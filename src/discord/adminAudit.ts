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

function sanitizeAuditText(value: string): string {
  return value.replace(/@/g, "@\u200b").slice(0, 500);
}

async function fetchAuditChannel(client: Client, channelId: string): Promise<AuditChannel> {
  const channel = await client.channels.fetch(channelId);
  if (!isAuditChannel(channel)) {
    throw new Error("Configured admin audit channel is not text-sendable");
  }
  return channel;
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
  const channel = await fetchAuditChannel(input.client, input.channelId);
  await channel.send({
    content: [
      "**CM Admin Refund**",
      `Operator: ${input.operatorId}`,
      `Order: ${sanitizeAuditText(input.orderRef)}`,
      `Wallet credit: ${sanitizeAuditText(input.currency)} ${(input.walletCreditCents / 100).toFixed(2)}`,
      `Reason: ${sanitizeAuditText(input.reason)}`,
      `Backend audit: ${sanitizeAuditText(input.auditEventId)}`,
      `Idempotent replay: ${input.idempotentReplay ? "yes" : "no"}`
    ].join("\n"),
    allowedMentions: safeAllowedMentions
  });
}

export async function postAdjustmentAudit(input: {
  client: Client;
  channelId: string;
  operatorId: string;
  userId: string;
  kind: "aura" | "wallet";
  delta: number;
  resultValue: number;
  currency?: string;
  reason: string;
  transactionId: string;
  auditEventId: string;
  idempotentReplay: boolean;
}): Promise<void> {
  const channel = await fetchAuditChannel(input.client, input.channelId);
  const isWallet = input.kind === "wallet";
  const deltaLabel = isWallet
    ? `${sanitizeAuditText(input.currency ?? "USD")} ${(input.delta / 100).toFixed(2)}`
    : `${input.delta.toLocaleString()} Aura`;
  const resultLabel = isWallet
    ? `${sanitizeAuditText(input.currency ?? "USD")} ${(input.resultValue / 100).toFixed(2)}`
    : `${input.resultValue.toLocaleString()} Aura`;

  await channel.send({
    content: [
      `**CM Admin ${isWallet ? "Wallet" : "Aura"} Adjustment**`,
      `Operator: ${input.operatorId}`,
      `User: ${sanitizeAuditText(input.userId)}`,
      `Delta: ${deltaLabel}`,
      `Result: ${resultLabel}`,
      `Reason: ${sanitizeAuditText(input.reason)}`,
      `Transaction: ${sanitizeAuditText(input.transactionId)}`,
      `Backend audit: ${sanitizeAuditText(input.auditEventId)}`,
      `Idempotent replay: ${input.idempotentReplay ? "yes" : "no"}`
    ].join("\n"),
    allowedMentions: safeAllowedMentions
  });
}
