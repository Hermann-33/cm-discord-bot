import type { Client, Message, MessageCreateOptions, TextBasedChannel } from "discord.js";
import { safeAllowedMentions } from "./safeMessages";

export type AuditChannel = TextBasedChannel & {
  send(options: MessageCreateOptions): Promise<Message>;
};

function isAuditChannel(channel: unknown): channel is AuditChannel {
  if (!channel || typeof channel !== "object") return false;
  const candidate = channel as { isTextBased?: () => boolean; send?: unknown };
  return typeof candidate.isTextBased === "function"
    && candidate.isTextBased()
    && typeof candidate.send === "function";
}

export async function postRefundAudit(input: {
  client: Client;
  channelId: string;
  operatorId: string;
  orderRef: string;
  reason: string;
  walletCreditCents: number;
  currency: string;
  auditEventId: string;
  idempotentReplay: boolean;
}): Promise<void> {
  const channel = await input.client.channels.fetch(input.channelId);
  if (!isAuditChannel(channel)) {
    throw new Error("Configured admin audit channel is not text-sendable");
  }

  const safeReason = input.reason.replace(/@/g, "@\u200b").slice(0, 500);
  await channel.send({
    content: [
      "**CM Admin Refund**",
      `Operator: ${input.operatorId}`,
      `Order: ${input.orderRef}`,
      `Wallet credit: ${input.currency} ${(input.walletCreditCents / 100).toFixed(2)}`,
      `Reason: ${safeReason}`,
      `Backend audit: ${input.auditEventId}`,
      `Idempotent replay: ${input.idempotentReplay ? "yes" : "no"}`
    ].join("\n"),
    allowedMentions: safeAllowedMentions
  });
}
