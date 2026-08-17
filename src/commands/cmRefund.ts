import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction
} from "discord.js";
import type { InternalApiClient } from "../api/client";
import { isInternalApiError } from "../api/errors";
import type { AppConfig } from "../config/env";
import { postRefundAudit } from "../discord/adminAudit";
import { logger, sanitizeError } from "../logger";
import type { CmAdminSession } from "./cmSessions";
import { refundPreviewFingerprint, rejectUnauthorized, safeApiMessage } from "./cmSupport";
import {
  buildNoticePanel,
  buildRefundPreviewPanel,
  buildRefundSuccessPanel,
  panelPayload
} from "./cmUi";

export const REFUND_CONFIRM_TTL_MS = 5 * 60 * 1000;

export type RefundDependencies = {
  nowMs: () => number;
  idempotencyKey: () => string;
  postRefundAudit: typeof postRefundAudit;
};

export async function showRefundModal(
  interaction: ButtonInteraction,
  session: CmAdminSession
): Promise<void> {
  if (!session.selectedOrder) {
    await interaction.reply({
      content: "Open an order before starting a refund.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const reason = new TextInputBuilder()
    .setCustomId("reason")
    .setLabel("Refund reason")
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(8)
    .setMaxLength(1_000)
    .setRequired(true)
    .setPlaceholder("Explain why this order should be refunded.");
  const modal = new ModalBuilder()
    .setCustomId(`cm:refund:modal:${session.id}`)
    .setTitle("Refund Order")
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reason));
  await interaction.showModal(modal);
}

export async function handleRefundModal(
  interaction: ModalSubmitInteraction,
  session: CmAdminSession,
  api: InternalApiClient,
  dependencies: RefundDependencies
): Promise<void> {
  if (!interaction.isFromMessage()) {
    await rejectUnauthorized(interaction, "The refund form is no longer attached to a CM admin panel.");
    return;
  }
  if (!session.selectedOrder) {
    await rejectUnauthorized(interaction, "No order is selected in this CM admin session.");
    return;
  }

  const reason = interaction.fields.getTextInputValue("reason").trim();
  if (reason.length < 8 || reason.length > 1_000) {
    await rejectUnauthorized(interaction, "Refund reason must contain 8 to 1000 characters.");
    return;
  }

  await interaction.deferUpdate();
  try {
    const preview = await api.previewOrderRefund(session.selectedOrder.orderId);
    if (
      preview.orderId !== session.selectedOrder.orderId
      || preview.userId !== session.overview.identity.userId
    ) {
      throw new Error("Refund preview target mismatch");
    }
    session.refundProposal = {
      orderId: preview.orderId,
      reason,
      preview,
      idempotencyKey: dependencies.idempotencyKey(),
      expiresAtMs: dependencies.nowMs() + REFUND_CONFIRM_TTL_MS
    };
    await interaction.editReply(panelPayload(buildRefundPreviewPanel(session.id, preview, reason)));
  } catch (error) {
    logger.warn("CM refund preview failed", { code: isInternalApiError(error) ? error.code : "UNKNOWN" });
    await interaction.editReply(panelPayload(buildNoticePanel(
      session.id,
      "Refund Preview Failed",
      safeApiMessage(error),
      "order"
    )));
  }
}

export async function confirmRefund(
  interaction: ButtonInteraction,
  session: CmAdminSession,
  api: InternalApiClient,
  config: AppConfig,
  dependencies: RefundDependencies
): Promise<void> {
  const proposal = session.refundProposal;
  if (!proposal || !session.selectedOrder || proposal.orderId !== session.selectedOrder.orderId) {
    await interaction.update(panelPayload(buildNoticePanel(
      session.id,
      "Refund Confirmation Expired",
      "Start a new refund preview from the order panel.",
      "order"
    )));
    return;
  }
  if (dependencies.nowMs() > proposal.expiresAtMs) {
    session.refundProposal = undefined;
    await interaction.update(panelPayload(buildNoticePanel(
      session.id,
      "Refund Confirmation Expired",
      "The five-minute confirmation window expired. Preview the refund again.",
      "order"
    )));
    return;
  }
  if (!config.botAuditLogChannelId) {
    await interaction.update(panelPayload(buildNoticePanel(
      session.id,
      "Refund Blocked",
      "BOT_AUDIT_LOG_CHANNEL_ID is not configured. No refund was executed.",
      "order"
    )));
    return;
  }

  await interaction.deferUpdate();
  try {
    const freshPreview = await api.previewOrderRefund(proposal.orderId);
    if (
      freshPreview.userId !== session.overview.identity.userId
      || refundPreviewFingerprint(freshPreview) !== refundPreviewFingerprint(proposal.preview)
    ) {
      session.refundProposal = undefined;
      await interaction.editReply(panelPayload(buildNoticePanel(
        session.id,
        "Refund State Changed",
        "CM returned different refund consequences. No refund was executed; preview it again.",
        "order"
      )));
      return;
    }

    const refund = await api.executeOrderRefund({
      orderId: proposal.orderId,
      reason: proposal.reason,
      idempotencyKey: proposal.idempotencyKey,
      operator: {
        provider: "discord",
        externalUserId: interaction.user.id,
        username: interaction.user.username,
        displayName: interaction.user.globalName ?? null
      }
    });
    if (refund.userId !== session.overview.identity.userId || refund.orderId !== proposal.orderId) {
      throw new Error("Refund result target mismatch");
    }

    session.refundProposal = undefined;
    let auditPosted = true;
    try {
      await dependencies.postRefundAudit({
        client: interaction.client,
        channelId: config.botAuditLogChannelId,
        operatorId: interaction.user.id,
        orderRef: refund.publicRef ?? refund.orderId,
        reason: proposal.reason,
        walletCreditCents: refund.finalWalletCreditCents,
        currency: refund.currency,
        auditEventId: refund.auditEventId,
        idempotentReplay: refund.idempotentReplay
      });
    } catch (auditError) {
      auditPosted = false;
      logger.error("sanitized Discord refund audit failure", sanitizeError(auditError));
    }

    try {
      session.overview = await api.fetchUserOverview(
        { kind: "user_id", value: session.overview.identity.userId },
        10
      );
      session.selectedOrder = await api.fetchOrderDetails(refund.orderId);
    } catch (refreshError) {
      logger.warn("post-refund CM refresh failed", {
        code: isInternalApiError(refreshError) ? refreshError.code : "UNKNOWN"
      });
    }

    await interaction.editReply(panelPayload(buildRefundSuccessPanel(session.id, refund, auditPosted)));
  } catch (error) {
    logger.warn("CM refund execute failed", { code: isInternalApiError(error) ? error.code : "UNKNOWN" });
    if (
      isInternalApiError(error, "ALREADY_REFUNDED")
      || isInternalApiError(error, "REFUND_NOT_ELIGIBLE")
      || isInternalApiError(error, "REFUND_STATE_INVALID")
      || isInternalApiError(error, "IDEMPOTENCY_CONFLICT")
    ) {
      session.refundProposal = undefined;
      await interaction.editReply(panelPayload(buildNoticePanel(
        session.id,
        "Refund Not Executed",
        safeApiMessage(error),
        "order"
      )));
      return;
    }

    await interaction.editReply(panelPayload(buildRefundPreviewPanel(
      session.id,
      proposal.preview,
      proposal.reason,
      `${safeApiMessage(error)} The same confirmation can be retried safely with its original idempotency key.`
    )));
  }
}
