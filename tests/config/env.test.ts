import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../../src/config/env";

const validSecret = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");

function validEnvironment(): NodeJS.ProcessEnv {
  return {
    DISCORD_BOT_TOKEN: "test-token",
    DISCORD_CLIENT_ID: "123456789012345671",
    DISCORD_GUILD_ID: "123456789012345672",
    DISCORD_LEADERBOARD_CHANNEL_ID: "123456789012345673",
    DISCORD_COMMAND_CHANNEL_ID: "123456789012345674",
    DISCORD_AURA_COMMAND_BLOCKED_CHANNEL_ID: "123456789012345675",
    DISCORD_LEADERBOARD_MESSAGE_ID: "123456789012345676",
    CM_INTERNAL_INTEGRATIONS_API_ORIGIN: "https://cheaters.market",
    CM_INTERNAL_INTEGRATIONS_API_CLIENT_ID: "cm-discord-bot",
    CM_INTERNAL_INTEGRATIONS_API_KEY_ID: "cm-discord-bot-2026-08",
    CM_INTERNAL_INTEGRATIONS_API_HMAC_SECRET_BASE64: validSecret,
    CM_INTERNAL_INTEGRATIONS_API_TIMEOUT_MS: "5000"
  };
}

test("loads a complete strict configuration", () => {
  const config = loadConfig(validEnvironment());
  assert.equal(config.internalApi.origin, "https://cheaters.market");
  assert.equal(config.internalApi.clientId, "cm-discord-bot");
  assert.equal(config.internalApi.timeoutMs, 5_000);
  assert.equal(config.internalApi.hmacSecret.byteLength, 32);
});

test("blank leaderboard message ID enables bootstrap mode", () => {
  const environment = validEnvironment();
  environment.DISCORD_LEADERBOARD_MESSAGE_ID = "  ";
  assert.equal(loadConfig(environment).discordLeaderboardMessageId, undefined);
});

test("missing leaderboard message ID enables bootstrap mode", () => {
  const environment = validEnvironment();
  delete environment.DISCORD_LEADERBOARD_MESSAGE_ID;
  assert.equal(loadConfig(environment).discordLeaderboardMessageId, undefined);
});

test("rejects invalid Discord snowflakes without printing values", () => {
  const environment = validEnvironment();
  environment.DISCORD_GUILD_ID = "not-a-snowflake";
  assert.throws(
    () => loadConfig(environment),
    (error) => {
      const message = error instanceof Error ? error.message : String(error);
      return message.includes("DISCORD_GUILD_ID") && !message.includes("not-a-snowflake");
    }
  );
});

test("rejects non-HTTPS or non-origin API URLs", () => {
  for (const origin of ["http://cheaters.market", "https://cheaters.market/path", "not-a-url"]) {
    const environment = validEnvironment();
    environment.CM_INTERNAL_INTEGRATIONS_API_ORIGIN = origin;
    assert.throws(() => loadConfig(environment), /CM_INTERNAL_INTEGRATIONS_API_ORIGIN/);
  }
});

test("rejects malformed client and key identifiers", () => {
  const environment = validEnvironment();
  environment.CM_INTERNAL_INTEGRATIONS_API_CLIENT_ID = "Bad Client";
  environment.CM_INTERNAL_INTEGRATIONS_API_KEY_ID = "Bad Key";
  assert.throws(
    () => loadConfig(environment),
    /CM_INTERNAL_INTEGRATIONS_API_CLIENT_ID, CM_INTERNAL_INTEGRATIONS_API_KEY_ID/
  );
});

test("rejects noncanonical or short HMAC secrets without printing them", () => {
  for (const secret of ["not-base64", Buffer.from("too-short").toString("base64")]) {
    const environment = validEnvironment();
    environment.CM_INTERNAL_INTEGRATIONS_API_HMAC_SECRET_BASE64 = secret;
    assert.throws(
      () => loadConfig(environment),
      (error) => {
        const message = error instanceof Error ? error.message : String(error);
        return message.includes("CM_INTERNAL_INTEGRATIONS_API_HMAC_SECRET_BASE64") &&
          !message.includes(secret);
      }
    );
  }
});

test("defaults timeout to 5000 and enforces 1000 through 15000 milliseconds", () => {
  const environment = validEnvironment();
  delete environment.CM_INTERNAL_INTEGRATIONS_API_TIMEOUT_MS;
  assert.equal(loadConfig(environment).internalApi.timeoutMs, 5_000);

  for (const value of ["999", "15001", "1.5", "invalid"]) {
    environment.CM_INTERNAL_INTEGRATIONS_API_TIMEOUT_MS = value;
    assert.throws(() => loadConfig(environment), /CM_INTERNAL_INTEGRATIONS_API_TIMEOUT_MS/);
  }
});
