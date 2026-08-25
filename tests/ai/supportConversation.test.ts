import assert from "node:assert/strict";
import test from "node:test";
import {
  SupportConversationService,
  applyConversationContinuation,
  applyPendingClarificationAnswer,
  createSupportConversationState,
  type DeterministicSupportActionResolver,
  type DeterministicSupportResolver,
  type SupportTriagePlanner
} from "../../src/ai/supportConversation";
import { loadBundledSupportRuntimePack } from "../../src/ai/runtimePack";

const runtime = loadBundledSupportRuntimePack();

test("short answer is consumed against the pending clarification", () => {
  const state = createSupportConversationState({
    unknownContext: ["workedBefore"],
    pendingClarification: {
      id: "clarify.nfa.worked_before",
      contextKey: "workedBefore",
      answerType: "boolean"
    }
  });

  const result = applyPendingClarificationAnswer(state, "no");
  assert.equal(result.consumed, true);
  assert.equal(result.state.knownContext.workedBefore, false);
  assert.equal(result.state.answersReceived["clarify.nfa.worked_before"], false);
  assert.deepEqual(result.state.unknownContext, []);
  assert.equal(result.state.pendingClarification, null);
});

test("unrecognized short answer leaves pending clarification intact", () => {
  const state = createSupportConversationState({
    pendingClarification: {
      id: "clarify.nfa.worked_before",
      contextKey: "workedBefore",
      answerType: "boolean"
    }
  });
  const result = applyPendingClarificationAnswer(state, "maybe later");
  assert.equal(result.consumed, false);
  assert.notEqual(result.state.pendingClarification, null);
});

test("NFA failure-stage enum answer derives worked-before context without another question", () => {
  const state = createSupportConversationState({
    unknownContext: ["nfaFailureStage", "workedBefore", "ownerSessionConflict"],
    pendingClarification: {
      id: "clarify.nfa.failure_stage",
      contextKey: "nfaFailureStage",
      contextKeys: ["nfaFailureStage", "workedBefore", "ownerSessionConflict"],
      answerType: "enum",
      options: ["never_worked", "worked_then_invalid", "owner_or_session_conflict", "activation_or_token_issue", "not_sure"]
    }
  });

  const result = applyPendingClarificationAnswer(state, "never worked");
  assert.equal(result.consumed, true);
  assert.equal(result.state.knownContext.nfaFailureStage, "never_worked");
  assert.equal(result.state.knownContext.workedBefore, false);
  assert.equal(result.state.knownContext.ownerSessionConflict, false);
  assert.deepEqual(result.state.unknownContext, []);
});

test("selector clarification records only a supplied marker in planner state", () => {
  const state = createSupportConversationState({
    pendingClarification: {
      id: "clarify.order_selector",
      contextKey: "orderSelector",
      contextKeys: ["orderSelector", "purchaseSelector"],
      answerType: "selector"
    }
  });

  const result = applyPendingClarificationAnswer(state, "CM-SECRET-1234");
  assert.equal(result.consumed, true);
  assert.equal(result.state.knownContext.orderSelector, true);
  assert.equal(result.state.knownContext.purchaseSelector, true);
  assert.equal(result.state.answersReceived["clarify.order_selector"], "selector_supplied");
  assert.equal(JSON.stringify(result.state).includes("CM-SECRET-1234"), false);
});

test("already-low reply advances the permanent Rust NFA resource flow instead of repeating it", () => {
  const state = createSupportConversationState({
    candidateCaseIds: ["case.rust.nfa.server_load_crash"],
    candidateFamilyIds: ["technical.rust_nfa"],
    pendingProcedureId: "procedure.system.reduce_resource_pressure"
  });

  const result = applyConversationContinuation(state, "already low", runtime);
  assert.equal(result.failedProcedureId, "procedure.system.reduce_resource_pressure");
  assert.equal(result.state.knownContext.graphicsLevel, "low");
  assert.equal(result.state.procedureOutcomes["procedure.system.reduce_resource_pressure"], "failure");
  assert.deepEqual(result.state.candidateCaseIds, ["case.rust.nfa.server_load_crash.continue"]);
  assert.equal(result.state.continuationCaseId, "case.rust.nfa.server_load_crash.continue");
});

