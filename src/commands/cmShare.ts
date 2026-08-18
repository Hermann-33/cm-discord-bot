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

function customerDiscordLine(session: CmAdminSession): string {
  const identity = findDiscordIdentity(session.overview);
  if (!identity) return "Discord: **Not linked**";
  return `Discord: ${discordUserMention(identity.externalUserId)}`;
}

function buildUserShare(session: CmAdminSession): ContainerBuilder {
  const overview = session.overview;
  const latest = overview.recentOrders[0];
  const wallet = overview.wallet
    ? `Balance: **${formatMoney(overview.wallet.balanceCents, overview.wallet.currency)}**\nUpdated: ${formatDiscordTimestampPair(overview.wallet.updatedAt)}`
    : "No wallet record";
  const aura = overview.aura
    ? `Available: **${overview.aura.availableAura.toLocaleString()}**\nPending: ${overview.aura.pendingAura.toLocaleString()}\nLifetime earned: ${overview.aura.lifetimeEarnedAura.toLocaleString()}\nUpdated: ${formatDiscordTimestampPair(overview.aura.updatedAt)}`
    : "No Aura record";

  const container = new ContainerBuilder()
    .addTextDisplayComponents(text("# CM Account Summary"))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(
      `### Account\nStatus: **${overview.accountControl.isBanned ? "BANNED" : "Active"}**\n${customerDiscordLine(session)}\nCreated: ${formatDiscordTimestampPair(overview.identity.createdAt)}\nLast sign-in: ${formatDiscordTimestampPair(overview.identity.lastSignInAt)}`
    ))
    .addTextDisplayComponents(text(`### Wallet\n${wallet}`))
    .addTextDisplayComponents(text(`### Aura\n${aura}`))
    .addTextDisplayComponents(text(
      `### Activity\nOrders: **${overview.counts.orders}** · Licenses: ${overview.counts.licenses} · Account deliveries: ${overview.counts.accountDeliveries}`
    ));

  if (latest) {
    container.addSeparatorComponents(separator()).addTextDisplayComponents(text(
      `### Most Recent Order\n**${orderRef(latest)}** — ${orderLabel(latest)}\n${escapeDiscordText(latest.status)} · ${formatMoney(latest.amountCents, latest.currency)} · ${formatDiscordTimestampPair(latest.createdAt)}`
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
    .addTextDisplayComponents(text(`# Recent Orders\n${customerDiscordLine(session)}\nPage **${page + 1}/${pageCount}**`))
    .addSeparatorComponents(separator());

  if (pageOrders.length === 0) {
    return container.addTextDisplayComponents(text("No recent orders were returned."));
  }

  pageOrders.forEach((order, offset) => {
    container.addTextDisplayComponents(text(
      `**${start + offset + 1}. ${orderRef(order)}** — ${orderLabel(order)}\nStatus: ${escapeDiscordText(order.status)} · ${formatMoney(order.amountCents, order.currency)} · Qty ${order.quantity}\nCreated: ${formatDiscordTimestampPair(order.createdAt)}`
    ));
  });
  return container;
}

function buildOrderShare(session: CmAdminSession): ContainerBuilder | null {
  const order = session.selectedOrder;
  if (!order) return null;
  const fulfillment = order.fulfillmentSummary;
  const purchaseLines = order.purchaseKind === "product"
    ? [`Product: ${escapeDiscordText(order.productSlug)}`]
    : [
        `Account: ${escapeDiscordText(order.accountName ?? order.accountGameName ?? "Account purchase")}`,
        ...(order.accountVariantLabel ? [`Variant: ${escapeDiscordText(order.accountVariantLabel)}`] : []),
        ...(order.accountGameName ? [`Game: ${escapeDiscordText(order.accountGameName)}`] : [])
      ];

  return new ContainerBuilder()
    .addTextDisplayComponents(text(`# Order ${orderRef(order)}\nStatus: **${escapeDiscordText(order.status)}**`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(`### Customer\n${customerDiscordLine(session)}`))
    .addTextDisplayComponents(text(
      `### Purchase\nType: **${escapeDiscordText(order.purchaseKind)}**\n${purchaseLines.join("\n")}\nQuantity: ${order.quantity}\nAmount: **${formatMoney(order.amountCents, order.currency)}**\nCreated: ${formatDiscordTimestampPair(order.createdAt)}`
    ))
    .addTextDisplayComponents(text(`### Payment\nMethod: ${escapeDiscordText(order.payment.method)}`))
    .addTextDisplayComponents(text(
      `### Fulfillment\nRequested: ${fulfillment.quantityRequested} · Delivered: ${fulfillment.quantityDelivered}\nManual required: **${fulfillment.manualRequired ? "Yes" : "No"}**`
    ));
}

function buildAdjustmentPreviewShare(session: CmAdminSession, proposal: UserAdjustmentProposal): ContainerBuilder {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(text(`# ${proposal.kind === "aura" ? "Aura" : "Wallet"} Adjustment Preview`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(`### Customer\n${customerDiscordLine(session)}`));

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
        `# Fulfillment Status\nOrder **${orderRef(data.order)}** · ${escapeDiscordText(data.order.status)}\n${customerDiscordLine(session)}`
      ))
      .addSeparatorComponents(separator());
    if (data.fulfillments.length === 0) {
      return container.addTextDisplayComponents(text("No fulfillment records were returned."));
    }
    data.fulfillments.forEach((item, index) => {
      const message = item.userMessage ? `\nMessage: ${escapeDiscordText(item.userMessage)}` : "";
      container.addTextDisplayComponents(text(
        `**${index + 1}. ${item.kind.toUpperCase()}**\nStatus: **${escapeDiscordText(item.status)}**\nRequested: ${item.quantityRequested} · Delivered: ${item.quantityDelivered}\nManual required: ${item.manualRequiredAt ? `Yes · ${formatDiscordTimestampPair(item.manualRequiredAt)}` : "No"}${message}`
      ));
    });
    return container;
  }

  if (view.kind === "refund-preview") {
    const proposal = session.refundProposal;
    if (!proposal) return null;
    const preview = proposal.preview;
    return new ContainerBuilder()
      .addTextDisplayComponents(text(`# Refund Preview\nOrder **${orderRef(preview)}**`))
      .addSeparatorComponents(separator())
      .addTextDisplayComponents(text(`### Customer\n${customerDiscordLine(session)}`))
      .addTextDisplayComponents(text(
        `### Refund\nGross refund: **${formatMoney(preview.grossRefundCents, preview.currency)}**\nWallet credit: **${formatMoney(preview.finalWalletCreditCents, preview.currency)}**\nAura recovered: ${preview.auraRecovered}\nAura unrecoverable: ${preview.auraUnrecoverable}`
      ));
  }

  if (view.kind === "refund-success") {
    const refund = view.data;
    return new ContainerBuilder()
      .addTextDisplayComponents(text(`# Refund Complete\nOrder **${orderRef(refund)}** has been refunded.`))
      .addSeparatorComponents(separator())
      .addTextDisplayComponents(text(`### Customer\n${customerDiscordLine(session)}`))
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
      .addTextDisplayComponents(text(`### Customer\n${customerDiscordLine(session)}`));
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
