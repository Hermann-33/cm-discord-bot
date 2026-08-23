import assert from "node:assert/strict";
import test from "node:test";
import { GroqTriageClient } from "../../src/ai/groqClient";
import type { GroqConfig } from "../../src/config/env";
import type { SupportTriageInput } from "../../src/ai/supportTriage";

const config: GroqConfig = {
  origin: "https://api.groq.com",
  apiKey: "gsk_test_key_12345678901234567890",
  model: "openai/gpt-oss-120b",
  reasoningEffort: "low",
  timeoutMs: 5_000,
  maxCompletionTokens: 400
};

function triageInput(): SupportTriageInput {
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
      dynamicLookupIds: [],
      dynamicLookups: [],
      policyIds: [],
      policies: []
    },
    restricted: false
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

test("sends GPT-OSS 120B request with strict Groq structured output and sanitized text", async () => {
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

  const result = await new GroqTriageClient(config, fetchImpl).triage(triageInput());
  assert.equal(result.accepted, true);
  assert.equal(result.fallbackUsed, false);
  assert.equal(capturedUrl, "https://api.groq.com/openai/v1/chat/completions");

  const headers = new Headers(capturedInit?.headers);
  assert.equal(headers.get("authorization"), `Bearer ${config.apiKey}`);

  const body = JSON.parse(String(capturedInit?.body));
  assert.equal(body.model, "openai/gpt-oss-120b");
  assert.equal(body.temperature, 0);
  assert.equal(body.max_completion_tokens, 400);
  assert.equal(body.reasoning_effort, "low");
  assert.equal(body.stream, false);
  assert.equal(body.response_format.type, "json_schema");
  assert.equal(body.response_format.json_schema.strict, true);
  assert.equal(JSON.stringify(body).includes("user@example.com"), false);
  assert.equal(JSON.stringify(body).includes(config.apiKey), false);
});

test("Groq invalid canonical output is rejected by the deterministic validator", async () => {
  const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(decision({
      nextAction: "answer_case",
      caseIds: ["case.invented"],
      clarificationId: null,
      confidence: 0.99
    })) } }]
  }), { status: 200 });
  const result = await new GroqTriageClient(config, fetchImpl).triage(triageInput());
  assert.equal(result.accepted, false);
  assert.equal(result.fallbackUsed, true);
  assert.ok(result.validationErrors.includes("unknown_case:case.invented"));
});

test("Groq 429 fails closed without retrying", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return new Response("rate limited", { status: 429 });
  };
  const result = await new GroqTriageClient(config, fetchImpl).triage(triageInput());
  assert.equal(calls, 1);
  assert.deepEqual(result.validationErrors, ["groq_http_429"]);
  assert.equal(result.fallbackUsed, true);
});

test("Groq malformed structured JSON fails closed", async () => {
  const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: "{bad json" } }]
  }), { status: 200 });
  const result = await new GroqTriageClient(config, fetchImpl).triage(triageInput());
  assert.deepEqual(result.validationErrors, ["groq_invalid_structured_json"]);
  assert.equal(result.fallbackUsed, true);
});

test("Groq timeout fails closed without retrying", async () => {
  let calls = 0;
  const timeoutConfig = { ...config, timeoutMs: 5 };
  const fetchImpl: typeof fetch = async (_input, init) => {
    calls += 1;
    return await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });
  };
  const result = await new GroqTriageClient(timeoutConfig, fetchImpl).triage(triageInput());
  assert.equal(calls, 1);
  assert.deepEqual(result.validationErrors, ["groq_timeout"]);
});
