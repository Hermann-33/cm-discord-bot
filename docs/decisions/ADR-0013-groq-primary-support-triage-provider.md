# ADR-0013: Groq primary support-triage provider

- Status: Accepted
- Date: 2026-08-24
- Supersedes: ADR-0012 only for the preferred hosted model/provider selection. ADR-0012 remains authoritative for the bundled runtime-pack boundary, deterministic state machine, validator, and benchmark-before-activation gate.

## Context

The support agent needs semantic interpretation of short, ambiguous, slang-heavy customer messages while keeping business truth and executable actions deterministic.

The initial OpenRouter free-model candidate could not be evaluated reliably under the account-level free-model limits and free-endpoint capability/routing constraints. Changing to another OpenRouter `:free` model would retain the same shared free-account bottleneck.

Groq exposes `openai/gpt-oss-120b` through an OpenAI-compatible Chat Completions endpoint. The model supports strict JSON-schema Structured Outputs and is available under Groq's free plan with materially larger request allowances than the OpenRouter free-model account path used during initial testing.

## Decision

The primary hosted support-triage candidate is:

```text
Provider: Groq
Model: openai/gpt-oss-120b
Endpoint: https://api.groq.com/openai/v1/chat/completions
```

Default planner settings are:

```text
temperature: 0
reasoning_effort: low
max_completion_tokens: 400
stream: false
response_format: strict JSON schema
```

The model is only a semantic next-action planner. It has no authority to invent or execute support policy, product truth, order/payment state, refunds, balance mutations, fulfillment, restricted technical procedures, or any other backend operation.

OpenRouter remains available as an explicit secondary development adapter. There is no automatic cross-provider failover.

## Safety boundary

Every hosted result passes through the existing deterministic validator. The bot rejects unknown canonical IDs, scope conflicts, restricted autonomous answers, repeated or already-answered clarifications, malformed output, and low-confidence direct cases.

Transport/provider failure falls back to deterministic state continuation, canonical clarification, or human escalation. Hosted provider errors are never surfaced raw to customers.

The Groq client does not enable browser search, code execution, MCP, tool calling, or any model-side external action.

## Privacy boundary

The planner receives only the compact sanitized support payload. Raw transcripts, historical evidence, customer identifiers, account credentials, API keys, private URLs, and direct database/website access remain excluded.

## Benchmark boundary

Customer-facing activation remains blocked until the selected Groq/model configuration meets the existing conversational-safety gate on consumed development data and later passes an untouched final holdout.

The benchmark harness must pace requests below the applicable token-per-minute limit and stop after an HTTP 429 rather than repeatedly issuing failed requests.

## Consequences

- `GROQ_API_KEY`, `GROQ_MODEL`, and `GROQ_REASONING_EFFORT` are added to the optional AI configuration surface.
- `openai/gpt-oss-120b` becomes the primary benchmark candidate.
- The support conversation service remains provider-neutral.
- The OpenRouter adapter and configuration remain available but are not the preferred free-provider path.
- No customer-facing Discord support entrypoint is enabled by this ADR.
