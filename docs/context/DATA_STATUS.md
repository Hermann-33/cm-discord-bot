# Data and Backend Dependency Status

Verified/re-baselined: 2026-08-17

## Bot-side verdict

The current production bot has **no direct Supabase or Postgres access**. It carries no database credential and has no database fallback. Cheater's Market data access is website-owned and reached through the HMAC-authenticated Internal Integrations API.

Current bot source uses only:

- `POST /api/internal/integrations/v1/aura/leaderboards`;
- `POST /api/internal/integrations/v1/aura/lookup`.

The currently documented bot integration credential is limited to the corresponding Aura read operations. No mutation operation is consumed by bot source.

## Authoritative Internal Integrations API contract supplied 2026-08-17

Backend contract documentation supplied for this project describes the following production operations:

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

These are backend API capabilities. They are **not** proof that the Discord bot's dedicated client has those permissions. Each client has an exact non-empty `allowedOperations` list with no wildcard or master-key bypass.

### HTTP/authentication contract relevant to bot implementation

Integration routes are `POST`, JSON, no query string, with a documented maximum raw request body of 16 KiB.

Every request requires the existing HMAC headers and signs exactly eight LF-separated canonical lines:

```text
cm-integrations-v1
{client_id}
{key_id}
{timestamp_ms}
{nonce_uuidv4}
{uppercase_method}
{exact_pathname}
{sha256_exact_raw_body}
```

The exact serialized UTF-8 body bytes must be sent after signing. Timestamp/nonce/signature are fresh per HTTP attempt. The transport nonce is independent from mutation idempotency.

All documented mutations require a UUID `idempotencyKey`. The same logical mutation must reuse the same idempotency key and exact body across retries while using a fresh transport nonce/timestamp/signature. Same key + changed body returns `IDEMPOTENCY_CONFLICT`.

### Mutation contracts now documented

`users.aura.adjust`:

- path `/api/internal/integrations/v1/users/aura/adjust`;
- user selector;
- `deltaAura`: non-zero integer, maximum magnitude 1,000,000,000;
- reason 1–500 characters;
- UUID idempotency key;
- optional strict operator audit context.

`users.wallet.adjust`:

- path `/api/internal/integrations/v1/users/wallet/adjust`;
- user selector;
- `deltaCents`: non-zero integer, maximum magnitude 100,000,000;
- reason 1–500 characters;
- UUID idempotency key;
- optional strict operator audit context.

Backend documentation states production verification covered success/replay/conflict/failure/cleanup for both wallet and Aura adjustment. This bot repository has not independently performed an authenticated mutation smoke test with the bot credential.

### Selector contradiction requiring source verification

The full API contract identifies itself as the authoritative V1 contract and states that `external_identity` is a lookup selector only. The bot quickstart nevertheless shows `external_identity` in Aura/wallet adjustment request examples.

Do not silently choose one. Before implementing mutation targeting, inspect the actual website route schema/source or an updated authoritative contract and determine which selectors `users.aura.adjust` and `users.wallet.adjust` accept. Until then, do not assume direct Discord external-identity mutation targeting is valid.

### Exact DTO requirement

The supplied documentation describes the operation set and request fundamentals but does not provide every exact response field for every read/support operation in the pasted material. Before adding a strict Zod schema/client method, verify the exact authoritative request and response DTO for that operation rather than guessing field names.

## Live Supabase environment

Read-only verification on 2026-08-17:

- project ref: `gcqbayehikvbwvvseyoc`;
- project name: `Cheater's Market`;
- region: `us-east-1`;
- status: `ACTIVE_HEALTHY`;
- Postgres: 17.6.1.063.

The bot does not connect to this project directly.

## Current migration ledger returned by Supabase

- `20260810024630 add_internal_discord_bot_api_nonce_guard`
- `20260812104228 add_internal_integration_balance_adjustments`
- `20260814044248 add_internal_integration_order_refund_execute`
- `20260815052426 add_internal_integration_purchase_processing_outbox`
- `20260816050802 add_daily_drop`
- `20260816050858 tighten_daily_drop_spins_grants`
- `20260816051116 add_daily_drop_foreign_key_indexes`
- `20260816064702 list_active_daily_drop_coupons`

## Aura/wallet database foundation

Verified live database primitives remain:

- `public.admin_adjust_aura_balance(...)`;
- `public.internal_integration_adjust_aura_balance(...)` for operation `users.aura.adjust`;
- `public.admin_adjust_wallet_balance(...)`;
- `public.internal_integration_adjust_wallet_balance(...)` for operation `users.wallet.adjust`.

Among checked application roles the internal-integration adjustment functions are service-role-only, use persistent idempotency/request-hash protection, validate targets/deltas/reasons/operator metadata, reject negative resulting balances and write transaction/audit evidence.

The wallet adjustment path writes a `wallet_transactions` `admin_adjustment` and participates in the live wallet funding-state trigger path: positive transactions route to funding-lot synchronization and negative transactions to funding-consumption synchronization.

The bot must never call these DB functions directly.

## Relevant tables and RLS

Verified relevant tables include:

- `admin_user_operation_events`
- `aura_balances`
- `aura_transactions`
- `internal_integration_idempotency`
- `user_discord_links`
- `user_discord_privacy_preferences`
- `wallet_balances`
- `wallet_funding_lots`
- `wallet_transactions`

RLS is enabled on all of those checked tables.

## Remaining HTTP/bot integration unknowns

The prior statement that Aura/wallet HTTP paths were unverified is obsolete. The paths and execute request fundamentals are now contract-documented.

Still unverified for this bot:

- bot-dedicated client's actual `allowedOperations` for new operations;
- exact route DTOs/selectors where the supplied docs conflict or omit exact response fields;
- an adjustment preview/confirmation endpoint or equivalent backend-authoritative confirmation state satisfying ADR-0004;
- bot-specific single/daily operator cap policy if required beyond backend hard bounds/rate limits;
- authenticated production smoke behavior using the bot's dedicated credentials.

Database functions and backend endpoint existence are not permission for the Discord bot to bypass the website or skip Discord authorization.

## Live Supabase security advisor snapshot

The advisor still reports unrelated website/database findings, including publicly/signed-in executable `SECURITY DEFINER` functions outside the bot's adjustment primitives, mutable `search_path` warnings, and disabled Auth leaked-password protection. These remain website/backend ownership and do not justify weakening the bot API boundary.

The verified Aura/wallet internal-integration adjustment functions themselves were not executable by anon/authenticated among the roles checked.

## Migration ownership

This repository does not own Supabase migrations or website API routes. Any DB/API change must be implemented/audited in the website/backend project. This bot consumes only explicitly approved HTTP contracts.

## Secret handling

Never commit or document real Discord bot tokens, Internal API HMAC secrets, website service credentials, Supabase service-role credentials or database credentials.
