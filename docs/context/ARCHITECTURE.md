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

## Active runtime

- Package: `cm-discord-bot` v2.0.0
- Node.js: 22+
- TypeScript: 6.x
- Module format: CommonJS
- Discord library: `discord.js` 14.27.0
- Validation: Zod
- Entry: `src/index.ts` -> compiled `dist/index.js`
- Host compatibility shim: root `index.js` requires `./dist/index.js`

## Startup and lifecycle

`src/index.ts`:

1. loads and validates environment;
2. creates Discord client;
3. creates `InternalApiClient`;
4. creates leaderboard service/schedule;
5. installs SIGINT/SIGTERM shutdown handlers;
6. on Discord ready, bootstraps or refreshes the leaderboard;
7. installs current message-command and slash-interaction handlers;
8. logs in using the Discord bot token.

Configuration failure and login/startup failures are sanitized and fail closed.

## Website API boundary

`src/api/` owns the HMAC-authenticated API client.

Current paths:

- `POST /api/internal/integrations/v1/aura/leaderboards`
- `POST /api/internal/integrations/v1/aura/lookup`

Security properties include:

- dedicated client/key/HMAC secret;
- signed method/path/timestamp/nonce/raw body;
- strict request/response Zod validation;
- origin-only HTTPS configuration;
- configurable 1–15 second timeout;
- 64 KiB response limit;
- one retry for transient network failure/503 behavior;
- stable mapped API errors;
- no response/body/secret logging.

## Discord command surfaces — current state

Current implementation:

- `cm aura` is an exact normalized message command. It is guild-scoped at runtime and silently blocked in one configured channel.
- `/refresh-leaderboard` is a manually registered guild slash command. It is constrained to the configured command channel and runtime `ManageGuild`/`Administrator` permission checks.

Accepted future policy is different: all commands should become slash commands and every command should have explicit runtime guild enforcement. See ADR-0003 and `COMMANDS.md`.

## Leaderboard architecture

The bot renders a single persistent Components V2 message containing:

- global Aura heading;
- lifetime top-10 board;
- available top-10 board;
- fixed-width inline-code rank/Aura labels;
- DB/API-provided privacy-aware display names, then bot-side sanitization;
- medal suffixes for top three;
- relative Discord update timestamp;
- mention suppression.

`LeaderboardService` fetches the read-only data and creates/edits the configured message. Bootstrap mode creates the message when no message ID is configured, logs the new ID safely, then exits so operators can persist the ID.

## Scheduler

The leaderboard refreshes immediately at normal startup and then every five minutes. Startup, scheduled, and manual refresh use one in-memory overlap guard so concurrent refreshes do not race.

SIGINT/SIGTERM shutdown clears scheduling and destroys the Discord client.

## Data ownership

The website/backend owns:

- user/account identity resolution;
- Discord link state;
- Aura calculation and balances;
- wallet balances/ledger/funding lots;
- orders/payments/deliveries/licenses;
- OAuth and Support-role state;
- data authorization and mutation rules.

The bot owns only Discord interaction, presentation, local validation, and transport to approved backend operations.

## Legacy archive

`legacy/` is a frozen archive of the pre-rebuild bot. Production builds/tests must not import it. `docs/legacy-parity.md` is historical evidence and parity reference, not active architecture.

## Future admin mutation architecture

Accepted direction:

```text
Discord slash command
  -> guild/channel/user-ID authorization in bot
  -> preview/confirm workflow
  -> dedicated signed Internal Integrations API mutation operation
  -> website-side validation/idempotency/caps/audit
  -> transactional business/ledger mutation
  -> sanitized response and Discord audit log
```

Direct bot calls to database mutation functions are forbidden.

## Fragile boundaries

- HMAC canonicalization/signing
- API error/status contract
- API credential scopes
- mention suppression
- command authorization ordering
- persistent Components V2 message edit semantics
- scheduler overlap lock
- wallet ledger/funding-lot invariants in future backend work
- legacy/current code separation