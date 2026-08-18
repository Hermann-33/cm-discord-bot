import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder
} from "discord.js";
import type {
  AuraAdjustmentData,
  OrderDetailsData,
  OrderFulfillmentData,
  OrderRefundExecuteData,
  OrderRefundPreviewData,
  RecentOrderData,
  UserOverviewData,
  WalletAdjustmentData
} from "../api/schemas";
import {
  discordUserMention,
  escapeDiscordText,
  findDiscordIdentity,
  formatDiscordTimestampPair
} from "../discord/presentation";
import { safeAllowedMentions } from "../discord/safeMessages";
import type { UserAdjustmentProposal } from "./cmSessions";

const ORDERS_PER_PAGE = 5;

function text(content: string): TextDisplayBuilder {
  return new TextDisplayBuilder().setContent(content);
}

function separator(): SeparatorBuilder {
  return new SeparatorBuilder().setDivider(true);
}

function button(customId: string, label: string, style = ButtonStyle.Secondary): ButtonBuilder {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
}

function shareRow(sessionId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    button(`cm:share:current:${sessionId}`, "Share to Chat", ButtonStyle.Success)
  );
}

function formatMoney(cents: number, currency: string): string {
  const safeCurrency = escapeDiscordText(currency.toUpperCase());
  return `${safeCurrency} ${(cents / 100).toFixed(2)}`;
}

function formatSignedMoney(cents: number, currency: string): string {
  const safeCurrency = escapeDiscordText(currency.toUpperCase());
  return `${safeCurrency} ${cents > 0 ? "+" : ""}${(cents / 100).toFixed(2)}`;
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

function compactDiscordIdentity(overview: UserOverviewData): string {
  const identity = findDiscordIdentity(overview);
  return identity ? discordUserMention(identity.externalUserId) : "**Not linked**";
}

function quantitySuffix(quantity: number): string {
  return quantity > 1 ? ` · Qty ${quantity}` : "";
}

function fulfillmentTypeLabel(
  order: OrderDetailsData,
  fulfillment: OrderFulfillmentData
): string | null {
  const support = fulfillment.support;
  if (support?.productTypeLabel) return escapeDiscordText(support.productTypeLabel);
  if (order.purchaseKind === "account" && order.accountVariantLabel) {
    return escapeDiscordText(order.accountVariantLabel);
  }
  if (support?.productDurationDays) {
    const days = support.productDurationDays;
    return `${days} ${days === 1 ? "Day" : "Days"}`;
  }
  return null;
}

function fulfillmentProviders(data: OrderFulfillmentData): string[] {
  return [...new Set(data.fulfillments.map((item) => item.providerCode.trim()).filter(Boolean))]
    .map((provider) => escapeDiscordText(provider));
}

export type CmPanelPayload = {
  components: [ContainerBuilder];
  flags: MessageFlags.IsComponentsV2;
  allowedMentions: typeof safeAllowedMentions;
};

export function panelPayload(container: ContainerBuilder): CmPanelPayload {
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: safeAllowedMentions
  };
}

export function buildUserPanel(sessionId: string, overview: UserOverviewData): ContainerBuilder {
  const latest = overview.recentOrders[0];
  const wallet = overview.wallet
    ? formatMoney(overview.wallet.balanceCents, overview.wallet.currency)
    : "—";
  const auraLines = overview.aura
    ? [
        `Available Aura: **${overview.aura.availableAura.toLocaleString()}**`,
        `Lifetime Aura: **${overview.aura.lifetimeEarnedAura.toLocaleString()}**`,
        ...(overview.aura.pendingAura > 0
          ? [`Pending Aura: **${overview.aura.pendingAura.toLocaleString()}**`]
          : [])
      ]
    : ["Available Aura: **—**", "Lifetime Aura: **—**"];
  const latestText = latest
    ? `**${orderRef(latest)}** — ${orderLabel(latest)}\n${escapeDiscordText(latest.status)} · ${formatMoney(latest.amountCents, latest.currency)}${quantitySuffix(latest.quantity)}\n${formatDiscordTimestampPair(latest.createdAt)}`
    : "No recent orders";

  const actions = new ActionRowBuilder<ButtonBuilder>().addComponents(
    button(`cm:adjust:aura:${sessionId}`, "Adjust Aura", ButtonStyle.Primary),
    button(`cm:adjust:wallet:${sessionId}`, "Adjust Wallet", ButtonStyle.Primary),
    button(`cm:order:open:${sessionId}:0`, "Open Recent Order", ButtonStyle.Primary).setDisabled(!latest),
    button(`cm:user:orders:${sessionId}:0`, "Order History")
  );

  return new ContainerBuilder()
    .addTextDisplayComponents(text(`# CM User Operations\n**${escapeDiscordText(overview.identity.email ?? overview.identity.userId)}**`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(
      `Status: **${overview.accountControl.isBanned ? "BANNED" : "Active"}** · Discord: ${compactDiscordIdentity(overview)}\nWallet: **${wallet}**\n${auraLines.join("\n")}\nOrders: **${overview.counts.orders}** · Licenses: **${overview.counts.licenses}** · Accounts: **${overview.counts.accountDeliveries}**`
    ))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(`### Latest Order\n${latestText}`))
    .addActionRowComponents(actions)
    .addActionRowComponents(shareRow(sessionId));
}

