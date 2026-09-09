import {
  MessageFlags,
  type ChatInputCommandInteraction
} from "discord.js";
import type { InternalApiClient } from "../api/client";
import { isInternalApiError } from "../api/errors";
import type {
  OrderLookupSelector,
  UserLookupSelector
} from "../api/schemas";
import type { AppConfig } from "../config/env";
import { postAdjustmentAudit, postRefundAudit } from "../discord/adminAudit";
import { findDiscordIdentity } from "../discord/presentation";
import { logger, sanitizeError } from "../logger";
import {
  parseAuraDelta,
  parseWalletDeltaToCents
} from "./cmAdjustments";
import { safeApiMessage } from "./cmSupport";
import {
  buildDirectAdjustmentSuccessPanel,
  buildDirectRefundSuccessPanel,
  buildNoticePanel,
  panelPayload
} from "./cmUi";

export type DirectMutationDependencies = {
  idempotencyKey: () => string;
  postAdjustmentAudit: typeof postAdjustmentAudit;
  postRefundAudit: typeof postRefundAudit;
};

function defaultAdjustmentReason(kind: "aura" | "wallet"): string {
  return kind === "aura"
    ? "Direct Aura adjustment via Discord admin command."
    : "Direct wallet balance adjustment via Discord admin command.";
}

export function normalizeDirectAdjustmentReason(
  kind: "aura" | "wallet",
  value?: string | null
): string {
  const trimmed = value?.trim() ?? "";
  return trimmed || defaultAdjustmentReason(kind);
}

export function normalizeDirectRefundReason(value?: string | null): string {
  const trimmed = value?.trim() ?? "";
  return trimmed || "Direct refund via Discord admin command.";
}

