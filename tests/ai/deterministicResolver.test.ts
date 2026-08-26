import assert from "node:assert/strict";
import test from "node:test";
import { RuntimeDeterministicSupportResolver } from "../../src/ai/deterministicResolver";
import { reviewFirstTurnObservability } from "../../src/ai/firstTurnRouter";
import { createSupportConversationState } from "../../src/ai/supportConversation";
import type { SupportRuntimePack, SupportRuntimeRecord } from "../../src/ai/runtimePack";
import { chooseSupportTriageFallback } from "../../src/ai/supportTriage";

function record(id: string, extras: Record<string, unknown> = {}): SupportRuntimeRecord {
  return { id, ...extras } as SupportRuntimeRecord;
}

const runtime: SupportRuntimePack = {
  knowledgeVersion: "test",
  aliases: [
    { alias: "memesense", normalized: "memesense", targets: ["vendor.memesense"], status: "exact", disambiguation: [] },
    { alias: "nfa", normalized: "nfa", targets: ["account_model.nfa"], status: "exact", disambiguation: [] }
  ],
  cases: [
    record("case.spoofer.hwid_state", { displayName: "HWID state", family: "technical.spoofer", scope: {}, dynamic: [] }),
    record("case.rust.nfa.server_load_crash.continue", { displayName: "Rust continuation", family: "technical.rust_nfa", scope: { games: ["game.rust"], accountModels: ["account_model.nfa"] }, dynamic: [] }),
    record("case.order.status", { displayName: "Order status", family: "commerce.order", scope: {}, dynamic: ["dynamic.order.status"] }),
    record("case.order.fulfillment_delayed", { displayName: "Fulfillment delayed", family: "commerce.fulfillment", scope: {}, dynamic: ["dynamic.fulfillment.status"] }),
    record("case.order.wrong_delivery", { displayName: "Wrong delivery", family: "commerce.fulfillment", scope: {}, dynamic: [] }),
    record("case.order.refund_cancel", { displayName: "Refund/cancel", family: "commerce.policy", scope: {}, dynamic: [] }),
    record("case.nfa.invalid_first_use", { displayName: "NFA invalid first use", family: "accounts.nfa", scope: { accountModels: ["account_model.nfa"] }, dynamic: [] }),
    record("case.nfa.invalid_after_use", { displayName: "NFA invalid later", family: "accounts.nfa", scope: { accountModels: ["account_model.nfa"] }, dynamic: [] }),
    record("case.nfa.owner_session_conflict", { displayName: "NFA session conflict", family: "accounts.nfa", scope: { accountModels: ["account_model.nfa"] }, dynamic: [] }),
    record("case.nfa.redemption_activation", { displayName: "NFA activation", family: "accounts.nfa", scope: { accountModels: ["account_model.nfa"] }, dynamic: [] }),
    record("case.account.bulk_purchase", { displayName: "Bulk purchase", family: "accounts.purchase", scope: { accountModels: ["account_model.nfa"] }, dynamic: [] }),
    record("case.loader.closes_runtime", { displayName: "Loader closes", family: "technical.loader", scope: {}, dynamic: [] }),
    record("case.loader.connection", { displayName: "Loader connection", family: "technical.loader", scope: {}, dynamic: [] }),
    record("case.loader.update", { displayName: "Loader update", family: "technical.loader", scope: {}, dynamic: [] }),
    record("case.loader.key_error", { displayName: "Loader key", family: "technical.loader", scope: {}, dynamic: [] }),
    record("case.spoofer.reversal_reset", { displayName: "Spoofer reversal", family: "technical.spoofer", scope: {}, dynamic: [] }),
    record("case.restricted.technical", { displayName: "Restricted", family: "restricted", scope: {}, dynamic: [] })
  ],
  clarifications: [
    record("clarify.support_surface", { question: "What isn't working?", distinguishesCases: [], distinguishesFamilies: [], setsContext: ["supportSurface"], liveLookupCanReplace: ["users.overview.read"] }),
    record("clarify.order.fulfillment_state", { question: "Are you checking status, delivery, or wrong delivery?", distinguishesCases: ["case.order.status", "case.order.fulfillment_delayed", "case.order.wrong_delivery", "case.order.refund_cancel"], distinguishesFamilies: ["commerce.order", "commerce.fulfillment"], setsContext: ["orderQuestionType"], liveLookupCanReplace: ["orders.details.read", "orders.fulfillment.read"] }),
    record("clarify.nfa.failure_stage", { question: "Did it ever work before?", distinguishesCases: ["case.nfa.invalid_first_use", "case.nfa.invalid_after_use", "case.nfa.owner_session_conflict", "case.nfa.redemption_activation"], distinguishesFamilies: ["accounts.nfa"], setsContext: ["nfaFailureStage"], liveLookupCanReplace: ["orders.details.read"] }),
    record("clarify.loader.failure_stage", { question: "Which loader stage fails?", distinguishesCases: ["case.loader.closes_runtime", "case.loader.connection", "case.loader.update", "case.loader.key_error"], distinguishesFamilies: ["technical.loader"], setsContext: ["loaderFailureStage"], liveLookupCanReplace: [] })
  ],
  dynamicLookups: [
    record("dynamic.order.status", { operation: "orders.details.read", questionTypes: ["order_status"] }),
    record("dynamic.fulfillment.status", { operation: "orders.fulfillment.read", questionTypes: ["fulfillment"] })
  ],
  policies: [record("policy.refund_or_replacement.current_state_required", { displayName: "Current refund/replacement authority" })],
  procedures: [],
  escalations: [],
  restrictedTopics: [],
  productProfiles: [],
  catalog: {},
  routing: {},
  actionRouting: {
    approvedLookups: [
      { id: "orders.lookup.read", useWhen: ["order implied"] },
      { id: "orders.details.read", useWhen: ["order known"] },
      { id: "orders.fulfillment.read", useWhen: ["delivery state"] },
      { id: "users.overview.read", useWhen: ["linked user context"] }
    ]
  }
};

