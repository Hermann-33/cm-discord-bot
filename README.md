# Cheater's Market Discord bot

Standalone Node.js/TypeScript Discord bot for Cheater's Market.

Current command surfaces:

- customer message command `cm aura`;
- staff operational slash command `/refresh-leaderboard`;
- private admin `/cm user` lookup by exact email **or** linked Discord user;
- private admin `/cm order reference:<CM-public-ref-or-order/purchase-UUID>` for canonical orders and pending purchases;
- private `/cm` Aura, wallet and canonical-order refund controls;
- explicit customer-safe **Share to Chat** copies from meaningful `/cm` panels.

## Architecture and data boundary

```text
Discord
  -> CM Discord bot
  -> HMAC-authenticated HTTPS
  -> Cheater's Market Internal Integrations API
  -> website-owned business/database layer
```

The bot has no direct Supabase/Postgres access, database credential, service-role credential or database fallback. Active source uses only:

```text
aura.leaderboards.read
aura.lookup.read
users.overview.read
orders.details.read
orders.fulfillment.read
purchase-intents.lookup.read
orders.refund.preview
orders.refund.execute
users.aura.adjust
users.wallet.adjust
```

Backend per-client `allowedOperations` remains an independent deployment authorization boundary. `purchase-intents.process` and manual fulfillment are not bot operations.

## Requirements

- Node.js 22+
- Discord application/bot
- privileged Message Content intent while `cm aura` remains message-based
- bot-dedicated Internal Integrations API client/key

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

`BOT_ADMIN_USER_IDS` is a comma-separated explicit Discord user-ID allowlist. `/cm` fails closed when it is empty. `BOT_AUDIT_LOG_CHANNEL_ID` is required before refund/Aura/wallet execution. `BOT_ADMIN_COMMAND_CHANNEL_ID` is not supported.

## `/cm` authorization

Every `/cm` slash command, button and modal requires:

1. guild interaction;
2. exact `DISCORD_GUILD_ID`;
3. non-empty `BOT_ADMIN_USER_IDS`;
4. invoking Discord user explicitly allowlisted;
5. operator-bound unexpired session for component/modal navigation.

A whitelisted admin may use `/cm` from any channel in the configured guild. DMs and wrong guilds fail closed. Ephemeral output is privacy, not authorization. `/refresh-leaderboard` keeps its separate configured channel and Discord permission policy.

## `/cm user`

Exactly one lookup input is required:

```text
/cm user email:user@example.com
```

or select:

```text
/cm user discord_user:<Discord user>
```

Discord lookup reuses `users.overview.read` with the canonical `external_identity` selector.

The User Operations panel shows canonical email, account state, linked Discord state, current wallet, available/lifetime Aura, pending Aura when non-zero, order/license/account counts and the latest order. Adjust Aura, Adjust Wallet, recent-order access, Order History and Share to Chat remain available.

## `/cm order` — canonical and pending

```text
/cm order reference:CM-...
/cm order reference:<order-or-purchase UUID>
```

The lookup is intentionally order-first:

```text
orders.details.read
  -> success: resolve exact owner and open canonical order
  -> NOT_FOUND only: purchase-intents.lookup.read
       -> resolve exact owner
       -> pending purchase panel
       -> Refresh Purchase
       -> transition automatically to canonical order when created
```

Authentication/authorization/rate-limit/service failures never trigger the purchase-intent fallback.

A pending purchase is read-only support state. It has no refund or delivery controls until the website creates the canonical order. The bot does not call `purchase-intents.process`.

## Fulfillment support view

For canonical orders, the bot consumes the website's optional `orders.fulfillment.read.support` metadata. The private staff panel can show:

- human-readable product/account type;
- finite duration when known;
- useful provider context;
- delivery progress;
- at most 10 stored **masked** license/account values;
- canonical manual-required state.

Raw/decrypted fulfillment secrets are not part of the API DTO and unexpected raw-material fields are rejected by strict validation.

Support enrichment is optional. If it is absent/unavailable, the canonical order still opens and existing order/refund navigation remains usable. Missing masked material does **not** mean manual fulfillment is required.

`Delivery Details` remains read-only diagnostics. No manual-fulfillment execute operation exists.

## Customer-safe sharing

Meaningful private `/cm` panels include **Share to Chat**. The click reauthorizes the admin and owning session, then posts a separately rendered read-only Components V2 summary into the current channel.

The shared copy contains no buttons or other interactive components. It includes the canonical customer account email plus linked Discord identity when available, but omits internal CM user UUIDs, internal purchase/purchase-intent option IDs, provider/provider-status internals, admin reasons, backend audit/transaction/idempotency identifiers and credentials.

**Masked fulfillment support material is private staff data and is never copied into Share to Chat.** Mentions are disabled with `safeAllowedMentions`.

ADR-0008 defines the separate public renderer; ADR-0009 permits canonical customer email; ADR-0011 defines pending-purchase and fulfillment-support disclosure rules.

## Mutations

Aura and wallet adjustments retain the ADR-0007 model: signed bounded delta, reason, fresh overview, current/change/projected preview, explicit five-minute confirmation, second fresh relevant-balance equality check, stable UUID idempotency/body, website-owned execution and backend + Discord audit.

Refund remains canonical-order-only:

```text
orders.refund.preview
  -> explicit confirmation
  -> fresh exact re-preview
  -> orders.refund.execute
```

Pending purchase intents do not expose refund execution.

## Develop and validate

```powershell
npm ci
npm test
npm run typecheck
npm run build
git diff --check
```

`npm start` runs `dist/index.js`.

## Guild slash-command registration

Registration is explicit and never happens on startup:

```powershell
npm run register:commands
```

Top-level commands remain `/refresh-leaderboard` and `/cm`; `user` and `order` remain `/cm` subcommands. TASK-CM-ADMIN-007 changes lookup behavior only, not command JSON, so command re-registration is not required for this task.

## Deployment note for pending lookup

The deployed website integration client used by the bot must include:

```text
purchase-intents.lookup.read
```

in its exact `allowedOperations` list. Endpoint existence does not grant that permission. No new bot environment variable is required.

## Non-production transcript tooling

The parallel `CM-Ticket-Transcripts` side project remains governed by ADR-0010. Export tooling lives under `tools/ticket-transcript-exporter/`, is not imported by `src/`, and is not a production bot dependency.

## Production notes

Use a single bot replica unless the in-memory session/scheduler architecture is redesigned. Keep Discord/API credentials only in the host secret store, collect structured logs without request bodies/credentials, and keep the bot limited to the exact website operations required by deployed source.

## Legacy archive

The pre-rebuild implementation remains frozen under `legacy/`; active source, builds and tests must not import or execute it.
