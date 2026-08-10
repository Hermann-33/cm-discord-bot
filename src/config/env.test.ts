import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "./env";

const KEYS = [
  "DISCORD_BOT_TOKEN",
  "DISCORD_LEADERBOARD_CHANNEL_ID",
  "DISCORD_LEADERBOARD_MESSAGE_ID",
  "DISCORD_COMMAND_CHANNEL_ID",
  "DISCORD_AURA_COMMAND_BLOCKED_CHANNEL_ID",
  "DISCORD_CLIENT_ID",
  "DISCORD_GUILD_ID",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CM_INTERNAL_API_ENABLED",
  "CM_INTERNAL_API_BASE_URL",
  "CM_INTERNAL_API_KEY_ID",
  "CM_INTERNAL_API_HMAC_SECRET_BASE64",
  "CM_INTERNAL_API_TIMEOUT_MS"
] as const;

const baseline = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

function setRequiredEnvironment(): void {
  process.env.DISCORD_BOT_TOKEN = "test-token";
  process.env.DISCORD_LEADERBOARD_CHANNEL_ID = "123456789012345678";
  delete process.env.DISCORD_LEADERBOARD_MESSAGE_ID;
  process.env.DISCORD_COMMAND_CHANNEL_ID = "123456789012345679";
  process.env.DISCORD_AURA_COMMAND_BLOCKED_CHANNEL_ID = "123456789012345680";
  process.env.DISCORD_CLIENT_ID = "123456789012345681";
  process.env.DISCORD_GUILD_ID = "123456789012345682";
  process.env.SUPABASE_URL = "https://project.example.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
}

test.afterEach(() => {
  for (const key of KEYS) {
    const value = baseline[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("missing internal API configuration stays disabled and preserves startup", { concurrency: false }, () => {
  setRequiredEnvironment();
  delete process.env.CM_INTERNAL_API_ENABLED;
  delete process.env.CM_INTERNAL_API_BASE_URL;
  delete process.env.CM_INTERNAL_API_KEY_ID;
  delete process.env.CM_INTERNAL_API_HMAC_SECRET_BASE64;
  const config = loadConfig();
  assert.deepEqual(config.internalApi, { enabled: false });
});

test("enabled internal API configuration fails closed when incomplete", { concurrency: false }, () => {
  setRequiredEnvironment();
  process.env.CM_INTERNAL_API_ENABLED = "true";
  delete process.env.CM_INTERNAL_API_BASE_URL;
  delete process.env.CM_INTERNAL_API_KEY_ID;
  delete process.env.CM_INTERNAL_API_HMAC_SECRET_BASE64;
  assert.throws(() => loadConfig(), /CM_INTERNAL_API_BASE_URL/);
});

test("enabled internal API accepts only complete origin-only HTTPS configuration", { concurrency: false }, () => {
  setRequiredEnvironment();
  process.env.CM_INTERNAL_API_ENABLED = "true";
  process.env.CM_INTERNAL_API_BASE_URL = "https://www.example.test";
  process.env.CM_INTERNAL_API_KEY_ID = "current-2026-01";
  process.env.CM_INTERNAL_API_HMAC_SECRET_BASE64 = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");
  process.env.CM_INTERNAL_API_TIMEOUT_MS = "5000";
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const config = loadConfig();
  assert.equal(config.internalApi.enabled, true);
  if (config.internalApi.enabled) {
    assert.equal(config.internalApi.baseUrl, "https://www.example.test");
    assert.equal(config.internalApi.timeoutMs, 5000);
  }
  assert.equal(config.supabase, undefined);
});

test("configuration failures never include the HMAC secret value", { concurrency: false }, () => {
  setRequiredEnvironment();
  const invalidSecret = "not-a-valid-secret-value";
  process.env.CM_INTERNAL_API_ENABLED = "true";
  process.env.CM_INTERNAL_API_BASE_URL = "https://www.example.test";
  process.env.CM_INTERNAL_API_KEY_ID = "current";
  process.env.CM_INTERNAL_API_HMAC_SECRET_BASE64 = invalidSecret;
  let message = "";
  try { loadConfig(); } catch (error) { message = error instanceof Error ? error.message : String(error); }
  assert.equal(message.includes(invalidSecret), false);
  assert.match(message, /CM_INTERNAL_API_HMAC_SECRET_BASE64/);
});