test("still-crashes reply records procedure failure and advances the canonical continuation", () => {
  const state = createSupportConversationState({
    candidateCaseIds: ["case.rust.nfa.server_load_crash"],
    candidateFamilyIds: ["technical.rust_nfa"],
    pendingProcedureId: "procedure.system.reduce_resource_pressure"
  });

  const result = applyConversationContinuation(state, "still crashes", runtime);
  assert.equal(result.failedProcedureId, "procedure.system.reduce_resource_pressure");
  assert.deepEqual(result.state.proceduresAttempted, ["procedure.system.reduce_resource_pressure"]);
  assert.deepEqual(result.state.candidateCaseIds, ["case.rust.nfa.server_load_crash.continue"]);
});

test("successful pending procedure closes deterministically without invoking Groq", async () => {
  let resolverCalls = 0;
  let plannerCalls = 0;
  const resolver: DeterministicSupportResolver = {
    resolve() {
      resolverCalls += 1;
      throw new Error("resolver should not run");
    }
  };
  const planner: SupportTriagePlanner = {
    async triage() {
      plannerCalls += 1;
      throw new Error("planner should not run");
    }
  };
  const actionResolver: DeterministicSupportActionResolver = {
    resolve() {
      throw new Error("action resolver should not run");
    }
  };
  const service = new SupportConversationService(runtime, resolver, planner, actionResolver);
  const state = createSupportConversationState({
    candidateCaseIds: ["case.rust.nfa.server_load_crash"],
    pendingProcedureId: "procedure.system.reduce_resource_pressure"
  });

  const result = await service.prepareTurn("worked", state);
  assert.equal(result.action.kind, "other");
  assert.equal(result.planner.model, "deterministic-continuation");
  assert.equal(result.state.procedureOutcomes["procedure.system.reduce_resource_pressure"], "success");
  assert.equal(resolverCalls, 0);
  assert.equal(plannerCalls, 0);
});

test("selector answer resumes the pending approved lookup without first-turn replanning", async () => {
  let resolverCalls = 0;
  let plannerCalls = 0;
  let resolvedLookupIds: readonly string[] = [];
  const resolver: DeterministicSupportResolver = {
    resolve() {
      resolverCalls += 1;
      throw new Error("resolver should not run");
    }
  };
  const planner: SupportTriagePlanner = {
    async triage() {
      plannerCalls += 1;
      throw new Error("planner should not run");
    }
  };
  const actionResolver: DeterministicSupportActionResolver = {
    resolve(input) {
      resolvedLookupIds = input.decision.dynamicLookupIds;
      return {
        state: createSupportConversationState({ ...input.state, pendingLookupIds: [] }),
        action: { kind: "dynamic_lookup", canonicalIds: input.decision.dynamicLookupIds, customerMessage: "resolved" }
      };
    }
  };
  const service = new SupportConversationService(runtime, resolver, planner, actionResolver);
  const state = createSupportConversationState({
    candidateCaseIds: ["case.order.status"],
    candidateFamilyIds: ["commerce.order"],
    pendingLookupIds: ["dynamic.order.status"],
    pendingClarification: {
      id: "clarify.order_selector",
      contextKey: "orderSelector",
      contextKeys: ["orderSelector", "purchaseSelector"],
      answerType: "selector"
    }
  });

  const result = await service.prepareTurn("CM-ORDER-1234", state, {
    orderSelector: { kind: "public_ref", value: "CM-ORDER-1234" }
  });
  assert.deepEqual(resolvedLookupIds, ["dynamic.order.status"]);
  assert.equal(result.planner.decision.reasonCode, "pending_lookup_resumed_after_clarification");
  assert.equal(resolverCalls, 0);
  assert.equal(plannerCalls, 0);
});
