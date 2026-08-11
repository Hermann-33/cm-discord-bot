import assert from "node:assert/strict";
import test from "node:test";
import { createShutdownHandler } from "../../src/scheduler/shutdown";

test("graceful shutdown stops the timer, destroys Discord, exits once, and is idempotent", async () => {
  let stopCalls = 0;
  let destroyCalls = 0;
  const exitCodes: number[] = [];
  const shutdown = createShutdownHandler(
    { stop: () => { stopCalls += 1; } },
    { destroy: () => { destroyCalls += 1; } },
    (exitCode) => { exitCodes.push(exitCode); }
  );

  await shutdown(0);
  await shutdown(1);

  assert.equal(stopCalls, 1);
  assert.equal(destroyCalls, 1);
  assert.deepEqual(exitCodes, [0]);
});
