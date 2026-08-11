import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import type { Message } from "discord.js";
import { InternalApiClientError } from "../../src/api/errors";
import {
  AURA_NOT_LINKED_MESSAGE,
  AURA_UNAVAILABLE_MESSAGE,
  handleAuraCommand,
  isAuraCommand
} from "../../src/commands/aura";
import type { AppConfig } from "../../src/config/env";
import type { AuraReadClient } from "../../src/leaderboard/types";

const GUILD_ID = "123456789012345672";
const AUTHOR_ID = "123456789012345678";
const BLOCKED_CHANNEL_ID = "123456789012345675";
const successFixture = JSON.parse(
  readFileSync(join(process.cwd(), "tests/fixtures/aura-success.json"), "utf8")
) as unknown;

const config = {
  discordGuildId: GUILD_ID,
  discordAuraCommandBlockedChannelId: BLOCKED_CHANNEL_ID
} as AppConfig;

function fakeMessage(overrides: Record<string, unknown> = {}) {
  const replies: unknown[] = [];
  const message = {
    author: { bot: false, id: AUTHOR_ID },
    content: "cm aura",
    guildId: GUILD_ID,
    channelId: "123456789012345674",
    reply: async (payload: unknown) => {
      replies.push(JSON.parse(JSON.stringify(payload)));
      return {};
    },
    ...overrides
  } as unknown as Message;
  return { message, replies };
}

function fakeAuraClient(
  lookup: AuraReadClient["lookupAuraByDiscordId"]
): AuraReadClient {
  return {
    fetchLeaderboards: async () => [],
    lookupAuraByDiscordId: lookup
  };
}

test("matches only the normalized exact cm aura trigger", () => {
  assert.equal(isAuraCommand("cm aura"), true);
  assert.equal(isAuraCommand("  CM   AURA  "), true);
  assert.equal(isAuraCommand("cm aura extra"), false);
  assert.equal(isAuraCommand("!cm aura"), false);
});

test("uses the message author Discord ID for an accepted command", async () => {
  const { message } = fakeMessage({ content: "  CM   AURA  " });
  let selector = "";
  await handleAuraCommand(message, config, fakeAuraClient(async (discordId) => {
    selector = discordId;
    return null;
  }));
  assert.equal(selector, AUTHOR_ID);
});

test("ignores bot messages", async () => {
  const { message, replies } = fakeMessage({ author: { bot: true, id: AUTHOR_ID } });
  let calls = 0;
  await handleAuraCommand(message, config, fakeAuraClient(async () => { calls += 1; return null; }));
  assert.equal(calls, 0);
  assert.equal(replies.length, 0);
});

test("ignores DMs", async () => {
  const { message, replies } = fakeMessage({ guildId: null });
  let calls = 0;
  await handleAuraCommand(message, config, fakeAuraClient(async () => { calls += 1; return null; }));
  assert.equal(calls, 0);
  assert.equal(replies.length, 0);
});

test("ignores messages from the wrong guild", async () => {
  const { message, replies } = fakeMessage({ guildId: "999999999999999999" });
  let calls = 0;
  await handleAuraCommand(message, config, fakeAuraClient(async () => { calls += 1; return null; }));
  assert.equal(calls, 0);
  assert.equal(replies.length, 0);
});

test("ignores the configured blocked channel", async () => {
  const { message, replies } = fakeMessage({ channelId: BLOCKED_CHANNEL_ID });
  let calls = 0;
  await handleAuraCommand(message, config, fakeAuraClient(async () => { calls += 1; return null; }));
  assert.equal(calls, 0);
  assert.equal(replies.length, 0);
});

test("maps HTTP 404 NOT_FOUND to the exact legacy not-linked response", async () => {
  const { message, replies } = fakeMessage();
  await handleAuraCommand(message, config, fakeAuraClient(async () => {
    throw new InternalApiClientError("NOT_FOUND", 404);
  }));
  assert.deepEqual(replies[0], {
    content: AURA_NOT_LINKED_MESSAGE,
    allowedMentions: { parse: [], users: [], roles: [], repliedUser: false }
  });
});

test("maps HTTP 200 with aura null to the exact legacy unavailable response", async () => {
  const { message, replies } = fakeMessage();
  await handleAuraCommand(message, config, fakeAuraClient(async () => null));
  assert.deepEqual(replies[0], {
    content: AURA_UNAVAILABLE_MESSAGE,
    allowedMentions: { parse: [], users: [], roles: [], repliedUser: false }
  });
});

test("renders the exact legacy Aura success embed from API fields", async () => {
  const { message, replies } = fakeMessage({ content: "  CM   AURA  " });
  await handleAuraCommand(message, config, fakeAuraClient(async () => ({
    displayName: "@Alice_*",
    availableAura: 123,
    lifetimeAura: 456,
    updatedAt: "2026-08-10T00:00:00.000Z"
  })));
  assert.deepEqual(replies[0], successFixture);
});

for (const displayName of ["Anonymous", "Discord User", "CM User"] as const) {
  test(`uses the API-provided ${displayName} display label`, async () => {
    const { message, replies } = fakeMessage();
    await handleAuraCommand(message, config, fakeAuraClient(async () => ({
      displayName,
      availableAura: 1,
      lifetimeAura: 2,
      updatedAt: "2026-08-10T00:00:00.000Z"
    })));
    const payload = replies[0] as { embeds: Array<{ title: string }> };
    assert.equal(payload.embeds[0]?.title, `${displayName}'s Aura`);
  });
}

test("neutralizes mention and markdown injection in API displayName", async () => {
  const { message, replies } = fakeMessage();
  await handleAuraCommand(message, config, fakeAuraClient(async () => ({
    displayName: "@everyone **name**",
    availableAura: 1,
    lifetimeAura: 2,
    updatedAt: "2026-08-10T00:00:00.000Z"
  })));
  const payload = replies[0] as { embeds: Array<{ title: string }> };
  assert.equal(payload.embeds[0]?.title.includes("@everyone"), false);
  assert.equal(payload.embeds[0]?.title.includes("\\*\\*name\\*\\*"), true);
});

test("maps other API failures to the exact legacy unavailable response", async () => {
  const originalError = console.error;
  console.error = () => undefined;
  try {
    const { message, replies } = fakeMessage();
    await handleAuraCommand(message, config, fakeAuraClient(async () => {
      throw new InternalApiClientError("RATE_LIMITED", 429);
    }));
    assert.equal((replies[0] as { content: string }).content, AURA_UNAVAILABLE_MESSAGE);
  } finally {
    console.error = originalError;
  }
});
