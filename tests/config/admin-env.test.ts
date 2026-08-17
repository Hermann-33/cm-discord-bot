import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../../src/config/env";

const validSecret = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");

function environment(): NodeJS.ProcessEnv {
  return {
    DISCORD_BOT_TOKEN: "test-token",
    DISCORD_CLIENT_ID: "123456789012345671",
    DISCORD_GUILD_ID: "123456789012345672",
    DISCORD_LEADERBOARD_CHANNEL_ID: "123456789012345673",
    DISCORD_COMMAND_CHANNEL_ID: "123456789012345674",
    DISCORD_AURA_COMMAND_BLOCKED_CHANNEL_ID: "123456789012345675",
    BOT_ADMIN_USER_IDS: "123456789012345681, 123456789012345682",
    BOT_ADMIN_COMMAND_CHANNEL_ID: "123456789012345680",
    BOT_AUDIT_LOG_CHANNEL_ID: "123456789012345683",
    CM_INTERNAL_INTEGRATIONS_API_ORIGIN: "https://cheaters.market",
    CM_INTERNAL_INTEGRATIONS_API_CLIENT_ID: "cm-discord-bot",
    CM_INTERNAL_INTEGRATIONS_API_KEY_ID: "cm-discord-bot-2026-08",
    CM_INTERNAL_INTEGRATIONS_API_HMAC_SECRET_BASE64: validSecret
  };
}

test("parses optional admin whitelist and channels", () => {
  const config = loadConfig(environment());
  assert.deepEqual(config.botAdminUserIds, [
    "123456789012345681",
    "123456789012345682"
  ]);
  assert.equal(config.botAdminCommandChannelId, "123456789012345680");
  assert.equal(config.botAuditLogChannelId, "123456789012345683");
});

test("missing admin configuration keeps normal bot startup possible but admin controls fail closed", () => {
  const env = environment();
  delete env.BOT_ADMIN_USER_IDS;
  delete env.BOT_ADMIN_COMMAND_CHANNEL_ID;
  delete env.BOT_AUDIT_LOG_CHANNEL_ID;
  const config = loadConfig(env);
  assert.deepEqual(config.botAdminUserIds, []);
  assert.equal(config.botAdminCommandChannelId, undefined);
  assert.equal(config.botAuditLogChannelId, undefined);
});

test("rejects duplicate or malformed admin IDs", () => {
  for (const value of [
    "123456789012345681,123456789012345681",
    "123456789012345681,not-an-id"
  ]) {
    const env = environment();
    env.BOT_ADMIN_USER_IDS = value;
    assert.throws(() => loadConfig(env), /BOT_ADMIN_USER_IDS/);
  }
});
