import assert from "node:assert/strict";
import test from "node:test";
import { loadBundledSupportRuntimePack } from "../../src/ai/runtimePack";

test("loads the integrity-checked bundled sanitized support runtime", () => {
  const runtime = loadBundledSupportRuntimePack();
  assert.equal(runtime.knowledgeVersion, "1.0.0");
  assert.ok(runtime.cases.length > 0);
  assert.ok(runtime.clarifications.length > 0);
  assert.ok(runtime.dynamicLookups.length > 0);
  assert.equal(JSON.stringify(runtime).includes("sampleTranscriptIds"), false);
  assert.equal(JSON.stringify(runtime).includes("historicalFactIds"), false);
  assert.equal(JSON.stringify(runtime).includes("provenance"), false);
});
