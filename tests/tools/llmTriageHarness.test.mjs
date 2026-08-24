import assert from 'node:assert/strict';
import test from 'node:test';
import { assessGoldRepresentability } from '../../tools/ticket-transcript-exporter/build-llm-triage-benchmark.mjs';
import { buildLlmTriageInput, chooseSafeTriageFallback, runLlmTriage, validateLlmTriageOutput } from '../../tools/ticket-transcript-exporter/llm-triage-contract.mjs';
import { buildTriageMessages, estimatePlannerTokens } from '../../tools/ticket-transcript-exporter/llm-triage-prompt.mjs';
import { isLocalTriageEndpoint } from '../../tools/ticket-transcript-exporter/llm-triage-provider.mjs';

const cases = [
  { id: 'case.nfa.invalid_first_use', displayName: 'NFA invalid at first use', family: 'accounts.nfa', scope: { games: [], vendors: [], products: [], variants: [], accountModels: ['account_model.nfa'], accountListings: [] }, ask: [], policies: [], dynamic: [], escalationIds: [] },
  { id: 'case.loader.connection', displayName: 'Loader connection failure', family: 'technical.loader', scope: { games: [], vendors: [], products: [], variants: [], accountModels: [], accountListings: [] }, ask: [], policies: [], dynamic: [], escalationIds: [] },
  { id: 'case.ancient.rust.issue', displayName: 'Ancient Rust issue', family: 'technical.product', scope: { games: ['game.rust'], vendors: ['vendor.ancient'], products: ['product.ancient.rust'], variants: [], accountModels: [], accountListings: [] }, ask: [], policies: [], dynamic: [], escalationIds: [] }
];
const clarifications = [
  { id: 'clarify.support_surface', question: 'What is not working?', setsContext: ['supportSurface'], distinguishesCases: [], distinguishesFamilies: [] },
  { id: 'clarify.nfa.failure_stage', question: 'Did it ever work?', setsContext: ['workedBefore'], distinguishesCases: ['case.nfa.invalid_first_use'], distinguishesFamilies: ['accounts.nfa'] }
];
const lookups = [{ id: 'orders.details.read', purpose: 'Read current order details' }];
const policies = [{ id: 'policy.refund.current', displayName: 'Current refund policy' }];
const observations = { explicitEntities: [], supportSurface: null, knownFacts: [], missingFacts: [] };
const out = (value) => ({ observations, caseIds: [], clarificationId: null, dynamicLookupIds: [], policyIds: [], confidence: 0.9, reasonCode: 'test', ...value });

function input(overrides = {}) {
  return buildLlmTriageInput({
    customerText: 'my nfa doesnt work',
    state: { resolvedEntities: ['account_model.nfa'], candidateFamilyIds: ['accounts.nfa'], questionsAsked: [] },
    candidateCases: cases.slice(0, 2),
    candidateFamilies: ['accounts.nfa'],
    clarifications,
    dynamicLookups: lookups,
    policies,
    ...overrides
  });
}

test('accepts a valid canonical clarification action', () => {
  const value = out({ nextAction: 'ask_clarification', clarificationId: 'clarify.nfa.failure_stage', confidence: 0.91, reasonCode: 'insufficient_context' });
  assert.deepEqual(validateLlmTriageOutput(value, input()).errors, []);
});

test('rejects invented case and lookup IDs', () => {
  const value = out({ nextAction: 'request_dynamic_lookup', caseIds: ['case.fake'], dynamicLookupIds: ['lookup.fake'] });
  const result = validateLlmTriageOutput(value, input());
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('unknown_case:case.fake'));
  assert.ok(result.errors.includes('unknown_lookup:lookup.fake'));
});

test('rejects ungrounded entity observations', () => {
  const value = out({ observations: { explicitEntities: ['product.exodus.rust'], supportSurface: 'account', knownFacts: [], missingFacts: [] }, nextAction: 'ask_clarification', clarificationId: 'clarify.nfa.failure_stage' });
  assert.ok(validateLlmTriageOutput(value, input()).errors.includes('ungrounded_observation_entity:product.exodus.rust'));
});

