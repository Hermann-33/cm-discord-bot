import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  appendShadowAdjudication, closeShadowCohort, emptyShadowReviewFlags,
  initializeShadowCohort, readShadowAdjudications, readShadowTurns,
  ShadowCohortRecorder, SHADOW_RELEASE_CANDIDATE_SHA, summarizeShadowMetrics
} from "../../src/ai/shadowValidation";
import { createSupportConversationState, type PreparedSupportTurn } from "../../src/ai/supportConversation";

async function temporaryCohort(start = new Date("2026-08-26T08:00:00.000Z")) {
  const rootDir = await mkdtemp(join(tmpdir(), "cm-shadow-test-"));
  const manifest = await initializeShadowCohort({
    rootDir, cohortId: "prospective-20260826-a", collectionStartAt: start, now: start
  });
  const recorder = await ShadowCohortRecorder.open({
    rootDir, pseudonymKey: Buffer.alloc(32, 7), runtimeKnowledgeVersion: "1.0.0",
    model: "openai/gpt-oss-120b", reasoningEffort: "low", maxCompletionTokens: 400
  });
  return { rootDir, manifest, recorder };
}

function result(overrides: Partial<PreparedSupportTurn> = {}): PreparedSupportTurn {
  return {
    state: createSupportConversationState(),
    action: { kind: "clarification", canonicalIds: ["clarify.support_surface"], customerMessage: "Which product needs help?" },
    planner: {
      accepted: true, fallbackUsed: false, model: "openai/gpt-oss-120b", validationErrors: [],
      decision: {
        observations: { explicitEntities: [], supportSurface: null, knownFacts: [], missingFacts: [] },
        nextAction: "ask_clarification", caseIds: [], clarificationId: "clarify.support_surface",
        dynamicLookupIds: [], policyIds: [], confidence: 1, reasonCode: "test"
      }
    },
    trace: {
      restricted: false, deterministicNextAction: null, allowedCaseIds: [],
      allowedClarificationIds: ["clarify.support_surface"], allowedDynamicLookupIds: [], allowedPolicyIds: []
    },
    ...overrides
  };
}

test("prospective cohort freezes metadata and rejects pre-start turns", async () => {
  const cohort = await temporaryCohort();
  try {
    assert.equal(cohort.manifest.releaseCandidateSha, SHADOW_RELEASE_CANDIDATE_SHA);
    assert.equal(cohort.manifest.runtimeKnowledgeVersion, "1.0.0");
    assert.equal(cohort.manifest.modelConfig.temperature, 0);
    const old = new Date("2026-08-26T07:59:59.999Z");
    assert.equal(cohort.recorder.accepts(old), false);
    assert.equal(await cohort.recorder.record({
      messageCreatedAt: old, guildId: "100000000000000001", channelId: "200000000000000001",
      userId: "300000000000000001", customerText: "old message",
      stateBeforeTurn: createSupportConversationState(), result: result(), latencyMs: 5
    }), null);
    assert.deepEqual(await readShadowTurns(cohort.rootDir), []);
  } finally { await rm(cohort.rootDir, { recursive: true, force: true }); }
});

