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

The bot has no direct Supabase/Postgres access.

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
6. installs MessageCreate and InteractionCreate handlers;
7. logs in;
8. on first ClientReady, bootstraps or immediately refreshes leaderboard and starts schedule.

Config/login/startup failures are sanitized and fail closed.

Current shutdown stops the timer and destroys Discord but does not drain a concurrent operation. Current work is read-only; revisit before mutation commands.

## Internal Integrations API boundary

Current bot source exposes only:

- `POST /api/internal/integrations/v1/aura/leaderboards`;
- `POST /api/internal/integrations/v1/aura/lookup`.

Current transport security properties:

- dedicated client/key/HMAC secret;
- HMAC-SHA256 over version/client/key/timestamp/nonce/method/path/body hash;
- fresh signed material per read retry;
- strict request and response schemas;
- origin-only HTTPS config;
- 1–15 second timeout;
- 64 KiB response cap;
- one transient transport/503 retry;
- stable error/status mapping;
- no trust of backend error text;
- no request body/credential logging in normal client behavior.

Future mutation calls must carry stable logical idempotency across retries; do not simply copy the read-call retry abstraction without mutation semantics.

## Discord command architecture — current

### Message surface

`cm aura` remains an exact normalized message command.

Runtime guards:

- bot author ignored;
- exact configured guild;
- configured blocked channel rejected before backend lookup.

It is safe under current behavior but conflicts with ADR-0003's accepted slash-only destination and keeps privileged Message Content intent required.

### Slash surface

`/refresh-leaderboard`:

- manual guild registration only;
- registration is a guild bulk overwrite;
- explicit runtime guild guard already present;
- exact command channel;
- ManageGuild/Administrator runtime check;
- ephemeral result.

`InteractionCreate` is currently hardwired to that handler. Add a clean registry/dispatch model before multiple admin slash commands make this composition unwieldy.

## Discord intents and messages

Current intents:

- Guilds;
- GuildMessages;
- MessageContent.

After `/aura` migration, remove message intents if no feature still requires them.

Mention suppression is centralized in `src/discord/safeMessages.ts` and is also used by Aura output.

## Leaderboard architecture

One Components V2 message contains:

- global Aura heading;
- lifetime top 10;
- available top 10;
- API-provided ranks;
- fixed-width rank/Aura labels;
- privacy-aware API display name, then bot sanitization;
- top-three medal suffixes;
- relative update timestamp;
- mention suppression.

Bootstrap creates one message then exits so the operator can persist its ID. Normal startup edits the configured message immediately, then schedules five-minute refreshes.

`LeaderboardService` owns a shared in-memory refresh lock. The schedule itself is not double-start guarded, but current `.once(ClientReady)` wiring prevents normal repeated start.

## Data ownership

Website/backend owns:

- user and external-identity resolution;
- Discord link/privacy state;
- Aura calculation/ledger/balance;
- wallet ledger/balance/funding state;
- orders/payments/deliveries/licenses;
- OAuth and Support-role state;
- data authorization;
- integration operation allowlists;
- mutation idempotency/business logic.

Bot owns:

- Discord interaction;
- presentation;
- local guard/validation;
- signed transport to explicitly approved backend operations;
- sanitized Discord audit output once implemented.

## Backend mutation foundation — current dependency state

Live DB now contains website-owned internal integration execute primitives:

```text
users.aura.adjust
users.wallet.adjust
```

They are service-role-only among checked application roles and implement persistent idempotency/request hash, bounded input, target validation, negative-balance protection and integration/operator audit metadata.

Wallet adjustment writes a wallet transaction, and the website wallet transaction trigger synchronizes funding lot/consumption state.

These are backend implementation facts, **not** bot API permissions.

Still unverified at this architecture layer:

- HTTP mutation paths;
- preview lifecycle;
- bot credential operation scope;
- mutation selector contract;
- caps/expiry behavior;
- production HTTP smoke test.

## Future admin mutation architecture

Accepted direction remains:

```text
Discord guild slash command
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

Direct bot calls to database mutation functions remain forbidden.

## Legacy archive

`legacy/` is frozen pre-rebuild evidence. Production build/typecheck excludes it and architecture tests prohibit active imports.

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
- API error/status contract;
- API credential scopes;
- guild/user/channel authorization ordering;
- mention suppression;
- Components V2 edit semantics;
- refresh overlap lock;
- future mutation preview/confirm state;
- wallet ledger/funding invariants;
- legacy/current separation.