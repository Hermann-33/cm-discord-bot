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

`TASK-CM-ADMIN-004` added `/cm user` lookup by email/Discord user, linked Discord identity, Share to Chat, Discord timestamps and concise Components V2 audit summaries.

## Phase 5.1 — Shared customer email — COMPLETE ON MAINLINE

`TASK-CM-ADMIN-005` / ADR-0009 intentionally added canonical customer account email to Share to Chat while preserving the separate read-only renderer and internal-field/control exclusions.

## Phase 5.2 — Admin UI declutter — COMPLETE ON MAINLINE

`TASK-CM-ADMIN-006` simplified private `/cm` and customer-share presentation without changing API, authorization or mutation behavior. Final verification passed 131/131 tests, typecheck, build and diff check and PR #4 merged at:

```text
6cef7695a09c8761d395f5d530bc79b7532c9b9f
```

## Phase 5.3 — Pending purchase + fulfillment support integration — IMPLEMENTED / VERIFIED ON PR #5

`TASK-CM-ADMIN-007` / ADR-0011 completes the currently available website-side order-support contract in the Discord bot.

Implemented on `task/cm-order-support-details`:

- `/cm order` remains canonical-order first;
- stable `NOT_FOUND` falls back to `purchase-intents.lookup.read`;
- exact pending-purchase owner resolution;
- private Pending Purchase panel;
- Refresh Purchase with automatic transition to canonical order;
- no order-only refund/delivery controls while only a purchase intent exists;
- optional private `orders.fulfillment.read.support` type/duration/masked-material/manual state;
- optional support failure no longer blocks canonical order controls;
- strict rejection of unexpected raw fulfillment material;
- masked fulfillment support/provider internals excluded from Share to Chat;
- exact API allowlist expanded only with `purchase-intents.lookup.read`;
- `purchase-intents.process`, manual fulfillment and direct DB remain forbidden.

Source implementation merge-ref verification on current concurrent mainline passed GitHub Actions run `32254272306`:

```text
Node 22.23.2
npm ci: PASS — 0 vulnerabilities
npm test: PASS — 153/153
npm run typecheck: PASS
npm run build: PASS
git diff --check: PASS
```

Remaining gates before production use:

1. final PR/documentation-head CI;
2. explicit merge authorization;
3. ensure website bot integration client allows `purchase-intents.lookup.read`;
4. normal bot deployment/restart.

No slash-command definition changed, so command re-registration is not required.

## Phase 6 — Manual fulfillment — BACKEND OPERATION REQUIRED

Still out of scope. `orders.fulfillment.read` is read-only; `purchase-intents.process` and direct DB are not substitutes.

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

Objective: make historical Discord/Tickety ticket corpus durable and accessible for later analysis.

Required sequence:

```text
Discord ticket-log channel
  -> enumerate complete historical log messages
  -> extract ticket metadata + exact View Transcript URLs
  -> validate fetch/parser against a small representative sample
  -> normalize complete transcript conversations
  -> bulk-export all recoverable tickets
  -> produce explicit failure/completeness manifests
  -> persist data in CM-Ticket-Transcripts
```

Real five-ticket validation remains the next operational gate before bulk export.

### Transcript Phase T2 — Corpus quality / indexing — NOT STARTED

Potential follow-up only after T1: schema stabilization, deduplication/integrity, indexes/manifests, attachment inventory and missing-data reconciliation.

### Transcript Phase T3 — Analysis / product use — NOT STARTED

Any analytics/support intelligence or production integration built from the corpus is separately scoped. Existence of the corpus does not authorize a production bot dependency.
