import assert from "node:assert/strict";
import test from "node:test";
import { MessageFlags, type ButtonInteraction, type MessageCreateOptions } from "discord.js";
import type { OrderDetailsData, UserOverviewData } from "../../src/api/schemas";
import { buildPublicSharePanel, shareCurrentPanel } from "../../src/commands/cmShare";
import type { CmAdminSession } from "../../src/commands/cmSessions";
import { escapeDiscordText } from "../../src/discord/presentation";
import { safeAllowedMentions } from "../../src/discord/safeMessages";

const USER_ID = "550e8400-e29b-41d4-a716-446655440000";
const ORDER_ID = "550e8400-e29b-41d4-a716-446655440001";
const SESSION_ID = "550e8400-e29b-41d4-a716-446655440002";
const ADMIN_ID = "123456789012345681";
const DISCORD_USER_ID = "123456789012345682";
const CREATED_AT = "2026-08-10T00:00:00.000Z";
const PRIVATE_EMAIL = "private@example.com";
const PRIVATE_PROVIDER = "internal-provider";

const overview = {
  identity: {
    userId: USER_ID,
    email: PRIVATE_EMAIL,
    createdAt: CREATED_AT,
    lastSignInAt: "2026-08-11T01:02:03.000Z",
    externalIdentities: [{
      provider: "discord",
      externalUserId: DISCORD_USER_ID,
      username: "customer",
      displayName: "Customer",
      linkedAt: "2026-08-09T05:00:00.000Z"
    }]
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
    licenseOptionId: "standard",
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
} satisfies UserOverviewData;

const selectedOrder = {
  orderId: ORDER_ID,
  publicRef: "CM-TEST",
  purchaseKind: "product",
  productSlug: "example-product",
  licenseOptionId: "standard",
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
  customerEmail: PRIVATE_EMAIL,
  payment: { method: "wallet", provider: PRIVATE_PROVIDER },
  fulfillmentSummary: {
    linkedLicenseCount: 1,
    accountDeliveryCount: 0,
    productDeliveryCount: 1,
    quantityRequested: 1,
    quantityDelivered: 1,
    manualRequired: false
  }
} satisfies OrderDetailsData;

function session(): CmAdminSession {
  return {
    id: SESSION_ID,
    operatorId: ADMIN_ID,
    overview,
    selectedOrder,
    shareView: { kind: "user" },
    createdAtMs: 0,
    touchedAtMs: 0
  };
}

function collectContent(value: unknown): string {
  if (Array.isArray(value)) return value.map(collectContent).join("\n");
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  const own = typeof record.content === "string" ? record.content : "";
  return [own, ...Object.values(record).map(collectContent)].filter(Boolean).join("\n");
}

function panelData(sessionState: CmAdminSession): { content: string; serialized: string } {
  const panel = buildPublicSharePanel(sessionState);
  assert.ok(panel);
  const json = panel.toJSON();
  return { content: collectContent(json), serialized: JSON.stringify(json) };
}

function assertAbsentEvenIfEscaped(content: string, privateValue: string): void {
  assert.equal(content.includes(privateValue), false);
  assert.equal(content.includes(escapeDiscordText(privateValue)), false);
}

test("customer-safe user share has no controls or private account identifiers and uses Discord timestamps", () => {
  const state = session();
  const { content, serialized } = panelData(state);
  const unix = Math.floor(Date.parse(CREATED_AT) / 1000);

  assertAbsentEvenIfEscaped(content, PRIVATE_EMAIL);
  assertAbsentEvenIfEscaped(content, USER_ID);
  assert.equal(content.includes(`<@${DISCORD_USER_ID}>`), true);
  assert.equal(content.includes(`<t:${unix}:f>`), true);
  assert.equal(content.includes(`<t:${unix}:R>`), true);
  assert.equal(serialized.includes("custom_id"), false);
});

test("customer-safe order share omits private email, internal user id, provider, and controls", () => {
  const state = session();
  state.shareView = { kind: "order" };
  const { content, serialized } = panelData(state);

  assertAbsentEvenIfEscaped(content, PRIVATE_EMAIL);
  assertAbsentEvenIfEscaped(content, USER_ID);
  assertAbsentEvenIfEscaped(content, PRIVATE_PROVIDER);
  assert.equal(content.includes(escapeDiscordText("CM-TEST")), true);
  assert.equal(serialized.includes("custom_id"), false);
});

test("customer-safe refund preview does not expose admin reason or backend identifiers", () => {
  const state = session();
  const privateReason = "INTERNAL ONLY REASON";
  state.refundProposal = {
    orderId: ORDER_ID,
    reason: privateReason,
    preview: {
      status: "eligible",
      orderId: ORDER_ID,
      publicRef: "CM-TEST",
      userId: USER_ID,
      purchaseKind: "product",
      productSlug: "example-product",
      accountSlug: null,
      currency: "USD",
      grossRefundCents: 1000,
      finalWalletCreditCents: 1000,
      auraAwarded: 0,
      auraRecovered: 0,
      auraRecoveredAvailable: 0,
      auraRecoveredPending: 0,
      auraUnrecoverable: 0,
      auraConvertible: 0,
      auraDeductionCents: 0,
      auraResidual: 0
    },
    operator: { provider: "discord", externalUserId: ADMIN_ID },
    idempotencyKey: "550e8400-e29b-41d4-a716-446655440003",
    expiresAtMs: 1_000
  };
  state.shareView = { kind: "refund-preview" };
  const { content, serialized } = panelData(state);

  assertAbsentEvenIfEscaped(content, privateReason);
  assertAbsentEvenIfEscaped(content, USER_ID);
  assert.equal(serialized.includes("idempotency"), false);
  assert.equal(serialized.includes("custom_id"), false);
});

test("Share to Chat posts a buttonless Components V2 copy and gives only the admin an ephemeral acknowledgement", async () => {
  const state = session();
  const sends: MessageCreateOptions[] = [];
  const replies: unknown[] = [];
  const channel = {
    isTextBased: () => true,
    send: async (payload: MessageCreateOptions) => {
      sends.push(payload);
      return {};
    }
  };
  const fake = {
    channel,
    replied: false,
    deferred: false,
    deferReply: async (payload: unknown) => { replies.push(payload); fake.deferred = true; },
    editReply: async (payload: unknown) => { replies.push(payload); },
    reply: async (payload: unknown) => { replies.push(payload); }
  };

  await shareCurrentPanel(fake as unknown as ButtonInteraction, state);
  assert.equal(sends.length, 1);
  assert.equal(sends[0]?.flags, MessageFlags.IsComponentsV2);
  assert.deepEqual(sends[0]?.allowedMentions, safeAllowedMentions);
  const publicJson = JSON.stringify((sends[0]?.components?.[0] as { toJSON(): unknown }).toJSON());
  assert.equal(publicJson.includes("custom_id"), false);
  assert.deepEqual(replies[0], { flags: MessageFlags.Ephemeral });
});
