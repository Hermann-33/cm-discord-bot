import assert from "node:assert/strict";
import test from "node:test";
import type { AppConfig } from "../../src/config/env";
import { authorizeAdminInteraction } from "../../src/discord/adminAuthorization";

const GUILD_ID = "123456789012345672";
const ADMIN_CHANNEL_ID = "123456789012345680";
const ADMIN_ID = "123456789012345681";

const config = {
  discordGuildId: GUILD_ID,
  botAdminCommandChannelId: ADMIN_CHANNEL_ID,
  botAdminUserIds: [ADMIN_ID]
} as AppConfig;

function identity(overrides: Partial<{ guildId: string | null; channelId: string | null; userId: string }> = {}) {
  return {
    guildId: overrides.guildId === undefined ? GUILD_ID : overrides.guildId,
    channelId: overrides.channelId === undefined ? ADMIN_CHANNEL_ID : overrides.channelId,
    user: { id: overrides.userId ?? ADMIN_ID }
  };
}

test("admin authorization permits exact guild, channel, and user whitelist", () => {
  assert.deepEqual(authorizeAdminInteraction(identity(), config), { ok: true });
});

test("admin authorization fails closed in DMs", () => {
  const result = authorizeAdminInteraction(identity({ guildId: null }), config);
  assert.equal(result.ok, false);
});

test("admin authorization fails closed in wrong guild", () => {
  const result = authorizeAdminInteraction(identity({ guildId: "999999999999999999" }), config);
  assert.equal(result.ok, false);
});

test("admin authorization fails closed in wrong channel", () => {
  const result = authorizeAdminInteraction(identity({ channelId: "999999999999999999" }), config);
  assert.equal(result.ok, false);
});

test("admin authorization requires explicit user ID whitelist", () => {
  const result = authorizeAdminInteraction(identity({ userId: "999999999999999999" }), config);
  assert.equal(result.ok, false);
});

test("admin authorization fails closed when admin config is missing", () => {
  const result = authorizeAdminInteraction(identity(), {
    ...config,
    botAdminCommandChannelId: undefined,
    botAdminUserIds: []
  });
  assert.equal(result.ok, false);
});
