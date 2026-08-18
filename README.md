# Cheater's Market Discord bot

Standalone Node.js/TypeScript Discord bot for Cheater's Market.

Current command surfaces include:

- customer message command `cm aura`;
- staff operational slash command `/refresh-leaderboard`;
- private admin `/cm user email:<email>`;
- private admin `/cm order reference:<CM-public-ref-or-order-UUID>` on `TASK-CM-ADMIN-003`;
- private `/cm` Aura, wallet and refund controls.

## Architecture and data boundary

```text
Discord
  -> CM Discord bot
  -> HMAC-authenticated HTTPS
  -> Cheater's Market Internal Integrations API
  -> website-owned business/database layer
```

The bot has no direct Supabase/Postgres access, database credential, service-role credential or database fallback.

`TASK-CM-ADMIN-003` source uses only these Internal Integrations API operations:

```text
aura.leaderboards.read
aura.lookup.read
users.overview.read
orders.details.read
orders.fulfillment.read
orders.refund.preview
orders.refund.execute
users.aura.adjust
users.wallet.adjust
```

Backend per-client `allowedOperations` remains an independent deployment authorization boundary. Never reuse a database/service-role credential in the bot and never commit HMAC secrets.

Manual fulfillment is **not** implemented: the current API exposes fulfillment diagnostics only and no manual-fulfillment mutation operation.

## Requirements

- Node.js 22+
- Discord application/bot
- privileged Message Content intent enabled while `cm aura` remains message-based
- bot-dedicated Internal Integrations API client/key

Install:

```powershell
npm ci
Copy-Item .env.example .env
```

## Environment variables

```text
DISCORD_BOT_TOKEN
DISCORD_CLIENT_ID
DISCORD_GUILD_ID
DISCORD_LEADERBOARD_CHANNEL_ID
DISCORD_COMMAND_CHANNEL_ID
DISCORD_AURA_COMMAND_BLOCKED_CHANNEL_ID
DISCORD_LEADERBOARD_MESSAGE_ID

BOT_ADMIN_USER_IDS
BOT_AUDIT_LOG_CHANNEL_ID

CM_INTERNAL_INTEGRATIONS_API_ORIGIN
CM_INTERNAL_INTEGRATIONS_API_CLIENT_ID
CM_INTERNAL_INTEGRATIONS_API_KEY_ID
CM_INTERNAL_INTEGRATIONS_API_HMAC_SECRET_BASE64
CM_INTERNAL_INTEGRATIONS_API_TIMEOUT_MS
```

Notes:

- `DISCORD_LEADERBOARD_MESSAGE_ID` is optional for initial bootstrap.
- `BOT_ADMIN_USER_IDS` may be absent for non-admin startup, but `/cm` fails closed when the list is empty.
- `BOT_AUDIT_LOG_CHANNEL_ID` is required before refund/Aura/wallet mutation execution.
- `BOT_ADMIN_COMMAND_CHANNEL_ID` is not supported.
- the API origin must be origin-only HTTPS.
- HMAC secret must be canonical standard Base64 and decode to at least 32 bytes.

## `/cm` authorization

Shared `/cm` authorization is:

1. guild interaction only;
2. exact `DISCORD_GUILD_ID`;
3. non-empty `BOT_ADMIN_USER_IDS`;
4. invoking Discord user ID explicitly allowlisted;
5. every button/modal reauthorizes.

A whitelisted admin may use `/cm` from any channel in the configured guild. DMs and wrong guilds fail closed. Ephemeral output is privacy, not authorization.

`/refresh-leaderboard` is separate and retains its configured command channel plus Discord permission checks.

## `/cm user`

```text
/cm user email:user@example.com
```

Opens a private Components V2 user panel with:

- account state;
- wallet balance;
- Aura summary;
- counts;
- latest-ten order navigation;
- Adjust Aura;
- Adjust Wallet;
- recent order opening/history.

Aura/wallet changes require amount + reason, explicit confirmation, a fresh current-state check immediately before execution, stable UUID idempotency and audit output.

## `/cm order`

```text
/cm order reference:CM-...
```

or:

```text
/cm order reference:<order UUID>
```

The bot resolves the canonical order, resolves the canonical owner, verifies target consistency and opens the normal private order panel with:

- Refund;
- Fulfillment diagnostics;
- Refresh Order;
- User Operations;
- owner recent Order History.

Manual Fulfillment remains blocked/informational.

## Aura adjustment

Website operation:

```text
users.aura.adjust
```

Bot rules:

- signed non-zero whole-number delta;
- maximum magnitude ±1,000,000,000 Aura;
- reason 1–500 characters;
- fresh user overview before preview;
- projected negative available Aura blocked;
- explicit confirmation expires after five minutes;
- fresh available-Aura equality check immediately before execute;
- one stable logical idempotency key/body across retry;
- backend transaction/audit IDs preserved;
- sanitized Discord audit attempted.

## Wallet adjustment

Website operation:

```text
users.wallet.adjust
```

Bot rules:

- signed decimal input, at most two decimal places;
- exact conversion to integer cents;
- maximum magnitude ±100,000,000 cents;
- projected negative wallet balance blocked;
- same fresh-state/confirmation/idempotency/audit controls as Aura;
- website remains authoritative for wallet ledger/funding-state accounting.

## Refund

Refund keeps the canonical website preview/re-preview flow:

```text
orders.refund.preview
  -> explicit confirmation
  -> fresh exact re-preview
  -> orders.refund.execute
```

The bot never supplies refund economics independently of the canonical order.

## Develop and validate

```powershell
npm test
npm run typecheck
npm run build
git diff --check
```

For a clean dependency install first:

```powershell
npm ci
```

`npm start` runs compiled `dist/index.js`. The root `index.js` hosting shim remains for hosts that execute the package entry directly.

## Guild slash-command registration

Command registration is explicit and is **not** performed on bot startup:

```powershell
npm run register:commands
```

The guild bulk overwrite contains two top-level commands:

```text
/refresh-leaderboard
/cm
```

`user` and `order` are `/cm` subcommands. After deploying a version that changes the `/cm` definition, run registration again once against the intended guild.

## Leaderboard bootstrap

If no leaderboard message exists:

1. leave `DISCORD_LEADERBOARD_MESSAGE_ID` empty;
2. start the bot once;
3. record the created message ID from safe structured output;
4. configure that ID;
5. restart for normal long-running scheduling.

Normal startup refreshes the configured message and then uses the five-minute schedule.

## Production deployment requirements

- long-running Node.js 22+ worker/process;
- exactly one bot replica unless the in-memory session/scheduler architecture is deliberately redesigned;
- HTTPS egress to the CM API and Discord;
- tokens/HMAC credentials only in host secret storage;
- dedicated website integration client with the exact operations required by deployed source;
- `BOT_ADMIN_USER_IDS` configured before `/cm` use;
- `BOT_AUDIT_LOG_CHANNEL_ID` configured before refund/Aura/wallet mutation use;
- Message Content intent while `cm aura` remains active;
- command registration performed after `/cm` definition changes;
- structured logs collected without request bodies or credential material.

## Legacy archive

The pre-rebuild implementation remains frozen under `legacy/`. Production source, builds and tests must not import or execute it. Historical parity evidence lives in `docs/legacy-parity.md`.
