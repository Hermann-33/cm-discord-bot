import assert from "node:assert/strict";
import test from "node:test";
import type {
  AuraAdjustmentData,
  OrderDetailsData,
  OrderFulfillmentData,
  OrderRefundExecuteData,
  UserOverviewData
} from "../../src/api/schemas";
import {
  buildAdjustmentSuccessPanel,
  buildFulfillmentPanel,
  buildOrderPanel,
  buildRefundSuccessPanel,
  buildUserPanel
} from "../../src/commands/cmUi";
import { escapeDiscordText } from "../../src/discord/presentation";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440002";
const USER_ID = "550e8400-e29b-41d4-a716-446655440000";
const ORDER_ID = "550e8400-e29b-41d4-a716-446655440001";
const DISCORD_USER_ID = "123456789012345682";
const CREATED_AT = "2026-08-10T00:00:00.000Z";
const TRANSACTION_ID = "550e8400-e29b-41d4-a716-446655440003";
const AUDIT_ID = "550e8400-e29b-41d4-a716-446655440004";

function overview(linked: boolean): UserOverviewData {
  return {
    identity: {
      userId: USER_ID,
      email: "user@example.com",
      createdAt: CREATED_AT,
      lastSignInAt: "2026-08-11T00:00:00.000Z",
      externalIdentities: linked ? [{
        provider: "discord",
        externalUserId: DISCORD_USER_ID,
        username: "customer",
        displayName: "Customer Name",
        linkedAt: "2026-08-09T00:00:00.000Z"
      }] : []
    },
    accountControl: {
      isBanned: false,
      banReason: null,
      bannedAt: null,
      unbannedAt: null,
      updatedAt: null
    },
    wallet: {
      balanceCents: 2500,
      currency: "USD",
      updatedAt: "2026-08-12T00:00:00.000Z"
    },
    aura: {
      availableAura: 500,
      pendingAura: 25,
      lifetimeEarnedAura: 1000,
      lifetimeRedeemedAura: 475,
      updatedAt: "2026-08-13T00:00:00.000Z"
    },
    counts: { orders: 1, licenses: 1, accountDeliveries: 0 },
    recentOrders: [{
      orderId: ORDER_ID,
      publicRef: "CM-TEST",
      purchaseKind: "product",
      productSlug: "example-product",
      licenseOptionId: "internal-license-option-id",
      accountSlug: null,
      accountVariantId: null,
      accountName: null,
      accountVariantLabel: null,
      accountGameName: null,
      quantity: 1,
      amountCents: 1000,
      currency: "USD",
      paymentMethod: "wallet",
      paymentProvider: null,
      status: "paid",
      createdAt: CREATED_AT,
      fulfillment: {
        linkedLicenseCount: 1,
        accountDeliveryCount: 0,
        productDeliveryCount: 1,
        quantityRequested: 1,
        quantityDelivered: 1,
        manualRequired: false
      }
    }]
  };
}

const order = {
  orderId: ORDER_ID,
  publicRef: "CM-TEST",
  purchaseKind: "product",
  productSlug: "example-product",
  licenseOptionId: "internal-license-option-id",
  accountSlug: null,
  accountVariantId: null,
  accountName: null,
  accountVariantLabel: null,
  accountGameName: null,
  quantity: 1,
  amountCents: 1000,
  currency: "USD",
  status: "paid",
  createdAt: CREATED_AT,
  userId: USER_ID,
  customerEmail: "user@example.com",
  payment: { method: "wallet", provider: "internal-provider" },
  fulfillmentSummary: {
    linkedLicenseCount: 1,
    accountDeliveryCount: 0,
    productDeliveryCount: 1,
    quantityRequested: 1,
    quantityDelivered: 1,
    manualRequired: false
  }
} satisfies OrderDetailsData;

const fulfillment = {
  order: {
    orderId: ORDER_ID,
    publicRef: "CM-TEST",
    purchaseKind: "product",
    status: "paid"
  },
  linkedLicenseCount: 1,
  fulfillments: [{
    kind: "product",
    deliveryId: "550e8400-e29b-41d4-a716-446655440005",
    providerCode: "internal-provider",
    status: "delivered",
    quantityRequested: 1,
    quantityDelivered: 1,
    failureCode: null,
    userMessage: "Delivered successfully",
    manualRequiredAt: null,
    createdAt: CREATED_AT,
    updatedAt: "2026-08-11T00:00:00.000Z"
  }],
  support: {
    productTypeLabel: "7 Days",
    productDurationDays: 7,
    maskedMaterials: [{ kind: "license_key", maskedValue: "ABCD-****-WXYZ" }],
    manualRequired: false
  }
} satisfies OrderFulfillmentData;

