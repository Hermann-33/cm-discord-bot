# Audit Log

## 2026-05-29 — Historical — Initial bot and leaderboard evolution

Initial standalone bot implementation followed by leaderboard/channel-policy presentation changes. Historical baseline; see `../legacy-parity.md`.

---

## 2026-08-11 — Historical — Legacy archive and Internal API rebuild

Direct bot/database coupling was removed from active production architecture. Production source moved to the HMAC Internal Integrations API with no direct Supabase dependency.

Verdict: `COMPLETE` for the read-only rebuild architecture.

---

## 2026-08-17 — DATA-AUDIT — Initial underlying Aura DB context

Read-only verification of DB facts needed for future admin-command design. No DB mutation performed.

---

## 2026-08-17 — TASK-WF-001 — Repository governance system

Installed repository-resident context, workflow, decisions, audit, history, handoff and specialist admin-security documentation.

Verdict: `COMPLETE` for documentation/governance scope.

---

## 2026-08-17 — TASK-AUDIT-001 — Full codebase and dependency re-baseline

Exhaustive static/source/config/GitHub/dependency review. No critical/high bot source issue found. Material process gaps included no executable current-head CI evidence, registration/HMAC config coupling, generic logger-redaction limitations, Node type/runtime alignment and local ZIP-ignore gap.

Its then-current conclusion that `cm aura` should become `/aura` was superseded by ADR-0005.

Verdict: `COMPLETE` for audit scope; executable verification gap remained.

---

## 2026-08-17 — TASK-POLICY-001 — Customer vs admin command-surface correction

Added ADR-0005 and preserved `cm aura` as intentional customer message command while reserving admin/staff operations for slash commands. No runtime/data mutation.

Verdict: `COMPLETE`.

---

## 2026-08-17 — TASK-API-DOC-001 — Internal Integrations API contract re-baseline

Recorded the broader production Internal Integrations operation catalog, HMAC/retry/idempotency semantics and documented Aura/wallet execute paths. Endpoint existence was explicitly separated from bot-client permission.

No runtime code, Discord state, website source, credentials or database state changed.

Verdict: `COMPLETE` for documentation re-baseline.

---

## 2026-08-17 — TASK-CM-ADMIN-001 — Private user/order admin console candidate

### Branch/scope

Implemented on `task/cm-admin-console`; production `master` was not changed. `/cm` was not registered or deployed and no live Internal API mutation was executed.

### Read-only website verification

Website repository was inspected read-only at commit `20f6cb52344bade858099febcec2d1c59312f2e5` to verify exact request/response schemas.

Findings relevant to candidate:

- `users.overview.read` accepts `recentOrdersLimit` only 1–10 and returns max ten recent orders;
- no current Internal Integrations API operation pages older orders for one user;
- `orders.details.read` exposes the safe privileged order DTO needed by the console;
- `orders.fulfillment.read` is diagnostics-only and no manual-fulfillment mutation operation exists;
- canonical refund preview/execute DTOs are present;
- Aura/wallet adjustment source schemas use `userLookupSelectorSchema`, resolving the earlier external-identity selector prose conflict.

### Candidate implementation

Added:

- `/cm user email:<email>` slash definition;
- ephemeral Components V2 private user panel;
- explicit guild/admin-channel/user-ID-whitelist authorization on command/buttons/modals;
- bounded operator-bound in-memory sessions;
- user overview, latest-ten order paging, order detail and fulfillment diagnostics;
- order -> user operations navigation;
- canonical refund reason/preview/re-preview/confirm/execute flow;
- stable refund logical body/idempotency across retry with fresh HMAC transport material;
- sanitized Discord refund audit;
- blocked Aura/wallet/manual-fulfillment controls rather than unsafe shortcuts;
- exact typed API DTOs/client methods for only the required user/order/refund operations;
- focused authorization/config/session/API/architecture tests;
- Node 22 GitHub Actions workflow.

### Security review correction

Static review found that rebuilding refund operator audit context from mutable Discord username/display name on a later retry could change the request body under the same idempotency key. The candidate was hardened to freeze only stable `provider=discord` + external user ID in the refund proposal and reuse that exact operator object for execute retries.

### CI result

GitHub Actions run for first feature commit `9f6417374e6564d02a76d0c589320793aa2c0c62` did not start a runner. GitHub annotation states recent account payments failed or the spending limit needs increasing. Job contained zero executed steps.

This is an infrastructure/billing execution failure, not application pass/fail evidence.

Local static/syntax checks found no direct DB access, real secrets, forbidden Aura/wallet/purchase-process execute path, or TypeScript syntax diagnostics in drafted changed files. These checks do not replace `npm test`, typecheck or build.

### Verdict

`PARTIAL` pending executable dependency-aware test/typecheck/build/diff-check evidence and subsequent review. No production registration/deployment/live mutation is authorized by this verdict.