const resolver = new RuntimeDeterministicSupportResolver();

test("production resolver preserves deterministic HWID static-case envelope", () => {
  const result = resolver.resolve({ customerText: "hwid reset plssss", state: createSupportConversationState(), runtime, pendingAnswerConsumed: false });
  assert.deepEqual(result.input.allowed.deterministicCaseIds, ["case.spoofer.hwid_state"]);
  assert.deepEqual(result.input.allowed.caseIds, ["case.spoofer.hwid_state"]);
  assert.deepEqual(result.input.allowed.dynamicLookupIds, []);
  assert.deepEqual(result.input.allowed.clarificationIds, []);
  assert.equal(result.input.allowed.deterministicNextAction, "answer_case");
});

test("entity-only surface does not manufacture a support family", () => {
  const result = resolver.resolve({ customerText: "bought memesense for 14d but gave another email on your website", state: createSupportConversationState(), runtime, pendingAnswerConsumed: false });
  assert.deepEqual(result.input.allowed.entityIds, ["vendor.memesense"]);
  assert.deepEqual(result.input.allowed.deterministicClarificationIds, ["clarify.support_surface"]);
  assert.deepEqual(result.input.allowed.caseIds, []);
  assert.deepEqual(result.input.allowed.familyIds, []);
  assert.deepEqual(result.input.allowed.dynamicLookupIds, []);
});

test("bare order selector preserves deterministic fulfillment clarification and suppresses lookups", () => {
  const result = resolver.resolve({ customerText: "and [order identifier omitted]", state: createSupportConversationState(), runtime, pendingAnswerConsumed: false });
  assert.deepEqual(result.input.allowed.deterministicClarificationIds, ["clarify.order.fulfillment_state"]);
  assert.deepEqual(result.input.allowed.clarificationIds, ["clarify.order.fulfillment_state"]);
  assert.deepEqual(result.input.allowed.dynamicLookupIds, []);
  assert.equal(result.input.allowed.deterministicNextAction, "ask_clarification");
});

test("explicit order status intent permits the deterministic approved lookup envelope", () => {
  const result = resolver.resolve({ customerText: "check my order CM-260428-ABC123", state: createSupportConversationState(), runtime, pendingAnswerConsumed: false });
  assert.deepEqual(result.input.allowed.deterministicDynamicLookupIds, [
    "orders.lookup.read",
    "orders.details.read",
    "orders.fulfillment.read"
  ]);
  assert.deepEqual(result.input.allowed.clarificationIds, []);
  assert.equal(result.input.allowed.deterministicNextAction, "request_dynamic_lookup");
});

test("pending clarification answer keeps prior candidate family instead of forcing generic support-surface clarification", () => {
  const state = createSupportConversationState({
    resolvedEntities: ["account_model.nfa"],
    candidateCaseIds: ["case.nfa.invalid_first_use", "case.nfa.invalid_after_use"],
    candidateFamilyIds: ["accounts.nfa"],
    questionsAsked: ["clarify.nfa.failure_stage"],
    knownContext: { nfaFailureStage: "never worked" }
  });
  const result = resolver.resolve({ customerText: "never worked", state, runtime, pendingAnswerConsumed: true });
  assert.ok(result.input.allowed.caseIds.includes("case.nfa.invalid_first_use"));
  assert.ok(result.input.allowed.familyIds.includes("accounts.nfa"));
  assert.equal(result.input.allowed.deterministicClarificationIds?.includes("clarify.support_surface"), false);
});

