# Current Architecture

Updated: 2026-08-17

## Runtime diagram

```text
Discord
  -> standalone CM Discord bot (Node.js 22+, TypeScript, discord.js)
  -> HMAC-authenticated HTTPS
  -> Cheater's Market Internal Integrations API
  -> website-owned business/data layer
  -> Supabase/Postgres and other website dependencies
```

The bot has no direct Supabase/Postgres access. This API boundary is the main architectural difference from the archived legacy bot.

Full current audit: `../audits/2026-08-17-full-codebase-audit.md`.

## Active runtime

- package: `cm-discord-bot` v2.0.0;
- Node.js contract: `>=22`;
- TypeScript source/CommonJS output;
- `discord.js` 14.27.0;
- Zod request/config/response validation;
- entry: `src/index.ts` -> `dist/index.js`;
- root `index.js` host shim requires `./dist/index.js`.

Audit note: dev `@types/node` is 25.x while the declared runtime minimum is Node 22. No current incompatible API use was found, but the type/runtime major should be aligned.

## Startup and lifecycle

`src/index.ts`:

1. loads/validates environment;
2. creates Discord client;
3. creates `InternalApiClient`;
4. creates leaderboard service/schedule;
5. installs SIGINT/SIGTERM one-shot handlers;
6. installs customer `MessageCreate` and admin `InteractionCreate` handlers;
7. logs in;
8. on first ClientReady, bootstraps or immediately refreshes leaderboard and starts schedule.

Current shutdown stops the timer and destroys Discord but does not drain a concurrent operation. Current work is read-only; revisit before mutation commands.

## Internal Integrations API boundary

Current bot source exposes only:

- `POST /api/internal/integrations/v1/aura/leaderboards`;
- `POST /api/internal/integrations/v1/aura/lookup`.

Current transport security properties:

- dedicated client/key/HMAC secret;
- HMAC-SHA256 canonical signing;
- fresh signed material per read retry;
- strict request and response schemas;
- origin-only HTTPS config;
- 1–15 second timeout;
- 64 KiB response cap;
- one transient transport/503 retry;
- stable error/status mapping;
- no trust of backend error text;
- no request body/credential logging in normal client behavior.

The bot must continue to use this boundary for future admin mutations. Direct bot-to-Supabase access is forbidden.

## Command architecture — current and accepted

ADR-0005 supersedes ADR-0003 where they conflict.

### Customer surface

`cm aura` is an intentional customer-facing message command.

Runtime guards:

- bot authors ignored;
- exact command trigger;
- exact configured guild;
- configured blocked channel rejected before backend lookup;
- sanitized output and safe allowed mentions.

It is not a `/aura` migration target under the current product policy.

### Admin/staff surface

`/refresh-leaderboard` is the current operational slash command:

- manually registered to configured guild;
- explicit runtime guild guard;
- exact command channel;
- `ManageGuild`/`Administrator` runtime check;
- ephemeral result.

Future admin mutation commands also remain slash commands and must satisfy ADR-0004.

### Discord intents

Current intents:

- `Guilds`;
- `GuildMessages`;
- `MessageContent`.

`GuildMessages` and privileged `MessageContent` are intentionally required while customer message commands such as `cm aura` exist. They are an accepted product/runtime tradeoff, not migration debt.

## Leaderboard architecture

One Components V2 message contains the lifetime and available top-10 Aura boards using API-provided ranks/privacy-aware display names, bot-side sanitization, fixed-width labels, medal suffixes, relative update timestamp and mention suppression.

Bootstrap creates one message then exits so the operator can persist its ID. Normal startup edits the configured message immediately, then schedules five-minute refreshes.

`LeaderboardService` owns a shared in-memory refresh lock. The schedule itself is not double-start guarded, but current `.once(ClientReady)` wiring prevents normal repeated start.

## Data ownership

Website/backend owns user/external identity resolution, Discord link/privacy state, Aura and wallet business state, orders/payments/deliveries/licenses, OAuth/Support-role state, authorization, integration operation allowlists and mutation idempotency/business logic.

Bot owns Discord interaction/presentation, local guards, signed transport to approved backend operations and sanitized Discord audit output once implemented.

## Backend mutation foundation — dependency state

Live DB contains website-owned internal integration execute primitives for:

```text
users.aura.adjust
users.wallet.adjust
```

They are service-role-only among checked application roles and implement persistent idempotency/request hash, bounded input, target validation, negative-balance protection and integration/operator audit metadata.

These are backend implementation facts, **not** bot API permissions.

Still unverified:

- HTTP mutation paths;
- preview lifecycle;
- bot credential operation scope;
- mutation selector contract;
- caps/expiry behavior;
- production HTTP smoke test.

## Future admin mutation architecture

```text
Discord admin slash command
  -> exact guild/admin channel
  -> explicit Discord user-ID whitelist
  -> optional secondary domain role
  -> input validation
  -> backend-authoritative preview/confirm/idempotency
  -> HMAC Internal Integrations API
  -> website-owned integration/business/DB transaction
  -> immutable backend audit
  -> sanitized Discord audit/result
```

Customer `cm aura` remains separate and read-only.

## Current engineering/governance gaps

- no repository CI/current-head test status;
- command registration loads full runtime config/HMAC secret;
- deployment host config is external to repo;
- branch-protection state unverified through current integration;
- generic logger is not universal credential/PII redaction;
- several low-severity lifecycle/test invariants are tracked in the full audit.

## Fragile boundaries

- HMAC canonicalization/signing;
- API retry/idempotency semantics;
- API credential scopes;
- customer/admin command-surface separation;
- guild/user/channel authorization ordering;
- mention suppression;
- Components V2 edit semantics;
- refresh overlap lock;
- future mutation preview/confirm state;
- wallet ledger/funding invariants;
- legacy/current separation.
