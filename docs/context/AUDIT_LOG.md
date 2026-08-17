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
- architecture tests enforce the two-read-operation API boundary at that historical point.

### Material findings

- no GitHub CI/status existed at audited head, and fresh local test/typecheck/build/npm-audit execution was unavailable;
- command registration required complete runtime config including Internal API HMAC material;
- logger sanitization was not universal secret/PII redaction;
- Node type definitions were newer than minimum runtime;
- `.gitignore` did not ignore ZIP archives;
- smaller defensive/test gaps remained.

### Backend drift discovered

Live DB contained service-role-only internal integration adjustment functions for `users.aura.adjust` and `users.wallet.adjust` with persistent idempotency/request-hash protection and audit integration. This did not, by itself, prove bot-facing HTTP mutation endpoints/permission existed.

### Historical audit conclusion later superseded

At audit time, ADR-0003 classified `cm aura` as slash-migration debt. That conclusion is superseded by ADR-0005, which intentionally keeps `cm aura` as a customer message command and reserves slash commands for staff/admin operations.

Verdict: `COMPLETE` for source/static/live-metadata audit; `PARTIAL` for production-hardening readiness because execution gates remained.

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

- production operation catalog is broader than the bot initially consumed;
- `users.aura.adjust` is contract-documented at `POST /api/internal/integrations/v1/users/aura/adjust`;
- `users.wallet.adjust` is contract-documented at `POST /api/internal/integrations/v1/users/wallet/adjust`;
- mutation retries require stable business idempotency key/body with fresh transport timestamp/nonce/signature;
- exact per-client `allowedOperations` means endpoint existence is not bot authorization;
- previous context saying Aura/wallet HTTP paths were unverified became obsolete.

### Unresolved contract/security issues at that point

- bot credential operation scope remained unverified;
- exact DTOs needed verification before new typed client methods;
- selector prose conflicted with quickstart examples;
- ADR-0004 required backend-authoritative preview/confirm or equivalent confirmation state, while supplied Aura/wallet docs exposed direct execute endpoints and no dedicated adjustment preview endpoint.

### Scope and safety

No production bot code, Discord state, website source, API credential, Supabase state or mutation was changed.

### Verdict

`COMPLETE` for repository documentation re-baseline; implementation readiness remained gated by unresolved items above.

---

## 2026-08-17 — TASK-CM-ADMIN-001 — Private user/order admin console

### Initial implementation branch

Implemented first on `task/cm-admin-console` without registering/deploying `/cm` or performing a live Internal API mutation.

### Verified dependency facts

Website source was inspected read-only at commit `20f6cb52344bade858099febcec2d1c59312f2e5` before adding strict DTOs. It verified: user overview returns at most ten recent orders; order details and fulfillment diagnostics DTOs; canonical refund preview/execute; no manual-fulfillment mutation operation; and Aura/wallet adjustment request schemas use `userLookupSelectorSchema`.

### Implementation

- `/cm user email:<email>` ephemeral Components V2 admin console;
- configured guild/admin-channel/explicit-user-ID-whitelist checks on command/buttons/modals under the then-current ADR-0004 policy;
- operator-bound expiring component sessions;
- user overview, latest-ten order paging, order detail and fulfillment diagnostics;
- order-to-user navigation;
- refund reason -> canonical preview -> explicit confirmation -> fresh re-preview -> idempotent execute -> backend/Discord audit;
- blocked Aura/wallet/manual-fulfillment controls rather than unsafe shortcuts;
- typed API client restricted to required read/refund operations;
- focused tests and Node 22 CI workflow.

Refund replay was hardened by freezing stable Discord provider/user-ID audit context so a later username/display-name change cannot change request body under the same idempotency key.

### Verification and merge completion

GitHub Actions could not start because of account billing/spending-limit state, so the branch was verified in a local Node environment. A small test-only typing fix was committed at `47a28323fdc2c2d18d1edc3f9952f0d817f481f1`.

Final local gates before merge:

- `npm ci` passed;
- `npm test` passed 104/104;
- `npm run typecheck` passed;
- `npm run build` passed;
- `git diff --check` passed;
- focused security scans passed.

The feature branch was pushed, `master` fast-forwarded to `47a28323fdc2c2d18d1edc3f9952f0d817f481f1`, and `origin/master` matched. No deployment, command registration, bot startup, environment modification, website change, production API call or refund occurred.

### Verdict

`COMPLETE` for repository implementation/merge. Operational provisioning, registration, deployment and controlled live testing remain separate gates.

---

## 2026-08-17 — TASK-CM-ADMIN-002 — Guild-wide `/cm` channel policy

### Decision

Product owner chose to allow explicitly whitelisted `/cm` administrators to use the private admin console from any channel in the configured Cheater's Market guild.

This conflicts with ADR-0004's original mandatory admin-command-channel requirement, so ADR-0006 was added rather than rewriting historical ADR-0004. ADR-0006 supersedes only that channel requirement and keeps the configured-guild restriction, explicit user-ID whitelist, per-interaction reauthorization, confirmation/idempotency, backend authorization and audit controls.

### Feature-branch implementation

Branch:

```text
task/cm-admin-guild-scope
```

Changes drafted through the GitHub connector:

- remove `BOT_ADMIN_COMMAND_CHANNEL_ID` from config and `.env.example`;
- remove channel matching from shared `/cm` admin authorization;
- keep exact guild + mandatory explicit user whitelist;
- explicitly test successful `/cm` authorization/backend lookup from another guild channel;
- keep wrong-guild/DM/non-whitelisted/missing-whitelist failures;
- prevent active-source/environment reintroduction of the removed admin-channel variable;
- preserve `/refresh-leaderboard` channel checks;
- preserve refund audit-channel requirement;
- update current governance/security/context documentation.

### Verification state

Executable Node test/typecheck/build/diff checks have not yet been run for TASK-CM-ADMIN-002 in this connector environment.

### Verdict

`PARTIAL` pending clean local/CI verification and merge. No deployment, command registration, environment modification, website change or production API mutation is part of this implementation step.
