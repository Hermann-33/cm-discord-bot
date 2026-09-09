import assert from "node:assert/strict";
import test from "node:test";
import { MessageFlags, type Interaction } from "discord.js";
import type { InternalApiClient } from "../../src/api/client";
import { InternalApiClientError } from "../../src/api/errors";
import type { PurchaseIntentData } from "../../src/api/purchaseIntents";
import type {
  AuraAdjustmentData,
  OrderDetailsData,
  OrderFulfillmentData,
  OrderRefundExecuteData,
  OrderRefundPreviewData,
  UserOverviewData,
  WalletAdjustmentData
} from "../../src/api/schemas";
import { buildCmCommand, CmAdminController } from "../../src/commands/cm";
import type { AppConfig } from "../../src/config/env";

const GUILD_ID = "123456789012345672";
const ADMIN_CHANNEL_ID = "123456789012345680";
const OTHER_CHANNEL_ID = "999999999999999999";
const ADMIN_ID = "123456789012345681";
const DISCORD_CUSTOMER_ID = "123456789012345682";
const USER_ID = "550e8400-e29b-41d4-a716-446655440000";
const ORDER_ID = "550e8400-e29b-41d4-a716-446655440001";
const PURCHASE_INTENT_ID = "550e8400-e29b-41d4-a716-446655440010";
const IDEMPOTENCY_ID = "550e8400-e29b-41d4-a716-446655440011";
const AUDIT_CHANNEL_ID = "123456789012345699";

const config = {
  discordGuildId: GUILD_ID,
  botAdminUserIds: [ADMIN_ID],
  botAuditLogChannelId: AUDIT_CHANNEL_ID
} as unknown as AppConfig;

const overview = {
  identity: {
    userId: USER_ID,
    email: "user@example.com",
    createdAt: "2026-08-10T00:00:00.000Z",
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
  wallet: {
    balanceCents: 2500,
    currency: "USD",
    updatedAt: "2026-08-10T00:00:00.000Z"
  },
  aura: {
    availableAura: 500,
    pendingAura: 0,
    lifetimeEarnedAura: 1000,
    lifetimeRedeemedAura: 500,
    updatedAt: "2026-08-10T00:00:00.000Z"
  },
  counts: { orders: 0, licenses: 0, accountDeliveries: 0 },
  recentOrders: []
} satisfies UserOverviewData;

const order = {
  orderId: ORDER_ID,
  publicRef: "CM-TEST",
  purchaseKind: "product",
  productSlug: "product",
  licenseOptionId: null,
  accountSlug: null,
  accountVariantId: null,
  accountName: null,
  accountVariantLabel: null,
  accountGameName: null,
  quantity: 1,
  amountCents: 1000,
  currency: "USD",
  status: "paid",
  createdAt: "2026-08-10T00:00:00.000Z",
  userId: USER_ID,
  customerEmail: "user@example.com",
  payment: { method: "wallet", provider: null },
  fulfillmentSummary: {
    linkedLicenseCount: 1,
    accountDeliveryCount: 0,
    productDeliveryCount: 0,
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
    deliveryId: "550e8400-e29b-41d4-a716-446655440006",
    providerCode: "provider",
    status: "delivered",
    quantityRequested: 1,
    quantityDelivered: 1,
    failureCode: null,
    userMessage: null,
    manualRequiredAt: null,
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:00.000Z"
  }],
  support: {
    productTypeLabel: "7 Days",
    productDurationDays: 7,
    maskedMaterials: [{ kind: "license_key", maskedValue: "ABCD-****-WXYZ" }],
    manualRequired: false
  }
} satisfies OrderFulfillmentData;

const pendingPurchase = {
  purchaseIntentId: PURCHASE_INTENT_ID,
  publicRef: "CM-PENDING",
  userId: USER_ID,
  purchaseKind: "product",
  productSlug: "pending-product",
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
  expiresAt: "2026-08-10T01:00:00.000Z",
  createdAt: "2026-08-10T00:00:00.000Z"
} satisfies PurchaseIntentData;

