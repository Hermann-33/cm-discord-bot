# Data and Backend Dependency Status

Verified/re-baselined: 2026-08-18

## Bot-side invariant

The standalone Discord bot has **no direct Supabase/Postgres access**.

It carries no database/service-role credential and has no table/RPC/database fallback. Website-owned business/data access occurs only through the HMAC-authenticated Cheater's Market Internal Integrations API.

## Current website Internal Integrations API operation catalog

Read-only website source verification confirms the production V1 catalog includes:

| Permission | Path |
| --- | --- |
| `aura.leaderboards.read` | `/api/internal/integrations/v1/aura/leaderboards` |
| `aura.lookup.read` | `/api/internal/integrations/v1/aura/lookup` |
| `users.lookup.read` | `/api/internal/integrations/v1/users/lookup` |
| `users.overview.read` | `/api/internal/integrations/v1/users/overview` |
| `orders.lookup.read` | `/api/internal/integrations/v1/orders/lookup` |
| `orders.details.read` | `/api/internal/integrations/v1/orders/details` |
| `orders.fulfillment.read` | `/api/internal/integrations/v1/orders/fulfillment` |
| `purchase-intents.lookup.read` | `/api/internal/integrations/v1/purchase-intents/lookup` |
| `purchase-intents.process` | `/api/internal/integrations/v1/purchase-intents/process` |
| `purchase-intents.process.status.read` | `/api/internal/integrations/v1/purchase-intents/process/status` |
| `orders.refund.preview` | `/api/internal/integrations/v1/orders/refund/preview` |
| `orders.refund.execute` | `/api/internal/integrations/v1/orders/refund/execute` |
| `users.wallet.adjust` | `/api/internal/integrations/v1/users/wallet/adjust` |
| `users.aura.adjust` | `/api/internal/integrations/v1/users/aura/adjust` |

This is the website capability catalog, **not** the bot source/API surface and not proof of a deployed client's permission. Each website integration client has an exact non-empty `allowedOperations` list; there is no wildcard/master bypass.

The product owner reports that the production bot client allowlist was expanded separately in website deployment configuration. That secret external configuration is not stored or independently verified by this bot repository.

## Bot operation surface on TASK-CM-ADMIN-003

The feature branch intentionally consumes only:

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

It does not implement purchase processing or any manual-fulfillment mutation.

## HTTP/HMAC contract

Integration requests are:

- `POST` JSON;
- no query string;
- maximum raw body 16 KiB on website side;
- signed with the existing eight-line `cm-integrations-v1` canonical request;
- exact raw body bytes are hashed/signed;
- timestamp and transport nonce are fresh per HTTP attempt.

Mutation idempotency is separate from transport replay protection:

- UUID idempotency key is stable across retries of one logical business action;
- exact logical request body remains stable;
- same key + changed body returns `IDEMPOTENCY_CONFLICT`.

The bot client serializes its validated mutation body before the transport retry loop, preserving this contract.

## User selector status

Current website source confirms `userLookupSelectorSchema` accepts:

```text
user_id
email
external_identity
```

Aura/wallet adjustment request schemas reuse this selector. The current bot adjustment UI intentionally executes against the canonical `user_id` already resolved into its private session.

## Order selector status

Current website source confirms order selectors accept:

```text
order_id
public_ref
```

`TASK-CM-ADMIN-003` uses this to implement `/cm order reference:<...>` through `orders.details.read`.

The bot then resolves `users.overview.read` using the canonical `order.userId` and requires the returned owner ID to match.

## User overview/order history bound

`users.overview.read` accepts `recentOrdersLimit` only in the range 1–10. The bot requests 10 and paginates locally at five per page. There is no API operation for arbitrary older user-order paging in the current bot design.

## Fulfillment status

`orders.fulfillment.read` is diagnostics-only.

The website operation catalog has **no manual-fulfillment execute operation**. Therefore Manual Fulfillment remains blocked/informational and the bot must not:

- call DB functions directly;
- invent another endpoint;
- reuse `purchase-intents.process` as a substitute.

## Refund contract

Website exposes a canonical pair:

```text
orders.refund.preview
orders.refund.execute
```

The bot keeps the established preview -> explicit confirmation -> fresh exact re-preview -> execute model. Caller cannot choose refund economics independently from the canonical order.

Website owns wallet/Aura/refund accounting and immutable audit records.

## Aura adjustment contract

Website request:

- user selector;
- `deltaAura`: non-zero integer, maximum magnitude `1,000,000,000`;
- reason 1–500 characters;
- UUID idempotency key;
- optional strict operator context.

Website response `adjustment` includes:

- `userId`;
- `deltaAura`;
- `availableAura`;
- `pendingAura`;
- `lifetimeEarnedAura`;
- `lifetimeRedeemedAura`;
- `transactionId`;
- `auditEventId`;
- `createdAt`;
- `idempotentReplay`.

Verified backend adjustment primitive behavior includes target existence validation, negative-result rejection, persistent idempotency/request-hash semantics, Aura transaction creation and admin/integration audit evidence.

## Wallet adjustment contract

Website request:

- user selector;
- `deltaCents`: non-zero integer, maximum magnitude `100,000,000` cents;
- reason 1–500 characters;
- UUID idempotency key;
- optional strict operator context.

Website response `adjustment` includes:

- `userId`;
- `deltaCents`;
- `balanceCents`;
- `currency`;
- `transactionId`;
- `auditEventId`;
- `createdAt`;
- `idempotentReplay`.

Verified wallet primitive behavior:

- missing wallet row is prepared as zero balance / USD;
- negative result rejected;
- canonical `wallet_transactions` admin-adjustment entry created;
- admin/integration audit evidence created;
- existing funding-state trigger machinery participates in positive/negative wallet transactions.

The bot never directly overwrites wallet state.

## Stable adjustment errors

Current website source verifies relevant stable error codes/statuses:

```text
INVALID_ADJUSTMENT    -> 400
INSUFFICIENT_BALANCE  -> 409
IDEMPOTENCY_CONFLICT  -> 409
NOT_FOUND             -> 404
OPERATION_FORBIDDEN   -> 403
RATE_LIMITED          -> 429
```

The bot maps them to safe messages and never surfaces raw backend error text.

## ADR-0007 confirmation resolution

The former repository blocker requiring a dedicated backend Aura/wallet preview endpoint is superseded by ADR-0007 after explicit product/security decision.

Accepted bot-side confirmation is:

```text
fresh users.overview.read
  -> current/change/projected private preview
  -> explicit confirmation <= 5 minutes
  -> fresh users.overview.read
  -> exact relevant balance equality
  -> idempotent website execute operation
  -> backend + Discord audit
```

This does not alter website data ownership or authorize direct DB use.

## Live database context

Previously verified live Supabase project context remains upstream dependency evidence only. Relevant website DB primitives for Aura/wallet adjustment are service-role-only among checked application roles and include persistent idempotency and audit behavior.

Historical wider Supabase security/performance advisor findings are preserved in `docs/audits/2026-08-17-full-codebase-audit.md` and the audit log. They remain website ownership and do not justify bot direct-database access.

## Migration ownership

This repository owns no Supabase migration. Any DB/API route change belongs to the website/backend project and requires separate scope.

## Secret handling

Never commit or document real:

- Discord bot token;
- Internal Integrations API HMAC secret;
- website service credentials;
- Supabase service-role credential;
- database credential;
- production `INTERNAL_INTEGRATIONS_API_CLIENTS_JSON` secret/key material.
