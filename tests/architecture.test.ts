import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  });
}

const sourceText = sourceFiles(join(process.cwd(), "src"))
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");
const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
  dependencies: Record<string, string>;
};

test("root production code contains no direct database client or credentials", () => {
  assert.equal(Object.hasOwn(packageJson.dependencies, "@supabase/supabase-js"), false);
  assert.equal(sourceText.includes("@supabase/supabase-js"), false);
  assert.equal(sourceText.includes("SUPABASE_"), false);
});

test("root production code contains no obsolete API path or support command", () => {
  assert.equal(sourceText.includes("/api/internal/discord-bot/"), false);
  assert.equal(sourceText.includes("cm-support"), false);
});

test("root production code never imports or executes the legacy archive", () => {
  assert.equal(/(?:from|require\()\s*["'][^"']*legacy[\\/]/.test(sourceText), false);
});

test("API client exposes only explicitly approved bot operations", () => {
  for (const path of [
    "/api/internal/integrations/v1/aura/leaderboards",
    "/api/internal/integrations/v1/aura/lookup",
    "/api/internal/integrations/v1/users/overview",
    "/api/internal/integrations/v1/orders/details",
    "/api/internal/integrations/v1/orders/fulfillment",
    "/api/internal/integrations/v1/purchase-intents/lookup",
    "/api/internal/integrations/v1/orders/refund/preview",
    "/api/internal/integrations/v1/orders/refund/execute",
    "/api/internal/integrations/v1/users/aura/adjust",
    "/api/internal/integrations/v1/users/wallet/adjust"
  ]) {
    assert.equal(sourceText.includes(path), true, `missing approved path ${path}`);
  }

  for (const forbidden of [
    "/api/internal/integrations/v1/purchase-intents/process",
    "/api/internal/integrations/v1/orders/fulfillment/manual",
    "internal_integration_adjust_aura_balance",
    "internal_integration_adjust_wallet_balance"
  ]) {
    assert.equal(sourceText.includes(forbidden), false, `unexpected forbidden path or DB primitive ${forbidden}`);
  }
});

test("admin authorization is guild-wide and cannot rely on Discord roles alone", () => {
  assert.equal(sourceText.includes("BOT_ADMIN_USER_IDS"), true);
  assert.equal(sourceText.includes("botAdminUserIds.includes"), true);
  assert.equal(sourceText.includes("BOT_ADMIN_COMMAND_CHANNEL_ID"), false);
  assert.equal(sourceText.includes("botAdminCommandChannelId"), false);
});

test("environment example contains only the approved root variable surface", () => {
  const names = readFileSync(join(process.cwd(), ".env.example"), "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("="))
    .map((line) => line.slice(0, line.indexOf("=")));
  assert.deepEqual(names, [
    "DISCORD_BOT_TOKEN",
    "DISCORD_CLIENT_ID",
    "DISCORD_GUILD_ID",
    "DISCORD_LEADERBOARD_CHANNEL_ID",
    "DISCORD_COMMAND_CHANNEL_ID",
    "DISCORD_AURA_COMMAND_BLOCKED_CHANNEL_ID",
    "DISCORD_LEADERBOARD_MESSAGE_ID",
    "BOT_ADMIN_USER_IDS",
    "BOT_AUDIT_LOG_CHANNEL_ID",
    "CM_INTERNAL_INTEGRATIONS_API_ORIGIN",
    "CM_INTERNAL_INTEGRATIONS_API_CLIENT_ID",
    "CM_INTERNAL_INTEGRATIONS_API_KEY_ID",
    "CM_INTERNAL_INTEGRATIONS_API_HMAC_SECRET_BASE64",
    "CM_INTERNAL_INTEGRATIONS_API_TIMEOUT_MS"
  ]);
});
