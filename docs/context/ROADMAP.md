# Project Roadmap

Updated: 2026-08-18

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

## Phase 5.2 — Admin UI declutter — TASK-CM-ADMIN-006 COMPLETE / VERIFIED FOR MERGE

Branch / PR:

```text
task/cm-admin-ui-declutter
PR #4
```

Goal: make `/cm` substantially faster to scan by removing routine internal/statistical noise while retaining all useful support and mutation operations.

Implemented:

- compact User Operations summary;
- compact recent-order list with `Latest N of total` truncation indicator;
- order panel stripped of internal UUID/option/provider and duplicate fulfillment statistics;
- `Fulfillment Diagnostics` renamed `Delivery Details` and reduced to meaningful status/progress/exception/message fields;
- visible nonfunctional Manual Fulfillment button removed;
- refund/Aura/wallet preview/success panels stripped of routine backend bookkeeping;
- Share to Chat summaries reduced to customer-relevant current state while retaining ADR-0009 email disclosure;
- focused presentation tests added/expanded.

No API operation, website source/config, database path, mutation logic, authorization, environment variable, slash-command definition, leaderboard behavior or `legacy/` change.

### Executable gate

The first CI attempt caught two faulty new test assertions only. After fixing those assertions, GitHub Actions run `32156144669` passed 131/131 tests, typecheck, build and diff check.

After the documentation/audit updates, run `32156801285` also passed on Node `22.23.2`:

```text
npm ci: PASS, 0 vulnerabilities
npm test: PASS — 131/131
npm run typecheck: PASS
npm run build: PASS
git diff --check: PASS
```

PR #4 is complete for implementation/documentation verification and may merge when its current-head GitHub Actions status is green.

## Phase 6 — Manual fulfillment — BACKEND OPERATION REQUIRED

Still out of scope. The API exposes `orders.fulfillment.read` only; no purchase-processing or direct-DB substitute is allowed. TASK-CM-ADMIN-006 removes the dead visible button rather than implying this capability exists.

## Phase 7 — Production hardening / operations

Priorities:

- branch protection/status checks;
- registration-specific config loader;
- stronger generic PII/secret redaction;
- deployment/rollback/credential-rotation runbooks;
- controlled authenticated read/mutation smoke tests only with explicit authorization.

TASK-CM-ADMIN-006 does not alter slash registration. After merge, a normal bot redeploy/restart is sufficient; no `npm run register:commands` is required solely for this task.
