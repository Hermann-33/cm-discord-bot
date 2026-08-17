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

Live DB now contains service-role-only internal integration adjustment functions for `users.aura.adjust` and `users.wallet.adjust` with persistent idempotency/request-hash protection and audit integration. This does not prove bot-facing HTTP mutation endpoints/permission exist.

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