test('rejects restricted autonomous answer', () => {
  const triageInput = input({ restricted: true });
  const value = out({ nextAction: 'answer_case', caseIds: ['case.nfa.invalid_first_use'], confidence: 0.95 });
  assert.ok(validateLlmTriageOutput(value, triageInput).errors.includes('restricted_autonomous_answer'));
});

test('rejects repeated clarification and low-confidence direct case', () => {
  const triageInput = input({ state: { resolvedEntities: ['account_model.nfa'], candidateFamilyIds: ['accounts.nfa'], questionsAsked: ['clarify.nfa.failure_stage'] } });
  const repeated = out({ nextAction: 'ask_clarification', clarificationId: 'clarify.nfa.failure_stage' });
  assert.ok(validateLlmTriageOutput(repeated, triageInput).errors.some((item) => item.startsWith('unknown_clarification:') || item === 'repeated_clarification'));

  const low = out({ nextAction: 'answer_case', caseIds: ['case.nfa.invalid_first_use'], confidence: 0.4 });
  assert.ok(validateLlmTriageOutput(low, input()).errors.includes('low_confidence_direct_case'));
});

test('rejects case scope conflict with resolved product', () => {
  const triageInput = buildLlmTriageInput({
    customerText: 'issue',
    state: { resolvedEntities: ['game.rust','vendor.exodus','product.exodus.rust'], questionsAsked: [] },
    candidateCases: [cases[2]],
    clarifications: [clarifications[0]],
    dynamicLookups: [],
    policies: []
  });
  const value = out({ nextAction: 'answer_case', caseIds: ['case.ancient.rust.issue'], confidence: 0.99 });
  assert.ok(validateLlmTriageOutput(value, triageInput).errors.includes('scope_conflict:case.ancient.rust.issue'));
});

test('invalid JSON falls back to canonical clarification', async () => {
  const result = await runLlmTriage({ provider: async () => '{bad json', input: input() });
  assert.equal(result.accepted, false);
  assert.equal(result.output.nextAction, 'ask_clarification');
  assert.ok(['clarify.nfa.failure_stage','clarify.support_surface'].includes(result.output.clarificationId));
});

test('safe fallback prefers active case, then clarification, then human escalation', () => {
  const active = input({ state: { activeCaseId: 'case.nfa.invalid_first_use', resolvedEntities: ['account_model.nfa'], questionsAsked: [] } });
  assert.equal(chooseSafeTriageFallback(active).nextAction, 'answer_case');

  const clarify = input();
  assert.equal(chooseSafeTriageFallback(clarify).nextAction, 'ask_clarification');

  const none = buildLlmTriageInput({ customerText: 'x', state: { questionsAsked: [] }, candidateCases: [], clarifications: [], dynamicLookups: [], policies: [] });
  assert.equal(chooseSafeTriageFallback(none).nextAction, 'human_escalation');
});

test('prompt builder stays compact and instructs the model to choose a next action only', () => {
  const triageInput = input();
  const messages = buildTriageMessages(triageInput);
  assert.equal(messages.length, 2);
  assert.match(messages[0].content, /safest next action/i);
  assert.ok(estimatePlannerTokens(triageInput) > 0);
  assert.ok(estimatePlannerTokens(triageInput) < 2000);
});

test('lookup options are limited to deterministic case or control-plane relevance', () => {
  const staticCase = {
    id: 'case.spoofer.hwid_state',
    displayName: 'HWID or spoofer state question',
    family: 'technical.spoofer',
    scope: { games: [], vendors: [], products: [], variants: [], accountModels: [], accountListings: [] },
    ask: [], policies: [], dynamic: [], escalationIds: []
  };
  const allLookups = [
    { id: 'users.overview.read', purpose: 'user overview' },
    { id: 'orders.details.read', purpose: 'order details' },
    { id: 'dynamic.catalog.product_status', purpose: 'product status' }
  ];
  const staticInput = buildLlmTriageInput({
    customerText: 'hwid reset plssss',
    state: { candidateCaseIds: [staticCase.id], candidateFamilyIds: [staticCase.family], questionsAsked: [] },
    candidateCases: [staticCase],
    candidateFamilies: [staticCase.family],
    clarifications: [],
    dynamicLookups: allLookups,
    policies: []
  });
  assert.deepEqual(staticInput.allowed.dynamicLookupIds, []);

  const paymentInput = buildLlmTriageInput({
    customerText: 'my payment is pending',
    state: { questionsAsked: [] },
    candidateCases: [],
    candidateFamilies: ['commerce.payment'],
    candidateDynamicLookupIds: ['users.overview.read'],
    clarifications: [],
    dynamicLookups: allLookups,
    policies: []
  });
  assert.deepEqual(paymentInput.allowed.dynamicLookupIds, ['users.overview.read']);
});

