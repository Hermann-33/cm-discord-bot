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

## Groq benchmark harness

The hosted benchmark remains restricted to the already-consumed development input file. New/final holdouts cannot be substituted during provider/model selection.

The Groq benchmark:

- uses the same compact sanitized planner payload and deterministic validator as production;
- defaults to a conservative estimated 6,500-token-per-minute pacing budget;
- reserves the full completion allowance when pacing;
- stops after the first HTTP 429 instead of repeatedly consuming failed requests;
- reports accepted structured output, optimal/safe-progress/safe-no-progress/unsafe classifications, fallback rate, scope leakage, and latency.

Exact next smoke test after the operator adds `GROQ_API_KEY`:

```powershell
npm.cmd run evaluate:groq-triage -- --data-dir ..\CM-Ticket-Transcripts --limit 3
```

If genuine model outputs are accepted, continue with a paced 20-record run.

## Activation gate

Customer-facing support remains blocked until the selected provider/model configuration demonstrates:

```text
safe-progress-or-better >= 95%
unsafe route <= 2%
scope leakage = 0
```

Structured-output acceptance, fallback rate, latency, clarification relevance, privacy, provider reliability, and multi-turn eventual routing must also be reviewed before Discord activation.

## Private transcript repository

`Hermann-33/CM-Ticket-Transcripts` remains private and data/specification-only. Canonical knowledge, historical evidence, evaluation artifacts, and provenance stay there. Only the explicitly sanitized runtime derivative may be promoted to the public bot repository.
