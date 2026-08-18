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

`TASK-CM-ADMIN-002` / ADR-0006:

- exact configured guild;
- no DM/wrong guild;
- mandatory explicit `BOT_ADMIN_USER_IDS`;
- any channel in configured guild;
- per-interaction reauthorization;
- no `BOT_ADMIN_COMMAND_CHANNEL_ID`;
- separate mutation audit channel.

## Phase 4 — Direct order + Aura/wallet controls — COMPLETE ON MAINLINE

`TASK-CM-ADMIN-003` was verified locally (113/113 tests, typecheck, build, diff checks) and squash-merged into `master` at:

```text
4b10d74aa80d3fa5c5e5a27b82e4ccf109a880a8
```

Mainline includes `/cm order`, confirmed Aura adjustment, confirmed wallet adjustment, canonical refund and backend + Discord audit. Manual fulfillment remains blocked.

## Phase 5 — Customer-safe sharing / Discord admin UX — COMPLETE ON MAINLINE

`TASK-CM-ADMIN-004` was verified by GitHub Actions (127/127 tests, typecheck, build and diff check) and squash-merged into `master` at:

```text
7a41dbeefae167044091b0aaed8372c3b58acdd0
```

It added `/cm user` lookup by email/Discord user, linked Discord identity, Share to Chat, Discord timestamps and concise Components V2 audit summaries.

## Phase 5.1 — Shared customer email — TASK-CM-ADMIN-005 COMPLETE / VERIFIED FOR MERGE

Product follow-up:

- include the canonical CM account email in every shared customer identity section;
- keep the shared message read-only/no controls;
- keep internal CM UUIDs, option IDs, provider/failure codes, admin reasons, backend identifiers and credentials excluded;
- preserve exact-guild + explicit-admin + operator-owned-session checks.

ADR-0009 supersedes ADR-0008 only for the previous full-email prohibition.

Implementation branch/PR:

```text
task/cm-share-email
PR #3
```

No API operation, website source/config, database path, mutation logic, manual fulfillment behavior or slash-command definition changes.

### Executable gate

GitHub Actions run `32145501289` passed on Node `22.23.2`:

```text
npm ci: PASS, 0 vulnerabilities
npm test: PASS — 128/128
npm run typecheck: PASS
npm run build: PASS
git diff --check: PASS
```

Static review confirms the source change is limited to the customer-share renderer plus focused tests; API/auth/mutation/config/registration/legacy source remains untouched. PR #3 may be merged once the final documentation head revalidates successfully.

## Phase 6 — Manual fulfillment — BACKEND OPERATION REQUIRED

Still out of scope. The API exposes `orders.fulfillment.read` only; no purchase-processing or direct-DB substitute is allowed.

## Phase 7 — Production hardening / operations

Priorities:

- branch protection/status checks;
- registration-specific config loader;
- stronger generic PII/secret redaction;
- deployment/rollback/credential-rotation runbooks;
- controlled authenticated read/mutation smoke tests only with explicit authorization.

TASK-CM-ADMIN-005 does not alter slash registration, so deployment of that change does not require command registration solely for the email-sharing behavior.
