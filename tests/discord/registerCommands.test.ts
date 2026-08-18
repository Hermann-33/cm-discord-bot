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

test("CM admin command registers user email/Discord lookup and order surfaces", () => {
  const command = buildCmCommand().toJSON();
  assert.equal(command.name, "cm");
  assert.deepEqual(command.options?.map((option) => option.name), ["user", "order"]);
  const user = command.options?.[0] as { options?: { name: string; required?: boolean; type?: number }[] };
  assert.deepEqual(user.options?.map((option) => [option.name, option.required, option.type]), [
    ["email", false, 3],
    ["discord_user", false, 6]
  ]);
});