type FakeCommandOptions = {
  userId?: string;
  channelId?: string;
  subcommand?: "user" | "order" | "aura" | "balance" | "refund" | "ticket-allow";
  email?: string | null;
  discordUserId?: string | null;
  reference?: string;
  amount?: string;
  reason?: string | null;
};

function fakeCommand(options: FakeCommandOptions = {}) {
  const {
    userId = ADMIN_ID,
    channelId = ADMIN_CHANNEL_ID,
    subcommand = "user",
    email = ["user", "aura", "balance"].includes(subcommand) ? "user@example.com" : null,
    discordUserId = null,
    reference = "CM-TEST",
    amount = subcommand === "balance" ? "+10.00" : "+250",
    reason = null
  } = options;
  const replies: unknown[] = [];
  const defers: unknown[] = [];
  const edits: unknown[] = [];
  const fake = {
    isChatInputCommand: () => true,
    isButton: () => false,
    isModalSubmit: () => false,
    commandName: "cm",
    guildId: GUILD_ID,
    channelId,
    user: { id: userId, username: "admin", globalName: "Admin" },
    client: {},
    options: {
      getSubcommand: () => subcommand,
      getString: (name: string) =>
        name === "email" ? email
          : name === "reference" ? reference
            : name === "amount" ? amount
              : name === "reason" ? reason
                : null,
      getUser: (name: string) => name === "discord_user" && discordUserId ? { id: discordUserId } : null
    },
    replied: false,
    deferred: false,
    reply: async (payload: unknown) => { replies.push(payload); fake.replied = true; },
    deferReply: async (payload: unknown) => { defers.push(payload); fake.deferred = true; },
    editReply: async (payload: unknown) => { edits.push(payload); },
    followUp: async (payload: unknown) => { replies.push(payload); }
  };
  return { interaction: fake as unknown as Interaction, replies, defers, edits };
}

test("/cm registers direct aura, balance, refund, and existing admin surfaces", () => {
  const json = buildCmCommand().toJSON();
  assert.equal(json.name, "cm");
  assert.deepEqual(
    json.options?.map((option) => option.name),
    ["user", "order", "aura", "balance", "refund", "ticket-allow"]
  );
  const user = json.options?.[0] as { options?: { name: string; required?: boolean }[] };
  const orderCommand = json.options?.[1] as { options?: { name: string; required?: boolean }[] };
  const aura = json.options?.[2] as { options?: { name: string; required?: boolean }[] };
  const balance = json.options?.[3] as { options?: { name: string; required?: boolean }[] };
  const refund = json.options?.[4] as { options?: { name: string; required?: boolean }[] };
  const ticketAllow = json.options?.[5] as { options?: unknown[] };
  assert.deepEqual(user.options?.map((option) => [option.name, option.required]), [
    ["email", false],
    ["discord_user", false]
  ]);
  assert.deepEqual(orderCommand.options?.map((option) => [option.name, option.required]), [["reference", true]]);
  assert.deepEqual(aura.options?.map((option) => [option.name, option.required]), [
    ["amount", true],
    ["email", false],
    ["discord_user", false],
    ["reason", false]
  ]);
  assert.deepEqual(balance.options?.map((option) => [option.name, option.required]), [
    ["amount", true],
    ["email", false],
    ["discord_user", false],
    ["reason", false]
  ]);
  assert.deepEqual(refund.options?.map((option) => [option.name, option.required]), [
    ["reference", true],
    ["reason", false]
  ]);
  assert.deepEqual(ticketAllow.options, []);
});

test("/cm ticket-allow is delegated to the ticket gate controller", async () => {
  const controller = new CmAdminController(config, {} as InternalApiClient);
  const context = fakeCommand({ subcommand: "ticket-allow", email: null });
  assert.equal(await controller.handle(context.interaction), false);
  assert.equal(context.replies.length, 0);
  assert.equal(context.defers.length, 0);
  assert.equal(context.edits.length, 0);
});

