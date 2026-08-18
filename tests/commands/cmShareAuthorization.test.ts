import assert from "node:assert/strict";
import test from "node:test";
import { MessageFlags, type Interaction, type MessageCreateOptions } from "discord.js";
import type { InternalApiClient } from "../../src/api/client";
import type { UserOverviewData } from "../../src/api/schemas";
import { CmAdminController } from "../../src/commands/cm";
import { CmSessionStore } from "../../src/commands/cmSessions";
import type { AppConfig } from "../../src/config/env";

const GUILD_ID = "123456789012345672";
const ADMIN_ID = "123456789012345681";
const OTHER_ADMIN_ID = "123456789012345682";
const SESSION_ID = "550e8400-e29b-41d4-a716-446655440002";

const overview: UserOverviewData = {
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
  wallet: null,
  aura: null,
  counts: { orders: 0, licenses: 0, accountDeliveries: 0 },
  recentOrders: []
};

function config(adminIds: string[]): AppConfig {
  return {
    discordGuildId: GUILD_ID,
    botAdminUserIds: adminIds
  } as unknown as AppConfig;
}

function store() {
  return new CmSessionStore(1_000, 10, {
    nowMs: () => 100,
    id: () => SESSION_ID
  });
}

function fakeShareButton(userId: string) {
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
    isChatInputCommand: () => false,
    isButton: () => true,
    isModalSubmit: () => false,
    customId: `cm:share:current:${SESSION_ID}`,
    guildId: GUILD_ID,
    channelId: "123456789012345699",
    channel,
    user: { id: userId },
    replied: false,
    deferred: false,
    reply: async (payload: unknown) => { replies.push(payload); fake.replied = true; },
    deferReply: async (payload: unknown) => { replies.push(payload); fake.deferred = true; },
    editReply: async (payload: unknown) => { replies.push(payload); },
    followUp: async (payload: unknown) => { replies.push(payload); }
  };
  return { interaction: fake as unknown as Interaction, sends, replies };
}

test("Share to Chat reuses /cm authorization and sends only for the owning allowlisted operator", async () => {
  const sessions = store();
  sessions.create(ADMIN_ID, overview);
  const controller = new CmAdminController(
    config([ADMIN_ID]),
    {} as InternalApiClient,
    sessions
  );
  const context = fakeShareButton(ADMIN_ID);

  assert.equal(await controller.handle(context.interaction), true);
  assert.equal(context.sends.length, 1);
  assert.equal(context.sends[0]?.flags, MessageFlags.IsComponentsV2);
  assert.equal((context.replies[0] as { flags: number }).flags, MessageFlags.Ephemeral);
});

test("Share to Chat rejects a non-whitelisted user before channel publication", async () => {
  const sessions = store();
  sessions.create(ADMIN_ID, overview);
  const controller = new CmAdminController(
    config([ADMIN_ID]),
    {} as InternalApiClient,
    sessions
  );
  const context = fakeShareButton(OTHER_ADMIN_ID);

  assert.equal(await controller.handle(context.interaction), true);
  assert.equal(context.sends.length, 0);
  assert.equal((context.replies[0] as { flags: number }).flags, MessageFlags.Ephemeral);
});

test("Share to Chat rejects a second allowlisted admin who does not own the session", async () => {
  const sessions = store();
  sessions.create(ADMIN_ID, overview);
  const controller = new CmAdminController(
    config([ADMIN_ID, OTHER_ADMIN_ID]),
    {} as InternalApiClient,
    sessions
  );
  const context = fakeShareButton(OTHER_ADMIN_ID);

  assert.equal(await controller.handle(context.interaction), true);
  assert.equal(context.sends.length, 0);
  assert.equal((context.replies[0] as { flags: number }).flags, MessageFlags.Ephemeral);
});
