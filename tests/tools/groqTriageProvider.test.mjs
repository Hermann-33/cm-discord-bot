import assert from 'node:assert/strict';
import test from 'node:test';
import { createGroqTriageProvider, DEFAULT_GROQ_TRIAGE_MODEL } from '../../tools/ticket-transcript-exporter/groq-triage-provider.mjs';

const input = {
  customerText: 'my nfa does not work',
  state: { resolvedEntities: ['account_model.nfa'], questionsAsked: [] },
  allowed: {
    entityIds: ['account_model.nfa'],
    caseIds: [],
    deterministicCaseIds: [],
    cases: [],
    familyIds: ['accounts.nfa'],
    clarificationIds: ['clarify.nfa.failure_stage'],
    deterministicClarificationIds: [],
    clarifications: [{ id: 'clarify.nfa.failure_stage', question: 'Did it ever work before?' }],
    dynamicLookupIds: [],
    deterministicDynamicLookupIds: [],
    dynamicLookups: [],
    policyIds: [],
    policies: []
  },
  restricted: false
};

async function captureBody(plannerInput) {
  let body;
  const provider = createGroqTriageProvider({
    apiKey: 'gsk_test_key_12345678901234567890',
    fetchImpl: async (_url, init) => {
      body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200 });
    }
  });
  await provider(plannerInput);
  return body;
}

test('Groq provider uses fixed host, GPT-OSS 120B, strict schema, and low reasoning', async () => {
  let capturedUrl;
  let capturedInit;
  const provider = createGroqTriageProvider({
    apiKey: 'gsk_test_key_12345678901234567890',
    fetchImpl: async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
  });

  await provider(input);
  assert.equal(capturedUrl, 'https://api.groq.com/openai/v1/chat/completions');
  const body = JSON.parse(String(capturedInit.body));
  assert.equal(body.model, DEFAULT_GROQ_TRIAGE_MODEL);
  assert.equal(body.response_format.type, 'json_schema');
  assert.equal(body.response_format.json_schema.strict, true);
  assert.equal(body.reasoning_effort, 'low');
  assert.equal(body.temperature, 0);
  assert.equal(body.max_completion_tokens, 400);
  assert.equal(body.stream, false);
});

test('Groq strict schema constrains deterministic lookup routes', async () => {
  const body = await captureBody({
    ...input,
    customerText: '[order identifier omitted] order id pls check its paid already',
    allowed: {
      ...input.allowed,
      clarificationIds: [],
      clarifications: [],
      dynamicLookupIds: ['purchase-intents.lookup.read', 'purchase-intents.process.status.read'],
      deterministicDynamicLookupIds: ['purchase-intents.lookup.read', 'purchase-intents.process.status.read'],
      dynamicLookups: [
        { id: 'purchase-intents.lookup.read', purpose: 'purchase lookup' },
        { id: 'purchase-intents.process.status.read', purpose: 'purchase status' }
      ]
    }
  });
  const schema = body.response_format.json_schema.schema;
  assert.deepEqual(schema.properties.nextAction.enum, ['request_dynamic_lookup']);
  assert.equal(schema.properties.clarificationId.type, 'null');
  assert.deepEqual(schema.properties.dynamicLookupIds.items.enum, [
    'purchase-intents.lookup.read',
    'purchase-intents.process.status.read'
  ]);
});

test('Groq strict schema constrains deterministic clarification routes', async () => {
  const body = await captureBody({
    ...input,
    customerText: 'and [order identifier omitted]',
    allowed: {
      ...input.allowed,
      clarificationIds: ['clarify.order.fulfillment_state'],
      deterministicClarificationIds: ['clarify.order.fulfillment_state'],
      clarifications: [{ id: 'clarify.order.fulfillment_state', question: 'What do you need about this order?' }],
      dynamicLookupIds: [],
      deterministicDynamicLookupIds: [],
      dynamicLookups: []
    }
  });
  const schema = body.response_format.json_schema.schema;
  assert.deepEqual(schema.properties.nextAction.enum, ['ask_clarification']);
  assert.deepEqual(schema.properties.clarificationId.enum, ['clarify.order.fulfillment_state']);
});