test("evidence is pseudonymous, sanitized, turn-separated and never records a sent response", async () => {
  const cohort = await temporaryCohort();
  try {
    const secret = "gsk_abcdefghijklmnopqrstuvwxyz123456";
    const common = {
      guildId: "100000000000000001", channelId: "200000000000000001",
      stateBeforeTurn: createSupportConversationState({ knownContext: { orderSelector: "CM-ABC123", customerEmail: "person@example.com" } }),
      result: result()
    };
    const first = await cohort.recorder.record({
      ...common, userId: "300000000000000001", messageCreatedAt: new Date("2026-08-26T08:00:01.000Z"),
      customerText: `person@example.com CM-ABC123 ${secret}`, latencyMs: 12.345
    });
    const second = await cohort.recorder.record({
      ...common, userId: "300000000000000001", messageCreatedAt: new Date("2026-08-26T08:00:02.000Z"),
      customerText: "same conversation", latencyMs: 10
    });
    const other = await cohort.recorder.record({
      ...common, userId: "300000000000000002", messageCreatedAt: new Date("2026-08-26T08:00:03.000Z"),
      customerText: "other customer", latencyMs: 9
    });
    assert.equal(first?.turnIndex, 1);
    assert.equal(second?.turnIndex, 2);
    assert.notEqual(first?.conversationPseudonym, other?.conversationPseudonym);
    assert.equal(first?.responseActuallySent, false);
    const evidence = await readFile(join(cohort.rootDir, "turns.jsonl"), "utf8");
    for (const value of [secret, "person@example.com", "CM-ABC123", "300000000000000001"]) {
      assert.equal(evidence.includes(value), false);
    }
  } finally { await rm(cohort.rootDir, { recursive: true, force: true }); }
});

test("planner failures store sanitized codes only", async () => {
  const cohort = await temporaryCohort();
  try {
    await cohort.recorder.record({
      messageCreatedAt: new Date("2026-08-26T08:00:01.000Z"), guildId: "100000000000000001", channelId: "200000000000000001", userId: "300000000000000001",
      customerText: "help", stateBeforeTurn: createSupportConversationState(), latencyMs: 20,
      failureCode: "ProviderError secret@example.com raw body"
    });
    const [record] = await readShadowTurns(cohort.rootDir);
    assert.equal(record.plannerAccepted, false);
    assert.equal(record.plannerFallbackUsed, true);
    assert.equal(JSON.stringify(record).includes("secret@example.com"), false);
    assert.equal(record.responseActuallySent, false);
  } finally { await rm(cohort.rootDir, { recursive: true, force: true }); }
});

test("lookup and customer-question evidence reflects the deterministic proposed result", async () => {
  const cohort = await temporaryCohort();
  try {
    const lookupResult = result({
      state: createSupportConversationState({
        dynamicLookupResults: { "dynamic.order.status": { status: "resolved", data: { status: "pending" } } }
      }),
      action: { kind: "dynamic_lookup", canonicalIds: ["dynamic.order.status"], customerMessage: "Current order status: pending." }
    });
    lookupResult.planner.decision.nextAction = "request_dynamic_lookup";
    lookupResult.planner.decision.clarificationId = null;
    lookupResult.planner.decision.dynamicLookupIds = ["dynamic.order.status"];
    const record = await cohort.recorder.record({
      messageCreatedAt: new Date("2026-08-26T08:00:01.000Z"),
      guildId: "100000000000000001", channelId: "200000000000000001", userId: "300000000000000001",
      customerText: "check order", stateBeforeTurn: createSupportConversationState(), result: lookupResult, latencyMs: 25
    });
    assert.equal(record?.lookupRequested, true);
    assert.equal(record?.lookupResolved, true);
    assert.equal(record?.wouldAskCustomerQuestion, false);
    assert.equal(record?.finalProposedAction, "dynamic_lookup");
  } finally { await rm(cohort.rootDir, { recursive: true, force: true }); }
});

test("closed cohorts reject additional records", async () => {
  const cohort = await temporaryCohort();
  try {
    await closeShadowCohort(cohort.rootDir);
    await assert.rejects(() => cohort.recorder.record({
      messageCreatedAt: new Date("2026-08-26T08:00:01.000Z"),
      guildId: "100000000000000001", channelId: "200000000000000001", userId: "300000000000000001",
      customerText: "new message", stateBeforeTurn: createSupportConversationState(), result: result(), latencyMs: 5
    }), /ShadowCohortClosed/);
    assert.equal((await readShadowTurns(cohort.rootDir)).length, 0);
  } finally { await rm(cohort.rootDir, { recursive: true, force: true }); }
});

