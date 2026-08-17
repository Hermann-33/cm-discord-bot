import { MessageFlags, type ButtonInteraction, type ChatInputCommandInteraction, type ModalSubmitInteraction } from "discord.js";
import { isInternalApiError } from "../api/errors";
import type { OrderRefundPreviewData } from "../api/schemas";
import type { AppConfig } from "../config/env";
import { authorizeAdminInteraction } from "../discord/adminAuthorization";
import type { CmAdminSession } from "./cmSessions";
import { CmSessionStore } from "./cmSessions";

export type CmInteraction = ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction;

export function safeApiMessage(error: unknown): string {
  if (isInternalApiError(error, "NOT_FOUND")) return "The requested CM record was not found.";
  if (isInternalApiError(error, "OPERATION_FORBIDDEN")) return "The bot credential is not permitted to use this CM operation.";
  if (isInternalApiError(error, "RATE_LIMITED")) return "CM rate limiting is active. Try again shortly.";
  if (isInternalApiError(error, "ALREADY_REFUNDED")) return "This order is already refunded.";
  if (isInternalApiError(error, "REFUND_NOT_ELIGIBLE")) return "This order is not eligible for refund.";
  if (isInternalApiError(error, "REFUND_STATE_INVALID")) return "CM rejected the refund because the order state is inconsistent.";
  if (isInternalApiError(error, "IDEMPOTENCY_CONFLICT")) {
    return "CM rejected the refund because its idempotency state conflicted. Do not retry with changed details.";
  }
  return "The CM service request could not be completed.";
}

export function refundPreviewFingerprint(preview: OrderRefundPreviewData): string {
  return JSON.stringify(preview);
}

export function parseNonNegativeInteger(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export async function rejectUnauthorized(interaction: CmInteraction, message: string): Promise<void> {
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
}

export function authorize(interaction: CmInteraction, config: AppConfig) {
  return authorizeAdminInteraction(interaction, config);
}

export async function requireSession(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  sessions: CmSessionStore,
  sessionId: string
): Promise<CmAdminSession | null> {
  const session = sessions.get(sessionId, interaction.user.id);
  if (session) return session;
  await rejectUnauthorized(
    interaction,
    "This private CM admin panel expired or does not belong to you. Run /cm user again."
  );
  return null;
}
