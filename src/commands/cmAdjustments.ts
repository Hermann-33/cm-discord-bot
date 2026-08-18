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
import {
  CM_ADJUSTMENT_REASON_MAX_LENGTH,
  CM_AURA_DELTA_MAX,
  CM_WALLET_DELTA_MAX_CENTS
} from "../api/schemas";
import { isInternalApiError } from "../api/errors";
import type { AppConfig } from "../config/env";
import { postAdjustmentAudit } from "../discord/adminAudit";
import { logger, sanitizeError } from "../logger";
import type { CmAdminSession, UserAdjustmentProposal } from "./cmSessions";
import { rejectUnauthorized, safeApiMessage } from "./cmSupport";
import {
  buildAdjustmentPreviewPanel,
  buildAdjustmentSuccessPanel,
  buildNoticePanel,
  panelPayload
} from "./cmUi";

export const ADJUSTMENT_CONFIRM_TTL_MS = 5 * 60 * 1000;

export type AdjustmentDependencies = {
  nowMs: () => number;
  idempotencyKey: () => string;
  postAdjustmentAudit: typeof postAdjustmentAudit;
};

export type AdjustmentKind = "aura" | "wallet";

function parseAuraDelta(value: string): number | null {
  const normalized = value.trim();
  if (!/^[+-]?\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed === 0 || Math.abs(parsed) > CM_AURA_DELTA_MAX) return null;
  return parsed;
}

function parseWalletDeltaToCents(value: string): number | null {
  const normalized = value.trim();
  if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const negative = normalized.startsWith("-");
  const unsigned = normalized.replace(/^[+-]/, "");
  const [wholePart, fractionPart = ""] = unsigned.split(".");
  const whole = Number(wholePart);
  const fraction = Number(fractionPart.padEnd(2, "0"));
  if (!Number.isSafeInteger(whole) || !Number.isSafeInteger(fraction)) return null;
  const absoluteCents = whole * 100 + fraction;
  const cents = negative ? -absoluteCents : absoluteCents;
  if (!Number.isSafeInteger(cents) || cents === 0 || Math.abs(cents) > CM_WALLET_DELTA_MAX_CENTS) return null;
  return cents;
}

export async function showAdjustmentModal(
  interaction: ButtonInteraction,
  session: CmAdminSession,
  kind: AdjustmentKind
): Promise<void> {
  const delta = new TextInputBuilder()
    .setCustomId("delta")
    .setLabel(kind === "aura" ? "Aura change (e.g. +500 or -250)" : "Balance change (e.g. +10.00 or -5.25)")
    .setStyle(TextInputStyle.Short)
    .setMinLength(1)
    .setMaxLength(24)
    .setRequired(true)
    .setPlaceholder(kind === "aura" ? "+500" : "+10.00");
  const reason = new TextInputBuilder()
    .setCustomId("reason")
    .setLabel("Reason")
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(1)
    .setMaxLength(CM_ADJUSTMENT_REASON_MAX_LENGTH)
    .setRequired(true)
    .setPlaceholder("Explain why this adjustment is being made.");
  const modal = new ModalBuilder()
    .setCustomId(`cm:adjust:${kind}-modal:${session.id}`)
    .setTitle(kind === "aura" ? "Adjust Aura" : "Adjust Wallet Balance")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(delta),
      new ActionRowBuilder<TextInputBuilder>().addComponents(reason)
    );
  await interaction.showModal(modal);
}