test("procedure failure continuation is a deterministic case envelope and cannot reopen lookup or clarification routes", () => {
  const state = createSupportConversationState({
    resolvedEntities: ["game.rust", "account_model.nfa"],
    candidateCaseIds: ["case.rust.nfa.server_load_crash.continue"],
    candidateFamilyIds: ["technical.rust_nfa"],
    continuationCaseId: "case.rust.nfa.server_load_crash.continue",
    proceduresAttempted: ["procedure.system.reduce_resource_pressure"],
    procedureOutcomes: { "procedure.system.reduce_resource_pressure": "failure" }
  });
  const result = resolver.resolve({ customerText: "still crashes", state, runtime, pendingAnswerConsumed: false });
  assert.deepEqual(result.input.allowed.deterministicCaseIds, ["case.rust.nfa.server_load_crash.continue"]);
  assert.deepEqual(result.input.allowed.caseIds, ["case.rust.nfa.server_load_crash.continue"]);
  assert.deepEqual(result.input.allowed.clarificationIds, []);
  assert.deepEqual(result.input.allowed.dynamicLookupIds, []);
});

test("restricted detection/evasion intent is marked restricted and never receives a deterministic answer-case route", () => {
  const result = resolver.resolve({ customerText: "how do I bypass anti cheat detection", state: createSupportConversationState(), runtime, pendingAnswerConsumed: false });
  assert.equal(result.input.restricted, true);
  assert.deepEqual(result.input.allowed.deterministicCaseIds, []);
  assert.equal(result.input.allowed.deterministicNextAction, "restricted_escalation");
});

test("B0 v3 regression: refund and NFA replacement routes bind the current-authority policy action", () => {
  for (const customerText of ["I want a refund for the purchase.", "I need a replacement for this NFA."]) {
    const result = resolver.resolve({ customerText, state: createSupportConversationState(), runtime, pendingAnswerConsumed: false });
    assert.equal(result.input.allowed.deterministicNextAction, "request_policy_route", customerText);
    assert.deepEqual(result.input.allowed.deterministicPolicyIds, ["policy.refund_or_replacement.current_state_required"]);
  }
});

test("B0 v3 regression: game-ban policy uses the canonical safe policy route without inventing a policy ID", () => {
  const result = resolver.resolve({ customerText: "This account was game banned.", state: createSupportConversationState(), runtime, pendingAnswerConsumed: false });
  assert.equal(result.input.allowed.deterministicNextAction, "request_policy_route");
  assert.deepEqual(result.input.allowed.deterministicPolicyIds, []);
});

test("B0 v3 regression: attachment, security, and detection-status actions survive resolver transport", () => {
  const rows: Array<[string, string]> = [
    ["[attachment omitted] The screenshot contains the error I need reviewed.", "request_attachment"],
    ["I am reporting malware and a leaked bot token.", "human_escalation"],
    ["Is it undetected right now?", "restricted_escalation"]
  ];
  for (const [customerText, action] of rows) {
    const result = resolver.resolve({ customerText, state: createSupportConversationState(), runtime, pendingAnswerConsumed: false });
    assert.equal(result.input.allowed.deterministicNextAction, action, customerText);
  }
});

test("B0 v4 regression: plural NFA, nfa.exe, unspoof, declined-card, and VAC-ban wording retain canonical routes", () => {
  const rows: Array<[string, string, string | null]> = [
    ["Can I order several NFAs together as a bulk purchase?", "answer_case", "case.account.bulk_purchase"],
    ["nfa.exe shows a failed-to-fetch network connection message.", "answer_case", "case.loader.connection"],
    ["Please unspoof the computer and restore it to normal.", "answer_case", "case.spoofer.reversal_reset"],
    ["My card payment did not go through at checkout.", "request_dynamic_lookup", null],
    ["A VAC ban appeared on the account after the game session.", "request_policy_route", null]
  ];
  for (const [customerText, action, caseId] of rows) {
    const result = resolver.resolve({ customerText, state: createSupportConversationState(), runtime, pendingAnswerConsumed: false });
    assert.equal(result.input.allowed.deterministicNextAction, action, customerText);
    if (caseId) assert.ok(result.input.allowed.caseIds.includes(caseId), customerText);
  }
});

test("B0 v4 regression: an explicit router clarification is deterministic in schema and fallback", () => {
  const result = resolver.resolve({
    customerText: "My loader is misbehaving and I do not know which stage is failing.",
    state: createSupportConversationState(),
    runtime,
    pendingAnswerConsumed: false
  });
  assert.equal(result.input.allowed.deterministicNextAction, "ask_clarification");
  assert.deepEqual(result.input.allowed.deterministicClarificationIds, ["clarify.loader.failure_stage"]);
  assert.equal(chooseSupportTriageFallback(result.input).clarificationId, "clarify.loader.failure_stage");
});

