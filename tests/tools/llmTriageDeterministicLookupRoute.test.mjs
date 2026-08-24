import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLlmTriageInput, chooseSafeTriageFallback, runLlmTriage } from '../../tools/ticket-transcript-exporter/llm-triage-contract.mjs';
import { buildTriageMessages } from '../../tools/ticket-transcript-exporter/llm-triage-prompt.mjs';

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

const orderCases = [
  {
    id: 'case.order.status',
    displayName: 'Order status',
    family: 'commerce.order',
    scope: { global: true, games: [], vendors: [], products: [], variants: [], accountModels: [], accountListings: [] },
    ask: [],
    policies: [],
    dynamic: ['orders.details.read'],
    escalationIds: []
  },
  {
    id: 'case.order.fulfillment_delayed',
    displayName: 'Order fulfillment delayed',
    family: 'commerce.fulfillment',
    scope: { global: true, games: [], vendors: [], products: [], variants: [], accountModels: [], accountListings: [] },
    ask: [],
    policies: [],
    dynamic: ['orders.fulfillment.read'],
    escalationIds: []
  }
];

const clarifications = [
  {
    id: 'clarify.support_surface',
    question: 'What is not working?',
    setsContext: ['supportSurface'],
    distinguishesCases: [],
    distinguishesFamilies: ['commerce.payment','commerce.order','commerce.fulfillment','accounts.nfa'],
    liveLookupCanReplace: ['users.overview.read','orders.lookup.read']
  },
  {
    id: 'clarify.account_type',
    question: 'What account type is this?',
    setsContext: ['accountModel'],
    distinguishesCases: [],
    distinguishesFamilies: ['accounts.nfa','accounts.delivery','accounts.access'],
    liveLookupCanReplace: ['orders.details.read']
  },
  {
    id: 'clarify.account.delivery_state',
    question: 'Did you receive the account?',
    setsContext: ['deliveryState'],
    distinguishesCases: ['case.order.fulfillment_delayed'],
    distinguishesFamilies: ['commerce.fulfillment'],
    liveLookupCanReplace: ['orders.details.read','orders.fulfillment.read']
  },
  {
    id: 'clarify.order.fulfillment_state',
    question: 'Are you checking status, waiting for delivery, or reporting a wrong delivery?',
    setsContext: ['orderQuestionType','deliveryState'],
    distinguishesCases: ['case.order.status','case.order.fulfillment_delayed'],
    distinguishesFamilies: ['commerce.order','commerce.fulfillment'],
    liveLookupCanReplace: ['orders.details.read','orders.fulfillment.read']
  },
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
  { id: 'orders.details.read', purpose: 'order details' },
  { id: 'orders.fulfillment.read', purpose: 'order fulfillment' },
  { id: 'purchase-intents.lookup.read', purpose: 'purchase lookup' },
  { id: 'purchase-intents.process.status.read', purpose: 'purchase processing status' },
  { id: 'dynamic.purchase_intent.status', purpose: 'semantic payment status' }
];

function deterministicPaymentInput(customerText = 'i just payed again its wtv bro') {
  return buildLlmTriageInput({
    customerText,
    state: { candidateFamilyIds: ['commerce.payment'], questionsAsked: [] },
    candidateCases: paymentCases,
    candidateFamilies: ['commerce.payment'],
    candidateDynamicLookupIds: ['purchase-intents.lookup.read', 'purchase-intents.process.status.read'],
    clarifications,
    dynamicLookups: lookups,
    policies: []
  });
}

function deterministicOrderClarificationInput() {
  return buildLlmTriageInput({
    customerText: 'and [order identifier omitted]',
    state: { candidateFamilyIds: ['commerce.order','commerce.fulfillment'], questionsAsked: [] },
    candidateCases: orderCases,
    candidateFamilies: ['commerce.order','commerce.fulfillment'],
    candidateClarificationIds: ['clarify.order.fulfillment_state'],
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

test('deterministic lookup prompt treats redacted selectors as present and explains deterministic actions', () => {
  const input = deterministicPaymentInput('[order identifier omitted] order id pls check its paid already');
  const [systemMessage] = buildTriageMessages(input);

  assert.match(systemMessage.content, /privacy placeholders/i);
  assert.match(systemMessage.content, /present and redacted/i);
  assert.match(systemMessage.content, /not entity IDs/i);
  assert.match(systemMessage.content, /deterministicDynamicLookupIds/i);
  assert.match(systemMessage.content, /deterministicClarificationIds/i);
});

test('selector-only order route preserves exactly the deterministic clarification and suppresses live lookup detours', () => {
  const input = deterministicOrderClarificationInput();

  assert.deepEqual(input.allowed.clarificationIds, ['clarify.order.fulfillment_state']);
  assert.deepEqual(input.allowed.deterministicClarificationIds, ['clarify.order.fulfillment_state']);
  assert.deepEqual(input.allowed.dynamicLookupIds, []);
  assert.deepEqual(input.allowed.deterministicDynamicLookupIds, []);
});

test('entity-only support-surface route does not manufacture speculative case families', () => {
  const input = buildLlmTriageInput({
    customerText: 'bought memesense for 14d but gave another email on your website',
    state: { resolvedEntities: ['vendor.memesense'], questionsAsked: [] },
    resolvedEntities: ['vendor.memesense'],
    candidateCases: [...paymentCases, ...orderCases],
    candidateFamilies: [],
    candidateClarificationIds: ['clarify.support_surface'],
    clarifications,
    dynamicLookups: lookups,
    policies: []
  });

  assert.deepEqual(input.allowed.entityIds, ['vendor.memesense']);
  assert.deepEqual(input.allowed.caseIds, []);
  assert.deepEqual(input.allowed.familyIds, []);
  assert.deepEqual(input.allowed.clarificationIds, ['clarify.support_surface']);
  assert.deepEqual(input.allowed.deterministicClarificationIds, ['clarify.support_surface']);
  assert.deepEqual(input.allowed.dynamicLookupIds, []);
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

test('invalid model action falls back to the deterministic selector-only clarification', async () => {
  const input = deterministicOrderClarificationInput();
  const result = await runLlmTriage({
    provider: async () => JSON.stringify({
      observations: { explicitEntities: [], supportSurface: null, knownFacts: [], missingFacts: [] },
      nextAction: 'request_dynamic_lookup',
      caseIds: [],
      clarificationId: null,
      dynamicLookupIds: [],
      policyIds: [],
      confidence: 0.9,
      reasonCode: 'wrong_route'
    }),
    input
  });

  assert.equal(result.accepted, false);
  assert.ok(result.errors.includes('deterministic_clarification_route_mismatch'));
  assert.equal(result.output.nextAction, 'ask_clarification');
  assert.equal(result.output.clarificationId, 'clarify.order.fulfillment_state');
  assert.equal(result.output.reasonCode, 'deterministic_clarification_route');
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
  assert.deepEqual(input.allowed.deterministicClarificationIds, []);
  assert.notEqual(chooseSafeTriageFallback(input).reasonCode, 'deterministic_lookup_route');
});

test('case and clarification lookup dependencies still apply without a deterministic route', () => {
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
