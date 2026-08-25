import assert from "node:assert/strict";
import test from "node:test";
import { RuntimeDeterministicSupportActionResolver } from "../../src/ai/actionResolver";
import { applyPendingClarificationAnswer, createSupportConversationState } from "../../src/ai/supportConversation";
import type { SupportLiveLookupAdapter } from "../../src/ai/supportLookup";
import type { SupportRuntimePack, SupportRuntimeRecord } from "../../src/ai/runtimePack";
import type { SupportTriageDecision } from "../../src/ai/supportTriage";

function record(id: string, extras: Record<string, unknown> = {}): SupportRuntimeRecord {
  return { id, ...extras } as SupportRuntimeRecord;
}

const runtime: SupportRuntimePack = {
  knowledgeVersion: "test",
  aliases: [], productProfiles: [], catalog: {}, routing: {}, actionRouting: {}, restrictedTopics: [],
  cases: [
    record("case.rust.nfa.server_load_crash", {
      displayName: "Rust NFA server load crash", family: "technical.rust_nfa", policies: [],
      flow: [{ procedureId: "procedure.system.reduce_resource_pressure" }]
    }),
    record("case.restricted.technical", { displayName: "Restricted technical", family: "restricted", policies: [], flow: [] }),
    record("case.order.status", { displayName: "Order status", family: "commerce.order", policies: [], flow: [] })
  ],
  clarifications: [
    record("clarify.payment_state", { answerType: "enum", options: ["declined", "pending", "completed_missing"], setsContext: ["paymentState"], question: "Was the payment declined, pending, or completed with nothing appearing?" }),
    record("clarify.order_selector", { answerType: "selector", options: [], setsContext: ["orderSelector", "purchaseSelector"], question: "Which recent order or payment is this about?" })
  ],
  dynamicLookups: [record("dynamic.order.status", { operation: "orders.details.read" })],
  policies: [
    record("policy.nfa.short_term", { authority: "current_authoritative", rule: "NFA is short-term access.", dynamicRequirements: [] }),
    record("policy.refund.current", { authority: "operator_approved", rule: "Refund decisions require live state.", dynamicRequirements: ["dynamic.order.status"] })
  ],
  procedures: [
    record("procedure.system.reduce_resource_pressure", {
      restricted: false,
      steps: [
        { action: "If graphics are high, lower ordinary in-game graphics settings." },
        { action: "Close unnecessary background applications and free ordinary system resources." }
      ]
    }),
    record("procedure.restricted.internal", { restricted: true, steps: [{ action: "Do not expose bypass internals." }] })
  ],
  escalations: []
};

function decision(overrides: Partial<SupportTriageDecision>): SupportTriageDecision {
  return {
    observations: { explicitEntities: [], supportSurface: null, knownFacts: [], missingFacts: [] },
    nextAction: "human_escalation",
    caseIds: [], clarificationId: null, dynamicLookupIds: [], policyIds: [], confidence: 1, reasonCode: "test",
    ...overrides
  };
}

test("canonical clarification renders exact question and records bounded pending state", async () => {
  const resolver = new RuntimeDeterministicSupportActionResolver();
  const resolved = await resolver.resolve({
    decision: decision({ nextAction: "ask_clarification", clarificationId: "clarify.payment_state" }),
    state: createSupportConversationState(), runtime, lookupContext: {}
  });
  assert.equal(resolved.action.kind, "clarification");
  assert.equal(resolved.action.customerMessage, "Was the payment declined, pending, or completed with nothing appearing?");
  assert.deepEqual(resolved.state.pendingClarification, {
    id: "clarify.payment_state", contextKey: "paymentState", contextKeys: ["paymentState"], answerType: "enum",
    options: ["declined", "pending", "completed_missing"]
  });
  const answer = applyPendingClarificationAnswer(resolved.state, "pending");
  assert.equal(answer.consumed, true);
  assert.equal(answer.state.knownContext.paymentState, "pending");
  assert.equal(answer.state.pendingClarification, null);
});

test("safe Rust NFA case renders only explicitly allowlisted ordinary resource procedure and tracks it", async () => {
  const resolver = new RuntimeDeterministicSupportActionResolver();
  const resolved = await resolver.resolve({
    decision: decision({ nextAction: "answer_case", caseIds: ["case.rust.nfa.server_load_crash"] }),
    state: createSupportConversationState(), runtime, lookupContext: {}
  });
  assert.equal(resolved.action.kind, "case");
  assert.match(resolved.action.customerMessage, /lower ordinary in-game graphics settings/i);
  assert.match(resolved.action.customerMessage, /Close unnecessary background applications/i);
  assert.doesNotMatch(resolved.action.customerMessage, /bypass internals/i);
  assert.equal(resolved.state.pendingProcedureId, "procedure.system.reduce_resource_pressure");
});

