import assert from "node:assert/strict";
import test from "node:test";
import { MessageFlags, type ButtonInteraction, type ModalSubmitInteraction } from "discord.js";
import type { InternalApiClient } from "../../src/api/client";
import type { PurchaseIntentData } from "../../src/api/purchaseIntents";
import type { OrderDetailsData, UserOverviewData } from "../../src/api/schemas";
import {
  confirmPurchaseApproval,
  handlePurchaseApprovalModal,
  type PurchaseApprovalDependencies
} from "../../src/commands/cmPurchaseApproval";
import type { CmAdminSession } from "../../src/commands/cmSessions";
import type { AppConfig } from "../../src/config/env";

const ADMIN_ID = "123456789012345681";
const USER_ID = "550e8400-e29b-41d4-a716-446655440000";
const PURCHASE_ID = "550e8400-e29b-41d4-a716-446655440010";
const ORDER_ID = "550e8400-e29b-41d4-a716-446655440011";
const SESSION_ID = "550e8400-e29b-41d4-a716-446655440012";
const IDEMPOTENCY_ID = "550e8400-e29b-41d4-a716-446655440013";
const AUDIT_CHANNEL_ID = "123456789012345699";

const overview = {
  identity: {
    userId: USER_ID,
    email: "user@example.com",
    createdAt: "2026-09-09T00:00:00.000Z",
    lastSignInAt: null,
    externalIdentities: []
  },
  accountControl: {
    isBanned: false,
    banReason: null,
    bannedAt: null,
    unbannedAt: null,
    updatedAt: null
  },
  wallet: null,
  aura: null,
  counts: { orders: 0, licenses: 0, accountDeliveries: 0 },
  recentOrders: []
} satisfies UserOverviewData;

const pendingPurchase = {
  purchaseIntentId: PURCHASE_ID,
  publicRef: "CM-PENDING",
  userId: USER_ID,
  purchaseKind: "product",
  productSlug: "product",
  licenseOptionId: "7-day",
  accountSlug: null,
  accountVariantId: null,
  accountName: null,
  accountVariantLabel: null,
  accountGameName: null,
  quantity: 1,
  amountCents: 1200,
  currency: "USD",
  paymentMethod: "crypto",
  paymentProvider: "oxapay",
  status: "pending",
  providerStatus: "waiting",
  orderId: null,
  expiresAt: "2026-09-09T01:00:00.000Z",
  createdAt: "2026-09-09T00:00:00.000Z"
} satisfies PurchaseIntentData;

const order = {
  orderId: ORDER_ID,
  publicRef: "CM-ORDER",
  purchaseKind: "product",
  productSlug: "product",
  licenseOptionId: "7-day",
  accountSlug: null,
  accountVariantId: null,
  accountName: null,
  accountVariantLabel: null,
  accountGameName: null,
  quantity: 1,
  amountCents: 1200,
  currency: "USD",
  status: "paid",
  createdAt: "2026-09-09T00:05:00.000Z",
  userId: USER_ID,
  customerEmail: "user@example.com",
  payment: { method: "crypto", provider: "oxapay" },
  fulfillmentSummary: {
    linkedLicenseCount: 0,
    accountDeliveryCount: 0,
    productDeliveryCount: 0,
    quantityRequested: 1,
    quantityDelivered: 0,
    manualRequired: false
  }
} satisfies OrderDetailsData;

const config = {
  discordGuildId: "123456789012345672",
  botAdminUserIds: [ADMIN_ID],
  botAuditLogChannelId: AUDIT_CHANNEL_ID
} as unknown as AppConfig;

function session(): CmAdminSession {
  return {
    id: SESSION_ID,
    operatorId: ADMIN_ID,
    overview,
    selectedPurchaseIntent: pendingPurchase,
    shareView: { kind: "purchase-intent" },
    createdAtMs: 0,
    touchedAtMs: 0
  };
}

function modal(reason = "Payment verified manually.", evidence = "Ticket 1234") {
  const edits: unknown[] = [];
  const fake = {
    isFromMessage: () => true,
    user: { id: ADMIN_ID, username: "admin", globalName: "Admin" },
    fields: {
      getTextInputValue: (id: string) => id === "reason" ? reason : evidence
    },
    deferUpdate: async () => undefined,
    editReply: async (payload: unknown) => { edits.push(payload); },
    replied: false,
    deferred: false,
    reply: async () => undefined,
    followUp: async () => undefined
  };
  return { interaction: fake as unknown as ModalSubmitInteraction, edits };
}

function button() {
  const edits: unknown[] = [];
  const updates: unknown[] = [];
  const fake = {
    user: { id: ADMIN_ID, username: "admin", globalName: "Admin" },
    client: {},
    deferUpdate: async () => undefined,
    editReply: async (payload: unknown) => { edits.push(payload); },
    update: async (payload: unknown) => { updates.push(payload); },
    replied: false,
    deferred: false,
    reply: async () => undefined,
    followUp: async () => undefined
  };
  return { interaction: fake as unknown as ButtonInteraction, edits, updates };
}

function dependencies(audit?: (input: unknown) => Promise<void>): PurchaseApprovalDependencies {
  return {
    nowMs: () => Date.parse("2026-09-09T00:10:00.000Z"),
    idempotencyKey: () => IDEMPOTENCY_ID,
    postPurchaseApprovalAudit: (audit ?? (async () => undefined)) as PurchaseApprovalDependencies["postPurchaseApprovalAudit"]
  };
}