export function buildOrdersPanel(
  sessionId: string,
  overview: UserOverviewData,
  requestedPage: number
): ContainerBuilder {
  const totalVisible = overview.recentOrders.length;
  const pageCount = Math.max(1, Math.ceil(totalVisible / ORDERS_PER_PAGE));
  const page = Math.min(Math.max(0, requestedPage), pageCount - 1);
  const start = page * ORDERS_PER_PAGE;
  const pageOrders = overview.recentOrders.slice(start, start + ORDERS_PER_PAGE);
  const summary = overview.counts.orders > totalVisible
    ? ` · Latest **${totalVisible}** of **${overview.counts.orders}**`
    : "";
  const container = new ContainerBuilder()
    .addTextDisplayComponents(text(
      `# Recent Orders\n${escapeDiscordText(overview.identity.email ?? overview.identity.userId)}\nPage **${page + 1}/${pageCount}**${summary}`
    ))
    .addSeparatorComponents(separator());

  if (pageOrders.length === 0) {
    container.addTextDisplayComponents(text("No recent orders were returned."));
  } else {
    pageOrders.forEach((order, offset) => {
      const absoluteIndex = start + offset;
      container.addTextDisplayComponents(text(
        `**${absoluteIndex + 1}. ${orderRef(order)}** — ${orderLabel(order)}\n${escapeDiscordText(order.status)} · ${formatMoney(order.amountCents, order.currency)}${quantitySuffix(order.quantity)}\n${formatDiscordTimestampPair(order.createdAt)}`
      ));
    });

    const openButtons = new ActionRowBuilder<ButtonBuilder>();
    pageOrders.forEach((_order, offset) => {
      const absoluteIndex = start + offset;
      openButtons.addComponents(button(
        `cm:order:open:${sessionId}:${absoluteIndex}`,
        `Open ${absoluteIndex + 1}`,
        ButtonStyle.Primary
      ));
    });
    container.addActionRowComponents(openButtons);
  }

  const nav = new ActionRowBuilder<ButtonBuilder>().addComponents(
    button(`cm:user:home:${sessionId}`, "User Operations"),
    button(`cm:user:orders:${sessionId}:${page - 1}`, "Previous").setDisabled(page === 0),
    button(`cm:user:orders:${sessionId}:${page + 1}`, "Next").setDisabled(page >= pageCount - 1)
  );
  return container
    .addActionRowComponents(nav)
    .addActionRowComponents(shareRow(sessionId));
}

