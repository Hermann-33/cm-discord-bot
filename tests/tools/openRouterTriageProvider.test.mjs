import assert from 'node:assert/strict';
import test from 'node:test';
import { createOpenRouterTriageProvider, DEFAULT_OPENROUTER_TRIAGE_MODEL } from '../../tools/ticket-transcript-exporter/openrouter-triage-provider.mjs';

const input = {
  customerText: 'my nfa does not work',
  state: { resolvedEntities: ['account_model.nfa'], questionsAsked: [] },
  allowed: {
    entityIds: ['account_model.nfa'],
    caseIds: [],
    cases: [],
    familyIds: ['accounts.nfa'],
    clarificationIds: ['clarify.nfa.failure_stage'],
    clarifications: [{ id: 'clarify.nfa.failure_stage', question: 'Did it ever work before?' }],
    dynamicLookupIds: [],
    dynamicLookups: [],
    policyIds: [],
    policies: []
  },
  restricted: false
};

test('OpenRouter provider uses the fixed host, structured output, and required parameter routing', async () => {
  let capturedUrl;
  let capturedInit;
  const provider = createOpenRouterTriageProvider({
    apiKey: 'test-api-key',
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
  assert.equal(capturedUrl, 'https://openrouter.ai/api/v1/chat/completions');
  const body = JSON.parse(String(capturedInit.body));
  assert.equal(body.model, DEFAULT_OPENROUTER_TRIAGE_MODEL);
  assert.equal(body.response_format.type, 'json_schema');
  assert.equal(body.response_format.json_schema.strict, true);
  assert.equal(body.provider.require_parameters, true);
  assert.equal(body.provider.data_collection, 'allow');
  assert.equal(body.temperature, 0);
  assert.equal(body.max_tokens, 400);
});

test('OpenRouter provider rejects non-OpenRouter remote endpoints', () => {
  assert.throws(() => createOpenRouterTriageProvider({
    apiKey: 'test-api-key',
    baseUrl: 'https://example.com/api/v1'
  }), /must use https:\/\/openrouter\.ai/);
});

test('OpenRouter provider sanitizes every hosted planner payload', async () => {
  let body;
  const provider = createOpenRouterTriageProvider({
    apiKey: 'test-api-key',
    fetchImpl: async (_url, init) => {
      body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200 });
    }
  });
  await provider({
    ...input,
    customerText: 'email user@example.com password=hunter2 CM-PRIVATE-1234',
    state: { ...input.state, dynamicLookupResults: { orderId: '550e8400-e29b-41d4-a716-446655440000' } }
  });
  const outbound = JSON.stringify(body.messages);
  assert.equal(outbound.includes('user@example.com'), false);
  assert.equal(outbound.includes('hunter2'), false);
  assert.equal(outbound.includes('CM-PRIVATE-1234'), false);
  assert.equal(outbound.includes('550e8400-e29b-41d4-a716-446655440000'), false);
  assert.equal(outbound.includes('account_model.nfa'), true);
});