test('known context suppresses redundant clarification', () => {
  const contextKnown = input({ state: { resolvedEntities: ['account_model.nfa'], candidateFamilyIds: ['accounts.nfa'], questionsAsked: [], knownContext: { supportSurface: 'nfa_or_account' } } });
  assert.ok(!contextKnown.allowed.clarificationIds.includes('clarify.support_surface'));
});

test('generic support-surface clarification is omitted when it cannot distinguish scoped candidates', () => {
  const mediaCase = {
    id: 'case.media.application',
    displayName: 'Media or creator application',
    family: 'business.application',
    scope: { games: [], vendors: [], products: [], variants: [], accountModels: [], accountListings: [] },
    ask: [], policies: [], dynamic: [], escalationIds: []
  };
  const triageInput = buildLlmTriageInput({
    customerText: 'Could I make media for spoofers?',
    state: { candidateCaseIds: [mediaCase.id], candidateFamilyIds: [mediaCase.family], questionsAsked: [] },
    candidateCases: [mediaCase],
    candidateFamilies: [mediaCase.family],
    clarifications: [clarifications[0]],
    dynamicLookups: [],
    policies: []
  });
  assert.deepEqual(triageInput.allowed.caseIds, ['case.media.application']);
  assert.deepEqual(triageInput.allowed.clarificationIds, []);
});

test('generic support-surface clarification remains available when no scoped candidate exists', () => {
  const triageInput = buildLlmTriageInput({
    customerText: 'would u be interested in a video like this?',
    state: { questionsAsked: [] },
    candidateCases: [],
    candidateFamilies: [],
    clarifications: [clarifications[0]],
    dynamicLookups: [],
    policies: []
  });
  assert.deepEqual(triageInput.allowed.clarificationIds, ['clarify.support_surface']);
});

test('gold representability rejects an answer case the planner was never offered', () => {
  const triageInput = buildLlmTriageInput({
    customerText: 'hwid reset plssss',
    state: { questionsAsked: [] },
    candidateCases: [],
    candidateFamilies: [],
    clarifications: [clarifications[0]],
    dynamicLookups: [],
    policies: []
  });
  const result = assessGoldRepresentability({
    action: 'answer_case',
    observableCaseIds: ['case.spoofer.hwid_state'],
    observableFamilyIds: ['technical.spoofer'],
    clarificationId: null,
    lookupIds: [],
    policyIds: []
  }, triageInput);
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes('gold_case_not_represented'));
  assert.ok(result.reasons.includes('gold_answer_case_unavailable'));
});

test('gold representability rejects family and clarification divergence', () => {
  const triageInput = input();
  const result = assessGoldRepresentability({
    action: 'ask_clarification',
    observableCaseIds: [],
    observableFamilyIds: ['technical.game'],
    clarificationId: 'clarify.technical.failure_stage',
    lookupIds: [],
    policyIds: []
  }, triageInput);
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes('gold_family_not_represented'));
  assert.ok(result.reasons.includes('gold_clarification_unavailable'));
});

test('gold representability accepts a clarification available in the planner contract', () => {
  const triageInput = input();
  const result = assessGoldRepresentability({
    action: 'ask_clarification',
    observableCaseIds: ['case.nfa.invalid_first_use'],
    observableFamilyIds: ['accounts.nfa'],
    clarificationId: 'clarify.nfa.failure_stage',
    lookupIds: [],
    policyIds: []
  }, triageInput);
  assert.deepEqual(result, { eligible: true, reasons: [] });
});

test('local provider guard refuses non-local endpoints', () => {
  assert.equal(isLocalTriageEndpoint('http://127.0.0.1:11434/v1'), true);
  assert.equal(isLocalTriageEndpoint('http://localhost:1234/v1'), true);
  assert.equal(isLocalTriageEndpoint('https://example.com/v1'), false);
});