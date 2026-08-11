import assert from "node:assert/strict";
import test from "node:test";
import type { LeaderboardRefreshResult } from "../../src/leaderboard/service";
import {
  LEADERBOARD_UPDATE_INTERVAL_MS,
  LeaderboardSchedule,
  type TimerFunctions
} from "../../src/scheduler/leaderboardSchedule";

function harness(options: { hasMessage: boolean; results?: Array<LeaderboardRefreshResult | Error> }) {
  const refreshOptions: Array<{ failOnError: boolean }> = [];
  let bootstrapCalls = 0;
  let timerDelay: number | undefined;
  let timerCallback: (() => void) | undefined;
  let cleared = false;
  let index = 0;
  const results = options.results ?? ["refreshed"];
  const service = {
    createInitialMessage: async () => { bootstrapCalls += 1; },
    refreshNow: async (value: { failOnError: boolean }) => {
      refreshOptions.push(value);
      const result = results[Math.min(index++, results.length - 1)]!;
      if (result instanceof Error) throw result;
      return result;
    }
  };
  const handle = {} as NodeJS.Timeout;
  const timers: TimerFunctions = {
    setInterval: (callback, delay) => {
      timerCallback = callback;
      timerDelay = delay;
      return handle;
    },
    clearInterval: (value) => {
      assert.equal(value, handle);
      cleared = true;
    }
  };
  const schedule = new LeaderboardSchedule(service, options.hasMessage, timers);
  return {
    schedule,
    values: () => ({ refreshOptions, bootstrapCalls, timerDelay, timerCallback, cleared })
  };
}

test("bootstrap creates one message and does not start the timer", async () => {
  const context = harness({ hasMessage: false });
  assert.equal(await context.schedule.start(), "bootstrap-complete");
  assert.equal(context.values().bootstrapCalls, 1);
  assert.equal(context.values().refreshOptions.length, 0);
  assert.equal(context.values().timerDelay, undefined);
});

test("performs an immediate startup refresh then starts the five-minute timer", async () => {
  const context = harness({ hasMessage: true });
  assert.equal(await context.schedule.start(), "running");
  assert.deepEqual(context.values().refreshOptions, [{ failOnError: true }]);
  assert.equal(context.values().timerDelay, LEADERBOARD_UPDATE_INTERVAL_MS);
  assert.equal(LEADERBOARD_UPDATE_INTERVAL_MS, 300_000);
});

test("startup refresh failure propagates and does not start the timer", async () => {
  const context = harness({ hasMessage: true, results: [new Error("startup failure")] });
  await assert.rejects(() => context.schedule.start(), /startup failure/);
  assert.equal(context.values().timerDelay, undefined);
});

test("scheduled refresh uses nonfatal mode and continues after failure", async () => {
  const context = harness({ hasMessage: true, results: ["refreshed", "failed", "refreshed"] });
  await context.schedule.start();
  await context.schedule.runScheduledRefresh();
  await context.schedule.runScheduledRefresh();
  assert.deepEqual(context.values().refreshOptions, [
    { failOnError: true },
    { failOnError: false },
    { failOnError: false }
  ]);
});

test("clean shutdown clears the active timer", async () => {
  const context = harness({ hasMessage: true });
  await context.schedule.start();
  assert.equal(typeof context.values().timerCallback, "function");
  context.schedule.stop();
  assert.equal(context.values().cleared, true);
});

test("unexpected scheduled rejection is safely logged and does not escape", async () => {
  const originalError = console.error;
  console.error = () => undefined;
  try {
    const context = harness({ hasMessage: true, results: ["refreshed", new Error("unexpected")] });
    await context.schedule.start();
    await context.schedule.runScheduledRefresh();
  } finally {
    console.error = originalError;
  }
});