test("an already pending or failed procedure is not rendered again", async () => {
  const resolver = new RuntimeDeterministicSupportActionResolver();
  for (const state of [
    createSupportConversationState({ pendingProcedureId: "procedure.system.reduce_resource_pressure" }),
    createSupportConversationState({
      proceduresAttempted: ["procedure.system.reduce_resource_pressure"],
      procedureOutcomes: { "procedure.system.reduce_resource_pressure": "failure" }
    })
  ]) {
    const resolved = await resolver.resolve({
      decision: decision({ nextAction: "answer_case", caseIds: ["case.rust.nfa.server_load_crash"] }),
      state, runtime, lookupContext: {}
    });
    assert.doesNotMatch(resolved.action.customerMessage, /lower ordinary in-game graphics settings/i);
    assert.match(resolved.action.customerMessage, /staff member should continue/i);
  }
});

test("restricted case and restricted escalation never render technical procedure details", async () => {
  const resolver = new RuntimeDeterministicSupportActionResolver();
  const restrictedCase = await resolver.resolve({
    decision: decision({ nextAction: "answer_case", caseIds: ["case.restricted.technical"] }),
    state: createSupportConversationState(), runtime, lookupContext: {}
  });
  assert.equal(restrictedCase.action.kind, "escalation");
  assert.doesNotMatch(restrictedCase.action.customerMessage, /bypass internals/i);

  const restrictedRoute = await resolver.resolve({
    decision: decision({ nextAction: "restricted_escalation" }), state: createSupportConversationState(), runtime, lookupContext: {}
  });
  assert.equal(restrictedRoute.action.kind, "escalation");
  assert.doesNotMatch(restrictedRoute.action.customerMessage, /kernel|driver|injection procedure/i);
});

test("authoritative policy renders canonical rule but dynamic policy fails closed until live state exists", async () => {
  const resolver = new RuntimeDeterministicSupportActionResolver();
  const safe = await resolver.resolve({
    decision: decision({ nextAction: "request_policy_route", policyIds: ["policy.nfa.short_term"] }),
    state: createSupportConversationState(), runtime, lookupContext: {}
  });
  assert.equal(safe.action.kind, "policy");
  assert.equal(safe.action.customerMessage, "NFA is short-term access.");

  const blocked = await resolver.resolve({
    decision: decision({ nextAction: "request_policy_route", policyIds: ["policy.refund.current"] }),
    state: createSupportConversationState(), runtime, lookupContext: {}
  });
  assert.equal(blocked.action.kind, "escalation");
});

test("dynamic lookup stores only adapter safe data as resolved conversation context", async () => {
  const adapter: SupportLiveLookupAdapter = {
    async resolveMany() {
      return [{ lookupId: "dynamic.order.status", status: "resolved", safeData: { kind: "order_status", status: "processing" }, customerMessage: "Current order status: processing." }];
    }
  };
  const resolver = new RuntimeDeterministicSupportActionResolver(adapter);
  const resolved = await resolver.resolve({
    decision: decision({ nextAction: "request_dynamic_lookup", dynamicLookupIds: ["dynamic.order.status"] }),
    state: createSupportConversationState({ pendingLookupIds: ["dynamic.order.status"] }), runtime, lookupContext: {}
  });
  assert.equal(resolved.action.kind, "dynamic_lookup");
  assert.equal(resolved.action.customerMessage, "Current order status: processing.");
  assert.deepEqual(resolved.state.dynamicLookupResults["dynamic.order.status"], {
    status: "resolved", data: { kind: "order_status", status: "processing" }
  });
  assert.deepEqual(resolved.state.knownContext["lookup.dynamic.order.status"], {
    kind: "order_status", status: "processing"
  });
  assert.deepEqual(resolved.state.pendingLookupIds, []);
});

test("lookup requiring selector preserves pending lookup authority; unsupported lookup escalates", async () => {
  const clarificationAdapter: SupportLiveLookupAdapter = {
    async resolveMany() {
      return [{ lookupId: "dynamic.order.status", status: "needs_clarification", clarificationId: "clarify.order_selector" }];
    }
  };
  const clarified = await new RuntimeDeterministicSupportActionResolver(clarificationAdapter).resolve({
    decision: decision({ nextAction: "request_dynamic_lookup", dynamicLookupIds: ["dynamic.order.status"] }),
    state: createSupportConversationState(), runtime, lookupContext: {}
  });
  assert.equal(clarified.action.kind, "clarification");
  assert.equal(clarified.state.pendingClarification?.id, "clarify.order_selector");
  assert.deepEqual(clarified.state.pendingLookupIds, ["dynamic.order.status"]);

  const unsupportedAdapter: SupportLiveLookupAdapter = {
    async resolveMany() { return [{ lookupId: "dynamic.catalog.price", status: "unsupported" }]; }
  };
  const unsupported = await new RuntimeDeterministicSupportActionResolver(unsupportedAdapter).resolve({
    decision: decision({ nextAction: "request_dynamic_lookup", dynamicLookupIds: ["dynamic.catalog.price"] }),
    state: createSupportConversationState({ pendingLookupIds: ["dynamic.catalog.price"] }), runtime, lookupContext: {}
  });
  assert.equal(unsupported.action.kind, "escalation");
  assert.deepEqual(unsupported.state.pendingLookupIds, []);
  assert.doesNotMatch(unsupported.action.customerMessage, /catalog\.current\.read|endpoint|provider/i);
});
