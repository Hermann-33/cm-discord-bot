import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { buildCmCommand } from "../../src/commands/cm";
import { buildRefreshLeaderboardCommand } from "../../src/commands/refreshLeaderboard";

test("refresh leaderboard registration JSON matches the frozen legacy command fixture", () => {
  const expected = JSON.parse(
    readFileSync(join(process.cwd(), "tests/fixtures/refresh-command.json"), "utf8")
  );
  assert.deepEqual(JSON.parse(JSON.stringify(buildRefreshLeaderboardCommand())), expected);
});

test("CM admin command is a guild slash command with user/email surface", () => {
  const command = buildCmCommand().toJSON();
  assert.equal(command.name, "cm");
  assert.equal(command.options?.length, 1);
  assert.equal(command.options?.[0]?.name, "user");
});