test("independent adjudication and summarizer apply ADR-0014 gates and latency math", async () => {
  const cohort = await temporaryCohort();
  try {
    const first = await cohort.recorder.record({
      messageCreatedAt: new Date("2026-08-26T08:00:01.000Z"), guildId: "100000000000000001", channelId: "200000000000000001", userId: "300000000000000001",
      customerText: "help", stateBeforeTurn: createSupportConversationState(), result: result(), latencyMs: 100
    });
    const restricted = result({
      action: { kind: "escalation", canonicalIds: [], customerMessage: "Staff review required." },
      trace: { restricted: true, deterministicNextAction: "restricted_escalation", allowedCaseIds: [], allowedClarificationIds: [], allowedDynamicLookupIds: [], allowedPolicyIds: [] }
    });
    restricted.planner.decision.nextAction = "restricted_escalation";
    restricted.planner.decision.clarificationId = null;
    const second = await cohort.recorder.record({
      messageCreatedAt: new Date("2026-08-26T08:00:02.000Z"), guildId: "100000000000000001", channelId: "200000000000000001", userId: "300000000000000002",
      customerText: "restricted", stateBeforeTurn: createSupportConversationState(), result: restricted, latencyMs: 300
    });
    for (const record of [first!, second!]) {
      await appendShadowAdjudication(cohort.rootDir, {
        schemaVersion: 1, recordId: record.recordId, adjudicatedAt: "2026-08-26T09:00:00.000Z",
        reviewerPseudonym: "reviewer_a", quality: "optimal", correctAction: true,
        flags: emptyShadowReviewFlags(), notes: "reviewed"
      });
    }
    const metrics = summarizeShadowMetrics(cohort.manifest, await readShadowTurns(cohort.rootDir), await readShadowAdjudications(cohort.rootDir));
    assert.equal(metrics.safeProgressOrBetterRate, 1);
    assert.equal(metrics.unsafeRate, 0);
    assert.equal(metrics.restrictedSafetyRate, 1);
    assert.equal(metrics.latencyAverageMs, 200);
    assert.equal(metrics.latencyMedianMs, 100);
    assert.equal(metrics.latencyP95Ms, 300);
    assert.equal(metrics.releaseDecisionReady, false);
    const closed = await closeShadowCohort(cohort.rootDir);
    const closedMetrics = summarizeShadowMetrics(closed, await readShadowTurns(cohort.rootDir), await readShadowAdjudications(cohort.rootDir));
    assert.equal(closedMetrics.measuredGatesSatisfied, true);
    assert.equal(closedMetrics.releaseDecisionReady, false, "ADR-0014 has no approved minimum sample");
  } finally { await rm(cohort.rootDir, { recursive: true, force: true }); }
});

test("unsafe flags fail privacy, mutation, scope and unsafe-rate gates", async () => {
  const cohort = await temporaryCohort();
  try {
    const record = await cohort.recorder.record({
      messageCreatedAt: new Date("2026-08-26T08:00:01.000Z"), guildId: "100000000000000001", channelId: "200000000000000001", userId: "300000000000000001",
      customerText: "help", stateBeforeTurn: createSupportConversationState(), result: result(), latencyMs: 50
    });
    const flags = emptyShadowReviewFlags();
    flags.scopeLeakage = true; flags.privacyLeakage = true; flags.mutationAttempt = true;
    await appendShadowAdjudication(cohort.rootDir, {
      schemaVersion: 1, recordId: record!.recordId, adjudicatedAt: "2026-08-26T09:00:00.000Z",
      reviewerPseudonym: "reviewer_a", quality: "unsafe", correctAction: false, flags, notes: "unsafe"
    });
    const metrics = summarizeShadowMetrics(cohort.manifest, await readShadowTurns(cohort.rootDir), await readShadowAdjudications(cohort.rootDir));
    assert.equal(metrics.gates.scopeLeakage, false);
    assert.equal(metrics.gates.privacy, false);
    assert.equal(metrics.gates.mutationAuthority, false);
    assert.equal(metrics.unsafeRate, 1);
  } finally { await rm(cohort.rootDir, { recursive: true, force: true }); }
});
