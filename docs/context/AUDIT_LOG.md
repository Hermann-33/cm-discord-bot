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

### Scope

Exhaustive audit of active bot source, all root tests/fixtures, package/build/env configuration, GitHub branch/PR/CI state, legacy isolation, documentation drift and read-only live Supabase dependency metadata relevant to future bot work.

### Positive findings

- no direct Supabase/Postgres dependency in active bot;
- HMAC request signing and strict API DTO validation are real controls;
- API response size/timeout/error/retry handling is bounded;
- mention suppression/display-name sanitization are centralized/tested;
- `cm aura` performs guild/channel checks before API lookup;
- `/refresh-leaderboard` has explicit runtime guild/channel/permission guards;
- Components V2 leaderboard and overlap lock match implementation;
- legacy is excluded and regression-tested;
- architecture tests enforce the two-read-operation API boundary.

### Material findings

- no GitHub CI/status exists at current head, and fresh local test/typecheck/build/npm-audit execution was unavailable;
- command registration currently requires complete runtime config including Internal API HMAC material;
- logger sanitization is not universal secret/PII redaction;
- Node type definitions are newer than the minimum runtime;
- `.gitignore` does not ignore ZIP archives;
- smaller defensive/test gaps remain.

### Backend drift discovered

Live DB now contains service-role-only internal integration adjustment functions for `users.aura.adjust` and `users.wallet.adjust` with persistent idempotency/request-hash protection and audit integration. This did not, by itself, prove bot-facing HTTP mutation endpoints/permission existed.

### Historical audit conclusion later superseded

At audit time, ADR-0003 classified `cm aura` as slash-migration debt. The audit therefore recommended conversion to `/aura` and eventual Message Content removal.

That product conclusion is **superseded by ADR-0005**. Current policy intentionally keeps `cm aura` as a customer message command and reserves slash commands for staff/admin operations. This correction does not alter the audit's source/security findings about how `cm aura` is currently guarded.

Verdict: `COMPLETE` for source/static/live-metadata audit; `PARTIAL` for production-hardening readiness because execution gates remain.

---

## 2026-08-17 — TASK-POLICY-001 — Customer vs admin command-surface correction

### Decision

Product owner clarified that `cm aura` is a customer-facing command, while slash commands are intended for admins/staff.

### Governance action

- added ADR-0005, superseding conflicting parts of ADR-0003;
- retained `cm aura` as intentional message command;
- retained Message Content/GuildMessages as intentional requirements while that customer command exists;
- kept admin/staff operational and mutation commands slash-only/guild-only;
- corrected active context, architecture, command catalog, roadmap and handoff.

### Data boundary

No architecture change: both customer and admin commands continue to use approved Internal Integrations API operations; direct Supabase/Postgres access remains forbidden.

### Verdict

`COMPLETE` for policy/documentation correction. No runtime code, Discord state or database state changed.

---

## 2026-08-17 — TASK-API-DOC-001 — Internal Integrations API contract re-baseline

### Evidence

Authoritative backend Internal Integrations API and bot-quickstart documentation was supplied for the project.

### Material corrections

- production operation catalog is broader than the bot currently consumes;
- `users.aura.adjust` is contract-documented at `POST /api/internal/integrations/v1/users/aura/adjust`;
- `users.wallet.adjust` is contract-documented at `POST /api/internal/integrations/v1/users/wallet/adjust`;
- mutation retries require stable business idempotency key/body with fresh transport timestamp/nonce/signature;
- exact per-client `allowedOperations` means endpoint existence is not bot authorization;
- previous context saying Aura/wallet HTTP paths were unverified is obsolete.

### Unresolved contract/security issues

- bot credential operation scope remains unverified;
- exact DTOs must be read before implementing new typed client methods;
- authoritative full contract says external identity is lookup-only while quickstart mutation examples use `external_identity`; mutation selector support requires route/source verification;
- ADR-0004 requires backend-authoritative preview/confirm or equivalent confirmation state, while supplied Aura/wallet docs expose direct execute endpoints and no dedicated adjustment preview endpoint.

### Scope and safety

No production bot code, Discord state, website source, API credential, Supabase state or mutation was changed.

### Verdict

`COMPLETE` for repository documentation re-baseline; implementation readiness remains gated by the unresolved items above.

---

## 2026-08-17 — TASK-CM-ADMIN-001 — Private user/order admin console candidate

### Branch and scope

Implemented only on `task/cm-admin-console`; production `master` was not changed. `/cm` was not registered/deployed and no live Internal API mutation was executed.

### Verified dependency facts

Website source was inspected read-only at commit `20f6cb52344bade858099febcec2d1c59312f2e5` before adding strict DTOs. It verifies: user overview returns at most 10 recent orders; order details and fulfillment diagnostics DTOs; canonical refund preview/execute; no manual-fulfillment mutation operation; and Aura/wallet adjustment request schemas use `userLookupSelectorSchema`, resolving the earlier selector-document discrepancy.

### Candidate implementation

- `/cm user email:<email>` ephemeral Components V2 admin console;
- exact guild/admin-channel/explicit-user-ID-whitelist checks on command/buttons/modals;
- operator-bound expiring component sessions;
- user overview, latest-ten order paging, order detail and fulfillment diagnostics;
- order-to-user navigation;
- refund reason -> canonical preview -> explicit confirmation -> fresh re-preview -> idempotent execute -> backend/Discord audit;
- blocked Aura/wallet/manual-fulfillment controls rather than unsafe shortcuts;
- typed API client restricted to the required read/refund operations;
- focused tests and Node 22 CI workflow.

Static review further hardened refund replay by freezing stable Discord provider/user-ID audit context in the proposal so a later username/display-name change cannot change the request body under the same idempotency key.

### Verification result

GitHub Actions did not start a runner because the account reported recent payment failure or spending-limit status; zero workflow steps executed. Local TypeScript syntax transpilation reported zero syntax diagnostics and focused scans found no real secrets, direct DB path or Aura/wallet/purchase-processing execute path. These checks do not replace dependency-aware test/typecheck/build evidence.

### Verdict

`PARTIAL` pending executable `npm test`, `npm run typecheck`, `npm run build` and diff-check evidence plus subsequent review. No merge, API-scope provisioning, registration, deployment or live refund is authorized by this verdict.