test("unauthorized /cm user is rejected before backend lookup", async () => {
  let calls = 0;
  const api = {
    fetchUserOverview: async () => { calls += 1; return overview; }
  } as unknown as InternalApiClient;
  const controller = new CmAdminController(config, api);
  const context = fakeCommand({ userId: "999999999999999997" });
  assert.equal(await controller.handle(context.interaction), true);
  assert.equal(calls, 0);
  assert.equal((context.replies[0] as { flags: number }).flags, MessageFlags.Ephemeral);
});

test("authorized /cm user resolves email through users.overview", async () => {
  let selector: unknown;
  const api = {
    fetchUserOverview: async (input: unknown) => { selector = input; return overview; }
  } as unknown as InternalApiClient;
  const controller = new CmAdminController(config, api);
  const context = fakeCommand();
  assert.equal(await controller.handle(context.interaction), true);
  assert.deepEqual(selector, { kind: "email", value: "user@example.com" });
  assert.deepEqual(context.defers, [{ flags: MessageFlags.Ephemeral }]);
  assert.equal((context.edits[0] as { flags: number }).flags, MessageFlags.IsComponentsV2);
});

test("authorized /cm user resolves a selected Discord user through external identity", async () => {
  let selector: unknown;
  const api = {
    fetchUserOverview: async (input: unknown) => { selector = input; return overview; }
  } as unknown as InternalApiClient;
  const controller = new CmAdminController(config, api);
  const context = fakeCommand({ email: null, discordUserId: DISCORD_CUSTOMER_ID });
  assert.equal(await controller.handle(context.interaction), true);
  assert.deepEqual(selector, {
    kind: "external_identity",
    provider: "discord",
    externalUserId: DISCORD_CUSTOMER_ID
  });
  assert.deepEqual(context.defers, [{ flags: MessageFlags.Ephemeral }]);
});

test("/cm user rejects both lookup options before backend access", async () => {
  let calls = 0;
  const api = {
    fetchUserOverview: async () => { calls += 1; return overview; }
  } as unknown as InternalApiClient;
  const controller = new CmAdminController(config, api);
  const context = fakeCommand({ email: "user@example.com", discordUserId: DISCORD_CUSTOMER_ID });
  assert.equal(await controller.handle(context.interaction), true);
  assert.equal(calls, 0);
  assert.equal((context.replies[0] as { flags: number }).flags, MessageFlags.Ephemeral);
});

test("/cm user rejects a missing lookup before backend access", async () => {
  let calls = 0;
  const api = {
    fetchUserOverview: async () => { calls += 1; return overview; }
  } as unknown as InternalApiClient;
  const controller = new CmAdminController(config, api);
  const context = fakeCommand({ email: null, discordUserId: null });
  assert.equal(await controller.handle(context.interaction), true);
  assert.equal(calls, 0);
  assert.equal((context.replies[0] as { flags: number }).flags, MessageFlags.Ephemeral);
});

