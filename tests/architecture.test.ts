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

test("API client exposes only the two least-privilege Aura operations", () => {
  assert.equal(sourceText.includes("/api/internal/integrations/v1/aura/leaderboards"), true);
  assert.equal(sourceText.includes("/api/internal/integrations/v1/aura/lookup"), true);
  assert.equal(sourceText.includes("/api/internal/integrations/v1/users/lookup"), false);
  assert.equal(sourceText.includes("/api/internal/integrations/v1/orders/lookup"), false);
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
    "CM_INTERNAL_INTEGRATIONS_API_ORIGIN",
    "CM_INTERNAL_INTEGRATIONS_API_CLIENT_ID",
    "CM_INTERNAL_INTEGRATIONS_API_KEY_ID",
    "CM_INTERNAL_INTEGRATIONS_API_HMAC_SECRET_BASE64",
    "CM_INTERNAL_INTEGRATIONS_API_TIMEOUT_MS"
  ]);
});
