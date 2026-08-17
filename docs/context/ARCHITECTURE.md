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

Audit note: dev `@types/node` is 25.x while the declared runtime minimum is Node 22.

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

Current shutdown stops the timer and destroys Discord but does not drain a concurrent operation. Revisit before mutation commands.

## Internal Integrations API boundary

Current bot source exposes only:

- `POST /api/internal/integrations/v1/aura/leaderboards`;
- `POST /api/internal/integrations/v1/aura/lookup`.

Current transport security properties:

- dedicated client/key/HMAC secret;
- HMAC-SHA256 eight-line canonical signing;
- exact raw UTF-8 JSON body bytes signed;
- fresh timestamp/nonce/signature per HTTP attempt;
- strict request and response schemas;
- origin-only HTTPS config;
- 1–15 second timeout;
- 64 KiB bot-side response cap;
- one transient transport/503 retry for current reads;
- stable error/status mapping;
- no trust of backend error text;
- no request body/credential logging in normal client behavior.

Authoritative backend documentation confirms additional production operations, including:

- `users.lookup.read`;
- `users.overview.read`;
- `orders.lookup.read`;
- `orders.details.read`;
- `orders.fulfillment.read`;
- `purchase-intents.lookup.read`;
- `purchase-intents.process`;
- `purchase-intents.process.status.read`;
- `orders.refund.preview`;
- `orders.refund.execute`;
- `users.wallet.adjust`;
- `users.aura.adjust`.

Each integration client is authorized by an exact non-wildcard operation allowlist. The existence of a production operation is not permission for this bot to call it.

For mutation retries, transport nonce/timestamp/signature must be fresh per HTTP attempt while the logical mutation `idempotencyKey` and exact request body remain stable.

## Command architecture — current and accepted

ADR-0005 supersedes ADR-0003 where they conflict.

### Customer surface

`cm aura` is an intentional customer-facing message command with bot-author, exact-guild, blocked-channel, sanitization and safe-mention guards. It is not a `/aura` migration target under the current policy.

### Admin/staff surface

`/refresh-leaderboard` is the current operational slash command with manual guild registration, explicit runtime guild guard, exact command channel, `ManageGuild`/`Administrator` runtime permission and ephemeral results.

Future admin mutation commands remain slash commands and must satisfy ADR-0004.

### Discord intents

Current intents are `Guilds`, `GuildMessages`, and `MessageContent`. The latter two are intentional while customer message commands exist.

## Leaderboard architecture

One Components V2 message contains lifetime and available top-10 Aura boards using API-provided ranks/privacy-aware display names, bot-side sanitization, fixed-width labels, medal suffixes, relative update timestamp and mention suppression.

Bootstrap creates one message then exits so the operator can persist its ID. Normal startup edits the configured message immediately, then schedules five-minute refreshes.

`LeaderboardService` owns a shared in-memory refresh lock.

## Data ownership

Website/backend owns user/external identity resolution, Discord link/privacy state, Aura and wallet business state, orders/payments/deliveries/licenses, OAuth/Support-role state, authorization, integration operation allowlists and mutation idempotency/business logic.

Bot owns Discord interaction/presentation, local authorization guards, signed transport to explicitly approved backend operations and sanitized Discord audit output once implemented.

## Backend mutation dependency state

Live DB contains website-owned internal integration execute primitives for `users.aura.adjust` and `users.wallet.adjust` with service-role-only execution, persistent idempotency/request hash, bounded input, target validation, negative-balance protection and integration/operator audit metadata.

Authoritative backend contract documentation now also confirms the production HTTP execute paths:

```text
POST /api/internal/integrations/v1/users/aura/adjust
POST /api/internal/integrations/v1/users/wallet/adjust
```

Documented request fundamentals:

- user selector;
- non-zero bounded signed delta (`deltaAura` or `deltaCents`);
- reason 1–500 characters;
- UUID `idempotencyKey`;
- optional strict Discord operator audit context.

Still unresolved before bot mutation integration:

- this bot client's exact operation allowlist/scope;
- exact strict request/response DTOs from the actual route contract/source;
- mutation selector discrepancy between the authoritative full contract and quickstart examples;
- ADR-0004 backend-authoritative preview/confirm requirement versus the documented direct execute endpoints;
- controlled authenticated smoke verification.

## Future admin mutation architecture

```text
Discord admin slash command
  -> exact guild/admin channel
  -> explicit Discord user-ID whitelist
  -> optional secondary domain role
  -> input validation
  -> ADR-0004-compatible backend confirmation/idempotency
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
- several low-severity lifecycle/test invariants remain.

## Fragile boundaries

- HMAC canonicalization/signing;
- API retry/idempotency semantics;
- API credential scopes;
- strict endpoint DTOs/selectors;
- customer/admin command-surface separation;
- guild/user/channel authorization ordering;
- mention suppression;
- Components V2 edit semantics;
- refresh overlap lock;
- mutation confirmation state;
- wallet ledger/funding invariants;
- legacy/current separation.
