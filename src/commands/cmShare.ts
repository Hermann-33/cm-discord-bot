import {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
  type ButtonInteraction,
  type Message,
  type MessageCreateOptions,
  type TextBasedChannel
} from "discord.js";
import type { OrderDetailsData, RecentOrderData } from "../api/schemas";
import {
  discordUserMention,
  escapeDiscordText,
  findDiscordIdentity,
  formatDiscordTimestampPair
} from "../discord/presentation";
import { safeAllowedMentions } from "../discord/safeMessages";
import { logger, sanitizeError } from "../logger";
import type { CmAdminSession, UserAdjustmentProposal } from "./cmSessions";

const ORDERS_PER_PAGE = 5;

type ShareChannel = TextBasedChannel & {
  send(options: MessageCreateOptions): Promise<Message>;
};

function text(content: string): TextDisplayBuilder {
  return new TextDisplayBuilder().setContent(content);
}

function separator(): SeparatorBuilder {
  return new SeparatorBuilder().setDivider(true);
}

function isShareChannel(channel: unknown): channel is ShareChannel {
  if (!channel || typeof channel !== "object") return false;
  const candidate = channel as { isTextBased?: () => boolean; send?: unknown };
  return typeof candidate.isTextBased === "function"
    && candidate.isTextBased()
    && typeof candidate.send === "function";
}

function formatMoney(cents: number, currency: string): string {
  return `${escapeDiscordText(currency.toUpperCase())} ${(cents / 100).toFixed(2)}`;
}

function formatSignedMoney(cents: number, currency: string): string {
  return `${escapeDiscordText(currency.toUpperCase())} ${cents > 0 ? "+" : ""}${(cents / 100).toFixed(2)}`;
}

function signedInteger(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toLocaleString()}`;
}

function orderLabel(order: RecentOrderData | OrderDetailsData): string {
  return escapeDiscordText(
    order.accountName
      ?? order.accountGameName
      ?? order.productSlug
      ?? order.accountSlug
      ?? "Order"
  );
}

function orderRef(order: { publicRef: string | null; orderId: string }): string {
  return escapeDiscordText(order.publicRef ?? order.orderId);
}

function quantitySuffix(quantity: number): string {
  return quantity > 1 ? ` · Qty ${quantity}` : "";
}

function customerIdentityBlock(session: CmAdminSession): string {
  const email = `Email: ${escapeDiscordText(session.overview.identity.email, 320)}`;
  const identity = findDiscordIdentity(session.overview);
  if (!identity) return `${email}\nDiscord: **Not linked**`;
  return `${email}\nDiscord: ${discordUserMention(identity.externalUserId)}`;
}

function buildUserShare(session: CmAdminSession): ContainerBuilder {
  const overview = session.overview;
  const latest = overview.recentOrders[0];
  const wallet = overview.wallet
    ? formatMoney(overview.wallet.balanceCents, overview.wallet.currency)
    : "—";
  const aura = overview.aura
    ? `${overview.aura.availableAura.toLocaleString()} available${overview.aura.pendingAura > 0 ? ` · ${overview.aura.pendingAura.toLocaleString()} pending` : ""}`
    : "—";

  const container = new ContainerBuilder()
    .addTextDisplayComponents(text("# CM Account Summary"))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(
      `${customerIdentityBlock(session)}\nStatus: **${overview.accountControl.isBanned ? "BANNED" : "Active"}**\nWallet: **${wallet}** · Aura: **${aura}**`
    ));

  if (latest) {
    container.addSeparatorComponents(separator()).addTextDisplayComponents(text(
      `### Latest Order\n**${orderRef(latest)}** — ${orderLabel(latest)}\n${escapeDiscordText(latest.status)} · ${formatMoney(latest.amountCents, latest.currency)}${quantitySuffix(latest.quantity)}\n${formatDiscordTimestampPair(latest.createdAt)}`
    ));
  }
  return container;
}

