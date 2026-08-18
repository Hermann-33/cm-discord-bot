import {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
  type Client,
  type Message,
  type MessageCreateOptions,
  type TextBasedChannel
} from "discord.js";
import {
  discordUserMention,
  escapeDiscordText,
  formatDiscordTimestampPair
} from "./presentation";
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

function text(content: string): TextDisplayBuilder {
  return new TextDisplayBuilder().setContent(content);
}

function separator(): SeparatorBuilder {
  return new SeparatorBuilder().setDivider(true);
}

function formatMoney(cents: number, currency: string): string {
  return `${escapeDiscordText(currency.toUpperCase())} ${(cents / 100).toFixed(2)}`;
}

function customerLines(accountEmail?: string | null, discordUserId?: string | null): string {
  const lines: string[] = [];
  if (accountEmail) lines.push(`Account: **${escapeDiscordText(accountEmail)}**`);
  if (discordUserId) lines.push(`Discord: ${discordUserMention(discordUserId)}`);
  return lines.length > 0 ? lines.join("\n") : "Customer: —";
}

async function fetchAuditChannel(client: Client, channelId: string): Promise<AuditChannel> {
  const channel = await client.channels.fetch(channelId);
  if (!isAuditChannel(channel)) {
    throw new Error("Configured admin audit channel is not text-sendable");
  }
  return channel;
}

async function sendAuditPanel(channel: AuditChannel, container: ContainerBuilder): Promise<void> {
  await channel.send({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: safeAllowedMentions
  });
}

export async function postRefundAudit(input: {
  client: Client;
  channelId: string;
  operatorId: string;
  orderRef: string;
  accountEmail?: string | null;
  customerDiscordUserId?: string | null;
  reason: string;
  walletCreditCents: number;
  currency: string;
  completedAt: string;
  idempotentReplay: boolean;
}): Promise<void> {
  const channel = await fetchAuditChannel(input.client, input.channelId);
  const replay = input.idempotentReplay
    ? "\n> Backend returned an idempotent replay of the same refund request."
    : "";
  const panel = new ContainerBuilder()
    .addTextDisplayComponents(text(`# CM Audit · Refund\nOrder **${escapeDiscordText(input.orderRef)}**`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(`### Customer\n${customerLines(input.accountEmail, input.customerDiscordUserId)}`))
    .addTextDisplayComponents(text(
      `### Result\nWallet credit: **${formatMoney(input.walletCreditCents, input.currency)}**\nReason: ${escapeDiscordText(input.reason)}${replay}`
    ))
    .addTextDisplayComponents(text(
      `### Operator\n${discordUserMention(input.operatorId)}\nCompleted: ${formatDiscordTimestampPair(input.completedAt)}`
    ));
  await sendAuditPanel(channel, panel);
}

export async function postAdjustmentAudit(input: {
  client: Client;
  channelId: string;
  operatorId: string;
  accountEmail?: string | null;
  customerDiscordUserId?: string | null;
  kind: "aura" | "wallet";
  delta: number;
  resultValue: number;
  currency?: string;
  reason: string;
  completedAt: string;
  idempotentReplay: boolean;
}): Promise<void> {
  const channel = await fetchAuditChannel(input.client, input.channelId);
  const isWallet = input.kind === "wallet";
  const deltaLabel = isWallet
    ? formatMoney(input.delta, input.currency ?? "USD")
    : `${input.delta > 0 ? "+" : ""}${input.delta.toLocaleString()} Aura`;
  const resultLabel = isWallet
    ? formatMoney(input.resultValue, input.currency ?? "USD")
    : `${input.resultValue.toLocaleString()} Aura`;
  const replay = input.idempotentReplay
    ? "\n> Backend returned an idempotent replay of the same adjustment request."
    : "";
  const title = isWallet ? "Wallet Adjustment" : "Aura Adjustment";
  const panel = new ContainerBuilder()
    .addTextDisplayComponents(text(`# CM Audit · ${title}`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(`### Customer\n${customerLines(input.accountEmail, input.customerDiscordUserId)}`))
    .addTextDisplayComponents(text(
      `### Change\nApplied: **${deltaLabel}**\nNew balance: **${resultLabel}**\nReason: ${escapeDiscordText(input.reason)}${replay}`
    ))
    .addTextDisplayComponents(text(
      `### Operator\n${discordUserMention(input.operatorId)}\nCompleted: ${formatDiscordTimestampPair(input.completedAt)}`
    ));
  await sendAuditPanel(channel, panel);
}
