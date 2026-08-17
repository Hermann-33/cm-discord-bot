# Audit Log

## 2026-05-29 — Historical — Initial bot and leaderboard evolution

### Scope

Initial standalone bot implementation followed by leaderboard/channel-policy presentation changes.

### Evidence

Git history:

- `b3206c6` — initial Discord bot implementation.
- `31ca167` — leaderboard rendering update; Components V2 direction and Aura command channel-policy change.

### Verdict

Historical baseline. See `../legacy-parity.md` for exact parity evidence.

---

## 2026-08-11 — Historical — Legacy archive and Internal API rebuild

### Scope

Remove direct bot/database coupling from the active production architecture and preserve the old bot for audit/history.

### Evidence

- `6dfe75f` — archive legacy Discord bot.
- `d7a7f4e` — rebuild Discord bot on Internal Integrations API.
- root README documents no direct Supabase/Postgres access and dedicated read-only API permissions.
- production source uses `src/api/*` HMAC client.

### Verdict

`COMPLETE` for the read-only rebuild architecture represented by the repository.

---

## 2026-08-17 — DATA-AUDIT — Underlying Aura DB context

### Scope

Read-only verification of DB facts needed for future admin-command design.

### Findings

- Aura leaderboard/user read functions remain `SECURITY INVOKER`, `search_path=public`, and service-role-only among checked application roles.
- `admin_adjust_aura_balance(uuid, uuid, bigint, text)` exists as a service-role-only `SECURITY DEFINER` function.
- That function updates available Aura and writes Aura/admin audit records, but it does not supply the full Discord mutation control plane.

### Risk

Direct bot invocation of DB admin functions would reintroduce a broad trust boundary and bypass the desired backend/API authorization, idempotency, caps, confirmation, and audit design.

### Verdict

`COMPLETE` as read-only context verification. No DB mutation performed.

---

## 2026-08-17 — TASK-WF-001 — Repository governance system

### Scope

Install the repository-resident memory/governance workflow adapted from the supplied IntelliMaint model.

### Findings

- Repo already has a strong README, test suite, legacy archive, and detailed parity audit.
- No root `AGENTS.md` or full current-context/ADR/handoff system existed.
- Old conversation context contains historical direct-Supabase assumptions that are superseded by the current Internal API rebuild.
- Future user decisions require all commands to converge on guild-only slash commands and high-risk mutations to use explicit Discord user-ID whitelists.

### Fix

Added canonical context, workflow, decision, audit, history, handoff, and security-model documents. Current state, historical state, and future accepted decisions are explicitly separated.

### Verdict

`COMPLETE` for documentation/governance scope once committed to the repository. No bot runtime or external state change is part of this task.