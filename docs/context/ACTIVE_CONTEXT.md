# Active Context

Updated: 2026-08-17

## Current audited state

The production bot is the v2 Internal Integrations API rebuild on `master`. The pre-rebuild bot is frozen under `legacy/`.

Latest full re-baseline audit: `../audits/2026-08-17-full-codebase-audit.md`.

The current bot remains **read-only** against Cheater's Market data and contains no Supabase/Postgres credential or direct database client.

## Main architectural difference from the legacy bot

The legacy design accessed Supabase directly from the bot. The current design does not.

Current path:

```text
Discord command
  -> standalone CM Discord bot
  -> HMAC-authenticated Cheater's Market Internal Integrations API
  -> website-owned business/data layer
  -> Supabase/Postgres
```

This API boundary is the principal architectural change and is mandatory for both customer and admin features.

## Current implemented command/runtime surfaces

- `cm aura` — **customer-facing message command**, exact configured guild, blocked in one configured channel.
- `/refresh-leaderboard` — **staff/admin operational slash command** with explicit runtime guild check, exact command channel and `ManageGuild|Administrator` permission.
- one persistent Components V2 Aura leaderboard message;
- bootstrap creation when no message ID is configured;
- immediate startup refresh plus five-minute schedule;
- shared in-memory overlap lock for scheduled/manual refresh.

## Accepted command policy

ADR-0005 supersedes ADR-0003 where they conflict.

Current product rule:

- customer/self-service commands may use message/text commands;
- `cm aura` should remain a customer message command and is not migration debt;
- slash commands are reserved for staff/admin operational and mutation surfaces;
- admin slash commands remain configured-guild-only at registration and runtime;
- DMs fail closed for admin slash commands;
- high-impact mutation commands additionally require ADR-0004 whitelist/channel/confirmation controls.

Because `cm aura` intentionally remains a message command, `GuildMessages` and privileged `MessageContent` intents are intentional current requirements, not defects to remove unless the product policy changes.

## Current data/API posture

Bot production source calls only:

- `POST /api/internal/integrations/v1/aura/leaderboards`;
- `POST /api/internal/integrations/v1/aura/lookup`.

The current bot credential is still documented as read-only. No mutation client or mutation command exists in this repo.

## Material backend changes discovered by the audit

Live Supabase now includes migration `20260812104228 add_internal_integration_balance_adjustments`.

Verified upstream execute primitives now exist for:

- `users.aura.adjust`;
- `users.wallet.adjust`.

The corresponding DB functions are service-role-only, idempotent/request-hash protected, audited, bounded and reject negative resulting balances. Wallet admin adjustment writes a wallet transaction and participates in the wallet funding-state synchronization path.

These DB primitives do **not** authorize the bot to mutate directly.

### Still unverified

Before bot mutation work, separately verify the website Internal Integrations API for:

- exact HTTP mutation paths;
- preview/confirm lifecycle;
- operation allowlist/scopes;
- bot credential mutation permission;
- target selector contract;
- cap/expiry/state-binding semantics.

Do not infer HTTP availability from DB functions.

## Audit findings that still affect next work

No critical/high issue was found in active bot source.

Material bot/process findings:

1. no GitHub CI/workflow/current-head test status exists; fresh test/typecheck/build/npm-audit execution was unavailable in the audit environment;
2. command registration currently requires full runtime config including Internal API HMAC material;
3. generic logger error sanitization is safe for current API errors but is not universal secret/PII pattern redaction;
4. `@types/node` 25.x is newer than the minimum Node 22 runtime contract;
5. `.gitignore` does not ignore ZIP archives; prior local checkout had an untracked `CM DC Bot.zip`;
6. several small defensive/test gaps are listed in the full audit.

The earlier audit finding that `cm aura` violates a slash-only end state is superseded by ADR-0005 and must not be treated as current technical debt.

## Do-not-touch boundaries

- website source unless separately scoped;
- direct Supabase/Postgres access from bot;
- customer/admin command-surface separation without an explicit product decision;
- `legacy/` history;
- real environment values/secrets;
- mutation execution before HTTP/API authorization and bot whitelist controls are verified.

## Exact next engineering gate

1. add/restore an executable verification gate, preferably CI;
2. preserve and test `cm aura` as the customer message command;
3. implement reusable admin user-ID whitelist + admin-channel authorization for future slash admin commands, still with no mutation;
4. separately verify the website Internal Integrations HTTP contract and operation scope for `users.aura.adjust`;
5. only then implement Aura admin preview/confirm slash commands;
6. prove Aura admin mutation path before enabling wallet admin commands.
