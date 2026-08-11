import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  AURA_EMOJI,
  buildLeaderboardCreatePayload,
  buildLeaderboardEditPayload,
  formatAura,
  sanitizeDisplayName
} from "../../src/leaderboard/format";
import type { LeaderboardEntry } from "../../src/leaderboard/types";

const FIXED_TIME = 1767225600000;
const populatedRows: LeaderboardEntry[] = [
  { leaderboardType: "lifetime", rank: 1, displayName: "Alice", aura: 12_345 },
  { leaderboardType: "lifetime", rank: 2, displayName: "@Bob_*", aura: 900 },
  { leaderboardType: "available", rank: 1, displayName: "Anonymous", aura: 500 }
];

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), "tests/fixtures", name), "utf8"));
}

function json(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

test("matches the frozen populated Components V2 fixture", () => {
  assert.deepEqual(
    json(buildLeaderboardCreatePayload(populatedRows, FIXED_TIME)),
    fixture("leaderboard-populated.json")
  );
});

test("matches the frozen empty Components V2 fixture", () => {
  assert.deepEqual(
    json(buildLeaderboardCreatePayload([], FIXED_TIME)),
    fixture("leaderboard-empty.json")
  );
});

test("edit payload preserves components and clears legacy content and embeds", () => {
  const expected = fixture("leaderboard-populated.json") as Record<string, unknown>;
  expected.content = null;
  expected.embeds = [];
  assert.deepEqual(json(buildLeaderboardEditPayload(populatedRows, FIXED_TIME)), expected);
});

test("preserves API ranks rather than recalculating them", () => {
  const payload = json(buildLeaderboardCreatePayload([
    { leaderboardType: "lifetime", rank: 7, displayName: "Seventh", aura: 10 }
  ], FIXED_TIME));
  const serialized = JSON.stringify(payload);
  assert.equal(serialized.includes("` 7`"), true);
  assert.equal(serialized.includes("` 1` `       10` Seventh"), false);
});

test("preserves custom Aura emoji and sanitizes labels", () => {
  const payload = json(buildLeaderboardCreatePayload(populatedRows, FIXED_TIME));
  assert.equal(JSON.stringify(payload).includes(AURA_EMOJI), true);
  assert.equal(sanitizeDisplayName(" @everyone\n**name** ").includes("@everyone"), false);
  assert.equal(sanitizeDisplayName(" @everyone\n**name** ").includes("\\*\\*name\\*\\*"), true);
});

test("retains legacy Aura formatting fallbacks", () => {
  assert.equal(formatAura(12345), "12,345");
  assert.equal(formatAura("001000"), "001,000");
  assert.equal(formatAura(Number.NaN), "0");
  assert.equal(formatAura("invalid"), "0");
  assert.equal(formatAura(null), "0");
});