test("authorized /cm aura executes immediately from a Discord user and returns only the final result", async () => {
  let lookupSelector: unknown;
  let executedInput: unknown;
  let auditInput: unknown;
  const linkedOverview = {
    ...overview,
    identity: {
      ...overview.identity,
      externalIdentities: [{
        provider: "discord",
        externalUserId: DISCORD_CUSTOMER_ID,
        username: "customer",
        displayName: "Customer",
        linkedAt: "2026-08-10T00:00:00.000Z"
      }]
    }
  } satisfies UserOverviewData;
  const result = {
    userId: USER_ID,
    deltaAura: 250,
    availableAura: 750,
    pendingAura: 0,
    lifetimeEarnedAura: 1250,
    lifetimeRedeemedAura: 500,
    transactionId: "550e8400-e29b-41d4-a716-446655440020",
    auditEventId: "550e8400-e29b-41d4-a716-446655440021",
    createdAt: "2026-09-09T00:00:00.000Z",
    idempotentReplay: false
  } satisfies AuraAdjustmentData;
  const api = {
    fetchUserOverview: async (selector: unknown) => {
      lookupSelector = selector;
      return linkedOverview;
    },
    executeAuraAdjustment: async (input: unknown) => {
      executedInput = input;
      return result;
    }
  } as unknown as InternalApiClient;
  const dependencies = {
    nowMs: () => 0,
    idempotencyKey: () => IDEMPOTENCY_ID,
    postAdjustmentAudit: async (input: unknown) => { auditInput = input; },
    postRefundAudit: async () => undefined,
    postPurchaseApprovalAudit: async () => undefined
  };
  const controller = new CmAdminController(config, api, undefined, dependencies);
  const context = fakeCommand({
    subcommand: "aura",
    email: null,
    discordUserId: DISCORD_CUSTOMER_ID,
    amount: "+250"
  });

  assert.equal(await controller.handle(context.interaction), true);
  assert.deepEqual(lookupSelector, {
    kind: "external_identity",
    provider: "discord",
    externalUserId: DISCORD_CUSTOMER_ID
  });
  assert.deepEqual(executedInput, {
    selector: { kind: "user_id", value: USER_ID },
    deltaAura: 250,
    reason: "Direct Aura adjustment via Discord admin command.",
    idempotencyKey: IDEMPOTENCY_ID,
    operator: {
      provider: "discord",
      externalUserId: ADMIN_ID,
      username: "admin",
      displayName: "Admin"
    }
  });
  assert.equal((auditInput as { delta: number }).delta, 250);
  assert.deepEqual(context.defers, [{ flags: MessageFlags.Ephemeral }]);
  const output = JSON.stringify(context.edits[0]);
  assert.equal(output.includes("Aura Adjustment Complete"), true);
  assert.equal(output.includes("+250 Aura"), true);
  assert.equal(output.includes("750 Aura"), true);
  assert.equal(output.includes("Confirm"), false);
  assert.equal(output.includes("Share to Chat"), true);
});

test("authorized /cm balance executes a signed amount immediately from email", async () => {
  let executedInput: unknown;
  const result = {
    userId: USER_ID,
    deltaCents: -525,
    balanceCents: 1975,
    currency: "USD",
    transactionId: "550e8400-e29b-41d4-a716-446655440022",
    auditEventId: "550e8400-e29b-41d4-a716-446655440023",
    createdAt: "2026-09-09T00:00:00.000Z",
    idempotentReplay: false
  } satisfies WalletAdjustmentData;
  const api = {
    fetchUserOverview: async (selector: unknown) => {
      assert.deepEqual(selector, { kind: "email", value: "user@example.com" });
      return overview;
    },
    executeWalletAdjustment: async (input: unknown) => {
      executedInput = input;
      return result;
    }
  } as unknown as InternalApiClient;
  const dependencies = {
    nowMs: () => 0,
    idempotencyKey: () => IDEMPOTENCY_ID,
    postAdjustmentAudit: async () => undefined,
    postRefundAudit: async () => undefined,
    postPurchaseApprovalAudit: async () => undefined
  };
  const controller = new CmAdminController(config, api, undefined, dependencies);
  const context = fakeCommand({
    subcommand: "balance",
    email: "user@example.com",
    amount: "-5.25",
    reason: "Manual balance correction"
  });

  assert.equal(await controller.handle(context.interaction), true);
  assert.deepEqual(executedInput, {
    selector: { kind: "user_id", value: USER_ID },
    deltaCents: -525,
    reason: "Manual balance correction",
    idempotencyKey: IDEMPOTENCY_ID,
    operator: {
      provider: "discord",
      externalUserId: ADMIN_ID,
      username: "admin",
      displayName: "Admin"
    }
  });
  const output = JSON.stringify(context.edits[0]);
  assert.equal(output.includes("Balance Adjustment Complete"), true);
  assert.equal(output.includes("USD -5.25"), true);
  assert.equal(output.includes("USD 19.75"), true);
  assert.equal(output.includes("Confirm"), false);
  assert.equal(output.includes("Share to Chat"), true);
});