export async function executeDirectAdjustment(input: {
  interaction: ChatInputCommandInteraction;
  api: InternalApiClient;
  config: AppConfig;
  dependencies: DirectMutationDependencies;
  kind: "aura" | "wallet";
  selector: UserLookupSelector;
  rawAmount: string;
  reason: string;
}): Promise<void> {
  const {
    interaction,
    api,
    config,
    dependencies,
    kind,
    selector,
    rawAmount,
    reason
  } = input;

  if (!config.botAuditLogChannelId) {
    await interaction.reply({
      content: "BOT_AUDIT_LOG_CHANNEL_ID is not configured. No balance change was executed.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const delta = kind === "aura"
    ? parseAuraDelta(rawAmount)
    : parseWalletDeltaToCents(rawAmount);
  if (delta === null) {
    await interaction.reply({
      content: kind === "aura"
        ? "Aura amount must be a non-zero whole number within ±1,000,000,000. Use a positive value to add and a negative value to deduct."
        : "Balance amount must be a non-zero value with at most two decimal places and within ±1,000,000.00. Use a positive value to add and a negative value to deduct.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const overview = await api.fetchUserOverview(selector, 10);
    const canonicalSelector: UserLookupSelector = {
      kind: "user_id",
      value: overview.identity.userId
    };

    if (kind === "aura") {
      const currentAura = overview.aura?.availableAura ?? 0;
      if (currentAura + delta < 0) {
        await interaction.editReply(panelPayload(buildNoticePanel(
          null,
          "Aura Adjustment Not Executed",
          "This change would make available Aura negative."
        )));
        return;
      }

      const result = await api.executeAuraAdjustment({
        selector: canonicalSelector,
        deltaAura: delta,
        reason,
        idempotencyKey: dependencies.idempotencyKey(),
        operator: {
          provider: "discord",
          externalUserId: interaction.user.id,
          username: interaction.user.username ?? null,
          displayName: interaction.user.globalName ?? null
        }
      });
      if (result.userId !== overview.identity.userId || result.deltaAura !== delta) {
        throw new Error("Adjustment result target mismatch");
      }

      const discordIdentity = findDiscordIdentity(overview);
      let auditPosted = true;
      try {
        await dependencies.postAdjustmentAudit({
          client: interaction.client,
          channelId: config.botAuditLogChannelId,
          operatorId: interaction.user.id,
          accountEmail: overview.identity.email,
          customerDiscordUserId: discordIdentity?.externalUserId,
          kind: "aura",
          delta,
          resultValue: result.availableAura,
          reason,
          completedAt: result.createdAt,
          idempotentReplay: result.idempotentReplay
        });
      } catch (auditError) {
        auditPosted = false;
        logger.error("sanitized Discord direct adjustment audit failure", sanitizeError(auditError));
      }

      await interaction.editReply(panelPayload(
        buildDirectAdjustmentSuccessPanel("aura", result, overview, reason, auditPosted)
      ));
      return;
    }

    const currentBalanceCents = overview.wallet?.balanceCents ?? 0;
    if (currentBalanceCents + delta < 0) {
      await interaction.editReply(panelPayload(buildNoticePanel(
        null,
        "Balance Adjustment Not Executed",
        "This change would make the wallet balance negative."
      )));
      return;
    }

    const result = await api.executeWalletAdjustment({
      selector: canonicalSelector,
      deltaCents: delta,
      reason,
      idempotencyKey: dependencies.idempotencyKey(),
      operator: {
        provider: "discord",
        externalUserId: interaction.user.id,
        username: interaction.user.username ?? null,
        displayName: interaction.user.globalName ?? null
      }
    });
    if (result.userId !== overview.identity.userId || result.deltaCents !== delta) {
      throw new Error("Adjustment result target mismatch");
    }

    const discordIdentity = findDiscordIdentity(overview);
    let auditPosted = true;
    try {
      await dependencies.postAdjustmentAudit({
        client: interaction.client,
        channelId: config.botAuditLogChannelId,
        operatorId: interaction.user.id,
        accountEmail: overview.identity.email,
        customerDiscordUserId: discordIdentity?.externalUserId,
        kind: "wallet",
        delta,
        resultValue: result.balanceCents,
        currency: result.currency,
        reason,
        completedAt: result.createdAt,
        idempotentReplay: result.idempotentReplay
      });
    } catch (auditError) {
      auditPosted = false;
      logger.error("sanitized Discord direct adjustment audit failure", sanitizeError(auditError));
    }

    await interaction.editReply(panelPayload(
      buildDirectAdjustmentSuccessPanel("wallet", result, overview, reason, auditPosted)
    ));
  } catch (error) {
    logger.warn("CM direct adjustment failed", {
      code: isInternalApiError(error) ? error.code : "UNKNOWN"
    });
    await interaction.editReply(panelPayload(buildNoticePanel(
      null,
      "Adjustment Not Executed",
      safeApiMessage(error)
    )));
  }
}

export async function executeDirectRefund(input: {
  interaction: ChatInputCommandInteraction;
  api: InternalApiClient;
  config: AppConfig;
  dependencies: DirectMutationDependencies;
  selector: OrderLookupSelector;
  reason: string;
}): Promise<void> {
  const {
    interaction,
    api,
    config,
    dependencies,
    selector,
    reason
  } = input;

  if (!config.botAuditLogChannelId) {
    await interaction.reply({
      content: "BOT_AUDIT_LOG_CHANNEL_ID is not configured. No refund was executed.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const order = await api.fetchOrderDetails(selector);
    const overview = await api.fetchUserOverview(
      { kind: "user_id", value: order.userId },
      10
    );
    if (overview.identity.userId !== order.userId) {
      throw new Error("Refund target mismatch");
    }

    const preview = await api.previewOrderRefund(order.orderId);
    if (preview.orderId !== order.orderId || preview.userId !== order.userId) {
      throw new Error("Refund preview target mismatch");
    }

    const refund = await api.executeOrderRefund({
      orderId: order.orderId,
      reason,
      idempotencyKey: dependencies.idempotencyKey(),
      operator: {
        provider: "discord",
        externalUserId: interaction.user.id,
        username: interaction.user.username ?? null,
        displayName: interaction.user.globalName ?? null
      }
    });
    if (refund.orderId !== order.orderId || refund.userId !== order.userId) {
      throw new Error("Refund result target mismatch");
    }

    const discordIdentity = findDiscordIdentity(overview);
    let auditPosted = true;
    try {
      await dependencies.postRefundAudit({
        client: interaction.client,
        channelId: config.botAuditLogChannelId,
        operatorId: interaction.user.id,
        orderRef: refund.publicRef ?? refund.orderId,
        accountEmail: overview.identity.email,
        customerDiscordUserId: discordIdentity?.externalUserId,
        reason,
        walletCreditCents: refund.finalWalletCreditCents,
        currency: refund.currency,
        completedAt: refund.refundedAt,
        idempotentReplay: refund.idempotentReplay
      });
    } catch (auditError) {
      auditPosted = false;
      logger.error("sanitized Discord direct refund audit failure", sanitizeError(auditError));
    }

    await interaction.editReply(panelPayload(
      buildDirectRefundSuccessPanel(refund, overview, reason, auditPosted)
    ));
  } catch (error) {
    logger.warn("CM direct refund failed", {
      code: isInternalApiError(error) ? error.code : "UNKNOWN"
    });
    await interaction.editReply(panelPayload(buildNoticePanel(
      null,
      "Refund Not Executed",
      safeApiMessage(error)
    )));
  }
}
