# Current Architecture

Updated: 2026-08-18

## System boundary

The production architecture remains:

```text
Discord
  -> standalone CM Discord bot
  -> HMAC-authenticated HTTPS
  -> Cheater's Market website-owned Internal Integrations API
  -> website business/data layer
  -> Supabase/Postgres and other backend dependencies
```

The bot has no direct Supabase/Postgres client, service-role key, database credential, RPC fallback or table mutation path. `legacy/` remains frozen and excluded from active runtime.

## Command surfaces

Current mainline plus `TASK-CM-ADMIN-003` target:

- customer message command `cm aura`;
- staff/admin slash command `/refresh-leaderboard`;
- private admin slash command `/cm user email:<email>`;
- private admin slash command `/cm order reference:<CM-public-ref-or-order-UUID>`;
- private `/cm` buttons/modals for navigation, Aura adjustment, wallet adjustment and refund.

ADR-0005 governs customer vs admin presentation. ADR-0006 governs shared `/cm` guild-wide authorization. ADR-0007 governs Aura/wallet confirmation and mutation.

## Interaction routing

`src/index.ts` constructs one `CmAdminController` and gives it first chance to handle:

- `/cm` chat-input interactions;
- `cm:*` button interactions;
- `cm:*` modal submissions.

Unhandled chat-input interactions continue to `/refresh-leaderboard`. Customer `MessageCreate` routing for `cm aura` remains unchanged.

Guild command registration remains a manual bulk overwrite containing the two top-level slash commands:

```text
/refresh-leaderboard
/cm
```

`user` and `order` are subcommands of `/cm`, not additional top-level application commands.

## Shared `/cm` authorization boundary

Before sensitive backend access, every `/cm` command/button/modal interaction requires:

1. guild interaction;
2. exact configured `DISCORD_GUILD_ID`;
3. non-empty `BOT_ADMIN_USER_IDS`;
4. invoking Discord user ID explicitly present in that allowlist.

There is no `/cm` command-channel restriction under ADR-0006. Roles are not an authorization substitute. Ephemeral/private output is confidentiality only.

`/refresh-leaderboard` is independent and keeps its command-channel + Discord permission checks.

## Private session model

`CmSessionStore` holds bounded short-lived UI/confirmation state:

- random UUID session ID;
- original operator Discord ID;
- current `users.overview.read` DTO;
- optional selected order;
- optional refund proposal;
- optional Aura/wallet adjustment proposal;
- 15-minute inactivity TTL;
- maximum 100 sessions with oldest-session eviction.

Component custom IDs contain only domain/action/session/index tokens. They do not carry emails, balances, reasons, backend UUID targets or credential material. Session retrieval also requires the same operator ID.

Sessions are not the website mutation authority. Refund re-previews the backend. Aura/wallet confirmations perform a fresh authoritative overview read before execution and fail closed if the relevant balance changed.

## Bot Internal Integrations API surface

`TASK-CM-ADMIN-003` bot source intentionally exposes only:

```text
aura.leaderboards.read
  POST /api/internal/integrations/v1/aura/leaderboards

aura.lookup.read
  POST /api/internal/integrations/v1/aura/lookup

users.overview.read
  POST /api/internal/integrations/v1/users/overview

orders.details.read
  POST /api/internal/integrations/v1/orders/details

orders.fulfillment.read
  POST /api/internal/integrations/v1/orders/fulfillment

orders.refund.preview
  POST /api/internal/integrations/v1/orders/refund/preview

orders.refund.execute
  POST /api/internal/integrations/v1/orders/refund/execute

users.aura.adjust
  POST /api/internal/integrations/v1/users/aura/adjust

users.wallet.adjust
  POST /api/internal/integrations/v1/users/wallet/adjust
```

No purchase-processing, manual-fulfillment execute or direct-database path is added.

All request/response DTOs are strict local mirrors of read-only verified website source. Backend per-client `allowedOperations` remains an independent runtime authorization boundary.

## Direct order lookup

`/cm order` accepts either:

- canonical UUID -> `order_id` selector;
- CM public reference -> normalized uppercase `public_ref` selector.

Flow:

