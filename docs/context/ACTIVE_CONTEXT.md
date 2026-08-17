# Active Context

Updated: 2026-08-17

## Current audited state

The production bot is the v2 Internal Integrations API rebuild on `master`. The pre-rebuild bot is frozen under `legacy/`.

Latest full re-baseline audit: `../audits/2026-08-17-full-codebase-audit.md`.

Audit starting head: `b86acf5a6e27ec69b187a2bacf94773faef81500`.

The current bot remains **read-only** against Cheater's Market data and contains no Supabase/Postgres credential or direct database client.

## Current implemented command/runtime surfaces

- `cm aura` — message command, exact configured guild, blocked in one configured channel.
- `/refresh-leaderboard` — guild slash command with explicit runtime guild check, exact command channel and `ManageGuild|Administrator` runtime permission.
- one persistent Components V2 Aura leaderboard message.
- bootstrap creation when no message ID is configured.
- immediate startup refresh plus five-minute schedule.
- shared in-memory overlap lock for scheduled/manual refresh.

## Accepted command direction

ADR-0003 remains authoritative:

- all command surfaces must converge on guild-only slash commands;
- `cm aura` is migration debt and should become `/aura`;
- after message-command removal, `MessageContent`/`GuildMessages` intents should be removed if nothing else requires them.

ADR-0004 remains authoritative for mutations:

- explicit whitelisted Discord user IDs are mandatory;
- guild and admin-channel checks are mandatory;
- roles are optional secondary gates only;
- direct database mutation from the bot is forbidden.

## Current data/API posture

Bot production source calls only:

- `POST /api/internal/integrations/v1/aura/leaderboards`;
- `POST /api/internal/integrations/v1/aura/lookup`.

The current bot credential is still documented as read-only. No mutation client or command exists in this repo.

## Material backend changes discovered by the audit

Live Supabase now includes migration:

`20260812104228 add_internal_integration_balance_adjustments`

Verified upstream execute primitives now exist for both:

- `users.aura.adjust`;
- `users.wallet.adjust`.

The corresponding DB functions are service-role-only, idempotent/request-hash protected, audited, bounded and reject negative resulting balances. Wallet admin adjustment writes a wallet transaction, and the wallet transaction funding-state trigger routes positive/negative transactions into funding-lot/consumption synchronization.

This means the old statement “balance adjustment backend work does not exist” is obsolete.

### What is still unverified

The audit did **not** inspect the website source or make an authenticated production HTTP mutation call. Therefore the following must still be verified separately before bot mutation implementation:

- exact HTTP mutation paths;
- whether preview operations exist;
- operation allowlist/scopes;
- whether the bot-dedicated credential is allowed to mutate;
- target selector contract;
- cap/preview/expiry semantics at the HTTP/business layer.

Do not infer HTTP availability from DB functions.

## Audit findings that affect next work

No critical/high issue was found in active bot source.

Material bot/process findings:

1. `cm aura` still violates the accepted slash-only end state and keeps privileged Message Content intent alive.
2. No GitHub CI/workflow/current-head test status exists; fresh test/typecheck/build/npm-audit execution was not available in this audit environment.
3. command registration currently requires full runtime config including Internal API HMAC material.
4. generic logger error sanitization is safe for current API errors but is not universal secret/PII pattern redaction.
5. `@types/node` 25.x is newer than the minimum Node 22 runtime contract.
6. `.gitignore` does not ignore ZIP archives; prior local checkout had an untracked `CM DC Bot.zip`.
7. several small defensive/test gaps are listed in the full audit.

External dependency warning:

Supabase advisor still reports several unrelated publicly/signed-in executable `SECURITY DEFINER` functions in the website DB. The new balance-adjustment integration functions themselves are not exposed to anon/authenticated among checked roles. See `DATA_STATUS.md`.

## Verification state

Source/static review: complete.

Live DB metadata verification: complete for the bot-relevant dependency facts documented in `DATA_STATUS.md`.

Fresh local execution during this audit: **not available**.

No CI result exists on the audited head, so these remain unverified for this audit:

- `npm test`;
- `npm run typecheck`;
- `npm run build`;
- `npm audit`.

## Do-not-touch boundaries

- website source unless separately scoped;
- direct Supabase/Postgres access from bot;
- `legacy/` history;
- real environment values/secrets;
- mutation execution before HTTP/API authorization and bot whitelist controls are verified.

## Exact next engineering gate

1. add/restore an executable verification gate (prefer repository CI);
2. migrate `cm aura` to guild-only `/aura` and remove unneeded message intents;
3. implement reusable admin user-ID whitelist + admin-channel authorization with tests, still no mutation;
4. separately verify the website Internal Integrations HTTP contract and operation scope for `users.aura.adjust`;
5. only then implement Aura preview/confirm client/commands;
6. prove Aura path before enabling wallet commands.