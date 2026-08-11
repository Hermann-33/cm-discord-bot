import assert from "node:assert/strict";
import test from "node:test";
import type { Client } from "discord.js";
import type { AppConfig } from "../../src/config/env";
import { LeaderboardService } from "../../src/leaderboard/service";
import type { AuraReadClient, LeaderboardEntry } from "../../src/leaderboard/types";

const config = {
  discordLeaderboardChannelId: "123456789012345673",
  discordLeaderboardMessageId: "123456789012345676"
} as AppConfig;

function discordHarness() {
  let createdPayload: unknown;
  let editedPayload: unknown;
  let fetchedMessageId: string | undefined;
  const channel = {
    isTextBased: () => true,
    send: async (payload: unknown) => {
      createdPayload = payload;
      return { id: "123456789012345699" };
    },
    messages: {
      fetch: async (messageId: string) => {
        fetchedMessageId = messageId;
        return {
          edit: async (payload: unknown) => {
            editedPayload = payload;
            return {};
          }
        };
      }
    }
  };
  const client = {
    channels: { fetch: async () => channel }
  } as unknown as Client;
  return {
    client,
    values: () => ({ createdPayload, editedPayload, fetchedMessageId })
  };
}

function auraClient(fetchLeaderboards: () => Promise<LeaderboardEntry[]>): AuraReadClient {
  return {
    fetchLeaderboards,
    lookupAuraByDiscordId: async () => null
  };
}

async function withQuietLogs<T>(action: () => Promise<T>): Promise<T> {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  console.log = () => undefined;
  console.warn = () => undefined;
  console.error = () => undefined;
  try {
    return await action();
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }
}

test("creates the one-shot bootstrap message with safe mentions", async () => {
  const harness = discordHarness();
  const service = new LeaderboardService(config, harness.client, auraClient(async () => []));
  await withQuietLogs(() => service.createInitialMessage());
  const payload = harness.values().createdPayload as { allowedMentions: unknown; flags: number };
  assert.deepEqual(payload.allowedMentions, { parse: [], users: [], roles: [], repliedUser: false });
  assert.equal(payload.flags, 32768);
});

test("refresh edits the exact configured message with safe mentions", async () => {
  const harness = discordHarness();
  const service = new LeaderboardService(config, harness.client, auraClient(async () => []));
  const result = await withQuietLogs(() => service.refreshNow({ failOnError: true }));
  const values = harness.values();
  assert.equal(result, "refreshed");
  assert.equal(values.fetchedMessageId, config.discordLeaderboardMessageId);
  assert.deepEqual(
    (values.editedPayload as { allowedMentions: unknown }).allowedMentions,
    { parse: [], users: [], roles: [], repliedUser: false }
  );
});

test("scheduled and manual refreshes share one overlap lock", async () => {
  const harness = discordHarness();
  let resolveRows: ((rows: LeaderboardEntry[]) => void) | undefined;
  const rowsPromise = new Promise<LeaderboardEntry[]>((resolve) => { resolveRows = resolve; });
  const service = new LeaderboardService(config, harness.client, auraClient(() => rowsPromise));

  const first = withQuietLogs(() => service.refreshNow({ failOnError: true }));
  await Promise.resolve();
  const second = await withQuietLogs(() => service.refreshNow({ failOnError: true }));
  assert.equal(second, "already-running");
  resolveRows?.([]);
  assert.equal(await first, "refreshed");
});

test("scheduled failure returns failed and releases the lock for the next run", async () => {
  const harness = discordHarness();
  let calls = 0;
  const service = new LeaderboardService(config, harness.client, auraClient(async () => {
    calls += 1;
    if (calls === 1) throw new Error("temporary");
    return [];
  }));
  assert.equal(await withQuietLogs(() => service.refreshNow({ failOnError: false })), "failed");
  assert.equal(await withQuietLogs(() => service.refreshNow({ failOnError: false })), "refreshed");
});

test("startup/manual failOnError propagates the failure and releases the lock", async () => {
  const harness = discordHarness();
  let calls = 0;
  const service = new LeaderboardService(config, harness.client, auraClient(async () => {
    calls += 1;
    if (calls === 1) throw new Error("startup failure");
    return [];
  }));
  await assert.rejects(
    () => withQuietLogs(() => service.refreshNow({ failOnError: true })),
    /startup failure/
  );
  assert.equal(await withQuietLogs(() => service.refreshNow({ failOnError: true })), "refreshed");
});
