# Project Roadmap

Updated: 2026-08-19

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

`TASK-CM-ADMIN-004` added `/cm user` lookup by email/Discord user, linked Discord identity, Share to Chat, Discord timestamps and concise Components V2 audit summaries. It was verified with 127/127 tests and merged at:

```text
7a41dbeefae167044091b0aaed8372c3b58acdd0
```

## Phase 5.1 — Shared customer email — COMPLETE ON MAINLINE

`TASK-CM-ADMIN-005` / ADR-0009 explicitly added canonical customer account email to Share to Chat while preserving the separate read-only renderer and internal-field/control exclusions. Executable verification passed 128/128 tests, typecheck, build and diff check before merge.

## Phase 5.2 — Admin UI declutter — COMPLETE ON MAINLINE

`TASK-CM-ADMIN-006` simplified private `/cm` and customer-share presentation without changing API, authorization or mutation behavior.

Implemented:

- compact User Operations summary;
- compact recent-order list with `Latest N of total` truncation indicator;
- order panel stripped of internal UUID/option/provider and duplicate fulfillment statistics;
- `Fulfillment Diagnostics` renamed `Delivery Details` and reduced to meaningful status/progress/exception/message fields;
- visible nonfunctional Manual Fulfillment button removed;
- refund/Aura/wallet preview/success panels stripped of routine backend bookkeeping;
- Share to Chat summaries reduced to customer-relevant current state while retaining ADR-0009 email disclosure;
- focused presentation tests added/expanded.

Final verification passed on Node `22.23.2`:

```text
npm ci: PASS, 0 vulnerabilities
npm test: PASS — 131/131
npm run typecheck: PASS
npm run build: PASS
git diff --check: PASS
```

PR #4 was squash-merged into `master` at:

```text
6cef7695a09c8761d395f5d530bc79b7532c9b9f
```

## Phase 6 — Manual fulfillment — BACKEND OPERATION REQUIRED

Still out of scope. The API exposes `orders.fulfillment.read` only; no purchase-processing or direct-DB substitute is allowed.

## Phase 7 — Production hardening / operations

Priorities:

- branch protection/status checks;
- registration-specific config loader;
- stronger generic PII/secret redaction;
- deployment/rollback/credential-rotation runbooks;
- controlled authenticated read/mutation smoke tests only with explicit authorization.

## Parallel side project — CM Ticket Transcript Corpus

This is not a production-bot phase. It is a separate workstream governed by ADR-0010 and `SIDE_PROJECTS.md`.

Repository:

```text
Hermann-33/CM-Ticket-Transcripts
```

The repository is private and data-only. Main bot engineering may continue at the same time.

### Transcript Phase T1 — Corpus acquisition — IN PROGRESS

Objective: make the historical Discord/Tickety ticket corpus durable and accessible for later analysis.

Required sequence:

```text
Discord ticket-log channel
  -> enumerate complete historical log messages
  -> extract ticket metadata + Tickety transcript URLs
  -> validate fetch/parser against a small representative sample
  -> normalize complete transcript conversations
  -> bulk-export all recoverable tickets
  -> produce explicit failure/completeness manifests
  -> persist data in CM-Ticket-Transcripts
```

Completion gate:

- complete Discord channel history enumerated;
- every discovered transcript URL accounted for;
- normalized schema proven against representative samples;
- bulk export completed without silently dropping failures;
- raw evidence retained where required for parser recovery;
- no executable extraction code or credentials committed to the data repository;
- corpus is queryable for downstream analysis.

### Transcript Phase T2 — Corpus quality / indexing — NOT STARTED

Potential follow-up only after T1:

- schema/version stabilization;
- deduplication and integrity checks;
- searchable indexes/derived manifests;
- attachment inventory;
- quality statistics and missing-data reconciliation.

### Transcript Phase T3 — Analysis / product use — NOT STARTED

Any analytics, support intelligence or integration built from the corpus is separately scoped. Existence of the corpus does not authorize the production bot to depend on it.
