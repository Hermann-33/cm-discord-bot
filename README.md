# Cheater's Market Discord bot

Standalone Node.js/TypeScript Discord bot for Cheater's Market.

Current command surfaces:

- customer message command `cm aura`;
- staff operational slash command `/refresh-leaderboard`;
- private admin `/cm user` lookup by exact email **or** linked Discord user;
- private admin `/cm order reference:<CM-public-ref-or-order-UUID>`;
- private `/cm` Aura, wallet and refund controls;
- explicit customer-safe **Share to Chat** copies from normal `/cm` panels.

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
orders.refund.preview
orders.refund.execute
users.aura.adjust
users.wallet.adjust
```

Backend per-client `allowedOperations` remains an independent deployment authorization boundary. Manual fulfillment is not implemented.

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

Discord lookup reuses `users.overview.read` with the canonical `external_identity` selector; no new backend operation is needed.

The User Operations panel is intentionally compact: email, account status, linked Discord state, current wallet, available/pending Aura, order count and latest order. Routine login/update/lifetime/license statistics are not displayed there. Adjust Aura, Adjust Wallet, recent-order access, Order History and Share to Chat remain available.

## Customer-safe sharing

Meaningful private `/cm` panels include **Share to Chat**. The click itself reauthorizes the admin and session owner, then posts a separate read-only Components V2 summary into the current channel.

The shared copy contains **no buttons or other interactive components**. It is rendered independently from the private panel and includes the canonical customer account email plus linked Discord identity when available. It continues to omit internal CM user UUIDs, internal purchase option IDs, mutation/refund reasons, provider/failure internals, backend audit/transaction IDs and idempotency data. Mentions are disabled with `safeAllowedMentions`.

Shared summaries are intentionally concise: current customer-relevant state and outcomes are preferred over historical/update/statistical noise. ADR-0008 defines the separate read-only sharing boundary; ADR-0009 supersedes only its previous prohibition on displaying the customer account email.

## `/cm order`

```text
/cm order reference:CM-...
/cm order reference:<order UUID>
```

The bot resolves the canonical order and owner, verifies target consistency and opens a compact order panel with customer-facing item/status/amount/payment/delivery information plus Refund, Delivery Details, Refresh Order, User Operations and Share to Chat.

`Delivery Details` keeps useful delivery status/progress and only shows failure/manual-review/message fields when present. Internal provider/timestamp diagnostics and the nonfunctional Manual Fulfillment button are not shown. Manual fulfillment remains unsupported because no website-owned execute operation exists.

## Mutations

Aura and wallet adjustments retain the ADR-0007 model: signed bounded delta, reason, fresh overview, current/change/projected preview, explicit five-minute confirmation, second fresh relevant-balance equality check, stable UUID idempotency/body, website-owned execution and backend + Discord audit.

Private mutation panels show decision/result information rather than routine backend transaction/audit bookkeeping. Exceptional replay or Discord-audit-post-failure warnings remain visible when they occur.

Refund retains:

```text
orders.refund.preview
  -> explicit confirmation
  -> fresh exact re-preview
  -> orders.refund.execute
```

Discord audit output is a concise Components V2 summary of customer, action/result, reason, operator and completion time. Website audit records remain authoritative.

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

Top-level commands remain `/refresh-leaderboard` and `/cm`; `user` and `order` are `/cm` subcommands. Re-run registration after deploying any `/cm` definition change. Pure presentation changes such as TASK-CM-ADMIN-006 do not require registration.

## Production notes

Use a single bot replica unless the in-memory session/scheduler architecture is redesigned. Keep Discord/API credentials only in the host secret store, collect structured logs without request bodies/credentials, and keep the bot limited to the exact website operations required by deployed source.

## Legacy archive

The pre-rebuild implementation remains frozen under `legacy/`; active source, builds and tests must not import or execute it.
