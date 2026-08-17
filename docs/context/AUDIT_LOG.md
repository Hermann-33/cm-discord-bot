# Audit Log

## 2026-05-29 — Historical — Initial bot and leaderboard evolution

### Scope

Initial standalone bot implementation followed by leaderboard/channel-policy presentation changes.

### Evidence

- `b3206c6` — initial Discord bot implementation.
- `31ca167` — Components V2/channel-policy update.

### Verdict

Historical baseline. See `../legacy-parity.md`.

---

## 2026-08-11 — Historical — Legacy archive and Internal API rebuild

### Scope

Remove direct bot/database coupling from the active production architecture and preserve the old bot for audit/history.

### Evidence

- `6dfe75f` — archive legacy Discord bot.
- `d7a7f4e` — rebuild Discord bot on Internal Integrations API.
- production source uses HMAC API client and no direct Supabase dependency.

### Verdict

`COMPLETE` for the read-only rebuild architecture represented by the repository.

---

## 2026-08-17 — DATA-AUDIT — Initial underlying Aura DB context

### Scope

Read-only verification of DB facts needed for future admin-command design.

### Findings

- Aura read functions remained service-role-only read functions.
- `admin_adjust_aura_balance` existed but lacked the full external integration control plane known at that time.

### Verdict

`COMPLETE` for the snapshot at that point. No DB mutation performed.

---

## 2026-08-17 — TASK-WF-001 — Repository governance system

### Scope

Install repository-resident context, workflow, decisions, audit, history, handoff and specialist admin-security documentation.

### Outcome

Repository context became authoritative over stale chat assumptions. Current, historical and planned behavior were separated.

### Verdict

`COMPLETE` for documentation/governance scope.

---

## 2026-08-17 — TASK-AUDIT-001 — Full codebase and dependency re-baseline

### Scope

Exhaustive audit of active bot source, all root tests/fixtures, package/build/env configuration, GitHub branch/PR/CI state, legacy isolation, documentation drift, and read-only live Supabase dependency metadata relevant to future bot work.

### Source coverage

Every active production TypeScript file and every test referenced by `npm test` was read in full. All checked-in fixtures were inspected. See `../audits/2026-08-17-full-codebase-audit.md` for the complete evidence matrix.

### Positive findings

- no direct Supabase/Postgres dependency in active bot;
- HMAC request signing and strict API DTO validation are real source controls;
- API response size/timeout/error/retry handling is bounded;
- server error text is not trusted;
- mention suppression and display-name sanitization are centralized/tested;
- Aura command performs guild/channel checks before API lookup;
- refresh slash command has an explicit runtime guild guard, correcting older documentation ambiguity;
- Components V2 leaderboard and overlap lock match accepted behavior;
- legacy is excluded and regression-tested;
- architecture tests enforce the two-read-operation data boundary.

### Material bot/process findings

- accepted slash-only architecture is incomplete because `cm aura` remains a Message Content command;
- no GitHub CI/status exists at current head, and fresh local test/typecheck/build/npm-audit execution was unavailable to this audit;
- command registration currently requires the complete runtime config including Internal API HMAC material;
- logger sanitization is safe for current client errors but is not a universal secret/PII redactor;
- Node type definitions are one major ahead of the minimum supported Node runtime;
- `.gitignore` does not ignore ZIP archives;
- smaller defensive/test gaps exist around registration route testing, helper failures, scheduler double start, graceful drain and service invariants.

### Backend drift discovered

Supabase migration `20260812104228 add_internal_integration_balance_adjustments` materially changes the mutation-readiness picture.

Verified service-role-only functions now exist:

- `internal_integration_adjust_aura_balance(...)`, operation `users.aura.adjust`;
- `internal_integration_adjust_wallet_balance(...)`, operation `users.wallet.adjust`.

Both provide persistent idempotency/request-hash protection, bounded input, target validation and audit integration. Wallet admin adjustment also writes a wallet transaction whose trigger routes funding-lot/consumption synchronization.

This does **not** prove HTTP bot mutation endpoints or bot credential permission exist.

### Upstream security finding

Supabase advisor still reports several unrelated privileged `SECURITY DEFINER` functions executable by anon/authenticated. The new integration adjustment functions themselves were verified not executable by anon/authenticated among checked roles.

Owner: website/database project.

### Verification limitation

No CI workflow runs/statuses exist for the audited head. The private checkout could not be executed in the audit environment. Therefore no fresh pass claim is made for:

- `npm test`;
- `npm run typecheck`;
- `npm run build`;
- `npm audit`.

### Verdict

`PARTIAL` for production-hardening readiness because execution gates and several accepted architecture/hardening tasks remain.

`COMPLETE` for the source/static/live-metadata audit itself. No runtime source, Discord state or database state was mutated.