test('Groq strict schema constrains deterministic static-case routes', async () => {
  const body = await captureBody({
    ...input,
    customerText: 'loader link',
    allowed: {
      ...input.allowed,
      caseIds: ['case.loader.update'],
      deterministicCaseIds: ['case.loader.update'],
      cases: [{ id: 'case.loader.update', displayName: 'Loader update or download failure' }],
      clarificationIds: [],
      deterministicClarificationIds: [],
      clarifications: [],
      dynamicLookupIds: [],
      deterministicDynamicLookupIds: [],
      dynamicLookups: []
    }
  });
  const schema = body.response_format.json_schema.schema;
  assert.deepEqual(schema.properties.nextAction.enum, ['answer_case']);
  assert.deepEqual(schema.properties.caseIds.items.enum, ['case.loader.update']);
  assert.equal(schema.properties.caseIds.minItems, 1);
  assert.equal(schema.properties.dynamicLookupIds.maxItems, 0);
  assert.equal(schema.properties.policyIds.maxItems, 0);
});

test('Groq provider rejects non-Groq remote endpoints', () => {
  assert.throws(() => createGroqTriageProvider({
    apiKey: 'gsk_test_key_12345678901234567890',
    baseUrl: 'https://example.com/openai/v1'
  }), /must use https:\/\/api\.groq\.com\/openai\/v1/);
});

test('Groq provider sanitizes every hosted planner payload', async () => {
  let body;
  const provider = createGroqTriageProvider({
    apiKey: 'gsk_test_key_12345678901234567890',
    fetchImpl: async (_url, init) => {
      body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200 });
    }
  });
  await provider({
    ...input,
    customerText: 'email user@example.com password=hunter2 CM-PRIVATE-1234 gsk_secretsecretsecretsecret',
    state: { ...input.state, dynamicLookupResults: { orderId: '550e8400-e29b-41d4-a716-446655440000' } }
  });
  const outbound = JSON.stringify(body.messages);
  assert.equal(outbound.includes('user@example.com'), false);
  assert.equal(outbound.includes('hunter2'), false);
  assert.equal(outbound.includes('CM-PRIVATE-1234'), false);
  assert.equal(outbound.includes('gsk_secretsecretsecretsecret'), false);
  assert.equal(outbound.includes('550e8400-e29b-41d4-a716-446655440000'), false);
  assert.equal(outbound.includes('account_model.nfa'), true);
});

test('Groq provider does not retry a 429 response', async () => {
  let calls = 0;
  const provider = createGroqTriageProvider({
    apiKey: 'gsk_test_key_12345678901234567890',
    fetchImpl: async () => {
      calls += 1;
      return new Response('rate limited', { status: 429 });
    }
  });
  await assert.rejects(() => provider(input), /HTTP 429/);
  assert.equal(calls, 1);
});

test('Groq provider exposes sanitized structured error metadata without failed-generation content', async () => {
  const provider = createGroqTriageProvider({
    apiKey: 'gsk_test_key_12345678901234567890',
    fetchImpl: async () => new Response(JSON.stringify({
      error: {
        type: 'invalid_request_error',
        code: 'json_validate_failed',
        message: 'Generated JSON failed for user@example.com password=hunter2',
        failed_generation: 'gsk_secretsecretsecretsecret'
      }
    }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    })
  });

  await assert.rejects(
    () => provider(input),
    (error) => {
      assert.match(error.message, /HTTP 400/);
      assert.match(error.message, /invalid_request_error/);
      assert.match(error.message, /json_validate_failed/);
      assert.equal(error.message.includes('user@example.com'), false);
      assert.equal(error.message.includes('hunter2'), false);
      assert.equal(error.message.includes('gsk_secretsecretsecretsecret'), false);
      return true;
    }
  );
});
