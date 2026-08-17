import assert from "node:assert/strict";
import test from "node:test";
import { MessageFlags, type Interaction } from "discord.js";
import type { InternalApiClient } from "../../src/api/client";
import type { UserOverviewData } from "../../src/api/schemas";
import { buildCmCommand, CmAdminController } from "../../src/commands/cm";
import type { AppConfig } from "../../src/config/env";

const GUILD_ID = "123456789012345672";
const ADMIN_CHANNEL_ID = "123456789012345680";
const ADMIN_ID = "123456789012345681";

const config = {
  discordGuildId: GUILD_ID,
  botAdminCommandChannelId: ADMIN_CHANNEL_ID,
  botAdminUserIds: [ADMIN_ID]
} as AppConfig;

const overview = {
  identity: {
    userId: "550e8400-e29b-41d4-a716-446655440000",
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

function fakeCommand(userId = ADMIN_ID) {
  const replies: unknown[] = [];
  const defers: unknown[] = [];
  const edits: unknown[] = [];
  const fake = {
    isChatInputCommand: () => true,
    isButton: () => false,
    isModalSubmit: () => false,
    commandName: "cm",
    guildId: GUILD_ID,
    channelId: ADMIN_CHANNEL_ID,
    user: { id: userId, username: "admin", globalName: "Admin" },
    options: {
      getSubcommand: () => "user",
      getString: () => "user@example.com"
    },
    replied: false,
    deferred: false,
    reply: async (payload: unknown) => { replies.push(payload); },
    deferReply: async (payload: unknown) => { defers.push(payload); fake.deferred = true; },
    editReply: async (payload: unknown) => { edits.push(payload); },
    followUp: async (payload: unknown) => { replies.push(payload); }
  };
  return { interaction: fake as unknown as Interaction, replies, defers, edits };
}

test("/cm registers a user subcommand with required email option", () => {
  const json = buildCmCommand().toJSON();
  assert.equal(json.name, "cm");
  assert.equal(json.options?.[0]?.name, "user");
  const subcommand = json.options?.[0] as { options?: { name: string; required?: boolean }[] };
  assert.deepEqual(subcommand.options?.map((option) => [option.name, option.required]), [["email", true]]);
});

test("unauthorized /cm user is rejected before backend lookup", async () => {
  let calls = 0;
  const api = {
    fetchUserOverview: async () => { calls += 1; return overview; }
  } as unknown as InternalApiClient;
  const controller = new CmAdminController(config, api);
  const context = fakeCommand("999999999999999999");
  assert.equal(await controller.handle(context.interaction), true);
  assert.equal(calls, 0);
  assert.equal((context.replies[0] as { flags: number }).flags, MessageFlags.Ephemeral);
});

test("authorized /cm user returns an ephemeral Components V2 private panel", async () => {
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
