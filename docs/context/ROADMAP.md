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

Mainline now includes:

- `/cm order reference:<CM-ref-or-UUID>`;
- confirmed Aura adjustment;
- confirmed wallet adjustment;
- canonical refund retained;
- backend + Discord audit;
- manual fulfillment still blocked.

## Phase 5 — Customer-safe sharing / Discord admin UX — TASK-CM-ADMIN-004 PARTIAL

Branch/PR:

```text
task/cm-share-discord-audit-time
PR #2
```

Feature-branch implementation includes:

- `/cm user` lookup by exact email or selected Discord user;
- linked Discord identity in User Operations;
- Share to Chat on meaningful private `/cm` panels;
- dedicated buttonless/customer-safe public renderer under ADR-0008;
- absolute + relative Discord timestamps across `/cm`, share and audit views;
- concise Components V2 refund/Aura/wallet audit summaries;
- focused tests for selector validation, disclosure boundary, no-public-controls, timestamps, audit layout and share state.

No new API operation, website source/config, DB path or manual fulfillment behavior is introduced.

### Current gate

GitHub Actions run `32138604602` fails before job steps are created (`steps: null`, no logs), matching the existing Actions runner/account infrastructure problem.

The product owner requested no separate Codex/local test run. Repository governance still requires an executable pass before merge, so TASK-CM-ADMIN-004 remains PARTIAL/unmerged until this actually runs successfully:

```text
npm ci
npm test
npm run typecheck
npm run build
git diff --check
git status --short --untracked-files=all
```

If an executable gate passes and final static/security review is clean, PR #2 may be finalized and directly merged under the current authorization.

## Phase 6 — Manual fulfillment — BACKEND OPERATION REQUIRED

Still out of scope. The API exposes `orders.fulfillment.read` only; no purchase-processing or direct-DB substitute is allowed.

## Phase 7 — Production hardening / operations

Priorities:

- restore reliable GitHub-hosted CI/account runner execution;
- branch protection/status checks;
- registration-specific config loader;
- stronger generic PII/secret redaction;
- deployment/rollback/credential-rotation runbooks;
- controlled authenticated read/mutation smoke tests only with explicit authorization.

After any merge that changes `/cm` registration, production rollout requires bot redeploy/restart and one explicit `npm run register:commands`; those remain separate operational actions.