test("authorized /cm refund previews for eligibility then executes immediately and returns final result", async () => {
  let executeInput: unknown;
  let auditInput: unknown;
  const preview = {
    status: "eligible",
    orderId: ORDER_ID,
    publicRef: "CM-TEST",
    userId: USER_ID,
    purchaseKind: "product",
    productSlug: "product",
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
  } satisfies OrderRefundPreviewData;
  const refund = {
    ...preview,
    status: "refunded",
    walletTransactionId: "550e8400-e29b-41d4-a716-446655440024",
    auraTransactionIds: [],
    auditEventId: "550e8400-e29b-41d4-a716-446655440025",
    refundedAt: "2026-09-09T00:00:00.000Z",
    idempotentReplay: false
  } satisfies OrderRefundExecuteData;
  const api = {
    fetchOrderDetails: async (selector: unknown) => {
      assert.deepEqual(selector, { kind: "public_ref", value: "CM-TEST" });
      return order;
    },
    fetchUserOverview: async (selector: unknown) => {
      assert.deepEqual(selector, { kind: "user_id", value: USER_ID });
      return overview;
    },
    previewOrderRefund: async (orderId: string) => {
      assert.equal(orderId, ORDER_ID);
      return preview;
    },
    executeOrderRefund: async (input: unknown) => {
      executeInput = input;
      return refund;
    }
  } as unknown as InternalApiClient;
  const dependencies = {
    nowMs: () => 0,
    idempotencyKey: () => IDEMPOTENCY_ID,
    postAdjustmentAudit: async () => undefined,
    postRefundAudit: async (input: unknown) => { auditInput = input; },
    postPurchaseApprovalAudit: async () => undefined
  };
  const controller = new CmAdminController(config, api, undefined, dependencies);
  const context = fakeCommand({
    subcommand: "refund",
    email: null,
    reference: "cm-test"
  });

  assert.equal(await controller.handle(context.interaction), true);
  assert.deepEqual(executeInput, {
    orderId: ORDER_ID,
    reason: "Direct refund via Discord admin command.",
    idempotencyKey: IDEMPOTENCY_ID,
    operator: {
      provider: "discord",
      externalUserId: ADMIN_ID,
      username: "admin",
      displayName: "Admin"
    }
  });
  assert.equal((auditInput as { orderRef: string }).orderRef, "CM-TEST");
  assert.deepEqual(context.defers, [{ flags: MessageFlags.Ephemeral }]);
  const output = JSON.stringify(context.edits[0]);
  assert.equal(output.includes("Refund Complete"), true);
  assert.equal(output.includes("USD 10.00"), true);
  assert.equal(output.includes("Confirm"), false);
  assert.equal(output.includes("Share to Chat"), true);
});

test("authorized /cm user works from another channel in the configured guild", async () => {
  let calls = 0;
  const api = {
    fetchUserOverview: async () => { calls += 1; return overview; }
  } as unknown as InternalApiClient;
  const controller = new CmAdminController(config, api);
  const context = fakeCommand({ channelId: OTHER_CHANNEL_ID });
  assert.equal(await controller.handle(context.interaction), true);
  assert.equal(calls, 1);
  assert.deepEqual(context.defers, [{ flags: MessageFlags.Ephemeral }]);
});

test("authorized /cm order resolves a canonical order and enriches it when fulfillment support is available", async () => {
  const calls: unknown[] = [];
  const api = {
    fetchOrderDetails: async (selector: unknown) => { calls.push(["order", selector]); return order; },
    fetchUserOverview: async (selector: unknown) => { calls.push(["user", selector]); return overview; },
    fetchOrderFulfillment: async (orderId: string) => { calls.push(["fulfillment", orderId]); return fulfillment; }
  } as unknown as InternalApiClient;
  const controller = new CmAdminController(config, api);
  const context = fakeCommand({ channelId: OTHER_CHANNEL_ID, subcommand: "order", email: null, reference: "cm-test" });
  assert.equal(await controller.handle(context.interaction), true);
  assert.deepEqual(calls, [
    ["order", { kind: "public_ref", value: "CM-TEST" }],
    ["user", { kind: "user_id", value: USER_ID }],
    ["fulfillment", ORDER_ID]
  ]);
  assert.deepEqual(context.defers, [{ flags: MessageFlags.Ephemeral }]);
  assert.equal((context.edits[0] as { flags: number }).flags, MessageFlags.IsComponentsV2);
});

