import assert from "node:assert/strict";
import test from "node:test";
import { OpenRouterTriageClient } from "../../src/ai/openRouterClient";
import type { OpenRouterConfig } from "../../src/config/env";
import type { SupportTriageInput } from "../../src/ai/supportTriage";

const config: OpenRouterConfig = {
  origin: "https://openrouter.ai",
  apiKey: "test-api-key",
  model: "google/gemma-4-26b-a4b-it:free",
  dataCollection: "allow",
  timeoutMs: 5_000,
  maxTokens: 400
};

function triageInput(overrides: Partial<SupportTriageInput> = {}): SupportTriageInput {
  return {
    customerText: "my nfa doesnt work user@example.com",
    state: {
      resolvedEntities: ["account_model.nfa"],
      candidateCaseIds: ["case.nfa.invalid_first_use"],
      candidateFamilyIds: ["accounts.nfa"],
      knownContext: {},
      questionsAsked: []
    },
    allowed: {
      entityIds: ["account_model.nfa"],
      caseIds: ["case.nfa.invalid_first_use"],
      cases: [{
        id: "case.nfa.invalid_first_use",
        displayName: "NFA invalid at first use",
        family: "accounts.nfa",
        scope: { accountModels: ["account_model.nfa"] }
      }],
      familyIds: ["accounts.nfa"],
      clarificationIds: ["clarify.nfa.failure_stage"],
      clarifications: [{
        id: "clarify.nfa.failure_stage",
        question: "Did it ever work before?",
        distinguishesCases: ["case.nfa.invalid_first_use"],
        distinguishesFamilies: ["accounts.nfa"]
      }],
      dynamicLookupIds: ["orders.details.read"],
      dynamicLookups: [{ id: "orders.details.read", purpose: "Read current order state" }],
      policyIds: ["policy.refund.current"],
      policies: [{ id: "policy.refund.current", displayName: "Current refund policy" }]
    },
    restricted: false,
    ...overrides
  };
}

function decision(overrides: Record<string, unknown> = {}) {
  return {
    observations: {
      explicitEntities: ["account_model.nfa"],
      supportSurface: "account",
      knownFacts: ["NFA is explicit"],
      missingFacts: ["failure stage"]
    },
    nextAction: "ask_clarification",
    caseIds: [],
    clarificationId: "clarify.nfa.failure_stage",
    dynamicLookupIds: [],
    policyIds: [],
    confidence: 0.95,
    reasonCode: "insufficient_context",
    ...overrides
  };
}

test("sends pinned Gemma request with strict structured output and sanitized customer text", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const fetchImpl: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return new Response(JSON.stringify({
      id: "req-1",
      choices: [{ message: { content: JSON.stringify(decision()) } }]
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const client = new OpenRouterTriageClient(config, fetchImpl);
  const result = await client.triage(triageInput());

  assert.equal(result.accepted, true);
  assert.equal(result.fallbackUsed, false);
  assert.equal(result.decision.nextAction, "ask_clarification");
  assert.equal(capturedUrl, "https://openrouter.ai/api/v1/chat/completions");

  const headers = new Headers(capturedInit?.headers);
  assert.equal(headers.get("authorization"), `Bearer ${config.apiKey}`);
  assert.equal(headers.get("http-referer"), "https://cheaters.market");
  assert.equal(headers.get("x-title"), "Cheater's Market Discord Bot");

  const body = JSON.parse(String(capturedInit?.body));
  assert.equal(body.model, "google/gemma-4-26b-a4b-it:free");
  assert.equal(body.temperature, 0);
  assert.equal(body.max_tokens, 400);
  assert.equal(body.response_format.type, "json_schema");
  assert.equal(body.response_format.json_schema.strict, true);
  assert.equal(body.provider.require_parameters, true);
  assert.equal(body.provider.data_collection, "allow");
  assert.equal(JSON.stringify(body).includes("user@example.com"), false);
  assert.equal(JSON.stringify(body).includes(config.apiKey), false);
});

test("rejects invented canonical IDs and uses safe fallback", async () => {
  const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(decision({
      nextAction: "answer_case",
      caseIds: ["case.invented"],
      clarificationId: null,
      confidence: 0.99
    })) } }]
  }), { status: 200, headers: { "content-type": "application/json" } });

  const client = new OpenRouterTriageClient(config, fetchImpl);
  const result = await client.triage(triageInput());

  assert.equal(result.accepted, false);
  assert.equal(result.fallbackUsed, true);
  assert.ok(result.validationErrors.includes("unknown_case:case.invented"));
  assert.equal(result.decision.nextAction, "ask_clarification");
});

test("HTTP failures fail closed to a canonical clarification", async () => {
  const fetchImpl: typeof fetch = async () => new Response("rate limited", { status: 429 });
  const client = new OpenRouterTriageClient(config, fetchImpl);
  const result = await client.triage(triageInput());

  assert.equal(result.accepted, false);
  assert.equal(result.fallbackUsed, true);
  assert.deepEqual(result.validationErrors, ["openrouter_http_429"]);
  assert.equal(result.decision.clarificationId, "clarify.nfa.failure_stage");
});

test("restricted input cannot accept an autonomous static answer", async () => {
  const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(decision({
      nextAction: "answer_case",
      caseIds: ["case.nfa.invalid_first_use"],
      clarificationId: null,
      confidence: 0.99
    })) } }]
  }), { status: 200, headers: { "content-type": "application/json" } });

  const client = new OpenRouterTriageClient(config, fetchImpl);
  const result = await client.triage(triageInput({ restricted: true }));

  assert.equal(result.accepted, false);
  assert.ok(result.validationErrors.includes("restricted_autonomous_answer"));
});
