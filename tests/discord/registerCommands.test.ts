import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { buildRefreshLeaderboardCommand } from "../../src/commands/refreshLeaderboard";

test("guild registration JSON matches the frozen legacy command fixture", () => {
  const expected = JSON.parse(
    readFileSync(join(process.cwd(), "tests/fixtures/refresh-command.json"), "utf8")
  );
  assert.deepEqual(JSON.parse(JSON.stringify(buildRefreshLeaderboardCommand())), expected);
});
