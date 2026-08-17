import assert from "node:assert/strict";
import test from "node:test";
import type { AppConfig } from "../../src/config/env";
import { authorizeAdminInteraction } from "../../src/discord/adminAuthorization";

const GUILD_ID = "123456789012345672";
const ADMIN_CHANNEL_ID = "123456789012345680";
const OTHER_CHANNEL_ID = "999999999999999999";
const ADMIN_ID = "123456789012345681";

const config = {
  discordGuildId: GUILD_ID,
  botAdminUserIds: [ADMIN_ID]
} as unknown as AppConfig;

function identity(overrides: Partial<{ guildId: string | null; channelId: string | null; userId: string }> = {}) {
  return {
    guildId: overrides.guildId === undefined ? GUILD_ID : overrides.guildId,
    channelId: overrides.channelId === undefined ? ADMIN_CHANNEL_ID : overrides.channelId,
    user: { id: overrides.userId ?? ADMIN_ID }
  };
}

test("admin authorization permits whitelisted user in configured guild", () => {
  assert.deepEqual(authorizeAdminInteraction(identity(), config), { ok: true });
});

test("admin authorization permits whitelisted user from any channel in configured guild", () => {
  assert.deepEqual(
    authorizeAdminInteraction(identity({ channelId: OTHER_CHANNEL_ID }), config),
    { ok: true }
  );
});

test("admin authorization fails closed in DMs", () => {
  const result = authorizeAdminInteraction(identity({ guildId: null }), config);
  assert.equal(result.ok, false);
});

test("admin authorization fails closed in wrong guild", () => {
  const result = authorizeAdminInteraction(identity({ guildId: "999999999999999998" }), config);
  assert.equal(result.ok, false);
});

test("admin authorization requires explicit user ID whitelist", () => {
  const result = authorizeAdminInteraction(identity({ userId: "999999999999999997" }), config);
  assert.equal(result.ok, false);
});

test("admin authorization fails closed when admin whitelist is missing", () => {
  const result = authorizeAdminInteraction(identity(), {
    ...config,
    botAdminUserIds: []
  });
  assert.equal(result.ok, false);
});
