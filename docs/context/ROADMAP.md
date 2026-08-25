# Project Roadmap

Updated: 2026-08-24 10:49 +08:00

## Completion rule

A phase/task is complete only when applicable Discord behavior, API/data correctness, authorization/security, executable tests/typecheck/build/diff checks, documentation and requested Git/deployment gates pass.

## Phase 0 — Read-only foundation — COMPLETE

Customer `cm aura`, Components V2 leaderboard, bootstrap/scheduling/manual refresh, HMAC Internal Integrations API client, legacy isolation and removal of active direct-DB access.

## Phase 1 — Repository governance — COMPLETE

Repository-resident workflow, ADRs, context, audit, history and handoff.

## Phase 1.5 — Re-baseline / backend contracts — COMPLETE

Active code/dependency audit plus current Internal Integrations API operation/selector/idempotency contracts verified. ADR-0005 superseded the old slash-only customer recommendation.

## Phase 2 — Private admin console foundation — COMPLETE

`TASK-CM-ADMIN-001`: `/cm user`, private operator-bound sessions, user/order navigation, fulfillment diagnostics and canonical refund.

## Phase 3 — Guild-wide `/cm` authorization — COMPLETE

`TASK-CM-ADMIN-002` / ADR-0006 established exact configured guild + mandatory explicit `BOT_ADMIN_USER_IDS` + per-interaction authorization with no shared `/cm` channel restriction. Mutation audit channel remains separate.

## Phase 4 — Direct order + Aura/wallet controls — COMPLETE ON MAINLINE

`TASK-CM-ADMIN-003` added `/cm order`, confirmed Aura adjustment, confirmed wallet adjustment, canonical refund retention and backend + Discord audit. Manual fulfillment remains blocked.

## Phase 5 — Customer-safe sharing / Discord admin UX — COMPLETE ON MAINLINE

`TASK-CM-ADMIN-004` added `/cm user` lookup by email/Discord user, linked Discord identity, Share to Chat, Discord timestamps and concise Components V2 audit summaries.

## Phase 5.1 — Shared customer email — COMPLETE ON MAINLINE

`TASK-CM-ADMIN-005` / ADR-0009 intentionally added canonical customer account email to Share to Chat while preserving the separate read-only renderer and internal-field/control exclusions.

## Phase 5.2 — Admin UI declutter — COMPLETE ON MAINLINE

`TASK-CM-ADMIN-006` simplified private `/cm` and customer-share presentation without changing API, authorization or mutation behavior. PR #4 merged at `6cef7695a09c8761d395f5d530bc79b7532c9b9f` after tests/typecheck/build/diff checks.

## Phase 5.3 — Pending purchase + fulfillment support integration — IMPLEMENTED / VERIFIED

`TASK-CM-ADMIN-007` / ADR-0011 completed the currently available website-side order-support contract in the Discord bot:

- `/cm order` remains canonical-order first;
- stable `NOT_FOUND` falls back to `purchase-intents.lookup.read`;
- exact pending-purchase owner resolution;
- private Pending Purchase panel;
- Refresh Purchase with automatic transition to canonical order;
- no order-only refund/delivery controls while only a purchase intent exists;
- optional private `orders.fulfillment.read.support` type/duration/masked-material/manual state;
- optional support failure does not block canonical order controls;
- strict rejection of unexpected raw fulfillment material;
- masked fulfillment support/provider internals excluded from Share to Chat;
- `purchase-intents.process`, manual fulfillment and direct DB remain forbidden.

## Phase 6 — Manual fulfillment — BACKEND OPERATION REQUIRED

Still out of scope. `orders.fulfillment.read` is read-only; `purchase-intents.process` and direct DB are not substitutes.

## Phase 7 — Production hardening / operations

Priorities:

- branch protection/status checks;
- registration-specific config loader;
- stronger generic PII/secret redaction;
- deployment/rollback/credential-rotation runbooks;
- controlled authenticated read/mutation smoke tests only with explicit authorization.

## Parallel side project — CM Ticket Transcript / AI Support Knowledge Base

This is not a production-bot runtime phase until an explicit activation task passes all gates. It is governed by ADR-0010, ADR-0012, ADR-0013, `SIDE_PROJECTS.md`, `AI_SUPPORT_SIDE_PROJECT.md`, `HANDOFF.md`, and `AI_SUPPORT_HANDOVER_PROMPT.md`.

Private repository:

```text
Hermann-33/CM-Ticket-Transcripts
```

The repository is private and data/specification-only. Executable tooling remains in `cm-discord-bot/tools/ticket-transcript-exporter/`.