export async function handleAdjustmentModal(
  interaction: ModalSubmitInteraction,
  session: CmAdminSession,
  api: InternalApiClient,
  kind: AdjustmentKind,
  dependencies: AdjustmentDependencies
): Promise<void> {
  if (!interaction.isFromMessage()) {
    await rejectUnauthorized(interaction, "The adjustment form is no longer attached to a CM admin panel.");
    return;
  }

  const rawDelta = interaction.fields.getTextInputValue("delta");
  const reason = interaction.fields.getTextInputValue("reason").trim();
  if (reason.length < 1 || reason.length > CM_ADJUSTMENT_REASON_MAX_LENGTH) {
    await rejectUnauthorized(interaction, `Reason must contain 1 to ${CM_ADJUSTMENT_REASON_MAX_LENGTH} characters.`);
    return;
  }

  const delta = kind === "aura" ? parseAuraDelta(rawDelta) : parseWalletDeltaToCents(rawDelta);
  if (delta === null) {
    await rejectUnauthorized(
      interaction,
      kind === "aura"
        ? "Aura change must be a non-zero whole number within ±1,000,000,000."
        : "Balance change must be a non-zero amount with at most two decimal places and within ±1,000,000.00."
    );
    return;
  }

  await interaction.deferUpdate();
  try {
    const fresh = await api.fetchUserOverview(
      { kind: "user_id", value: session.overview.identity.userId },
      10
    );
    if (fresh.identity.userId !== session.overview.identity.userId) throw new Error("Adjustment target mismatch");
    session.overview = fresh;
    session.refundProposal = undefined;

    const operator = { provider: "discord" as const, externalUserId: interaction.user.id };
    const common = {
      targetUserId: fresh.identity.userId,
      reason,
      operator,
      idempotencyKey: dependencies.idempotencyKey(),
      expiresAtMs: dependencies.nowMs() + ADJUSTMENT_CONFIRM_TTL_MS
    };

    let proposal: UserAdjustmentProposal;
    if (kind === "aura") {
      const beforeAvailableAura = fresh.aura?.availableAura ?? null;
      const projectedAvailableAura = (beforeAvailableAura ?? 0) + delta;
      if (projectedAvailableAura < 0) {
        await interaction.editReply(panelPayload(buildNoticePanel(
          session.id,
          "Aura Adjustment Invalid",
          "This change would make available Aura negative. No change was made.",
          "user"
        )));
        return;
      }
      proposal = {
        ...common,
        kind: "aura",
        deltaAura: delta,
        beforeAvailableAura,
        projectedAvailableAura
      };
    } else {
      const beforeBalanceCents = fresh.wallet?.balanceCents ?? null;
      const projectedBalanceCents = (beforeBalanceCents ?? 0) + delta;
      if (projectedBalanceCents < 0) {
        await interaction.editReply(panelPayload(buildNoticePanel(
          session.id,
          "Wallet Adjustment Invalid",
          "This change would make the wallet balance negative. No change was made.",
          "user"
        )));
        return;
      }
      proposal = {
        ...common,
        kind: "wallet",
        deltaCents: delta,
        beforeBalanceCents,
        projectedBalanceCents,
        currency: fresh.wallet?.currency ?? "USD"
      };
    }

    session.adjustmentProposal = proposal;
    await interaction.editReply(panelPayload(buildAdjustmentPreviewPanel(session.id, proposal)));
  } catch (error) {
    logger.warn("CM adjustment preview failed", { code: isInternalApiError(error) ? error.code : "UNKNOWN" });
    await interaction.editReply(panelPayload(buildNoticePanel(
      session.id,
      "Adjustment Preview Failed",
      safeApiMessage(error),
      "user"
    )));
  }
}

function proposalStateMatches(proposal: UserAdjustmentProposal, session: CmAdminSession): boolean {
  if (proposal.kind === "aura") {
    return (session.overview.aura?.availableAura ?? null) === proposal.beforeAvailableAura
      && (session.overview.aura?.availableAura ?? 0) + proposal.deltaAura === proposal.projectedAvailableAura;
  }
  return (session.overview.wallet?.balanceCents ?? null) === proposal.beforeBalanceCents
    && (session.overview.wallet?.balanceCents ?? 0) + proposal.deltaCents === proposal.projectedBalanceCents;
}

