# Latest Handoff

Updated: 2026-08-17

## Latest product clarification

ADR-0005 is now authoritative and supersedes ADR-0003 where they conflict.

Command UX is audience-specific:

- customer/self-service commands use message/text commands;
- staff/admin operations use slash commands.

`cm aura` is specifically a customer command and should remain message-based. It is not a `/aura` migration target under the current product policy.

## Main current architecture

The principal difference from the legacy bot is the data boundary:

```text
OLD
Discord bot -> Supabase/Postgres directly

CURRENT
Discord bot -> HMAC Internal Integrations API -> website business/data layer -> Supabase/Postgres
```

The active bot must not regain direct Supabase/Postgres access.

## Current bot truth

- production bot has no direct DB access;
- API client exposes only leaderboard and Aura lookup reads;
- `cm aura` is the customer message command;
- `/refresh-leaderboard` is a staff/admin guild slash command with explicit runtime guild/channel/permission checks;
- `MessageContent`/`GuildMessages` are intentionally required by the customer message command;
- safe allowed mentions are centralized;
- leaderboard is Components V2;
- scheduled/manual refreshes share one overlap lock;
- legacy is isolated.

## Backend truth discovered in full audit

Live DB has purpose-built integration execute functions for Aura and wallet balance adjustments with service-role-only execution, idempotency/request-hash protection, validation, negative-balance protection and audit integration.

This does not prove the bot has an HTTP mutation contract or permission.

Still requires separate website/API verification:

- exact HTTP mutation paths;
- preview/confirm contract;
- operation allowlist/scopes;
- bot credential mutation permission;
- selector/target resolution;
- cap/expiry/state-binding rules;
- authenticated HTTP smoke test.

## Verification limitation

The full static/live-metadata audit is complete, but fresh `npm test`, `npm run typecheck`, `npm run build` and `npm audit` still need executable evidence/CI.

## Exact next engineering action

1. add CI or otherwise execute/record test + typecheck + build on current head;
2. preserve `cm aura` as customer message command and protect its current guard/API behavior;
3. establish a clean dispatcher for admin slash commands;
4. implement reusable admin authorization requiring explicit Discord user-ID whitelist + guild + admin channel, with tests and no mutation yet;
5. separately verify the website Internal Integrations API contract/scope for `users.aura.adjust`;
6. implement Aura admin preview/confirm slash flow using stable idempotency;
7. prove Aura on a controlled test account;
8. only then proceed to wallet admin slash integration.

## Do-not-touch boundaries

- no direct Supabase/Postgres client in bot;
- no direct calls from bot to DB admin/internal functions;
- no customer `cm aura` slash migration without a new explicit product decision;
- no admin message/prefix mutations;
- no wallet admin command before Aura admin path is proven;
- no role-only mutation authorization;
- no global or DM mutation commands;
- no `legacy/` edits during active feature work;
- no real secret values in repo/docs/logs.
