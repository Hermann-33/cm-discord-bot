# Latest Handoff

Updated: 2026-08-24

## Authority

- ADR-0005 — customer `cm aura` remains message-based; admin/staff controls remain slash/components/modals.
- ADR-0006 — `/cm` requires exact configured guild + explicit `BOT_ADMIN_USER_IDS`; no admin-command channel restriction.
- ADR-0007 — Aura/wallet mutations require fresh-state-bound confirmation, idempotency, and audit.
- ADR-0008 + ADR-0009 — Share to Chat uses a separate customer-safe renderer; canonical CM account email may be shared while internal/admin/credential data remains excluded.
- ADR-0010 — `CM-Ticket-Transcripts` is a private data-only side project with no production runtime dependency.
- ADR-0011 — `/cm order` is canonical-order-first with `NOT_FOUND`-only pending-purchase fallback; masked fulfillment support is private staff data.
- ADR-0012 — production AI support may use only the bundled sanitized `support-runtime/` derivative, deterministic state/validation, and benchmark-before-activation gate.
- ADR-0013 — Groq `openai/gpt-oss-120b` is the primary hosted support-triage candidate. OpenRouter remains a secondary development adapter.
- No direct Supabase/Postgres path, no manual fulfillment, and no `purchase-intents.process` permission.

For the complete AI-support workstream state, read `docs/context/AI_SUPPORT_SIDE_PROJECT.md`.

## Current feature branch

```text
task/ai-support-integration
```

Customer-facing AI support is still **disabled**. Discord entrypoints are not wired to the support planner yet.

The branch contains:

- bundled sanitized `support-runtime/` importer/loader boundary;
- stateful support conversation service and pending-question answer handling;
- deterministic support candidate/action validation/fallback;
- privacy sanitization for hosted planner payloads;
- Groq production triage client;
- Groq hosted benchmark adapter;
- OpenRouter secondary adapter;
- consumed-development benchmark guard;
- rate-safe Groq benchmark pacing and stop-on-429 behavior;
- V3 adjudication-aware benchmark construction;
- representability gating that separates deterministic candidate failures from LLM quality;
- turn-scoped lookup exposure instead of the global lookup catalog;
- targeted first-turn routing fixes documented in `AI_SUPPORT_SIDE_PROJECT.md`.

## Primary hosted provider

```text
Provider: Groq
Model: openai/gpt-oss-120b
Endpoint: https://api.groq.com/openai/v1/chat/completions
```

Default planner request controls:

```text
temperature = 0
reasoning_effort = low
max_completion_tokens = 400
stream = false
response_format = strict JSON schema
```

No model tools, browser search, code execution, MCP, direct website access, or executable support operations are exposed to the model.

The deterministic validator remains authoritative for canonical IDs, scope, restricted topics, confidence-sensitive direct cases, repeated/already-known clarifications, lookup eligibility and fallbacks.

## Environment

The operator supplies the Groq key manually to local `.env` or the deployment secret store:

```text
GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-120b
GROQ_REASONING_EFFORT=low
```

Do not commit `.env` or print/log the key.

The existing OpenRouter variables remain optional and secondary.

## Current clean benchmark preflight

The independently reviewed V3 development set is filtered through a separate adjudication overlay rather than rewriting historical gold.

Latest confirmed summary:

```text
sourceRecords:               300
reviewedRecords:             262
excludedByAdjudication:       26
adjudicatedRecords:          236
records:                     236
reviewQueueRecords:            0
representabilityRate:          1
representabilityReasons:      {}
```

Adjudication categories:

```text
bad_gold:                  14
ambiguous_gold:             8
safety_boundary_conflict:   3
safety_boundary_review:     1
```

Planner-token estimate after lookup pruning:

```text
average: 1,250.99
median:    799
p95:     2,355
```

## Current exact next action

A new 20-record Groq development triage run is currently in progress against the repaired 236-row representable/adjudicated benchmark.

Do **not** change prompt, model, reasoning effort, confidence threshold, gold labels or action contracts while that run is in progress.

When its output is available:

1. record the exact summary;
2. inspect every `unsafe_wrong_route`, `unsafe_scope_leakage`, `safe_no_progress`, `invalid`, fallback or semantic-review row offline;
3. determine whether each failure belongs to model semantics, deterministic candidate generation, planner-contract leakage, benchmark gold, missing KB surface or evaluator logic;
4. fix the smallest responsible layer;
5. do not tune GPT-OSS to reproduce bad gold;
6. do not run an untouched/final holdout during development tuning.

## Activation gate

Do not wire customer Discord support until the chosen hosted configuration demonstrates on clean representable reviewed data:

```text
safe-progress-or-better >= 95%
unsafe route <= 2%
scope leakage = 0
```

Also review structured-output acceptance, fallback rate, latency, clarification relevance, privacy, rate-limit behavior, product/variant/account-model isolation and multi-turn eventual routing.

## Runtime data boundary

Production must never read `CM-Ticket-Transcripts` directly. Only the explicit allowlisted, provenance-free `support-runtime/` bundle may be used by `src/`.

Raw transcripts, source transcript IDs, evidence prose, fact provenance, private evaluation artifacts, customer PII, credentials, benchmark gold and adjudication metadata remain outside production runtime.

## Current production behavior remains unchanged

The feature branch does not change deployed command behavior. Existing production surfaces remain:

- `cm aura`;
- `/refresh-leaderboard`;
- private `/cm user`;
- private `/cm order`;
- refund/Aura/wallet mutation controls;
- customer-safe Share to Chat.

No bot startup, command registration, deployment, or customer-facing AI activation is part of the current benchmark stage.
