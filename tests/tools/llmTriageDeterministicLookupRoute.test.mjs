import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLlmTriageInput, chooseSafeTriageFallback, runLlmTriage } from '../../tools/ticket-transcript-exporter/llm-triage-contract.mjs';

const paymentCases = [
  {
    id: 'case.payment.failed_or_pending',
    displayName: 'Payment failed or remains pending',
    family: 'commerce.payment',
    scope: { global: true, games: [], vendors: [], products: [], variants: [], accountModels: [], accountListings: [] },
    ask: [],
    policies: [],
    dynamic: ['dynamic.purchase_intent.status'],
    escalationIds: []
  }
];

const clarifications = [
  {
    id: 'clarify.payment_state',
    question: 'Was the payment declined, pending, or completed?',
    setsContext: ['paymentState'],
    distinguishesCases: ['case.payment.failed_or_pending'],
    distinguishesFamilies: ['commerce.payment'],
    liveLookupCanReplace: ['purchase-intents.lookup.read', 'users.overview.read']
  },
  {
    id: 'clarify.order_selector',
    question: 'Which payment or order is this about?',
    setsContext: ['orderSelector'],
    distinguishesCases: [],
    distinguishesFamilies: ['commerce.payment'],
    liveLookupCanReplace: ['orders.lookup.read', 'purchase-intents.lookup.read']
  }
];

const lookups = [
  { id: 'users.overview.read', purpose: 'user overview' },
  { id: 'orders.lookup.read', purpose: 'order lookup' },
  { id: 'purchase-intents.lookup.read', purpose: 'purchase lookup' },
  { id: 'purchase-intents.process.status.read', purpose: 'purchase processing status' },
  { id: 'dynamic.purchase_intent.status', purpose: 'semantic payment status' }
];

function deterministicPaymentInput() {
  return buildLlmTriageInput({
    customerText: 'i just payed again its wtv bro',
    state: { candidateFamilyIds: ['commerce.payment'], questionsAsked: [] },
    candidateCases: paymentCases,
    candidateFamilies: ['commerce.payment'],
    candidateDynamicLookupIds: ['purchase-intents.lookup.read', 'purchase-intents.process.status.read'],
    clarifications,
    dynamicLookups: lookups,
    policies: []
  });
}

test('deterministic live-lookup route suppresses unrelated lookup expansion and clarification detours', () => {
  const input = deterministicPaymentInput();

  assert.deepEqual(input.allowed.dynamicLookupIds, [
    'purchase-intents.lookup.read',
    'purchase-intents.process.status.read'
  ]);
  assert.deepEqual(input.allowed.deterministicDynamicLookupIds, [
    'purchase-intents.lookup.read',
    'purchase-intents.process.status.read'
  ]);
  assert.deepEqual(input.allowed.clarificationIds, []);
});

test('provider failure preserves deterministic live-lookup route instead of escalating', async () => {
  const input = deterministicPaymentInput();
  const result = await runLlmTriage({
    provider: async () => { throw new Error('provider unavailable'); },
    input
  });

  assert.equal(result.accepted, false);
  assert.equal(result.output.nextAction, 'request_dynamic_lookup');
  assert.deepEqual(result.output.dynamicLookupIds, [
    'purchase-intents.lookup.read',
    'purchase-intents.process.status.read'
  ]);
  assert.equal(result.output.reasonCode, 'deterministic_lookup_route');
});

test('fallback does not promote case-derived lookup dependencies to deterministic routes', () => {
  const input = buildLlmTriageInput({
    customerText: 'payment issue',
    state: { candidateFamilyIds: ['commerce.payment'], questionsAsked: [] },
    candidateCases: paymentCases,
    candidateFamilies: ['commerce.payment'],
    clarifications,
    dynamicLookups: lookups,
    policies: []
  });

  assert.deepEqual(input.allowed.deterministicDynamicLookupIds, []);
  assert.notEqual(chooseSafeTriageFallback(input).reasonCode, 'deterministic_lookup_route');
});

test('case and clarification lookup dependencies still apply without a deterministic lookup route', () => {
  const input = buildLlmTriageInput({
    customerText: 'payment issue',
    state: { candidateFamilyIds: ['commerce.payment'], questionsAsked: [] },
    candidateCases: paymentCases,
    candidateFamilies: ['commerce.payment'],
    clarifications,
    dynamicLookups: lookups,
    policies: []
  });

  assert.ok(input.allowed.dynamicLookupIds.includes('dynamic.purchase_intent.status'));
  assert.ok(input.allowed.dynamicLookupIds.includes('purchase-intents.lookup.read'));
  assert.ok(input.allowed.clarificationIds.includes('clarify.payment_state'));
});
