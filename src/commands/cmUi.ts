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

function escapeText(value: string | null | undefined): string {
  if (!value) return "—";
  return value
    .replace(/\\/g, "\\\\")
    .replace(/([`*_{}\[\]()<>#+\-.!|])/g, "\\$1")
    .replace(/@/g, "@\u200b")
    .slice(0, 500);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toISOString().replace("T", " ").replace(".000Z", " UTC");
}

function formatMoney(cents: number, currency: string): string {
  const safeCurrency = escapeText(currency.toUpperCase());
  return `${safeCurrency} ${(cents / 100).toFixed(2)}`;
}

function signedInteger(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toLocaleString()}`;
}

function orderLabel(order: RecentOrderData | OrderDetailsData): string {
  return escapeText(
    order.accountName
      ?? order.accountGameName
      ?? order.productSlug
      ?? order.accountSlug
      ?? "Order"
  );
}

function orderRef(order: { publicRef: string | null; orderId: string }): string {
  return escapeText(order.publicRef ?? order.orderId);
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
    ? `${formatMoney(overview.wallet.balanceCents, overview.wallet.currency)}\nUpdated: ${formatDate(overview.wallet.updatedAt)}`
    : "No wallet record";
  const aura = overview.aura
    ? `Available: **${overview.aura.availableAura.toLocaleString()}**\nPending: ${overview.aura.pendingAura.toLocaleString()}\nLifetime earned: ${overview.aura.lifetimeEarnedAura.toLocaleString()}`
    : "No Aura record";
  const latestText = latest
    ? `**${orderRef(latest)}** — ${orderLabel(latest)}\n${escapeText(latest.status)} · ${formatMoney(latest.amountCents, latest.currency)} · ${formatDate(latest.createdAt)}`
    : "No recent orders";

  const actions = new ActionRowBuilder<ButtonBuilder>().addComponents(
    button(`cm:adjust:aura:${sessionId}`, "Adjust Aura", ButtonStyle.Primary),
    button(`cm:adjust:wallet:${sessionId}`, "Adjust Wallet", ButtonStyle.Primary),
    button(`cm:order:open:${sessionId}:0`, "Open Recent Order", ButtonStyle.Primary).setDisabled(!latest),
    button(`cm:user:orders:${sessionId}:0`, "Order History")
  );

  return new ContainerBuilder()
    .addTextDisplayComponents(text(`# CM User Operations\n**${escapeText(overview.identity.email ?? overview.identity.userId)}**`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(
      `### Account\nStatus: **${overview.accountControl.isBanned ? "BANNED" : "Active"}**\nCreated: ${formatDate(overview.identity.createdAt)}\nLast sign-in: ${formatDate(overview.identity.lastSignInAt)}`
    ))
    .addTextDisplayComponents(text(`### Wallet\n${wallet}`))
    .addTextDisplayComponents(text(`### Aura\n${aura}`))
    .addTextDisplayComponents(text(
      `### Counts\nOrders: **${overview.counts.orders}** · Licenses: ${overview.counts.licenses} · Account deliveries: ${overview.counts.accountDeliveries}`
    ))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(`### Most Recent Order\n${latestText}`))
    .addActionRowComponents(actions);
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
  const container = new ContainerBuilder()
    .addTextDisplayComponents(text(`# Recent Orders\n${escapeText(overview.identity.email ?? overview.identity.userId)}\nPage **${page + 1}/${pageCount}**`));

  if (overview.counts.orders > totalVisible) {
    container.addTextDisplayComponents(text(
      `> Showing the latest **${totalVisible}** of **${overview.counts.orders}** orders. The current CM API returns at most 10 recent orders per user overview.`
    ));
  }

  container.addSeparatorComponents(separator());
  if (pageOrders.length === 0) {
    container.addTextDisplayComponents(text("No recent orders were returned."));
  } else {
    pageOrders.forEach((order, offset) => {
      const absoluteIndex = start + offset;
      container.addTextDisplayComponents(text(
        `**${absoluteIndex + 1}. ${orderRef(order)}** — ${orderLabel(order)}\nStatus: ${escapeText(order.status)} · ${formatMoney(order.amountCents, order.currency)} · Qty ${order.quantity}\n${formatDate(order.createdAt)}`
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
  return container.addActionRowComponents(nav);
}

export function buildOrderPanel(sessionId: string, order: OrderDetailsData): ContainerBuilder {
  const productOrAccount = order.purchaseKind === "product"
    ? `Product: ${escapeText(order.productSlug)}\nLicense option: ${escapeText(order.licenseOptionId)}`
    : `Account: ${escapeText(order.accountName ?? order.accountSlug)}\nVariant: ${escapeText(order.accountVariantLabel ?? order.accountVariantId)}\nGame: ${escapeText(order.accountGameName)}`;
  const fulfillment = order.fulfillmentSummary;
  const actions = new ActionRowBuilder<ButtonBuilder>().addComponents(
    button(`cm:refund:start:${sessionId}`, "Refund", ButtonStyle.Danger),
    button(`cm:order:fulfillment:${sessionId}`, "Fulfillment"),
    button(`cm:order:refresh:${sessionId}`, "Refresh Order"),
    button(`cm:user:home:${sessionId}`, "User Operations"),
    button(`cm:user:orders:${sessionId}:0`, "Order History")
  );

  return new ContainerBuilder()
    .addTextDisplayComponents(text(`# Order ${orderRef(order)}\nStatus: **${escapeText(order.status)}**`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(
      `### Customer\n${escapeText(order.customerEmail)}\nUser ID: ${escapeText(order.userId)}`
    ))
    .addTextDisplayComponents(text(
      `### Purchase\nType: **${order.purchaseKind}**\n${productOrAccount}\nQuantity: ${order.quantity}\nAmount: **${formatMoney(order.amountCents, order.currency)}**\nCreated: ${formatDate(order.createdAt)}`
    ))
    .addTextDisplayComponents(text(
      `### Payment\nMethod: ${escapeText(order.payment.method)}\nProvider: ${escapeText(order.payment.provider)}`
    ))
    .addTextDisplayComponents(text(
      `### Fulfillment Summary\nRequested: ${fulfillment.quantityRequested} · Delivered: ${fulfillment.quantityDelivered}\nLicenses: ${fulfillment.linkedLicenseCount} · Account deliveries: ${fulfillment.accountDeliveryCount} · Product deliveries: ${fulfillment.productDeliveryCount}\nManual required: **${fulfillment.manualRequired ? "Yes" : "No"}**`
    ))
    .addActionRowComponents(actions);
}

export function buildFulfillmentPanel(
  sessionId: string,
  data: OrderFulfillmentData
): ContainerBuilder {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(text(
      `# Fulfillment Diagnostics\nOrder **${orderRef(data.order)}** · ${escapeText(data.order.status)}\nLinked licenses: ${data.linkedLicenseCount}`
    ))
    .addSeparatorComponents(separator());

  if (data.fulfillments.length === 0) {
    container.addTextDisplayComponents(text("No fulfillment records were returned."));
  } else {
    data.fulfillments.forEach((item, index) => {
      const deliveryKind = item.kind === "account" ? ` · ${escapeText(item.deliveryKind)}` : "";
      container.addTextDisplayComponents(text(
        `**${index + 1}. ${item.kind.toUpperCase()}**${deliveryKind}\nProvider: ${escapeText(item.providerCode)} · Status: **${escapeText(item.status)}**\nRequested: ${item.quantityRequested} · Delivered: ${item.quantityDelivered}\nFailure: ${escapeText(item.failureCode)}\nManual required at: ${formatDate(item.manualRequiredAt)}\nMessage: ${escapeText(item.userMessage)}`
      ));
    });
  }

  const actions = new ActionRowBuilder<ButtonBuilder>().addComponents(
    button(`cm:block:manual:${sessionId}`, "Manual Fulfillment"),
    button(`cm:order:back:${sessionId}`, "Back to Order"),
    button(`cm:user:home:${sessionId}`, "User Operations")
  );
  return container.addActionRowComponents(actions);
}

export function buildRefundPreviewPanel(
  sessionId: string,
  preview: OrderRefundPreviewData,
  reason: string,
  note?: string
): ContainerBuilder {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(text(`# Refund Preview\nOrder **${orderRef(preview)}**`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(
      `Gross refund: **${formatMoney(preview.grossRefundCents, preview.currency)}**\nWallet credit: **${formatMoney(preview.finalWalletCreditCents, preview.currency)}**\nAura awarded: ${preview.auraAwarded}\nAura recovered: ${preview.auraRecovered} (${preview.auraRecoveredAvailable} available + ${preview.auraRecoveredPending} pending)\nAura unrecoverable: ${preview.auraUnrecoverable}\nAura deduction: ${formatMoney(preview.auraDeductionCents, preview.currency)}\nResidual Aura: ${preview.auraResidual}`
    ))
    .addTextDisplayComponents(text(`### Reason\n${escapeText(reason)}`));

  if (note) container.addTextDisplayComponents(text(`> ${escapeText(note)}`));

  return container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      button(`cm:refund:confirm:${sessionId}`, "Confirm Refund", ButtonStyle.Danger),
      button(`cm:refund:cancel:${sessionId}`, "Cancel")
    )
  );
}

export function buildRefundSuccessPanel(
  sessionId: string,
  refund: OrderRefundExecuteData,
  auditPosted: boolean
): ContainerBuilder {
  return new ContainerBuilder()
    .addTextDisplayComponents(text(`# Refund Complete\nOrder **${orderRef(refund)}** has been refunded.`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(
      `Wallet credit: **${formatMoney(refund.finalWalletCreditCents, refund.currency)}**\nAura recovered: ${refund.auraRecovered}\nRefunded: ${formatDate(refund.refundedAt)}\nIdempotent replay: ${refund.idempotentReplay ? "Yes" : "No"}\nBackend audit: ${escapeText(refund.auditEventId)}\nDiscord audit: ${auditPosted ? "Posted" : "Failed to post; backend audit is authoritative"}`
    ))
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        button(`cm:order:refresh:${sessionId}`, "Open Order", ButtonStyle.Primary),
        button(`cm:user:home:${sessionId}`, "User Operations"),
        button(`cm:user:orders:${sessionId}:0`, "Order History")
      )
    );
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
    : formatMoney(proposal.deltaCents, proposal.currency).replace(`${escapeText(proposal.currency.toUpperCase())} `, `${escapeText(proposal.currency.toUpperCase())} ${proposal.deltaCents > 0 ? "+" : ""}`);
  const projected = isAura
    ? `${proposal.projectedAvailableAura.toLocaleString()} Aura`
    : formatMoney(proposal.projectedBalanceCents, proposal.currency);

  const container = new ContainerBuilder()
    .addTextDisplayComponents(text(`# ${isAura ? "Aura" : "Wallet"} Adjustment Preview`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(
      `User: ${escapeText(proposal.targetUserId)}\nCurrent: **${before}**\nChange: **${delta}**\nProjected: **${projected}**`
    ))
    .addTextDisplayComponents(text(`### Reason\n${escapeText(proposal.reason)}`))
    .addTextDisplayComponents(text(
      "> Confirming will re-read the current CM balance. If it changed since this preview, execution is blocked and a new preview is required."
    ));
  if (note) container.addTextDisplayComponents(text(`> ${escapeText(note)}`));

  return container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      button(`cm:adjust:confirm:${sessionId}`, `Confirm ${isAura ? "Aura" : "Wallet"} Adjustment`, ButtonStyle.Danger),
      button(`cm:adjust:cancel:${sessionId}`, "Cancel")
    )
  );
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
      ? `${result.currency} ${result.deltaCents > 0 ? "+" : ""}${(result.deltaCents / 100).toFixed(2)}`
      : "—";
  const balance = isAura
    ? `${result.availableAura.toLocaleString()} Aura`
    : "balanceCents" in result
      ? formatMoney(result.balanceCents, result.currency)
      : "—";

  return new ContainerBuilder()
    .addTextDisplayComponents(text(`# ${kind === "aura" ? "Aura" : "Wallet"} Adjustment Complete`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(
      `User: ${escapeText(result.userId)}\nApplied: **${delta}**\nNew balance: **${balance}**\nCreated: ${formatDate(result.createdAt)}\nTransaction: ${escapeText(result.transactionId)}\nBackend audit: ${escapeText(result.auditEventId)}\nIdempotent replay: ${result.idempotentReplay ? "Yes" : "No"}\nDiscord audit: ${auditPosted ? "Posted" : "Failed to post; backend audit is authoritative"}`
    ))
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        button(`cm:user:home:${sessionId}`, "User Operations", ButtonStyle.Primary),
        button(`cm:user:orders:${sessionId}:0`, "Order History")
      )
    );
}

export function buildBlockedPanel(
  sessionId: string,
  title: string,
  message: string,
  returnTo: "user" | "order"
): ContainerBuilder {
  return new ContainerBuilder()
    .addTextDisplayComponents(text(`# ${escapeText(title)}\n${escapeText(message)}`))
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
    .addTextDisplayComponents(text(`# ${escapeText(title)}\n${escapeText(message)}`));
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