function buildOrdersShare(session: CmAdminSession, requestedPage: number): ContainerBuilder {
  const orders = session.overview.recentOrders;
  const pageCount = Math.max(1, Math.ceil(orders.length / ORDERS_PER_PAGE));
  const page = Math.min(Math.max(0, requestedPage), pageCount - 1);
  const start = page * ORDERS_PER_PAGE;
  const pageOrders = orders.slice(start, start + ORDERS_PER_PAGE);
  const container = new ContainerBuilder()
    .addTextDisplayComponents(text(`# Recent Orders\n${customerIdentityBlock(session)}\nPage **${page + 1}/${pageCount}**`))
    .addSeparatorComponents(separator());

  if (pageOrders.length === 0) {
    return container.addTextDisplayComponents(text("No recent orders were returned."));
  }

  pageOrders.forEach((order, offset) => {
    container.addTextDisplayComponents(text(
      `**${start + offset + 1}. ${orderRef(order)}** — ${orderLabel(order)}\n${escapeDiscordText(order.status)} · ${formatMoney(order.amountCents, order.currency)}${quantitySuffix(order.quantity)}\n${formatDiscordTimestampPair(order.createdAt)}`
    ));
  });
  return container;
}

function buildOrderShare(session: CmAdminSession): ContainerBuilder | null {
  const order = session.selectedOrder;
  if (!order) return null;
  const fulfillment = order.fulfillmentSummary;
  const purchaseLines = order.purchaseKind === "product"
    ? [`Item: **${escapeDiscordText(order.productSlug ?? "Product")}**`]
    : [
        `Item: **${escapeDiscordText(order.accountName ?? order.accountGameName ?? "Account purchase")}**`,
        ...(order.accountVariantLabel ? [`Variant: ${escapeDiscordText(order.accountVariantLabel)}`] : []),
        ...(order.accountGameName ? [`Game: ${escapeDiscordText(order.accountGameName)}`] : [])
      ];
  if (order.quantity > 1) purchaseLines.push(`Quantity: ${order.quantity}`);
  const deliveryLines = [`Delivered: **${fulfillment.quantityDelivered}/${fulfillment.quantityRequested}**`];
  if (fulfillment.manualRequired) deliveryLines.push("Manual review required: **Yes**");

  return new ContainerBuilder()
    .addTextDisplayComponents(text(`# Order ${orderRef(order)}\nStatus: **${escapeDiscordText(order.status)}**`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(`### Customer\n${customerIdentityBlock(session)}`))
    .addTextDisplayComponents(text(
      `### Purchase\n${purchaseLines.join("\n")}\nAmount: **${formatMoney(order.amountCents, order.currency)}**\nPlaced: ${formatDiscordTimestampPair(order.createdAt)}`
    ))
    .addTextDisplayComponents(text(`### Delivery\n${deliveryLines.join("\n")}`));
}

function buildAdjustmentPreviewShare(session: CmAdminSession, proposal: UserAdjustmentProposal): ContainerBuilder {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(text(`# ${proposal.kind === "aura" ? "Aura" : "Wallet"} Adjustment Preview`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(`### Customer\n${customerIdentityBlock(session)}`));

  if (proposal.kind === "aura") {
    return container.addTextDisplayComponents(text(
      `### Change\nCurrent: **${(proposal.beforeAvailableAura ?? 0).toLocaleString()} Aura**\nChange: **${signedInteger(proposal.deltaAura)} Aura**\nProjected: **${proposal.projectedAvailableAura.toLocaleString()} Aura**`
    ));
  }

  return container.addTextDisplayComponents(text(
    `### Change\nCurrent: **${formatMoney(proposal.beforeBalanceCents ?? 0, proposal.currency)}**\nChange: **${formatSignedMoney(proposal.deltaCents, proposal.currency)}**\nProjected: **${formatMoney(proposal.projectedBalanceCents, proposal.currency)}**`
  ));
}

export function buildPublicSharePanel(session: CmAdminSession): ContainerBuilder | null {
  const view = session.shareView;
  if (view.kind === "user") return buildUserShare(session);
  if (view.kind === "orders") return buildOrdersShare(session, view.page);
  if (view.kind === "order") return buildOrderShare(session);

  if (view.kind === "fulfillment") {
    const data = view.data;
    const container = new ContainerBuilder()
      .addTextDisplayComponents(text(
        `# Delivery Status\nOrder **${orderRef(data.order)}** · ${escapeDiscordText(data.order.status)}\n${customerIdentityBlock(session)}`
      ))
      .addSeparatorComponents(separator());
    if (data.fulfillments.length === 0) {
      return container.addTextDisplayComponents(text("No fulfillment records were returned."));
    }
    data.fulfillments.forEach((item, index) => {
      const lines = [
        `**${index + 1}. ${item.kind.toUpperCase()}**`,
        `Status: **${escapeDiscordText(item.status)}** · Delivered: ${item.quantityDelivered}/${item.quantityRequested}`
      ];
      if (item.manualRequiredAt) lines.push(`Manual review: ${formatDiscordTimestampPair(item.manualRequiredAt)}`);
      if (item.userMessage) lines.push(`Message: ${escapeDiscordText(item.userMessage)}`);
      container.addTextDisplayComponents(text(lines.join("\n")));
    });
    return container;
  }

  if (view.kind === "refund-preview") {
    const proposal = session.refundProposal;
    if (!proposal) return null;
    const preview = proposal.preview;
    const refundLines = [
      `Refund: **${formatMoney(preview.grossRefundCents, preview.currency)}**`,
      `Wallet credit: **${formatMoney(preview.finalWalletCreditCents, preview.currency)}**`,
      `Aura recovered: ${preview.auraRecovered}`
    ];
    if (preview.auraUnrecoverable > 0) refundLines.push(`Aura unrecoverable: ${preview.auraUnrecoverable}`);
    return new ContainerBuilder()
      .addTextDisplayComponents(text(`# Refund Preview\nOrder **${orderRef(preview)}**`))
      .addSeparatorComponents(separator())
      .addTextDisplayComponents(text(`### Customer\n${customerIdentityBlock(session)}`))
      .addTextDisplayComponents(text(`### Refund\n${refundLines.join("\n")}`));
  }

  if (view.kind === "refund-success") {
    const refund = view.data;
    return new ContainerBuilder()
      .addTextDisplayComponents(text(`# Refund Complete\nOrder **${orderRef(refund)}** has been refunded.`))
      .addSeparatorComponents(separator())
      .addTextDisplayComponents(text(`### Customer\n${customerIdentityBlock(session)}`))
      .addTextDisplayComponents(text(
        `### Result\nWallet credit: **${formatMoney(refund.finalWalletCreditCents, refund.currency)}**\nAura recovered: ${refund.auraRecovered}\nCompleted: ${formatDiscordTimestampPair(refund.refundedAt)}`
      ));
  }

  if (view.kind === "adjustment-preview") {
    return session.adjustmentProposal ? buildAdjustmentPreviewShare(session, session.adjustmentProposal) : null;
  }

  if (view.kind === "adjustment-success") {
    const container = new ContainerBuilder()
      .addTextDisplayComponents(text(`# ${view.adjustmentKind === "aura" ? "Aura" : "Wallet"} Adjustment Complete`))
      .addSeparatorComponents(separator())
      .addTextDisplayComponents(text(`### Customer\n${customerIdentityBlock(session)}`));
    if (view.adjustmentKind === "aura") {
      const result = view.data;
      return container.addTextDisplayComponents(text(
        `### Result\nApplied: **${signedInteger(result.deltaAura)} Aura**\nNew balance: **${result.availableAura.toLocaleString()} Aura**\nCompleted: ${formatDiscordTimestampPair(result.createdAt)}`
      ));
    }
    const result = view.data;
    return container.addTextDisplayComponents(text(
      `### Result\nApplied: **${formatSignedMoney(result.deltaCents, result.currency)}**\nNew balance: **${formatMoney(result.balanceCents, result.currency)}**\nCompleted: ${formatDiscordTimestampPair(result.createdAt)}`
    ));
  }

  return null;
}

export async function shareCurrentPanel(
  interaction: ButtonInteraction,
  session: CmAdminSession
): Promise<void> {
  const panel = buildPublicSharePanel(session);
  if (!panel) {
    await interaction.reply({
      content: "This panel no longer has a shareable customer view. Refresh the relevant CM panel and try again.",
      flags: MessageFlags.Ephemeral,
      allowedMentions: safeAllowedMentions
    });
    return;
  }

  const channel = interaction.channel;
  if (!isShareChannel(channel)) {
    await interaction.reply({
      content: "This Discord channel cannot receive the customer-safe CM panel.",
      flags: MessageFlags.Ephemeral,
      allowedMentions: safeAllowedMentions
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    await channel.send({
      components: [panel],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: safeAllowedMentions
    });
    await interaction.editReply({
      content: "Shared a customer-safe, read-only copy of this panel to the channel.",
      allowedMentions: safeAllowedMentions
    });
  } catch (error) {
    logger.warn("CM customer-safe share failed", sanitizeError(error));
    await interaction.editReply({
      content: "The customer-safe panel could not be posted to this channel.",
      allowedMentions: safeAllowedMentions
    });
  }
}