test("B0 v5 regression: clicked dashboard access and up-right-now catalog wording retain live-safe routes", () => {
  const dashboard = reviewFirstTurnObservability("The order says delivered, but the View Order link cannot be clicked.", runtime.aliases);
  assert.equal(dashboard.primaryDecision, "direct_static_case");
  assert.deepEqual(dashboard.observableCaseIds, ["case.dashboard.verification"]);

  const catalog = reviewFirstTurnObservability("Is the Exodus product up right now?", runtime.aliases);
  assert.equal(catalog.primaryDecision, "direct_dynamic_lookup");
  assert.deepEqual(catalog.dynamicLookupIds, ["dynamic.catalog.product_status"]);
});

test("B0 regression: invalid product license remains a single license activation case", () => {
  const result = reviewFirstTurnObservability("My license key is invalid and will not activate.", runtime.aliases);
  assert.equal(result.primaryDecision, "direct_static_case");
  assert.deepEqual(result.observableCaseIds, ["case.license.activation"]);
});

test("B0 regression: NFA never worked from first login resolves first-use invalidity", () => {
  const result = reviewFirstTurnObservability("I just bought an NFA and it never worked from the first login.", runtime.aliases);
  assert.equal(result.primaryDecision, "direct_static_case");
  assert.deepEqual(result.observableCaseIds, ["case.nfa.invalid_first_use"]);
});

test("B0 regression: signing-me-out wording resolves NFA owner/session conflict", () => {
  const result = reviewFirstTurnObservability("The NFA owner keeps signing me out whenever I log in.", runtime.aliases);
  assert.equal(result.primaryDecision, "direct_static_case");
  assert.deepEqual(result.observableCaseIds, ["case.nfa.owner_session_conflict"]);
});

test("B0 regression: delivered order with View Order access failure routes to dashboard verification", () => {
  const result = reviewFirstTurnObservability("My order is delivered but the View Order button will not open.", runtime.aliases);
  assert.equal(result.primaryDecision, "direct_static_case");
  assert.deepEqual(result.observableCaseIds, ["case.dashboard.verification"]);
});

test("B0 regression: explicit spoof reversal outranks incidental temporary-duration wording", () => {
  const result = reviewFirstTurnObservability("I want to remove the temporary spoof and put my PC back to normal.", runtime.aliases);
  assert.equal(result.primaryDecision, "direct_static_case");
  assert.deepEqual(result.observableCaseIds, ["case.spoofer.reversal_reset"]);
});

test("B0 v2 regression: apply-to-make media phrasing resolves media application", () => {
  const result = reviewFirstTurnObservability("How can I apply to make YouTube media for CM?", runtime.aliases);
  assert.equal(result.primaryDecision, "direct_static_case");
  assert.deepEqual(result.observableCaseIds, ["case.media.application"]);
});

test("B0 v2 regression: set-this-up phrasing resolves product requirements", () => {
  const result = reviewFirstTurnObservability("How do I set this up and where is the configuration guide?", runtime.aliases);
  assert.equal(result.primaryDecision, "direct_static_case");
  assert.deepEqual(result.observableCaseIds, ["case.product.requirements"]);
});

test("B0 v2 regression: was-fine-earlier phrasing resolves NFA invalid after use", () => {
  const result = reviewFirstTurnObservability("This NFA was fine earlier but it has become invalid now.", runtime.aliases);
  assert.equal(result.primaryDecision, "direct_static_case");
  assert.deepEqual(result.observableCaseIds, ["case.nfa.invalid_after_use"]);
});

test("B0 v2 regression: refunded wording enters current-authority policy route", () => {
  const result = reviewFirstTurnObservability("I want this purchase refunded.", runtime.aliases);
  assert.equal(result.primaryDecision, "direct_policy_route");
  assert.equal(result.policyRoute, true);
});

test("B0 v2 regression: product-key activation outranks order-key delivery routing", () => {
  const result = reviewFirstTurnObservability("Where do I activate the product key I already bought?", runtime.aliases);
  assert.equal(result.primaryDecision, "direct_static_case");
  assert.deepEqual(result.observableCaseIds, ["case.license.activation"]);
});

test("B0 v2 regression: website not-working phrasing keeps website-stage clarification", () => {
  const result = reviewFirstTurnObservability("The website is not working when I try to buy.", runtime.aliases);
  assert.equal(result.primaryDecision, "family_scoped_clarification");
  assert.equal(result.clarificationId, "clarify.website_stage");
});