export async function confirmAdjustment(
  interaction: ButtonInteraction,
  session: CmAdminSession,
  api: InternalApiClient,
  config: AppConfig,
  dependencies: AdjustmentDependencies
): Promise<void> {
  const proposal = session.adjustmentProposal;
  if (!proposal || proposal.targetUserId !== session.overview.identity.userId) {
    await interaction.update(panelPayload(buildNoticePanel(
      session.id,
      "Adjustment Confirmation Expired",
      "Start a new adjustment from the user operations panel.",
      "user"
    )));
    return;
  }
  if (dependencies.nowMs() > proposal.expiresAtMs) {
    session.adjustmentProposal = undefined;
    await interaction.update(panelPayload(buildNoticePanel(
      session.id,
      "Adjustment Confirmation Expired",
      "The five-minute confirmation window expired. Start the adjustment again.",
      "user"
    )));
    return;
  }
  if (!config.botAuditLogChannelId) {
    await interaction.update(panelPayload(buildNoticePanel(
      session.id,
      "Adjustment Blocked",
      "BOT_AUDIT_LOG_CHANNEL_ID is not configured. No balance change was executed.",
      "user"
    )));
    return;
  }

  await interaction.deferUpdate();
  try {
    const fresh = await api.fetchUserOverview({ kind: "user_id", value: proposal.targetUserId }, 10);
    if (fresh.identity.userId !== proposal.targetUserId) throw new Error("Adjustment target mismatch");
    session.overview = fresh;
    if (!proposalStateMatches(proposal, session)) {
      session.adjustmentProposal = undefined;
      await interaction.editReply(panelPayload(buildNoticePanel(
        session.id,
        "Balance State Changed",
        "The current CM balance changed after this confirmation was prepared. No adjustment was executed; review the new balance and start again.",
        "user"
      )));
      return;
    }

    const result = proposal.kind === "aura"
      ? await api.executeAuraAdjustment({
        selector: { kind: "user_id", value: proposal.targetUserId },
        deltaAura: proposal.deltaAura,
        reason: proposal.reason,
        idempotencyKey: proposal.idempotencyKey,
        operator: proposal.operator
      })
      : await api.executeWalletAdjustment({
        selector: { kind: "user_id", value: proposal.targetUserId },
        deltaCents: proposal.deltaCents,
        reason: proposal.reason,
        idempotencyKey: proposal.idempotencyKey,
        operator: proposal.operator
      });

    const expectedDelta = proposal.kind === "aura" ? proposal.deltaAura : proposal.deltaCents;
    const actualDelta = proposal.kind === "aura" ? result.deltaAura : result.deltaCents;
    if (result.userId !== proposal.targetUserId || actualDelta !== expectedDelta) {
      throw new Error("Adjustment result target mismatch");
    }

    session.adjustmentProposal = undefined;
    let auditPosted = true;
    try {
      await dependencies.postAdjustmentAudit({
        client: interaction.client,
        channelId: config.botAuditLogChannelId,
        operatorId: interaction.user.id,
        userId: result.userId,
        kind: proposal.kind,
        delta: expectedDelta,
        resultValue: proposal.kind === "aura" ? result.availableAura : result.balanceCents,
        currency: proposal.kind === "wallet" ? result.currency : undefined,
        reason: proposal.reason,
        transactionId: result.transactionId,
        auditEventId: result.auditEventId,
        idempotentReplay: result.idempotentReplay
      });
    } catch (auditError) {
      auditPosted = false;
      logger.error("sanitized Discord adjustment audit failure", sanitizeError(auditError));
    }

    try {
      session.overview = await api.fetchUserOverview({ kind: "user_id", value: result.userId }, 10);
    } catch (refreshError) {
      logger.warn("post-adjustment CM refresh failed", {
        code: isInternalApiError(refreshError) ? refreshError.code : "UNKNOWN"
      });
    }

    await interaction.editReply(panelPayload(buildAdjustmentSuccessPanel(session.id, proposal.kind, result, auditPosted)));
  } catch (error) {
    logger.warn("CM adjustment execute failed", { code: isInternalApiError(error) ? error.code : "UNKNOWN" });
    if (
      isInternalApiError(error, "INVALID_ADJUSTMENT")
      || isInternalApiError(error, "INSUFFICIENT_BALANCE")
      || isInternalApiError(error, "IDEMPOTENCY_CONFLICT")
    ) {
      session.adjustmentProposal = undefined;
      await interaction.editReply(panelPayload(buildNoticePanel(
        session.id,
        "Adjustment Not Executed",
        safeApiMessage(error),
        "user"
      )));
      return;
    }

    await interaction.editReply(panelPayload(buildAdjustmentPreviewPanel(
      session.id,
      proposal,
      `${safeApiMessage(error)} The same confirmation can be retried safely with its original idempotency key.`
    )));
  }
}
