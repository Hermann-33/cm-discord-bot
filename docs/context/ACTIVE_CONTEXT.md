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

## Groq benchmark state

Groq authentication and strict structured output are working. A 20-record run produced 20/20 accepted outputs with zero fallback and zero scope leakage, but its headline semantic rates were not valid planner-quality estimates because several reviewed gold actions were impossible to express from the deterministic candidate input supplied to the model.

Concrete examples included:

- `hwid reset plssss`: reviewed gold expected `case.spoofer.hwid_state`, but no candidate case was supplied;
- `where is the config file?`: reviewed gold expected `case.product.requirements`, but no candidate case was supplied;
- `my rust nfa account doesnt work` and `i got a nfa account and it dont work`: reviewed gold claimed current catalog-status lookup while the planner input was scoped to NFA/account support;
- a reseller-offer message was reviewed as a technical-failure clarification while the deterministic input correctly exposed a reseller/partnership case.

Therefore the previous 70% safe-progress / 5% unsafe 20-record summary must not be treated as a clean GPT-OSS quality score.

The benchmark builder now separates planner-quality evaluation from deterministic candidate/gold disagreement:

```text
historical-first-turn-action-v3.jsonl reviewed rows
  -> build planner input
  -> assess whether reviewed gold is expressible from allowed IDs/families
  -> eligible rows: llm-triage-development-inputs.jsonl
  -> unrepresentable rows: llm-triage-development-inputs-review-queue.jsonl
```

The summary reports representability rate and reason counts. Hosted Groq/OpenRouter evaluation fails closed unless every row in the hosted development file has independent V3 review metadata and explicit positive representability.

This prevents the LLM from being penalized for an action/case/clarification it was never allowed to choose while preserving candidate-generation failures for separate remediation.

Current next step:

```powershell
git pull --ff-only origin task/ai-support-integration
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
git diff --check
npm.cmd run build:llm-triage-benchmark -- --data-dir ..\CM-Ticket-Transcripts
```

Review the generated representability summary/review queue before spending more Groq requests. Do not rerun the 20-record hosted benchmark until that preflight is understood.

## Activation gate

Customer-facing support remains blocked until both layers pass:

1. deterministic candidate/gold representability is high enough that the planner is normally offered the correct action space;
2. on representable independently reviewed rows, the selected provider/model demonstrates:

```text
safe-progress-or-better >= 95%
unsafe route <= 2%
scope leakage = 0
```

Structured-output acceptance, fallback rate, latency, clarification relevance, privacy, provider reliability, and multi-turn eventual routing must also be reviewed before Discord activation.

## Private transcript repository

`Hermann-33/CM-Ticket-Transcripts` remains private and data/specification-only. Canonical knowledge, historical evidence, evaluation artifacts, and provenance stay there. Only the explicitly sanitized runtime derivative may be promoted to the public bot repository.
