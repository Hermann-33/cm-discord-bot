import assert from "node:assert/strict";
import test from "node:test";
import { MessageFlags, type Interaction } from "discord.js";
import type { InternalApiClient } from "../../src/api/client";
import type { OrderDetailsData, OrderFulfillmentData, UserOverviewData } from "../../src/api/schemas";
import { buildCmCommand, CmAdminController } from "../../src/commands/cm";
import type { AppConfig } from "../../src/config/env";

const GUILD_ID = "123456789012345672";
const ADMIN_CHANNEL_ID = "123456789012345680";
const OTHER_CHANNEL_ID = "999999999999999999";
const ADMIN_ID = "123456789012345681";
const DISCORD_CUSTOMER_ID = "123456789012345682";
const USER_ID = "550e8400-e29b-41d4-a716-446655440000";
const ORDER_ID = "550e8400-e29b-41d4-a716-446655440001";

const config = {
  discordGuildId: GUILD_ID,
  botAdminUserIds: [ADMIN_ID]
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

type FakeCommandOptions = {
  userId?: string;
  channelId?: string;
  subcommand?: "user" | "order";
  email?: string | null;
  discordUserId?: string | null;
  reference?: string;
};

function fakeCommand(options: FakeCommandOptions = {}) {
  const {
    userId = ADMIN_ID,
    channelId = ADMIN_CHANNEL_ID,
    subcommand = "user",
    email = subcommand === "user" ? "user@example.com" : null,
    discordUserId = null,
    reference = "CM-TEST"
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
    options: {
      getSubcommand: () => subcommand,
      getString: (name: string) => name === "email" ? email : name === "reference" ? reference : null,
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

test("/cm registers user lookup by email or Discord user and direct order lookup", () => {
  const json = buildCmCommand().toJSON();
  assert.equal(json.name, "cm");
  assert.deepEqual(json.options?.map((option) => option.name), ["user", "order"]);
  const user = json.options?.[0] as { options?: { name: string; required?: boolean }[] };
  const orderCommand = json.options?.[1] as { options?: { name: string; required?: boolean }[] };
  assert.deepEqual(user.options?.map((option) => [option.name, option.required]), [
    ["email", false],
    ["discord_user", false]
  ]);
  assert.deepEqual(orderCommand.options?.map((option) => [option.name, option.required]), [["reference", true]]);
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

test("authorized /cm order resolves public ref, owner, and fulfillment support before rendering", async () => {
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
