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

test("malformed structured JSON fails closed", async () => {
  const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: "{bad json" } }]
  }), { status: 200, headers: { "content-type": "application/json" } });
  const result = await new OpenRouterTriageClient(config, fetchImpl).triage(triageInput());
  assert.equal(result.accepted, false);
  assert.deepEqual(result.validationErrors, ["openrouter_invalid_structured_json"]);
  assert.equal(result.decision.nextAction, "ask_clarification");
});

test("timeout fails closed without retrying", async () => {
  let calls = 0;
  const timeoutConfig = { ...config, timeoutMs: 5 };
  const fetchImpl: typeof fetch = async (_input, init) => {
    calls += 1;
    return await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });
  };
  const result = await new OpenRouterTriageClient(timeoutConfig, fetchImpl).triage(triageInput());
  assert.equal(calls, 1);
  assert.deepEqual(result.validationErrors, ["openrouter_timeout"]);
  assert.equal(result.fallbackUsed, true);
});

test("5xx provider failure fails closed without exposing response text", async () => {
  const fetchImpl: typeof fetch = async () => new Response("private provider failure", { status: 503 });
  const result = await new OpenRouterTriageClient(config, fetchImpl).triage(triageInput());
  assert.deepEqual(result.validationErrors, ["openrouter_http_503"]);
  assert.equal(JSON.stringify(result).includes("private provider failure"), false);
});

test("rejects unknown clarification, lookup, policy, entity, scope, repeated and known-answer routes", async () => {
  const responses = [
    decision({ clarificationId: "clarify.invented" }),
    decision({ nextAction: "request_dynamic_lookup", clarificationId: null, dynamicLookupIds: ["lookup.invented"] }),
    decision({ nextAction: "request_policy_route", clarificationId: null, policyIds: ["policy.invented"] }),
    decision({ observations: { ...decision().observations, explicitEntities: ["game.invented"] } }),
    decision({ nextAction: "answer_case", caseIds: ["case.nfa.invalid_first_use"], clarificationId: null, confidence: 0.5 }),
    decision({ nextAction: "answer_case", caseIds: ["case.nfa.invalid_first_use"], clarificationId: null, confidence: 0.99 }),
    decision(),
    decision()
  ];
  let index = 0;
  const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(responses[index++]) } }]
  }), { status: 200, headers: { "content-type": "application/json" } });
  const client = new OpenRouterTriageClient(config, fetchImpl);

  assert.ok((await client.triage(triageInput())).validationErrors.includes("unknown_clarification:clarify.invented"));
  assert.ok((await client.triage(triageInput())).validationErrors.includes("unknown_lookup:lookup.invented"));
  assert.ok((await client.triage(triageInput())).validationErrors.includes("unknown_policy:policy.invented"));
  assert.ok((await client.triage(triageInput())).validationErrors.includes("ungrounded_observation_entity:game.invented"));
  assert.ok((await client.triage(triageInput())).validationErrors.includes("low_confidence_direct_case"));
  const scopeInput = triageInput({
    state: { ...triageInput().state, resolvedEntities: ["account_model.nfa", "game.rust"] },
    allowed: {
      ...triageInput().allowed,
      entityIds: ["account_model.nfa", "game.rust"],
      cases: [{
        ...triageInput().allowed.cases[0]!,
        scope: { accountModels: ["account_model.nfa"], games: ["game.fortnite"] }
      }]
    }
  });
  assert.ok((await client.triage(scopeInput)).validationErrors.includes("scope_conflict:case.nfa.invalid_first_use"));
  const repeatedInput = triageInput({ state: { ...triageInput().state, questionsAsked: ["clarify.nfa.failure_stage"] } });
  assert.ok((await client.triage(repeatedInput)).validationErrors.includes("repeated_clarification"));
  const knownInput = triageInput({
    state: { ...triageInput().state, knownContext: { workedBefore: false } },
    allowed: {
      ...triageInput().allowed,
      clarifications: [{
        ...triageInput().allowed.clarifications[0]!,
        setsContext: "workedBefore"
      }]
    }
  });
  assert.ok((await client.triage(knownInput)).validationErrors.includes("clarification_answer_already_known"));
});
