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

Exhaustive audit of active bot source, tests/config/GitHub state, legacy isolation and relevant live Supabase dependency metadata.

Material results:

- no direct Supabase/Postgres dependency in active bot;
- current HMAC signing/validation/mention-safety/guild guards are real controls;
- no CI/current-head executable verification evidence;
- command registration requires full runtime/HMAC config;
- generic logger redaction and several lifecycle/test gaps remain;
- live DB contains service-role-only `users.aura.adjust` and `users.wallet.adjust` execute primitives with persistent idempotency/audit foundations.

The audit's original all-slash conclusion for `cm aura` was later superseded by ADR-0005.

Verdict: `COMPLETE` for source/static/live-metadata audit; `PARTIAL` for production-hardening readiness because execution gates remain.

---

## 2026-08-17 — TASK-POLICY-001 — Customer vs admin command-surface correction

Product owner clarified that `cm aura` is customer-facing while slash commands are intended for admins/staff.

Governance action:

- added ADR-0005, superseding conflicting parts of ADR-0003;
- retained `cm aura` as intentional message command;
- retained Message Content/GuildMessages while required;
- kept admin/staff operational and mutation commands slash-only/guild-only.

Verdict: `COMPLETE` for policy/documentation correction. No runtime code, Discord state or database state changed.

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

Verdict: `COMPLETE` for repository documentation re-baseline; implementation readiness remains gated by the unresolved items above.
