# Active Context

Updated: 2026-08-24

## Production baseline

The deployed/mainline bot remains a standalone Node.js/TypeScript Discord service with no direct Supabase/Postgres client, credential, RPC fallback, or database mutation path.

Current production command behavior remains unchanged by the AI-support work:

- customer `cm aura` message command;
- `/refresh-leaderboard`;
- private `/cm user` by exact email or linked Discord user;
- private `/cm order` by public reference/order/purchase identifier;
- canonical refund preview/confirm/re-preview/execute;
- confirmed Aura and wallet adjustments;
- customer-safe Share to Chat copies.

The bot website operation set remains explicitly allowlisted and does not include `purchase-intents.process` or manual fulfillment.

## AI support integration branch

Current feature branch:

```text
task/ai-support-integration
```

Customer-facing AI support is not enabled. Discord message entrypoints are intentionally unwired until the hosted planner passes the benchmark gate.

For the full current handoff, read:

```text
docs/context/AI_SUPPORT_SIDE_PROJECT.md
```

ADR-0012 remains authoritative for the production data/state boundary:

```text
private transcript corpus
  -> operator-controlled sanitized allowlist importer
  -> public support-runtime/ bundle
  -> deterministic resolver/state/action layer
  -> hosted semantic next-action planner
  -> deterministic validator
  -> clarification / lookup / policy / case / escalation
```

Production startup never reads the private `CM-Ticket-Transcripts` repository.

## Primary hosted planner candidate

ADR-0013 changes the preferred hosted provider from OpenRouter to Groq while preserving all ADR-0012 safety boundaries.

```text
Provider: Groq
Model: openai/gpt-oss-120b
Endpoint: https://api.groq.com/openai/v1/chat/completions
```

Default request configuration:

```text
temperature: 0
reasoning_effort: low
max_completion_tokens: 400
stream: false
response_format: strict JSON schema
```

The model has no model-side tools, browser search, code execution, MCP, database access, direct website access, or executable support operation authority.

OpenRouter remains implemented only as an explicit secondary development adapter.

## Hosted-planner safety boundary

Before any hosted request, customer text and live/session context are sanitized to remove common identifiers, credentials, secrets, order references, URLs, and other unnecessary sensitive values while preserving canonical support IDs.

Every model output is checked deterministically. The bot rejects:

- invented case/clarification/lookup/policy/entity IDs;
- scope-conflicting cases;
- restricted autonomous answers;
- direct cases below the configured confidence threshold;
- repeated clarifications;
- clarifications already answered by known/live context;
- malformed or schema-invalid outputs.

Provider failures fail closed to the canonical state continuation / clarification / human escalation path. Provider clients do not automatically retry.

The model is no longer offered the entire global lookup catalog. Lookup choices are scoped to deterministic/case/clarification relevance, and an already-selected deterministic lookup route is authoritative for that turn.

## Stateful conversation support

The support-service scaffold preserves:

- resolved entities;
- candidate cases/families;
- known and unknown context;
- pending clarification;
- questions and answers;
- diagnostics/procedures/outcomes;
- dynamic lookup results;
- policy state;
- multiple intents.

Short replies are interpreted relative to a pending question before a new route is considered.

The bot is explicitly allowed to ask clarification questions instead of forcing a one-turn answer when the user message is under-specified.

## Corpus and canonical KB state

The private corpus remains complete at 1,578/1,578 structured tickets with zero extraction failures. The exhaustive deep-review/canonicalization work accounts for 3,949 historical fact nodes and preserves contradictions/unresolved material instead of treating all staff history as current policy.

The runtime ontology currently contains 55 canonical support cases and remains product/variant/account-model scoped where evidence requires that distinction.

## Clean V3 benchmark preflight

The original V3 review file is preserved. A separate adjudication overlay excludes unreliable development gold rather than rewriting source labels.

Current confirmed preflight:

```text
source V3 records:          300
independently reviewed:     262
excluded by adjudication:    26
  bad_gold:                  14
  ambiguous_gold:             8
  safety_boundary_conflict:   3
  safety_boundary_review:     1
retained adjudicated gold:  236
planner-representable:      236
review queue:                 0
representability rate:      100%
```

Current planner token estimate after lookup/candidate pruning:

```text
average: 1,250.99
median:    799
p95:     2,355
```

Important deterministic fixes completed during this cleanup include payment typo normalization, NFA activation routing, HWID reset recognition, controller-compatibility false-positive prevention, media/reseller intent recognition, restricted detection-status routing, order-selector-vs-intent separation, delivered `View Order` access routing, and turn-scoped dynamic lookup exposure.

## Groq benchmark state

Groq authentication and strict structured output are working. Earlier 20-record headline metrics were contaminated by bad/unrepresentable gold and by planner-contract leakage, so they are historical diagnostics rather than authoritative model-quality scores.

After benchmark/candidate repair, the latest confirmed state is the 236/236 representability preflight above.

A new 20-record Groq triage run is currently being executed against the repaired benchmark and tighter planner contract. Its result is not yet recorded in repository truth. Do not infer a pass/fail until the actual command output is reviewed.

When the result arrives, inspect every unsafe/scope-leak/safe-no-progress/invalid/fallback/semantic-review row before changing model, prompt, confidence threshold, reasoning effort or benchmark gold.

## Activation gate

Customer-facing support remains blocked until both layers pass:

1. deterministic candidate/gold representability is clean;
2. on representable independently reviewed rows, the selected provider/model demonstrates:

```text
safe-progress-or-better >= 95%
unsafe route <= 2%
scope leakage = 0
```

Structured-output acceptance, fallback rate, latency, clarification relevance, privacy, provider reliability, rate-limit behavior and multi-turn eventual routing must also be reviewed before Discord activation.

## Private transcript repository

`Hermann-33/CM-Ticket-Transcripts` remains private and data/specification-only. Canonical knowledge, historical evidence, evaluation artifacts, adjudication overlays and provenance stay there. Only the explicitly sanitized runtime derivative may be promoted to the public bot repository.
