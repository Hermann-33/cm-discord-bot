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
  }]
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

function json(value: { toJSON(): unknown }): string {
  return JSON.stringify(value.toJSON());
}

test("User Operations keeps actionable state while removing profile/stat noise", () => {
  const rendered = json(buildUserPanel(SESSION_ID, overview(true)));
  const unix = Math.floor(Date.parse(CREATED_AT) / 1000);

  assert.equal(rendered.includes("user@example\\.com"), true);
  assert.equal(rendered.includes(`<@${DISCORD_USER_ID}>`), true);
  assert.equal(rendered.includes("Wallet: **USD 25\\.00**"), true);
  assert.equal(rendered.includes("500 available"), true);
  assert.equal(rendered.includes("25 pending"), true);
  assert.equal(rendered.includes("Orders: **1**"), true);
  assert.equal(rendered.includes("CM\\-TEST"), true);
  assert.equal(rendered.includes(`<t:${unix}:f>`), true);
  assert.equal(rendered.includes(`<t:${unix}:R>`), true);
  assert.equal(rendered.includes("Share to Chat"), true);

  assert.equal(rendered.includes("Last sign-in"), false);
  assert.equal(rendered.includes("Lifetime earned"), false);
  assert.equal(rendered.includes("Lifetime redeemed"), false);
  assert.equal(rendered.includes("Updated:"), false);
  assert.equal(rendered.includes("Licenses:"), false);
  assert.equal(rendered.includes("Account deliveries:"), false);
  assert.equal(rendered.includes("Customer Name"), false);
  assert.equal(rendered.includes("Username:"), false);
});

test("User Operations clearly shows when Discord is not linked", () => {
  const rendered = json(buildUserPanel(SESSION_ID, overview(false)));
  assert.equal(rendered.includes("Discord: **Not linked**"), true);
  assert.equal(rendered.includes("Share to Chat"), true);
});

test("Order Operations removes internal IDs and duplicate fulfillment statistics", () => {
  const rendered = json(buildOrderPanel(SESSION_ID, order));

  assert.equal(rendered.includes("user@example\\.com"), true);
  assert.equal(rendered.includes("example\\-product"), true);
  assert.equal(rendered.includes("USD 10\\.00"), true);
  assert.equal(rendered.includes("Payment: wallet"), true);
  assert.equal(rendered.includes("Delivered: **1/1**"), true);
  assert.equal(rendered.includes("Delivery Details"), true);
  assert.equal(rendered.includes("Refund"), true);
  assert.equal(rendered.includes("Refresh Order"), true);
  assert.equal(rendered.includes("User Operations"), true);
  assert.equal(rendered.includes("Share to Chat"), true);

  assert.equal(rendered.includes(USER_ID), false);
  assert.equal(rendered.includes("internal\\-license\\-option\\-id"), false);
  assert.equal(rendered.includes("internal\\-provider"), false);
  assert.equal(rendered.includes("Type:"), false);
  assert.equal(rendered.includes("Licenses:"), false);
  assert.equal(rendered.includes("Account deliveries:"), false);
  assert.equal(rendered.includes("Product deliveries:"), false);
  assert.equal(rendered.includes("Manual review required"), false);
  assert.equal(rendered.includes("Order History"), false);
});

test("Delivery Details keeps useful status/message and drops diagnostic clutter", () => {
  const rendered = json(buildFulfillmentPanel(SESSION_ID, fulfillment));

  assert.equal(rendered.includes("Delivery Details"), true);
  assert.equal(rendered.includes("Status: **delivered**"), true);
  assert.equal(rendered.includes("Delivered: 1/1"), true);
  assert.equal(rendered.includes("Delivered successfully"), true);
  assert.equal(rendered.includes("Back to Order"), true);
  assert.equal(rendered.includes("Share to Chat"), true);

  assert.equal(rendered.includes("Provider:"), false);
  assert.equal(rendered.includes("internal\\-provider"), false);
  assert.equal(rendered.includes("Created:"), false);
  assert.equal(rendered.includes("Updated:"), false);
  assert.equal(rendered.includes("Linked licenses"), false);
  assert.equal(rendered.includes("Manual Fulfillment"), false);
  assert.equal(rendered.includes("User Operations"), false);
});

test("success panels keep outcomes but omit backend bookkeeping", () => {
  const refundRendered = json(buildRefundSuccessPanel(SESSION_ID, refund, true));
  const adjustmentRendered = json(buildAdjustmentSuccessPanel(SESSION_ID, "aura", auraAdjustment, true));

  for (const rendered of [refundRendered, adjustmentRendered]) {
    assert.equal(rendered.includes(USER_ID), false);
    assert.equal(rendered.includes(TRANSACTION_ID), false);
    assert.equal(rendered.includes(AUDIT_ID), false);
    assert.equal(rendered.includes("Backend audit:"), false);
    assert.equal(rendered.includes("Discord audit:"), false);
    assert.equal(rendered.includes("Idempotent replay:"), false);
    assert.equal(rendered.includes("Order History"), false);
  }

  assert.equal(refundRendered.includes("Wallet credit:"), true);
  assert.equal(refundRendered.includes("Aura recovered:"), true);
  assert.equal(adjustmentRendered.includes("Applied:"), true);
  assert.equal(adjustmentRendered.includes("New balance:"), true);
});