```text
/cm order
  -> orders.details.read
  -> returned canonical userId
  -> users.overview.read(user_id)
  -> require exact owner match
  -> create operator-bound session
  -> selectedOrder = canonical order
  -> render standard order panel
```

This makes order-first and user-first navigation converge on the same session/order UI rather than duplicating business logic.

## User/order navigation

`users.overview.read` is requested with `recentOrdersLimit: 10`, the verified backend maximum, and paginated locally at five rows per page.

Opening an order from recent history re-fetches `orders.details.read` and requires returned `userId` to match the session user.

`orders.fulfillment.read` remains diagnostics-only. Manual Fulfillment remains blocked because there is no website mutation contract.

## Refund architecture

Refund is unchanged from the existing canonical model:

```text
Refund
  -> reason modal (8-1000)
  -> orders.refund.preview
  -> private canonical consequence preview
  -> Confirm <= 5 minutes
  -> orders.refund.preview again
  -> exact DTO fingerprint equality
  -> orders.refund.execute with frozen body/idempotency key
  -> backend audit
  -> sanitized Discord audit
```

`BOT_AUDIT_LOG_CHANNEL_ID` is mandatory before execute. Backend audit remains authoritative if Discord audit posting fails.

## Aura/wallet adjustment architecture

ADR-0007 defines an accepted state-bound confirmation model around the website's existing execute-only adjustment contracts.

### Preview/confirmation layer

```text
Adjust Aura / Adjust Wallet
  -> private modal: signed delta + reason
  -> fresh users.overview.read
  -> validate local bounds + projected non-negative balance
  -> store exact target/kind/delta/reason/operator/current balance/projected balance
     + UUID idempotency key + five-minute expiry
  -> private confirmation panel
  -> Confirm
  -> fresh users.overview.read
  -> exact relevant balance comparison
  -> changed state: abort
  -> unchanged state: execute website adjustment
```

Aura:

- integer delta only;
- non-zero;
- maximum magnitude `1,000,000,000`;
- relevant bound state is available Aura.

Wallet:

- signed decimal operator input with max two decimal places;
- exact conversion to integer cents;
- non-zero;
- maximum magnitude `100,000,000` cents;
- relevant bound state is wallet balance;
- absent wallet preview uses zero/USD, matching the verified website primitive's row-preparation behavior.

### Execute/retry/audit

`src/api/client.ts` serializes the validated request body before its retry loop. Therefore one logical mutation retains the same target/delta/reason/operator/idempotency body while every HTTP attempt receives a fresh HMAC timestamp, nonce and signature.

Before execution, `BOT_AUDIT_LOG_CHANNEL_ID` is mandatory. The returned target and delta are verified. Backend transaction/audit IDs are preserved and a mention-safe Discord audit record is attempted. User overview refresh after success is best-effort.

The website remains responsible for transactional balance accounting, negative-balance rejection, ledger/funding behavior, idempotent replay and immutable business audit.

## Configuration surface

Admin runtime configuration remains:

```text
BOT_ADMIN_USER_IDS
BOT_AUDIT_LOG_CHANNEL_ID
```

`BOT_ADMIN_COMMAND_CHANNEL_ID` is not supported. No new secret or database environment variables are introduced by `TASK-CM-ADMIN-003`.

## Verification architecture

Node 22 CI contract:

```text
npm ci
npm test
npm run typecheck
npm run build
git diff --check
```

Connector-side implementation is not equivalent to executable verification. The task remains incomplete until these checks and focused boundary scans pass.

## Fragile boundaries

- HMAC canonicalization and exact serialized body retry behavior;
- strict website DTO mirrors;
- backend `allowedOperations` authorization;
- guild + explicit user whitelist ordering;
- per-interaction reauthorization;
- operator-bound session ownership/expiry;
- refund canonical re-preview equality;
- Aura/wallet fresh-state equality before first execute;
- stable mutation idempotency identity;
- audit-channel fail-closed precondition;
- mention-safe audit/output;
- no direct DB access;
- no purchase-processing or invented manual-fulfillment mutation;
- customer/admin command separation;
- `/refresh-leaderboard` independent channel policy.