export function buildOrderPanel(
  sessionId: string,
  order: OrderDetailsData,
  overview: UserOverviewData,
  fulfillmentData: OrderFulfillmentData
): ContainerBuilder {
  const typeLabel = fulfillmentTypeLabel(order, fulfillmentData);
  const purchaseLines = order.purchaseKind === "product"
    ? [
        `Item: **${escapeDiscordText(order.productSlug ?? "Product")}**`,
        ...(typeLabel ? [`Type: **${typeLabel}**`] : [])
      ]
    : [
        `Item: **${escapeDiscordText(order.accountName ?? order.accountGameName ?? order.accountSlug ?? "Account")}**`,
        ...(typeLabel ? [`Type: **${typeLabel}**`] : []),
        ...(order.accountGameName ? [`Game: ${escapeDiscordText(order.accountGameName)}`] : [])
      ];
  if (order.quantity > 1) purchaseLines.push(`Quantity: ${order.quantity}`);

  const fulfillment = order.fulfillmentSummary;
  const providers = fulfillmentProviders(fulfillmentData);
  const materials = fulfillmentData.support?.maskedMaterials ?? [];
  const deliveryLines = [
    ...(providers.length > 0 ? [`Provider: **${providers.join(", ")}**`] : []),
    `Delivered: **${fulfillment.quantityDelivered}/${fulfillment.quantityRequested}**`
  ];

  if (materials.length > 0) {
    materials.forEach((material, index) => {
      const label = material.kind === "license_key" ? "License key" : "Token";
      const suffix = materials.length > 1 ? ` ${index + 1}` : "";
      deliveryLines.push(`${label}${suffix}: **${escapeDiscordText(material.maskedValue)}**`);
    });
  } else {
    deliveryLines.push("Delivery material: **Manual fulfillment required**");
  }

  if (fulfillment.manualRequired || fulfillmentData.support?.manualRequired) {
    deliveryLines.push("Manual review required: **Yes**");
  }

  const actions = new ActionRowBuilder<ButtonBuilder>().addComponents(
    button(`cm:refund:start:${sessionId}`, "Refund", ButtonStyle.Danger),
    button(`cm:order:fulfillment:${sessionId}`, "Delivery Details"),
    button(`cm:order:refresh:${sessionId}`, "Refresh Order"),
    button(`cm:user:home:${sessionId}`, "User Operations")
  );

  return new ContainerBuilder()
    .addTextDisplayComponents(text(`# Order ${orderRef(order)}\nStatus: **${escapeDiscordText(order.status)}**`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(
      `### Customer\nEmail: ${escapeDiscordText(order.customerEmail ?? overview.identity.email ?? "—")}\nDiscord: ${compactDiscordIdentity(overview)}`
    ))
    .addTextDisplayComponents(text(
      `### Purchase\n${purchaseLines.join("\n")}\nAmount: **${formatMoney(order.amountCents, order.currency)}**\nPayment: ${escapeDiscordText(order.payment.method)}\nPlaced: ${formatDiscordTimestampPair(order.createdAt)}`
    ))
    .addTextDisplayComponents(text(`### Fulfillment\n${deliveryLines.join("\n")}`))
    .addActionRowComponents(actions)
    .addActionRowComponents(shareRow(sessionId));
}

export function buildFulfillmentPanel(
  sessionId: string,
  data: OrderFulfillmentData
): ContainerBuilder {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(text(
      `# Delivery Details\nOrder **${orderRef(data.order)}** · ${escapeDiscordText(data.order.status)}`
    ))
    .addSeparatorComponents(separator());

  if (data.fulfillments.length === 0) {
    container.addTextDisplayComponents(text("No fulfillment records were returned."));
  } else {
    data.fulfillments.forEach((item, index) => {
      const deliveryKind = item.kind === "account" ? ` · ${escapeDiscordText(item.deliveryKind)}` : "";
      const lines = [
        `**${index + 1}. ${item.kind.toUpperCase()}**${deliveryKind}`,
        `Status: **${escapeDiscordText(item.status)}** · Delivered: ${item.quantityDelivered}/${item.quantityRequested}`
      ];
      if (item.failureCode) lines.push(`Failure: ${escapeDiscordText(item.failureCode)}`);
      if (item.manualRequiredAt) lines.push(`Manual review: ${formatDiscordTimestampPair(item.manualRequiredAt)}`);
      if (item.userMessage) lines.push(`Message: ${escapeDiscordText(item.userMessage)}`);
      container.addTextDisplayComponents(text(lines.join("\n")));
    });
  }

  return container
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        button(`cm:order:back:${sessionId}`, "Back to Order")
      )
    )
    .addActionRowComponents(shareRow(sessionId));
}

export function buildRefundPreviewPanel(
  sessionId: string,
  preview: OrderRefundPreviewData,
  reason: string,
  note?: string
): ContainerBuilder {
  const refundLines = [
    `Refund: **${formatMoney(preview.grossRefundCents, preview.currency)}**`,
    `Wallet credit: **${formatMoney(preview.finalWalletCreditCents, preview.currency)}**`,
    `Aura recovered: ${preview.auraRecovered}`
  ];
  if (preview.auraUnrecoverable > 0) refundLines.push(`Aura unrecoverable: ${preview.auraUnrecoverable}`);

  const container = new ContainerBuilder()
    .addTextDisplayComponents(text(`# Refund Preview\nOrder **${orderRef(preview)}**`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(refundLines.join("\n")))
    .addTextDisplayComponents(text(`### Reason\n${escapeDiscordText(reason)}`));

  if (note) container.addTextDisplayComponents(text(`> ${escapeDiscordText(note)}`));

  return container
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        button(`cm:refund:confirm:${sessionId}`, "Confirm Refund", ButtonStyle.Danger),
        button(`cm:refund:cancel:${sessionId}`, "Cancel")
      )
    )
    .addActionRowComponents(shareRow(sessionId));
}

export function buildRefundSuccessPanel(
  sessionId: string,
  refund: OrderRefundExecuteData,
  auditPosted: boolean
): ContainerBuilder {
  const resultLines = [
    `Wallet credit: **${formatMoney(refund.finalWalletCreditCents, refund.currency)}**`,
    `Aura recovered: ${refund.auraRecovered}`,
    `Completed: ${formatDiscordTimestampPair(refund.refundedAt)}`
  ];
  if (refund.idempotentReplay) resultLines.push("> Backend confirmed this was an idempotent replay of the same refund.");
  if (!auditPosted) resultLines.push("> Discord audit failed to post; the backend audit remains authoritative.");

  return new ContainerBuilder()
    .addTextDisplayComponents(text(`# Refund Complete\nOrder **${orderRef(refund)}** has been refunded.`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(resultLines.join("\n")))
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        button(`cm:order:refresh:${sessionId}`, "Open Order", ButtonStyle.Primary),
        button(`cm:user:home:${sessionId}`, "User Operations")
      )
    )
    .addActionRowComponents(shareRow(sessionId));
}

