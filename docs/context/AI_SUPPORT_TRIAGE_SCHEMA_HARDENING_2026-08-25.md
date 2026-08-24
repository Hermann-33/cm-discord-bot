# AI Support Triage Schema Hardening — 2026-08-25

Status: `IMPLEMENTED / LOCAL VALIDATION PENDING`

Read this after `AI_SUPPORT_TRIAGE_PROGRESS_2026-08-25.md`. It records the additional hardening applied after the `0004` and `0026` analysis.

## Why this change exists

The latest hosted smoke showed that prompt instructions alone are not a sufficient action boundary:

- `0004` selected `clarify.account_type` instead of the deterministic `clarify.support_surface` route.
- `0026` attempted an order live lookup instead of the deterministic `clarify.order.fulfillment_state` route.
- an earlier `0031` selected `ask_clarification` with `clarificationId: null` despite a deterministic payment lookup route.

The validator and deterministic fallback prevented unsafe customer impact, but structured-output acceptance and progress metrics still suffered because Groq's static JSON schema structurally permitted those combinations.

## Decision

The deterministic resolver/planner builder defines the action envelope. For turns where that envelope contains an authoritative deterministic lookup or clarification, Groq strict Structured Outputs now encode that envelope directly in the per-request JSON schema.

This is not a replacement for deterministic validation. It is an earlier constrained-decoding layer.

## Code changes

Commit:

```text
4ed548bc2c829e81ced0c528249f0987a08b2324
Constrain deterministic Groq action schema
```

`llm-triage-prompt.mjs` now exports `buildTriageOutputSchema(input)`.

For deterministic lookup turns:

```text
nextAction enum:
  [request_dynamic_lookup]
clarificationId:
  null
dynamicLookupIds items enum:
  only allowed deterministic lookup IDs
```

For deterministic clarification turns:

```text
nextAction enum:
  [ask_clarification]
clarificationId enum:
  only allowed deterministic clarification IDs
```

Otherwise the normal general triage schema remains unchanged.

`groq-triage-provider.mjs` now builds the strict schema from the sanitized planner input instead of always sending one global static schema.

`groqTriageProvider.test.mjs` now verifies both deterministic lookup and deterministic clarification schema narrowing.

## Why this is justified

Groq's current Structured Outputs documentation states that `openai/gpt-oss-120b` supports `strict: true` constrained decoding with schema adherence, including enums. This makes schema-level action narrowing the correct provider-layer complement to deterministic candidate construction.

The system still does not trust the provider result blindly. `validateLlmTriageOutput(...)` remains authoritative after generation, and deterministic fallback still handles provider/validation failure.

## What this does not do

- It does not change V3 gold.
- It does not change the 26-row adjudication overlay.
- It does not invent live operations.
- It does not permit the LLM to act directly.
- It does not enable production AI support.
- It does not claim any local test, benchmark, or hosted-evaluation pass yet.

## Current combined candidate fix

The branch now has two complementary layers pending local validation:

1. deterministic clarification provenance/action-space narrowing (`1b603100683994bb50e266020ba50f80bdf1b3fc`);
2. input-aware Groq strict-schema action narrowing (`4ed548bc2c829e81ced0c528249f0987a08b2324`).

Together, the expected envelope for selector-only `0026` is:

```text
allowed.clarificationIds:
  [clarify.order.fulfillment_state]
allowed.deterministicClarificationIds:
  [clarify.order.fulfillment_state]
allowed.dynamicLookupIds:
  []
Groq nextAction schema:
  [ask_clarification]
Groq clarificationId schema:
  [clarify.order.fulfillment_state]
```

For entity-only `0004`, speculative cases/families are removed and only `clarify.support_surface` is available and schema-permitted.

For deterministic payment lookup `0031`, the Groq schema permits only `request_dynamic_lookup` and deterministic purchase-intent lookup IDs.

## Exact validation sequence

Do not spend more hosted quota before local validation and rebuild:

```cmd
cd /d "C:\code\CM DC Bot"
git pull --ff-only origin task/ai-support-integration
node --test tests/tools/llmTriageDeterministicLookupRoute.test.mjs tests/tools/groqTriageProvider.test.mjs
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
git diff --check
npm.cmd run build:llm-triage-benchmark -- --data-dir ..\CM-Ticket-Transcripts
```

The semantic rebuild must remain:

```text
adjudicatedRecords:       236
records:                   236
reviewQueueRecords:          0
representabilityRate:        1
representabilityReasons:    {}
```

Record the new planner-token statistics.

Only then rerun the same 20-row smoke:

```cmd
npm.cmd run evaluate:groq-triage -- --data-dir ..\CM-Ticket-Transcripts --limit 20
```

Preferred result:

```text
structuredOutputAcceptanceRate: 1
safeProgressOrBetterRate:       1
unsafeRate:                      0
safeNoProgressRate:             0
semanticReviewQueue:            0
fallbackRate:                    0
```

If the provider returns HTTP 400 after input-aware schema narrowing, inspect the sanitized Groq error metadata before changing schema or retry behavior.

## Durable lesson

A rule that is genuinely deterministic should be encoded as a machine constraint as early as practical. Prompt prose communicates intent; candidate construction, strict schema, validator, and fallback enforce it. Do not use prompt text as the sole boundary for deterministic support actions.