const refund = {
  status: "refunded",
  orderId: ORDER_ID,
  publicRef: "CM-TEST",
  userId: USER_ID,
  purchaseKind: "product",
  productSlug: "example-product",
  accountSlug: null,
  currency: "USD",
  grossRefundCents: 1000,
  finalWalletCreditCents: 1000,
  auraAwarded: 10,
  auraRecovered: 10,
  auraRecoveredAvailable: 10,
  auraRecoveredPending: 0,
  auraUnrecoverable: 0,
  auraConvertible: 0,
  auraDeductionCents: 0,
  auraResidual: 0,
  walletTransactionId: TRANSACTION_ID,
  auraTransactionIds: [],
  auditEventId: AUDIT_ID,
  refundedAt: CREATED_AT,
  idempotentReplay: false
} satisfies OrderRefundExecuteData;

const auraAdjustment = {
  userId: USER_ID,
  deltaAura: 100,
  availableAura: 600,
  pendingAura: 25,
  lifetimeEarnedAura: 1100,
  lifetimeRedeemedAura: 475,
  transactionId: TRANSACTION_ID,
  auditEventId: AUDIT_ID,
  createdAt: CREATED_AT,
  idempotentReplay: false
} satisfies AuraAdjustmentData;

function collectContent(value: unknown): string {
  if (Array.isArray(value)) return value.map(collectContent).join("\n");
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  const own = typeof record.content === "string" ? record.content : "";
  return [own, ...Object.values(record).map(collectContent)].filter(Boolean).join("\n");
}

function panelData(value: { toJSON(): unknown }): { content: string; serialized: string } {
  const json = value.toJSON();
  return {
    content: collectContent(json),
    serialized: JSON.stringify(json)
  };
}

function assertAbsentEvenIfEscaped(content: string, value: string): void {
  assert.equal(content.includes(value), false);
  assert.equal(content.includes(escapeDiscordText(value)), false);
}

test("User Operations shows useful Aura and commerce totals", () => {
  const { content, serialized } = panelData(buildUserPanel(SESSION_ID, overview(true)));
  const unix = Math.floor(Date.parse(CREATED_AT) / 1000);

  assert.equal(content.includes(escapeDiscordText("user@example.com")), true);
  assert.equal(content.includes(`<@${DISCORD_USER_ID}>`), true);
  assert.equal(content.includes("Wallet: **USD 25.00**"), true);
  assert.equal(content.includes("Available Aura: **500**"), true);
  assert.equal(content.includes("Lifetime Aura: **1,000**"), true);
  assert.equal(content.includes("Pending Aura: **25**"), true);
  assert.equal(content.includes("Orders: **1**"), true);
  assert.equal(content.includes("Licenses: **1**"), true);
  assert.equal(content.includes("Accounts: **0**"), true);
  assert.equal(content.includes(escapeDiscordText("CM-TEST")), true);
  assert.equal(content.includes(`<t:${unix}:f>`), true);
  assert.equal(content.includes(`<t:${unix}:R>`), true);
  assert.equal(serialized.includes("Share to Chat"), true);

  assert.equal(content.includes("Last sign-in"), false);
  assert.equal(content.includes("Lifetime redeemed"), false);
  assert.equal(content.includes("Updated:"), false);
  assert.equal(content.includes("Customer Name"), false);
  assert.equal(content.includes("Username:"), false);
});

test("User Operations clearly shows when Discord is not linked", () => {
  const { content, serialized } = panelData(buildUserPanel(SESSION_ID, overview(false)));
  assert.equal(content.includes("Discord: **Not linked**"), true);
  assert.equal(serialized.includes("Share to Chat"), true);
});