export function buildAdjustmentPreviewPanel(
  sessionId: string,
  proposal: UserAdjustmentProposal,
  note?: string
): ContainerBuilder {
  const isAura = proposal.kind === "aura";
  const before = isAura
    ? `${(proposal.beforeAvailableAura ?? 0).toLocaleString()} Aura${proposal.beforeAvailableAura === null ? " (no prior balance row)" : ""}`
    : `${formatMoney(proposal.beforeBalanceCents ?? 0, proposal.currency)}${proposal.beforeBalanceCents === null ? " (no prior wallet row)" : ""}`;
  const delta = isAura
    ? `${signedInteger(proposal.deltaAura)} Aura`
    : formatSignedMoney(proposal.deltaCents, proposal.currency);
  const projected = isAura
    ? `${proposal.projectedAvailableAura.toLocaleString()} Aura`
    : formatMoney(proposal.projectedBalanceCents, proposal.currency);

  const container = new ContainerBuilder()
    .addTextDisplayComponents(text(`# ${isAura ? "Aura" : "Wallet"} Adjustment Preview`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(
      `Current: **${before}**\nChange: **${delta}**\nProjected: **${projected}**`
    ))
    .addTextDisplayComponents(text(`### Reason\n${escapeDiscordText(proposal.reason)}`))
    .addTextDisplayComponents(text("> Balance is rechecked at confirmation; a changed balance blocks the adjustment."));
  if (note) container.addTextDisplayComponents(text(`> ${escapeDiscordText(note)}`));

  return container
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        button(`cm:adjust:confirm:${sessionId}`, `Confirm ${isAura ? "Aura" : "Wallet"} Adjustment`, ButtonStyle.Danger),
        button(`cm:adjust:cancel:${sessionId}`, "Cancel")
      )
    )
    .addActionRowComponents(shareRow(sessionId));
}

export function buildAdjustmentSuccessPanel(
  sessionId: string,
  kind: "aura" | "wallet",
  result: AuraAdjustmentData | WalletAdjustmentData,
  auditPosted: boolean
): ContainerBuilder {
  const isAura = kind === "aura" && "deltaAura" in result;
  const delta = isAura
    ? `${signedInteger(result.deltaAura)} Aura`
    : "deltaCents" in result
      ? formatSignedMoney(result.deltaCents, result.currency)
      : "—";
  const balance = isAura
    ? `${result.availableAura.toLocaleString()} Aura`
    : "balanceCents" in result
      ? formatMoney(result.balanceCents, result.currency)
      : "—";
  const resultLines = [
    `Applied: **${delta}**`,
    `New balance: **${balance}**`,
    `Completed: ${formatDiscordTimestampPair(result.createdAt)}`
  ];
  if (result.idempotentReplay) resultLines.push("> Backend confirmed this was an idempotent replay of the same adjustment.");
  if (!auditPosted) resultLines.push("> Discord audit failed to post; the backend audit remains authoritative.");

  return new ContainerBuilder()
    .addTextDisplayComponents(text(`# ${kind === "aura" ? "Aura" : "Wallet"} Adjustment Complete`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(resultLines.join("\n")))
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        button(`cm:user:home:${sessionId}`, "User Operations", ButtonStyle.Primary)
      )
    )
    .addActionRowComponents(shareRow(sessionId));
}

export function buildBlockedPanel(
  sessionId: string,
  title: string,
  message: string,
  returnTo: "user" | "order"
): ContainerBuilder {
  return new ContainerBuilder()
    .addTextDisplayComponents(text(`# ${escapeDiscordText(title)}\n${escapeDiscordText(message)}`))
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        button(
          returnTo === "order" ? `cm:order:back:${sessionId}` : `cm:user:home:${sessionId}`,
          returnTo === "order" ? "Back to Order" : "Back to User Operations"
        )
      )
    );
}

export function buildNoticePanel(
  sessionId: string | null,
  title: string,
  message: string,
  returnTo?: "user" | "order"
): ContainerBuilder {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(text(`# ${escapeDiscordText(title)}\n${escapeDiscordText(message)}`));
  if (sessionId && returnTo) {
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        button(
          returnTo === "order" ? `cm:order:back:${sessionId}` : `cm:user:home:${sessionId}`,
          returnTo === "order" ? "Back to Order" : "Back to User Operations"
        )
      )
    );
  }
  return container;
}
