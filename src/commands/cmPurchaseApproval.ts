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
import { postPurchaseApprovalAudit } from "../discord/adminAudit";
import { findDiscordIdentity } from "../discord/presentation";
import { logger, sanitizeError } from "../logger";
import type { CmAdminSession } from "./cmSessions";
import { rejectUnauthorized, safeApiMessage } from "./cmSupport";
import {
  buildNoticePanel,
  buildPurchaseApprovalPreviewPanel,
  buildPurchaseApprovalProcessingPanel,
  buildPurchaseApprovalSuccessPanel,
  buildPurchaseIntentPanel,
  panelPayload
} from "./cmUi";

export const PURCHASE_APPROVAL_CONFIRM_TTL_MS = 5 * 60 * 1000;

const processableStatuses = new Set(["pending", "processing", "failed", "expired", "underpaid"]);

export type PurchaseApprovalDependencies = {
  nowMs: () => number;
  idempotencyKey: () => string;
  postPurchaseApprovalAudit: typeof postPurchaseApprovalAudit;
};

function canProcess(status: string): boolean {
  return processableStatuses.has(status.toLowerCase());
}

export async function showPurchaseApprovalModal(
  interaction: ButtonInteraction,
  session: CmAdminSession
): Promise<void> {
  const purchase = session.selectedPurchaseIntent;
  if (!purchase || purchase.orderId) {
    await interaction.reply({
      content: "Open a pending CM purchase before starting manual approval.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  if (session.purchaseApprovalProposal?.submitted) {
    await interaction.reply({
      content: "This manual approval is already processing. Refresh the purchase instead of submitting it again.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  if (!canProcess(purchase.status)) {
    await interaction.reply({
      content: "This purchase state is not eligible for manual approval.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const reason = new TextInputBuilder()
    .setCustomId("reason")
    .setLabel("Approval reason")
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(8)
    .setMaxLength(1_000)
    .setRequired(true)
    .setPlaceholder("Explain how payment was verified before manual approval.");
  const evidence = new TextInputBuilder()
    .setCustomId("evidence")
    .setLabel("Evidence reference (optional)")
    .setStyle(TextInputStyle.Short)
    .setMinLength(1)
    .setMaxLength(500)
    .setRequired(false)
    .setPlaceholder("Ticket, payment reference, or internal verification note.");

  const modal = new ModalBuilder()
    .setCustomId(`cm:purchase:approve-modal:${session.id}`)
    .setTitle("Approve Pending Purchase")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(reason),
      new ActionRowBuilder<TextInputBuilder>().addComponents(evidence)
    );
  await interaction.showModal(modal);
}

export async function handlePurchaseApprovalModal(
  interaction: ModalSubmitInteraction,
  session: CmAdminSession,
  api: InternalApiClient,
  dependencies: PurchaseApprovalDependencies
): Promise<void> {
  if (!interaction.isFromMessage()) {
    await rejectUnauthorized(interaction, "The approval form is no longer attached to a CM admin panel.");
    return;
  }
  const selected = session.selectedPurchaseIntent;
  if (!selected || selected.orderId) {
    await rejectUnauthorized(interaction, "No pending purchase is selected in this CM admin session.");
    return;
  }

  const reason = interaction.fields.getTextInputValue("reason").trim();
  const evidenceReference = interaction.fields.getTextInputValue("evidence").trim();
  if (reason.length < 8 || reason.length > 1_000) {
    await rejectUnauthorized(interaction, "Approval reason must contain 8 to 1000 characters.");
    return;
  }
  if (evidenceReference.length > 500) {
    await rejectUnauthorized(interaction, "Evidence reference must contain at most 500 characters.");
    return;
  }

  await interaction.deferUpdate();
  try {
    const fresh = await api.fetchPurchaseIntent({
      kind: "purchase_intent_id",
      value: selected.purchaseIntentId
    });
    if (fresh.purchaseIntentId !== selected.purchaseIntentId || fresh.userId !== session.overview.identity.userId) {
      throw new Error("Purchase approval target mismatch");
    }
    if (fresh.orderId) {
      session.purchaseApprovalProposal = undefined;
      session.selectedPurchaseIntent = fresh;
      await interaction.editReply(panelPayload(buildNoticePanel(
        session.id,
        "Approval Not Required",
        "CM already created the canonical order. Refresh the purchase to open it.",
        "user"
      )));
      return;
    }
    if (!canProcess(fresh.status)) {
      session.purchaseApprovalProposal = undefined;
      session.selectedPurchaseIntent = fresh;
      await interaction.editReply(panelPayload(buildPurchaseIntentPanel(session.id, fresh, session.overview)));
      return;
    }

    const freshOverview = await api.fetchUserOverview({ kind: "user_id", value: fresh.userId }, 10);
    if (freshOverview.identity.userId !== fresh.userId) throw new Error("Purchase approval owner mismatch");
    session.overview = freshOverview;
    session.selectedPurchaseIntent = fresh;
    session.purchaseApprovalProposal = {
      purchaseIntentId: fresh.purchaseIntentId,
      userId: fresh.userId,
      sourceStatus: fresh.status,
      reason,
      ...(evidenceReference ? { evidenceReference } : {}),
      operator: {
        provider: "discord",
        externalUserId: interaction.user.id,
        username: interaction.user.username ?? null,
        displayName: interaction.user.globalName ?? null
      },
      idempotencyKey: dependencies.idempotencyKey(),
      expiresAtMs: dependencies.nowMs() + PURCHASE_APPROVAL_CONFIRM_TTL_MS,
      submitted: false
    };
    await interaction.editReply(panelPayload(buildPurchaseApprovalPreviewPanel(
      session.id,
      fresh,
      reason,
      evidenceReference || undefined
    )));
  } catch (error) {
    logger.warn("CM purchase approval preview failed", {
      code: isInternalApiError(error) ? error.code : "UNKNOWN"
    });
    await interaction.editReply(panelPayload(buildNoticePanel(
      session.id,
      "Manual Approval Failed",
      safeApiMessage(error),
      "user"
    )));
  }
}

export async function confirmPurchaseApproval(
  interaction: ButtonInteraction,
  session: CmAdminSession,
  api: InternalApiClient,
  config: AppConfig,
  dependencies: PurchaseApprovalDependencies
): Promise<void> {
  const proposal = session.purchaseApprovalProposal;
  const selected = session.selectedPurchaseIntent;
  if (!proposal || !selected || proposal.purchaseIntentId !== selected.purchaseIntentId) {
    await interaction.update(panelPayload(buildNoticePanel(
      session.id,
      "Approval Confirmation Expired",
      "Open the pending purchase and start manual approval again.",
      "user"
    )));
    return;
  }
  if (proposal.submitted) {
    await interaction.update(panelPayload(buildPurchaseApprovalProcessingPanel(session.id, selected)));
    return;
  }
  if (dependencies.nowMs() > proposal.expiresAtMs) {
    session.purchaseApprovalProposal = undefined;
    await interaction.update(panelPayload(buildNoticePanel(
      session.id,
      "Approval Confirmation Expired",
      "The five-minute confirmation window expired. Start manual approval again.",
      "user"
    )));
    return;
  }
  if (!config.botAuditLogChannelId) {
    await interaction.update(panelPayload(buildNoticePanel(
      session.id,
      "Manual Approval Blocked",
      "BOT_AUDIT_LOG_CHANNEL_ID is not configured. No purchase was approved.",
      "user"
    )));
    return;
  }

  await interaction.deferUpdate();
  try {
    const fresh = await api.fetchPurchaseIntent({
      kind: "purchase_intent_id",
      value: proposal.purchaseIntentId
    });
    if (fresh.purchaseIntentId !== proposal.purchaseIntentId || fresh.userId !== proposal.userId) {
      throw new Error("Purchase approval target mismatch");
    }
    if (fresh.orderId) {
      const order = await api.fetchOrderDetails(fresh.orderId);
      if (order.userId !== proposal.userId) throw new Error("Purchase approval order owner mismatch");
      session.selectedOrder = order;
      session.selectedPurchaseIntent = undefined;
      session.purchaseApprovalProposal = undefined;
      session.shareView = { kind: "order" };
      await interaction.editReply(panelPayload(buildNoticePanel(
        session.id,
        "Approval Not Required",
        "CM already created the canonical order. Open the order from the user panel.",
        "user"
      )));
      return;
    }
    if (!canProcess(fresh.status)) {
      session.purchaseApprovalProposal = undefined;
      session.selectedPurchaseIntent = fresh;
      await interaction.editReply(panelPayload(buildNoticePanel(
        session.id,
        "Manual Approval Not Executed",
        "The purchase state changed and is no longer eligible for manual approval.",
        "user"
      )));
      return;
    }

    const owner = await api.fetchUserOverview({ kind: "user_id", value: fresh.userId }, 10);
    if (owner.identity.userId !== proposal.userId) throw new Error("Purchase approval owner mismatch");
    session.overview = owner;
    session.selectedPurchaseIntent = fresh;

    const result = await api.processPurchaseIntent({
      selector: { kind: "purchase_intent_id", value: proposal.purchaseIntentId },
      reason: proposal.reason,
      ...(proposal.evidenceReference ? { evidenceReference: proposal.evidenceReference } : {}),
      idempotencyKey: proposal.idempotencyKey,
      operator: proposal.operator
    });
    proposal.submitted = true;

    let refreshedPurchase = await api.fetchPurchaseIntent({
      kind: "purchase_intent_id",
      value: proposal.purchaseIntentId
    });
    if (refreshedPurchase.userId !== proposal.userId) throw new Error("Purchase approval refresh owner mismatch");
    session.selectedPurchaseIntent = refreshedPurchase;

    let order = refreshedPurchase.orderId
      ? await api.fetchOrderDetails(refreshedPurchase.orderId)
      : null;
    if (order && order.userId !== proposal.userId) throw new Error("Purchase approval result owner mismatch");

    const processing = result.processing.status === "processing" || !order;
    const discordIdentity = findDiscordIdentity(owner);
    let auditPosted = true;
    try {
      await dependencies.postPurchaseApprovalAudit({
        client: interaction.client,
        channelId: config.botAuditLogChannelId,
        operatorId: interaction.user.id,
        purchaseRef: refreshedPurchase.publicRef ?? refreshedPurchase.purchaseIntentId,
        orderRef: order?.publicRef ?? order?.orderId,
        accountEmail: owner.identity.email,
        customerDiscordUserId: discordIdentity?.externalUserId,
        reason: proposal.reason,
        completedAt: new Date(dependencies.nowMs()).toISOString(),
        processing,
        idempotentReplay: result.idempotentReplay ?? false
      });
    } catch (auditError) {
      auditPosted = false;
      logger.error("sanitized Discord purchase approval audit failure", sanitizeError(auditError));
    }

    if (!order) {
      session.shareView = { kind: "purchase-intent" };
      await interaction.editReply(panelPayload(buildPurchaseApprovalProcessingPanel(
        session.id,
        refreshedPurchase
      )));
      return;
    }

    session.selectedOrder = order;
    session.selectedPurchaseIntent = undefined;
    session.purchaseApprovalProposal = undefined;
    session.shareView = { kind: "purchase-approval-success" };
    await interaction.editReply(panelPayload(buildPurchaseApprovalSuccessPanel(
      session.id,
      refreshedPurchase.publicRef ?? refreshedPurchase.purchaseIntentId,
      order,
      owner,
      auditPosted
    )));
  } catch (error) {
    logger.warn("CM purchase approval execute failed", {
      code: isInternalApiError(error) ? error.code : "UNKNOWN"
    });
    if (proposal.submitted) {
      session.shareView = { kind: "purchase-intent" };
      await interaction.editReply(panelPayload(buildPurchaseApprovalProcessingPanel(
        session.id,
        session.selectedPurchaseIntent ?? selected
      )));
      return;
    }

    if (
      isInternalApiError(error, "ALREADY_PROCESSED")
      || isInternalApiError(error, "INTENT_NOT_PROCESSABLE")
      || isInternalApiError(error, "PAYMENT_PROVIDER_UNSUPPORTED")
      || isInternalApiError(error, "PURCHASE_CONFIGURATION_UNSUPPORTED")
      || isInternalApiError(error, "IDEMPOTENCY_CONFLICT")
      || isInternalApiError(error, "MANUAL_REVIEW_REQUIRED")
    ) {
      session.purchaseApprovalProposal = undefined;
      await interaction.editReply(panelPayload(buildNoticePanel(
        session.id,
        "Manual Approval Not Executed",
        safeApiMessage(error),
        "user"
      )));
      return;
    }

    if (isInternalApiError(error, "PROCESSING_IN_PROGRESS")) {
      proposal.submitted = true;
      await interaction.editReply(panelPayload(buildPurchaseApprovalProcessingPanel(session.id, selected)));
      return;
    }

    await interaction.editReply(panelPayload(buildPurchaseApprovalPreviewPanel(
      session.id,
      selected,
      proposal.reason,
      proposal.evidenceReference,
      `${safeApiMessage(error)} The same confirmation can be retried safely with its original idempotency key.`
    )));
  }
}
