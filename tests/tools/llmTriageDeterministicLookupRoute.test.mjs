import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLlmTriageInput } from '../../tools/ticket-transcript-exporter/llm-triage-contract.mjs';

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

test('deterministic live-lookup route suppresses unrelated lookup expansion and clarification detours', () => {
  const input = buildLlmTriageInput({
    customerText: 'i just payed again its wtv bro',
    state: { candidateFamilyIds: ['commerce.payment'], questionsAsked: [] },
    candidateCases: paymentCases,
    candidateFamilies: ['commerce.payment'],
    candidateDynamicLookupIds: ['purchase-intents.lookup.read', 'purchase-intents.process.status.read'],
    clarifications,
    dynamicLookups: lookups,
    policies: []
  });

  assert.deepEqual(input.allowed.dynamicLookupIds, [
    'purchase-intents.lookup.read',
    'purchase-intents.process.status.read'
  ]);
  assert.deepEqual(input.allowed.clarificationIds, []);
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