test("Order Operations shows Discord, product type, provider and masked delivery material", () => {
  const { content, serialized } = panelData(buildOrderPanel(
    SESSION_ID,
    order,
    overview(true),
    fulfillment
  ));

  assert.equal(content.includes(`Email: ${escapeDiscordText("user@example.com")}`), true);
  assert.equal(content.includes(`Discord: <@${DISCORD_USER_ID}>`), true);
  assert.equal(content.includes(escapeDiscordText("example-product")), true);
  assert.equal(content.includes("Type: **7 Days**"), true);
  assert.equal(content.includes("USD 10.00"), true);
  assert.equal(content.includes("Payment: wallet"), true);
  assert.equal(content.includes("Provider: **internal\\-provider**"), true);
  assert.equal(content.includes("Delivered: **1/1**"), true);
  assert.equal(content.includes("License key: **ABCD\\-\\*\\*\\*\\*\\-WXYZ**"), true);
  assert.equal(serialized.includes("Delivery Details"), true);
  assert.equal(serialized.includes("Refund"), true);
  assert.equal(serialized.includes("Refresh Order"), true);
  assert.equal(serialized.includes("User Operations"), true);
  assert.equal(serialized.includes("Share to Chat"), true);

  assertAbsentEvenIfEscaped(content, USER_ID);
  assertAbsentEvenIfEscaped(content, "internal-license-option-id");
  assert.equal(content.includes("Product deliveries:"), false);
  assert.equal(serialized.includes("Order History"), false);
});

test("Order Operations shows Discord not linked and manual fulfillment when no material exists", () => {
  const manualFulfillment = {
    ...fulfillment,
    support: {
      productTypeLabel: "7 Days",
      productDurationDays: 7,
      maskedMaterials: [],
      manualRequired: true
    }
  } satisfies OrderFulfillmentData;
  const manualOrder = {
    ...order,
    fulfillmentSummary: { ...order.fulfillmentSummary, manualRequired: true, quantityDelivered: 0 }
  } satisfies OrderDetailsData;

  const { content } = panelData(buildOrderPanel(
    SESSION_ID,
    manualOrder,
    overview(false),
    manualFulfillment
  ));
  assert.equal(content.includes("Discord: **Not linked**"), true);
  assert.equal(content.includes("Delivery material: **Manual fulfillment required**"), true);
  assert.equal(content.includes("Manual review required: **Yes**"), true);
});

test("Delivery Details keeps useful status/message and drops diagnostic clutter", () => {
  const { content, serialized } = panelData(buildFulfillmentPanel(SESSION_ID, fulfillment));

  assert.equal(content.includes("Delivery Details"), true);
  assert.equal(content.includes("Status: **delivered**"), true);
  assert.equal(content.includes("Delivered: 1/1"), true);
  assert.equal(content.includes("Delivered successfully"), true);
  assert.equal(serialized.includes("Back to Order"), true);
  assert.equal(serialized.includes("Share to Chat"), true);

  assert.equal(content.includes("Provider:"), false);
  assertAbsentEvenIfEscaped(content, "internal-provider");
  assert.equal(content.includes("Created:"), false);
  assert.equal(content.includes("Updated:"), false);
  assert.equal(content.includes("Linked licenses"), false);
  assert.equal(serialized.includes("Manual Fulfillment"), false);
  assert.equal(serialized.includes("User Operations"), false);
});

test("success panels keep outcomes but omit backend bookkeeping", () => {
  const refundData = panelData(buildRefundSuccessPanel(SESSION_ID, refund, true));
  const adjustmentData = panelData(buildAdjustmentSuccessPanel(SESSION_ID, "aura", auraAdjustment, true));

  for (const { content, serialized } of [refundData, adjustmentData]) {
    assertAbsentEvenIfEscaped(content, USER_ID);
    assertAbsentEvenIfEscaped(content, TRANSACTION_ID);
    assertAbsentEvenIfEscaped(content, AUDIT_ID);
    assert.equal(content.includes("Backend audit:"), false);
    assert.equal(content.includes("Discord audit:"), false);
    assert.equal(content.includes("Idempotent replay:"), false);
    assert.equal(serialized.includes("Order History"), false);
  }

  assert.equal(refundData.content.includes("Wallet credit:"), true);
  assert.equal(refundData.content.includes("Aura recovered:"), true);
  assert.equal(adjustmentData.content.includes("Applied:"), true);
  assert.equal(adjustmentData.content.includes("New balance:"), true);
});
