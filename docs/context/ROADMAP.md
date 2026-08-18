# Project Roadmap

Updated: 2026-08-18

## Completion rule

A phase/task is complete only when applicable Discord behavior, API contract, data/business correctness, authorization/security, tests/typecheck/build/diff checks, documentation and requested Git/deployment gates pass.

## Phase 0 — Read-only foundation — COMPLETE

Customer `cm aura`, Components V2 leaderboard, bootstrap/scheduling/manual refresh, HMAC Internal Integrations API client, legacy isolation and removal of active direct-database access.

## Phase 1 — Repository governance — COMPLETE

Repository-resident workflow, ADRs, context, audit, history and handoff installed by `TASK-WF-001`.

## Phase 1.5 — Full re-baseline — COMPLETE WITH HISTORICAL EXECUTION GAP

`TASK-AUDIT-001` completed source/static/live-dependency review. ADR-0005 later superseded its slash-only customer-command recommendation.

## Phase 1.6 — Backend contract re-baseline — COMPLETE

Current Internal Integrations API operation catalog, HMAC/retry/idempotency model, strict user/order/refund DTOs and Aura/wallet adjustment contracts verified read-only from website source.

## Phase 2 — Admin dispatch foundation — COMPLETE

`TASK-CM-ADMIN-001` merged `/cm user`, private Components V2 sessions, user/order navigation and central interaction dispatch without changing customer `cm aura`.

## Phase 3 — Shared `/cm` authorization — COMPLETE

`TASK-CM-ADMIN-002` is represented in current `master` head `5baa260bb1f804c6c0e9878f2cb5be003564a915` and ADR-0006:

- exact configured guild;
- no DMs/wrong guild;
- mandatory explicit `BOT_ADMIN_USER_IDS`;
- any channel in configured guild;
- no `BOT_ADMIN_COMMAND_CHANNEL_ID`;
- per-interaction reauthorization;
- separate audit-channel requirement for mutations.

`/refresh-leaderboard` retains its own channel/permission policy.

## Phase 3.5 — Private user/order console — COMPLETE ON MAINLINE

Mainline includes:

- privileged user overview;
- wallet/Aura/account/order summary;
- bounded latest-ten order history;
- order detail navigation;
- fulfillment diagnostics;
- order -> user operations navigation;
- canonical refund control.

## Phase 3.6 — Canonical refund — COMPLETE IN SOURCE / OPERATIONAL TESTING SEPARATE

Source includes:

- reason modal;
- `orders.refund.preview`;
- explicit confirmation;
- five-minute TTL;
- exact fresh re-preview before execute;
- stable UUID idempotency/body across retry;
- `orders.refund.execute`;
- backend + sanitized Discord audit handling.

Live production refund testing remains a separately authorized operational action.

## Phase 4 — Direct order entry — TASK-CM-ADMIN-003 IN VERIFICATION

Feature branch:

```text
task/cm-admin-controls-order
```

Adds:

```text
/cm order reference:<CM-public-ref-or-order-UUID>
```

The command resolves canonical order details, resolves the owner overview, requires target consistency and opens the existing private order panel with Refund, Fulfillment diagnostics, Refresh, User Operations and recent Order History.

## Phase 5 — Aura adjustment — TASK-CM-ADMIN-003 IN VERIFICATION

ADR-0007 accepts a fresh-state-bound two-step confirmation around the verified `users.aura.adjust` endpoint.

Implemented source model:

- signed non-zero whole-number delta;
- backend max ±1,000,000,000 Aura;
- reason 1–500;
- fresh overview before preview;
- projected non-negative available Aura;
- five-minute explicit confirmation;
- fresh exact balance comparison immediately before execute;
- stable UUID idempotency/body across retry;
- result target/delta verification;
- required audit channel;
- backend + Discord audit;
- post-success overview refresh.

## Phase 5.5 — Wallet adjustment — TASK-CM-ADMIN-003 IN VERIFICATION

ADR-0007 supersedes the older Aura-first/wallet-later sequencing because the wallet backend operation/accounting primitive is verified.

Implemented source model:

- signed decimal input with at most two decimal places;
- exact integer-cent conversion;
- backend max ±100,000,000 cents;
- projected non-negative balance;
- same five-minute/fresh-state/idempotency/audit controls as Aura;
- website remains authoritative for wallet transaction/funding-state accounting.

## Phase 6 — Manual fulfillment — BACKEND OPERATION REQUIRED / OUT OF CURRENT SCOPE

The current API exposes `orders.fulfillment.read` only. `TASK-CM-ADMIN-003` deliberately leaves Manual Fulfillment blocked. No purchase-processing or direct-DB substitute is allowed.

## Phase 7 — Production hardening and operations

Verification contract:

```text
npm ci
npm test
npm run typecheck
npm run build
git diff --check
git status --short --untracked-files=all
```

Additional priorities:

- restore/reliably execute GitHub-hosted CI if account billing/spending limits still block it;
- branch protection/status checks;
- registration-specific config loader so command registration requires fewer unrelated secrets;
- stronger generic PII/secret redaction;
- deployment/rollback/credential-rotation runbooks;
- controlled authenticated read/mutation smoke tests only when explicitly authorized.

## Current position

`TASK-CM-ADMIN-003` source/tests/docs are on a feature branch with a draft PR. The immediate gate is executable Node 22 verification plus focused security/diff scans. Do not merge or report `COMPLETE` until those gates pass.

After a clean merge, operational rollout requires bot redeploy/restart and guild command re-registration because `/cm` gained the `order` subcommand. Live Aura/wallet/refund mutation tests remain separately controlled actions.
