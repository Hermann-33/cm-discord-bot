# Project Roadmap

Updated: 2026-08-17

## Completion rule

A phase is complete only when applicable Discord behavior, API contract, data/business correctness, security, automated verification, documentation and deployment gates pass.

## Phase 0 — Read-only bot foundation — COMPLETE

Customer `cm aura`, Components V2 leaderboard, bootstrap/scheduling/manual refresh, host shim, legacy archive, HMAC Internal API rebuild, and removal of active direct-DB access.

## Phase 1 — Repository governance — COMPLETE

Completed in `TASK-WF-001`.

## Phase 1.5 — Full re-baseline — COMPLETE WITH EXECUTION GAP

`TASK-AUDIT-001` completed source/static/live dependency review. ADR-0005 superseded its `/aura` migration conclusion.

## Phase 1.6 — Backend API contract re-baseline — COMPLETE

Production operation catalog, mutation paths, HMAC/retry/idempotency model documented. Later read-only website source verification additionally resolved exact DTOs used by the admin-console feature and confirmed Aura/wallet adjustment schemas accept `userLookupSelectorSchema`.

## Phase 2 — Admin dispatch foundation — IMPLEMENTED CANDIDATE / NOT PRODUCTION

`task/cm-admin-console` now contains:

- `/cm user email:<email>` slash definition;
- central `CmAdminController` interaction routing;
- command/button/modal dispatch without affecting customer `MessageCreate` routing;
- `/refresh-leaderboard` preserved;
- manual guild registration definition updated to include `/cm` but **not executed**.

Still required: executable test/typecheck/build evidence and review before merge/registration.

## Phase 3 — Admin authorization foundation — IMPLEMENTED CANDIDATE / NOT PRODUCTION

Feature branch contains:

- `BOT_ADMIN_USER_IDS` explicit whitelist;
- `BOT_ADMIN_COMMAND_CHANNEL_ID`;
- `BOT_AUDIT_LOG_CHANNEL_ID`;
- exact guild/channel/user checks;
- fail-closed missing config;
- operator-bound expiring component sessions;
- tests drafted for authorization/session behavior.

Roles remain optional/additive and are not used as authorization replacement.

## Phase 3.5 — Private user/order console — IMPLEMENTED CANDIDATE / VERIFICATION BLOCKED

Implemented:

- ephemeral Components V2 user operations panel;
- privileged user overview;
- wallet/Aura/account/order summary;
- latest-10 order history, five per page;
- order detail navigation;
- fulfillment diagnostics;
- order -> user operations navigation;
- blocked Aura/wallet/manual-fulfillment controls where the required mutation contract is not acceptable/available.

Backend limitation: `users.overview.read` returns at most 10 recent orders and no current operation pages older user orders.

## Phase 3.6 — Canonical order refund flow — IMPLEMENTED CANDIDATE / VERIFICATION BLOCKED

Implemented with:

- whitelist/guild/admin-channel gates before backend access;
- reason modal;
- `orders.refund.preview`;
- explicit private confirmation;
- five-minute TTL;
- fresh canonical re-preview comparison before execute;
- `orders.refund.execute`;
- stable logical idempotency key/body across retry;
- fresh signing material per HTTP attempt;
- backend audit IDs plus sanitized Discord audit output.

Not complete until dependency-aware tests/typecheck/build execute and a separately authorized controlled integration test is performed.

## Phase 4 — Aura mutation — BLOCKED BY CONFIRMATION MODEL

Website source confirms `users.aura.adjust` route schema accepts `userLookupSelectorSchema`, resolving the earlier selector-doc conflict.

Still blocking:

- bot credential scope;
- ADR-0004-compatible backend-authoritative preview/confirm or equivalent state-binding contract;
- cap/product-policy decisions;
- controlled verification.

No Aura execute path exists in bot feature source.

## Phase 5 — Wallet mutation — LATER / HIGH RISK

Wallet remains after Aura. No wallet execute path exists in bot feature source. Require proven Aura authorization/confirmation design plus stricter financial/ledger controls.

## Phase 6 — Manual fulfillment — BACKEND OPERATION REQUIRED

Current API exposes `orders.fulfillment.read` diagnostics only. Add no bot mutation until the website owns and exposes a narrow audited manual-fulfillment operation with an accepted authorization/idempotency contract.

## Phase 7 — Production hardening and operations

A CI workflow has now been added for Node 22 `npm ci`, test, typecheck, build and `git diff --check`.

Current blocker: GitHub Actions refused to start the runner because of account billing/spending-limit status; zero workflow steps ran. Therefore current-head executable evidence remains missing.

Other priorities:

- resolve GitHub Actions billing/execution;
- dependency scan/update policy;
- branch protection/rules;
- registration config split so registration does not require Internal API secrets;
- stronger generic PII/secret redaction;
- runtime/type-definition alignment;
- deployment/rollback/credential-rotation runbooks;
- controlled authenticated API smoke verification.

## Current position

The next step is **verification, not additional mutation surface**: restore executable CI/local dependency-aware testing, fix any failures, review the candidate, then explicitly authorize provisioning/registration/deployment. Aura/wallet/manual fulfillment remain blocked.