test("canonical /cm order remains usable when optional fulfillment support is unavailable", async () => {
  let purchaseFallbacks = 0;
  const api = {
    fetchOrderDetails: async () => order,
    fetchUserOverview: async () => overview,
    fetchOrderFulfillment: async () => { throw new InternalApiClientError("DEPENDENCY_UNAVAILABLE", 503); },
    fetchPurchaseIntent: async () => { purchaseFallbacks += 1; return pendingPurchase; }
  } as unknown as InternalApiClient;
  const controller = new CmAdminController(config, api);
  const context = fakeCommand({ subcommand: "order", email: null, reference: "CM-TEST" });
  assert.equal(await controller.handle(context.interaction), true);
  assert.equal(purchaseFallbacks, 0);
  assert.equal((context.edits[0] as { flags: number }).flags, MessageFlags.IsComponentsV2);
});

test("/cm order falls back to purchase-intents.lookup.read only when the canonical order is not found", async () => {
  const calls: unknown[] = [];
  const api = {
    fetchOrderDetails: async (selector: unknown) => {
      calls.push(["order", selector]);
      throw new InternalApiClientError("NOT_FOUND", 404);
    },
    fetchPurchaseIntent: async (selector: unknown) => {
      calls.push(["purchase", selector]);
      return pendingPurchase;
    },
    fetchUserOverview: async (selector: unknown) => {
      calls.push(["user", selector]);
      return overview;
    }
  } as unknown as InternalApiClient;
  const controller = new CmAdminController(config, api);
  const context = fakeCommand({ subcommand: "order", email: null, reference: "cm-pending" });
  assert.equal(await controller.handle(context.interaction), true);
  assert.deepEqual(calls, [
    ["order", { kind: "public_ref", value: "CM-PENDING" }],
    ["purchase", { kind: "public_ref", value: "CM-PENDING" }],
    ["user", { kind: "user_id", value: USER_ID }]
  ]);
  assert.deepEqual(context.defers, [{ flags: MessageFlags.Ephemeral }]);
  const serialized = JSON.stringify(context.edits[0]);
  assert.equal(serialized.includes("Pending Purchase"), true);
  assert.equal(serialized.includes("Refresh Purchase"), true);
  assert.equal(serialized.includes("Refund"), false);
  assert.equal(serialized.includes("Delivery Details"), false);
});

test("/cm order does not use purchase-intent fallback for authorization or service errors", async () => {
  let purchaseCalls = 0;
  const api = {
    fetchOrderDetails: async () => { throw new InternalApiClientError("OPERATION_FORBIDDEN", 403); },
    fetchPurchaseIntent: async () => { purchaseCalls += 1; return pendingPurchase; }
  } as unknown as InternalApiClient;
  const controller = new CmAdminController(config, api);
  const context = fakeCommand({ subcommand: "order", email: null, reference: "CM-PENDING" });
  assert.equal(await controller.handle(context.interaction), true);
  assert.equal(purchaseCalls, 0);
  assert.equal(JSON.stringify(context.edits[0]).includes("Order Lookup Failed"), true);
});

test("/cm order follows a purchase intent's canonical order when it appears during lookup", async () => {
  const linkedPurchase = { ...pendingPurchase, orderId: ORDER_ID } satisfies PurchaseIntentData;
  let orderCalls = 0;
  const api = {
    fetchOrderDetails: async (selector: unknown) => {
      orderCalls += 1;
      if (orderCalls === 1) throw new InternalApiClientError("NOT_FOUND", 404);
      assert.equal(selector, ORDER_ID);
      return order;
    },
    fetchPurchaseIntent: async () => linkedPurchase,
    fetchUserOverview: async () => overview,
    fetchOrderFulfillment: async () => fulfillment
  } as unknown as InternalApiClient;
  const controller = new CmAdminController(config, api);
  const context = fakeCommand({ subcommand: "order", email: null, reference: "CM-PENDING" });
  assert.equal(await controller.handle(context.interaction), true);
  assert.equal(orderCalls, 2);
  const serialized = JSON.stringify(context.edits[0]);
  assert.equal(serialized.includes("# Order"), true);
  assert.equal(serialized.includes("Pending Purchase"), false);
});