### Transcript Phase T1 — Corpus acquisition — COMPLETE

```text
strict View Transcript records: 1,578
structured tickets:             1,578 / 1,578
extraction failures:            0
messages:                       39,090
```

Tickety transcript content is obtained from its Msgpack API path, not the JavaScript shell page. Discovery targets only exact `View Transcript` controls.

### Transcript Phase T2 — Exhaustive deep review / knowledge graph — COMPLETE

All 1,578 tickets were processed into the private deep-review / evidence / graph layers. The private evidence system preserves contradictions, unresolved items, attachment/manual-review candidates, source links and provenance rather than flattening all historical support into present policy.

```text
historical fact nodes:     3,949
fact dispositions:         3,949 / 3,949
broken links:              0
fact nodes without evidence: 0
```

### Transcript Phase T3 — Canonical/runtime knowledge compilation — COMPLETE FOR CURRENT OFFLINE SOURCE

The private canonical/runtime source currently contains 55 support cases plus entity, procedure, policy, dynamic lookup, escalation, clarification and routing artifacts. Historical prose/PII/provenance remain outside the production derivative.

Dynamic/current state such as payment/order/fulfillment/balance/price/stock/status must use live authority rather than historical claims.

### Transcript Phase T4 — First-turn inferability / conversational routing — IMPLEMENTED / DEVELOPMENT EVALUATION

The project pivoted away from forcing exact first-turn case classification. Normative behavior now supports:

```text
exact_case
family_only
entity_only
control_plane_only
insufficient_context
multi_intent
```

Under-specified messages ask targeted clarification. Stateful replay preserves context and avoids repeated questions/diagnostics.

### Transcript Phase T5 — Hosted LLM triage — PRIMARY PROVIDER SELECTED / BENCHMARK CLEANUP PAUSED

ADR-0013 selects:

```text
Provider: Groq
Model: openai/gpt-oss-120b
```

OpenRouter remains secondary only.

The hosted model chooses a structured next action; it does not own support truth, live state, policy, scope, restricted-topic decisions, state transitions or executable operations.

Implemented safeguards include:

- hosted input privacy sanitization;
- strict JSON-schema output;
- canonical-ID/scope/restricted/repetition/known-answer validation;
- no automatic provider retry/failover;
- V3 gold representability gating;
- separate V3 adjudication overlay;
- turn-scoped live-lookup exposure rather than a global tool catalog;
- rate-safe Groq benchmark pacing and stop-on-429 behavior.

The consumed development cleanup and hosted validation are complete:

```text
sourceRecords:             300
reviewedRecords:           262
adjudicatedRecords:        236
excludedByAdjudication:     26
records:                   236
reviewQueueRecords:          0
representabilityRate:        1
```

Current committed adjudication categories:

```text
bad_gold:                  14
ambiguous_gold:             8
safety_boundary_conflict:   3
safety_boundary_review:     1
```

The final post-fix Groq development prefix reached 40/40 safe-progress-or-better: 36 optimal, 4 safe-progress, and zero unsafe, fallback, invalid, leakage, or semantic-review rows. Full local validation passed 308/308 tests plus typecheck/build/diff hygiene. See `AI_SUPPORT_TRIAGE_VALIDATION_2026-08-25.md`.

### Transcript Phase T6 — Hosted model selection / frozen final holdout — NOT COMPLETE

After the completed consumed-development cleanup:

- inspect every unsafe/safe-no-progress/scope-leak/invalid/fallback/semantic-review row;
- fix the smallest responsible layer rather than tuning against bad gold;
- freeze provider/model/prompt/thresholds;
- create/review a genuinely untouched transcript-grouped final holdout;
- run it once for final selection.

Do not consume the final holdout during development tuning.

### Phase 8 — Customer-facing AI support runtime integration — BLOCKED BY BENCHMARK GATE

ADR-0012 scaffolding exists, but Discord entrypoints are intentionally unwired.

Activation requires at minimum:

```text
safe-progress-or-better >= 95%
unsafe route <= 2%
scope leakage = 0
repeated known questions = 0
context-answerable questions = 0
```

Also require high structured-output acceptance, low/zero fallback, acceptable latency/rate-limit behavior, privacy pass, product/variant/account-model isolation, restricted-topic precision and correct multi-turn eventual routing.

Only after these gates pass may a separately authorized task review grounded reply rendering, Discord integration, staging, merge and deployment.

No bot startup, command registration, deployment, website mutation or customer-facing AI activation is authorized by the current paused workstream.
