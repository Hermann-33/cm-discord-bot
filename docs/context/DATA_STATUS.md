# Data and Backend Dependency Status

Verified/re-baselined: 2026-08-18

## Bot-side invariant

The Discord bot has **no direct Supabase/Postgres access**, no service-role/database credential and no table/RPC fallback. Website-owned business/data access occurs only through the HMAC-authenticated Internal Integrations API.

## Website capability catalog

Current read-only website source exposes these V1 operation IDs:

```text
aura.leaderboards.read
aura.lookup.read
users.lookup.read
users.overview.read
orders.lookup.read
orders.details.read
orders.fulfillment.read
purchase-intents.lookup.read
purchase-intents.process
purchase-intents.process.status.read
orders.refund.preview
orders.refund.execute
users.wallet.adjust
users.aura.adjust
```

This catalog is not the bot source surface and not proof of a deployed client's permission. Website clients have explicit non-empty `allowedOperations`; there is no wildcard/master bypass.

## Bot operation surface

Current bot source intentionally consumes only:

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

TASK-CM-ADMIN-005 adds **no** operation, endpoint, website config or database dependency.

## HTTP/HMAC contract

Requests are POST JSON with no query string and exact raw-body HMAC signing. Transport timestamp/nonce/signature are fresh per HTTP attempt. Mutation UUID idempotency key + logical request body remain stable across retries; same key with changed body conflicts.

## User selectors and Discord identity

Current website `userLookupSelectorSchema` accepts:

```text
user_id
email
external_identity
```

`external_identity` carries provider + external user ID. `users.overview.read` accepts that selector and its response already returns:

```text
identity.userId
identity.email
identity.externalIdentities[]
  provider
  externalUserId
  username
  displayName
  linkedAt
```

`/cm user discord_user:<selected Discord user>` uses the existing `external_identity/provider=discord` selector. Email lookup continues to use `email`. Both/neither input fails locally before backend access.

Aura/wallet execution continues against the canonical `user_id` already resolved into the private session.

## Share to Chat data source

Share to Chat performs no extra backend query and no mutation. It renders from the already-authorized `CmAdminSession`.

ADR-0009 explicitly permits and requires the canonical customer account email in shared customer identity sections. The value comes from:

```text
session.overview.identity.email
```

and is escaped for Discord presentation before display.

This email disclosure does not authorize exposing other internal session/API data. Internal CM UUIDs, option IDs, provider/failure codes, admin reasons, audit/transaction/idempotency identifiers and credentials remain excluded from the public renderer.

## Order selectors/history

Order selectors accept `order_id` and `public_ref`. Direct `/cm order` resolves the canonical order then resolves owner with `users.overview.read(user_id)` and requires exact equality.

`users.overview.read` accepts `recentOrdersLimit` only from 1–10. The bot requests 10 and paginates locally five per page; no arbitrary older-history operation is invented.

## Fulfillment

`orders.fulfillment.read` remains diagnostics-only. No manual-fulfillment execute operation exists. The bot must not call DB functions, invent an endpoint or reuse `purchase-intents.process` as a substitute.

## Refund

Website owns:

```text
orders.refund.preview
orders.refund.execute
```

The bot retains canonical preview -> explicit confirmation -> fresh exact preview equality -> execute. Caller cannot choose refund economics independently from the order.

## Aura adjustment

`users.aura.adjust` requires canonical user selector, non-zero integer `deltaAura` bounded to ±1,000,000,000, reason 1–500, UUID idempotency and optional strict operator context. Response includes resulting Aura values, transaction/audit IDs, timestamp and replay state.

Backend owns target validation, non-negative result, transaction/accounting, idempotency and immutable audit.

## Wallet adjustment

`users.wallet.adjust` requires canonical user selector, non-zero integer `deltaCents` bounded to ±100,000,000 cents, reason 1–500, UUID idempotency and optional strict operator context. Response includes resulting balance/currency, transaction/audit IDs, timestamp and replay state.

Verified website behavior prepares a missing wallet as zero/USD, rejects negative result, writes canonical wallet transaction/audit state and participates in funding-state machinery. The bot never overwrites a wallet balance directly.

## Stable relevant errors

```text
INVALID_ADJUSTMENT    -> 400
INSUFFICIENT_BALANCE  -> 409
IDEMPOTENCY_CONFLICT  -> 409
NOT_FOUND             -> 404
OPERATION_FORBIDDEN   -> 403
RATE_LIMITED          -> 429
```

Raw backend error text is not surfaced.

## Mutation confirmation authority

ADR-0007 permits Aura/wallet execution only through:

```text
fresh users.overview.read
  -> private current/change/projected confirmation
  -> explicit confirmation <= 5 minutes
  -> fresh exact relevant-balance equality
  -> idempotent website execute
  -> backend + Discord audit
```

Refund keeps its backend preview/re-preview model.

TASK-CM-ADMIN-005 changes only Discord share presentation and does not alter business mutation authority.

## Database/migration ownership

Live Supabase context is upstream dependency evidence only. This repository owns no DB migration/RLS/grant/function. Any website/API/database change requires separate scope.

## Secret handling

Never commit/log real Discord tokens, HMAC secrets, website service credentials, Supabase service-role/database credentials or production `INTERNAL_INTEGRATIONS_API_CLIENTS_JSON` key material.
