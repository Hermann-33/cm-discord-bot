# Project Roadmap

Updated: 2026-08-17

## Completion rule

A phase is complete only when applicable Discord behavior, API contract, data/business correctness, security, automated verification, documentation and deployment gates pass.

## Phase 0 — Read-only bot foundation — COMPLETE

Customer `cm aura`, Components V2 leaderboard, bootstrap/scheduling/manual refresh, host shim, legacy archive, HMAC Internal API rebuild, and removal of active direct-DB access.

## Phase 1 — Repository governance — COMPLETE

Completed in `TASK-WF-001`.

## Phase 1.5 — Full re-baseline — COMPLETE WITH HISTORICAL EXECUTION GAP

`TASK-AUDIT-001` completed source/static/live dependency review. ADR-0005 later superseded its `/aura` migration conclusion.

## Phase 1.6 — Backend API contract re-baseline — COMPLETE

Production operation catalog, mutation paths, HMAC/retry/idempotency model documented. Read-only website source verification later resolved exact DTOs used by the admin console and confirmed Aura/wallet adjustment schemas accept `userLookupSelectorSchema`.

## Phase 2 — Admin dispatch foundation — MERGED / VERIFIED

`TASK-CM-ADMIN-001` merged into `master` at `47a28323fdc2c2d18d1edc3f9952f0d817f481f1` with:

- `/cm user email:<email>` slash definition;
- central `CmAdminController` interaction routing;
- command/button/modal dispatch without affecting customer `MessageCreate` routing;
- `/refresh-leaderboard` preserved;
- manual guild registration definition updated to include `/cm` but not executed.

Local pre-merge verification passed 104/104 tests, typecheck, build and diff check. Registration/deployment remain separate operational gates.

## Phase 3 — Admin authorization foundation — GUILD-WIDE POLICY CHANGE IN VERIFICATION

TASK-CM-ADMIN-001 merged configured guild + admin command channel + explicit user whitelist authorization.

`TASK-CM-ADMIN-002` / ADR-0006 intentionally changes the shared `/cm` policy to:

- exact configured guild;
- no DMs;
- mandatory `BOT_ADMIN_USER_IDS` explicit whitelist;
- any channel in configured guild for a whitelisted operator;
- no `BOT_ADMIN_COMMAND_CHANNEL_ID` configuration;
- audit channel retained separately for mutation audit.

Feature branch:

```text
task/cm-admin-guild-scope
```

Current gate: run dependency-aware test/typecheck/build/diff verification, then merge only if clean.

## Phase 3.5 — Private user/order console — MERGED / NOT DEPLOYED

Tracked implementation provides:

- ephemeral Components V2 user operations panel;
- privileged user overview;
- wallet/Aura/account/order summary;
- latest-ten order history, five per page;
- order detail navigation;
- fulfillment diagnostics;
- order -> user operations navigation;
- blocked Aura/wallet/manual-fulfillment controls where required mutation contract is not acceptable/available.

Backend limitation: `users.overview.read` returns at most ten recent orders and no current operation pages older user orders.

## Phase 3.6 — Canonical order refund flow — MERGED / NOT DEPLOYED OR LIVE-TESTED

Tracked implementation includes:

- explicit admin user whitelist and configured-guild gate before backend access;
- reason modal;
- `orders.refund.preview`;
- explicit private confirmation;
- five-minute TTL;
- fresh canonical re-preview comparison before execute;
- `orders.refund.execute`;
- stable logical idempotency key/body across retry;
- fresh signing material per HTTP attempt;
- backend audit IDs plus sanitized Discord audit output.

ADR-0006 removes only the `/cm` command-channel restriction. Refund confirmation, idempotency, backend authorization and audit requirements are unchanged.

Not operationally complete until bot credential scope/config is provisioned, `/cm` is registered/deployed, reads are controlled-tested and the first refund test is separately authorized.

## Phase 4 — Aura mutation — BLOCKED BY CONFIRMATION MODEL

Website source confirms `users.aura.adjust` route schema accepts `userLookupSelectorSchema`, resolving the earlier selector-doc conflict.

Still blocking:

- bot credential scope;
- accepted backend-authoritative preview/confirm or equivalent state-binding contract;
- cap/product-policy decisions;
- controlled verification.

No Aura execute path exists in bot source.

Under ADR-0006, future Aura controls using shared `/cm` authorization may be used from any configured-guild channel by explicitly whitelisted operators; this does not weaken their mutation-specific controls.

## Phase 5 — Wallet mutation — LATER / HIGH RISK

Wallet remains after Aura. No wallet execute path exists in bot source. Require proven Aura authorization/confirmation design plus stricter financial/ledger controls.

## Phase 6 — Manual fulfillment — BACKEND OPERATION REQUIRED

Current API exposes `orders.fulfillment.read` diagnostics only. Add no bot mutation until the website owns/exposes a narrow audited manual-fulfillment operation with accepted authorization/idempotency contract.

## Phase 7 — Production hardening and operations

A CI workflow exists for Node 22:

```text
npm ci
npm test
npm run typecheck
npm run build
git diff --check
```

GitHub-hosted runner execution previously failed to start because of account billing/spending-limit state, so local Codex verification was used for TASK-CM-ADMIN-001.

Priorities:

- verify TASK-CM-ADMIN-002 locally and merge if clean;
- resolve GitHub Actions billing/execution for repeatable remote CI;
- dependency scan/update policy;
- branch protection/rules;
- registration config split so registration does not require Internal API secrets;
- stronger generic PII/secret redaction;
- runtime/type-definition alignment;
- deployment/rollback/credential-rotation runbooks;
- controlled authenticated API smoke verification.

## Current position

The immediate next step is **verification of TASK-CM-ADMIN-002**, not additional mutation surface. After that, operational provisioning/registration/deployment can be separately authorized. Aura/wallet/manual fulfillment remain blocked.
