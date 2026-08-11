import assert from "node:assert/strict";
import test from "node:test";
import { MessageFlags, PermissionFlagsBits, type ChatInputCommandInteraction } from "discord.js";
import { handleRefreshLeaderboardCommand } from "../../src/commands/refreshLeaderboard";
import type { AppConfig } from "../../src/config/env";
import type { LeaderboardRefreshController, LeaderboardRefreshResult } from "../../src/leaderboard/service";

const GUILD_ID = "123456789012345672";
const CHANNEL_ID = "123456789012345674";
const config = {
  discordGuildId: GUILD_ID,
  discordCommandChannelId: CHANNEL_ID,
  discordLeaderboardMessageId: "123456789012345676"
} as AppConfig;

function fakeInteraction(options: {
  guildId?: string | null;
  channelId?: string;
  permissions?: bigint[];
  commandName?: string;
} = {}) {
  const replies: unknown[] = [];
  const defers: unknown[] = [];
  const edits: unknown[] = [];
  const permissions = options.permissions ?? [PermissionFlagsBits.ManageGuild];
  const interaction = {
    commandName: options.commandName ?? "refresh-leaderboard",
    guildId: options.guildId === undefined ? GUILD_ID : options.guildId,
    channelId: options.channelId ?? CHANNEL_ID,
    memberPermissions: {
      has: (permission: bigint) => permissions.includes(permission)
    },
    reply: async (payload: unknown) => { replies.push(payload); },
    deferReply: async (payload: unknown) => { defers.push(payload); },
    editReply: async (payload: unknown) => { edits.push(payload); }
  } as unknown as ChatInputCommandInteraction;
  return { interaction, replies, defers, edits };
}

function controller(result: LeaderboardRefreshResult | Error): LeaderboardRefreshController {
  return {
    refreshNow: async () => {
      if (result instanceof Error) throw result;
      return result;
    }
  };
}

test("rejects the wrong guild ephemerally", async () => {
  const context = fakeInteraction({ guildId: "999999999999999999" });
  await handleRefreshLeaderboardCommand(context.interaction, config, controller("refreshed"));
  assert.equal((context.replies[0] as { content: string }).content, "This command is not available in this server.");
  assert.equal((context.replies[0] as { flags: number }).flags, MessageFlags.Ephemeral);
});

test("rejects the wrong channel ephemerally", async () => {
  const context = fakeInteraction({ channelId: "999999999999999999" });
  await handleRefreshLeaderboardCommand(context.interaction, config, controller("refreshed"));
  assert.equal((context.replies[0] as { content: string }).content, "Use this command in the configured bot command channel.");
});

test("rejects insufficient permissions", async () => {
  const context = fakeInteraction({ permissions: [] });
  await handleRefreshLeaderboardCommand(context.interaction, config, controller("refreshed"));
  assert.equal((context.replies[0] as { content: string }).content, "You do not have permission to refresh the leaderboard.");
});

for (const [label, permission] of [
  ["ManageGuild", PermissionFlagsBits.ManageGuild],
  ["Administrator", PermissionFlagsBits.Administrator]
] as const) {
  test(`permits ${label}`, async () => {
    const context = fakeInteraction({ permissions: [permission] });
    await handleRefreshLeaderboardCommand(context.interaction, config, controller("refreshed"));
    assert.deepEqual(context.defers, [{ flags: MessageFlags.Ephemeral }]);
    assert.deepEqual(context.edits, ["Leaderboard refreshed."]);
  });
}

test("rejects manual refresh when message ID is absent", async () => {
  const context = fakeInteraction();
  await handleRefreshLeaderboardCommand(
    context.interaction,
    { ...config, discordLeaderboardMessageId: undefined },
    controller("refreshed")
  );
  assert.equal((context.replies[0] as { content: string }).content, "Leaderboard message ID is not configured.");
});

test("reports the shared already-running state", async () => {
  const context = fakeInteraction();
  await handleRefreshLeaderboardCommand(context.interaction, config, controller("already-running"));
  assert.deepEqual(context.edits, ["Leaderboard refresh already in progress."]);
});

test("reports API or Discord refresh failure", async () => {
  const originalError = console.error;
  console.error = () => undefined;
  try {
    const context = fakeInteraction();
    await handleRefreshLeaderboardCommand(context.interaction, config, controller(new Error("safe test failure")));
    assert.deepEqual(context.edits, ["Leaderboard refresh failed. Check bot logs."]);
  } finally {
    console.error = originalError;
  }
});

test("ignores unrelated chat-input commands", async () => {
  const context = fakeInteraction({ commandName: "other" });
  await handleRefreshLeaderboardCommand(context.interaction, config, controller("refreshed"));
  assert.equal(context.replies.length + context.defers.length + context.edits.length, 0);
});