test("approval modal freezes canonical purchase target and one idempotency key before confirmation", async () => {
  const state = session();
  const api = {
    fetchPurchaseIntent: async () => pendingPurchase,
    fetchUserOverview: async () => overview
  } as unknown as InternalApiClient;
  const context = modal();

  await handlePurchaseApprovalModal(context.interaction, state, api, dependencies());

  assert.equal(state.purchaseApprovalProposal?.purchaseIntentId, PURCHASE_ID);
  assert.equal(state.purchaseApprovalProposal?.userId, USER_ID);
  assert.equal(state.purchaseApprovalProposal?.idempotencyKey, IDEMPOTENCY_ID);
  assert.equal(state.purchaseApprovalProposal?.submitted, false);
  assert.equal(state.purchaseApprovalProposal?.reason, "Payment verified manually.");
  assert.equal(state.purchaseApprovalProposal?.evidenceReference, "Ticket 1234");
  const serialized = JSON.stringify(context.edits[0]);
  assert.equal(serialized.includes("Manual Payment Approval"), true);
  assert.equal(serialized.includes("Confirm Manual Approval"), true);
});

test("confirmed approval executes exact purchase process and returns a shareable canonical order result", async () => {
  const state = session();
  state.purchaseApprovalProposal = {
    purchaseIntentId: PURCHASE_ID,
    userId: USER_ID,
    sourceStatus: "pending",
    reason: "Payment verified manually.",
    evidenceReference: "Ticket 1234",
    operator: {
      provider: "discord",
      externalUserId: ADMIN_ID,
      username: "admin",
      displayName: "Admin"
    },
    idempotencyKey: IDEMPOTENCY_ID,
    expiresAtMs: Date.parse("2026-09-09T00:15:00.000Z"),
    submitted: false
  };

  let processInput: unknown;
  let lookupCalls = 0;
  let auditInput: unknown;
  const processedPurchase = { ...pendingPurchase, status: "paid", orderId: ORDER_ID } satisfies PurchaseIntentData;
  const api = {
    fetchPurchaseIntent: async () => {
      lookupCalls += 1;
      return lookupCalls === 1 ? pendingPurchase : processedPurchase;
    },
    fetchUserOverview: async () => overview,
    processPurchaseIntent: async (input: unknown) => {
      processInput = input;
      return {
        processing: { status: "processed" },
        effectsStatus: "pending",
        idempotentReplay: false
      };
    },
    fetchOrderDetails: async () => order
  } as unknown as InternalApiClient;
  const context = button();

  await confirmPurchaseApproval(
    context.interaction,
    state,
    api,
    config,
    dependencies(async (input) => { auditInput = input; })
  );

  assert.deepEqual(processInput, {
    selector: { kind: "purchase_intent_id", value: PURCHASE_ID },
    reason: "Payment verified manually.",
    evidenceReference: "Ticket 1234",
    idempotencyKey: IDEMPOTENCY_ID,
    operator: {
      provider: "discord",
      externalUserId: ADMIN_ID,
      username: "admin",
      displayName: "Admin"
    }
  });
  assert.equal((auditInput as { orderRef: string }).orderRef, "CM-ORDER");
  assert.equal(state.selectedOrder?.orderId, ORDER_ID);
  assert.equal(state.selectedPurchaseIntent, undefined);
  assert.equal(state.purchaseApprovalProposal, undefined);
  assert.deepEqual(state.shareView, { kind: "purchase-approval-success" });
  const serialized = JSON.stringify(context.edits[0]);
  assert.equal(serialized.includes("Manual Approval Complete"), true);
  assert.equal(serialized.includes("Share to Chat"), true);
});

test("HTTP processing result locks the session against a second approval and leaves refresh as recovery", async () => {
  const state = session();
  state.purchaseApprovalProposal = {
    purchaseIntentId: PURCHASE_ID,
    userId: USER_ID,
    sourceStatus: "pending",
    reason: "Payment verified manually.",
    operator: { provider: "discord", externalUserId: ADMIN_ID },
    idempotencyKey: IDEMPOTENCY_ID,
    expiresAtMs: Date.parse("2026-09-09T00:15:00.000Z"),
    submitted: false
  };
  const api = {
    fetchPurchaseIntent: async () => pendingPurchase,
    fetchUserOverview: async () => overview,
    processPurchaseIntent: async () => ({
      processing: { status: "processing" },
      effectsStatus: "pending",
      idempotentReplay: false
    })
  } as unknown as InternalApiClient;
  const context = button();

  await confirmPurchaseApproval(context.interaction, state, api, config, dependencies());

  assert.equal(state.purchaseApprovalProposal?.submitted, true);
  assert.deepEqual(state.shareView, { kind: "purchase-intent" });
  const serialized = JSON.stringify(context.edits[0]);
  assert.equal(serialized.includes("Manual Approval Processing"), true);
  assert.equal(serialized.includes("Refresh Purchase"), true);
  assert.equal(serialized.includes("Confirm Manual Approval"), false);
  assert.equal(serialized.includes("Approve Payment"), false);
});
