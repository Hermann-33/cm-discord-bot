# Data and Backend Dependency Status

Verified/re-baselined: 2026-08-17

## Bot-side verdict

The current production bot has **no direct Supabase or Postgres access**. It carries no database credential and has no database fallback. Cheater's Market data access is website-owned and reached through the HMAC-authenticated Internal Integrations API.

Current bot source uses only:

- `POST /api/internal/integrations/v1/aura/leaderboards`;
- `POST /api/internal/integrations/v1/aura/lookup`.

The repository currently documents the bot integration credential as limited to the corresponding Aura read operations. No mutation operation is consumed by bot source.

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

The bot does not connect to this project directly. These facts describe an upstream dependency only.

## Current migration ledger returned by Supabase

- `20260810024630 add_internal_discord_bot_api_nonce_guard`
- `20260812104228 add_internal_integration_balance_adjustments`
- `20260814044248 add_internal_integration_order_refund_execute`
- `20260815052426 add_internal_integration_purchase_processing_outbox`
- `20260816050802 add_daily_drop`
- `20260816050858 tighten_daily_drop_spins_grants`
- `20260816051116 add_daily_drop_foreign_key_indexes`
- `20260816064702 list_active_daily_drop_coupons`

This supersedes the earlier context that knew only about the nonce/read-side Internal API foundation.

## Read-only Aura RPC context

The historical/read-side functions remain present:

- `public.get_discord_aura_leaderboard(integer)`
- `public.get_discord_aura_leaderboards(integer)`
- `public.get_discord_user_aura(text)`

Previously verified posture:

- `SECURITY INVOKER`;
- `search_path=public`;
- `anon`: no execute;
- `authenticated`: no execute;
- `service_role`: execute.

They are underlying DB context only; the rebuilt bot does not call them.

## Aura admin primitive

`public.admin_adjust_aura_balance(uuid, uuid, bigint, text)` remains present and service-role-only among the checked application roles.

It:

- validates target, non-zero delta and reason;
- prepares/locks Aura balance;
- rejects negative resulting available Aura;
- changes `available_aura`;
- inserts an `aura_transactions` `manual_adjustment` row;
- inserts `admin_user_operation_events` audit evidence;
- returns balance, Aura transaction ID and audit event ID.

The bot must never call this directly.

## New internal-integration Aura execute primitive

Verified live function:

`public.internal_integration_adjust_aura_balance(p_client_id text, p_idempotency_key uuid, p_request_hash text, p_target_user_id uuid, p_delta_aura bigint, p_reason text, p_operator jsonb)`

Verified security/access:

- `SECURITY DEFINER`;
- `search_path=''`;
- `anon`: no execute;
- `authenticated`: no execute;
- `service_role`: execute.

Verified behavior:

- fixed operation ID `users.aura.adjust`;
- validates integration client identifier;
- requires UUID idempotency key;
- requires 64-character lowercase hex request hash;
- delta must be non-zero and within +/-1,000,000,000 Aura;
- reason length 1–500;
- optional external operator JSON has an exact bounded shape;
- advisory transaction lock serializes the same client/operation/idempotency key;
- persistent `internal_integration_idempotency` record returns safe replay or conflict semantics;
- validates target user existence;
- calls the admin Aura primitive;
- maps below-zero to `insufficient_balance`;
- validates the resulting Aura transaction/audit IDs;
- augments the admin audit event with integration/client and optional external-operator metadata.

The database execute primitive does not authorize direct bot DB use. The HTTP execute path is now contract-documented separately above.

## Wallet admin primitive

Verified live function:

`public.admin_adjust_wallet_balance(uuid, uuid, integer, text)`

Among checked roles it is executable only by `service_role`.

Behavior:

- creates/locks the wallet balance row;
- requires a non-zero cents delta and reason;
- rejects a result below zero;
- updates wallet balance/currency;
- inserts `wallet_transactions` with type `admin_adjustment`;
- inserts `admin_user_operation_events` with reason, delta, previous/new balance, currency and wallet transaction ID;
- returns transaction/audit IDs.

## New internal-integration wallet execute primitive

Verified live function:

`public.internal_integration_adjust_wallet_balance(p_client_id text, p_idempotency_key uuid, p_request_hash text, p_target_user_id uuid, p_delta_cents integer, p_reason text, p_operator jsonb)`

Verified security/access:

- `SECURITY DEFINER`;
- `search_path=''`;
- `anon`: no execute;
- `authenticated`: no execute;
- `service_role`: execute.

Verified behavior:

- operation ID `users.wallet.adjust`;
- same persistent idempotency/request-hash conflict model;
- delta bounded to +/-100,000,000 cents;
- reason 1–500;
- strict optional external operator object;
- target existence validation;
- negative resulting balance mapped to `insufficient_balance`;
- validates wallet transaction and audit IDs;
- augments integration/operator audit metadata.

## Wallet funding-state behavior

A live `AFTER INSERT` trigger on `public.wallet_transactions` executes `handle_wallet_transaction_funding_state()`.

The funding-state function routes:

- positive wallet transactions -> funding-lot synchronization;
- negative wallet transactions -> funding-consumption synchronization;
- zero -> ignored.

Therefore the admin wallet adjustment path participates in the website's funding-state machinery rather than only changing one balance number.

The HTTP execute path is contract-documented, but bot scope/selectors/confirmation and controlled end-to-end bot verification remain required before exposing a Discord wallet command.

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

`internal_integration_idempotency` stores non-null:

- `client_id`;
- `operation_id`;
- `idempotency_key` UUID;
- `request_hash`;
- `response_result` JSONB;
- `created_at` timestamp.

## Critical boundary: HTTP contract is documented, bot authorization is not inferred

The earlier statement that the Aura/wallet HTTP paths were unverified is obsolete. The supplied authoritative backend contract documents those execute paths and request fundamentals.

Still unverified for this bot:

- bot-dedicated client's actual `allowedOperations` for new operations;
- exact route DTOs/selectors where the supplied docs conflict or omit exact fields;
- an Aura/wallet adjustment preview/confirmation endpoint or equivalent backend-authoritative confirmation state satisfying ADR-0004;
- bot-specific single/daily operator cap policy if required beyond backend hard bounds/rate limits;
- authenticated production smoke behavior using the bot's dedicated credentials.

Database functions and backend endpoint existence are not permission for the Discord bot to bypass the website or skip Discord authorization.

## Live Supabase security advisor snapshot

The advisor reports several categories.

### Service-only tables with RLS/no policies

Many sensitive service-only tables show `rls_enabled_no_policy` informational notices. Under the existing design, no browser policies can be intentional. Treat each table according to ownership rather than blindly adding public policies.

### Upstream HIGH risk — exposed SECURITY DEFINER functions

Advisor warnings still report anon and/or authenticated execution on unrelated privileged functions, including examples:

- `complete_product_delivery_generation(...)`;
- `handle_aura_redemption_wallet_funding_link()`;
- `handle_wallet_transaction_funding_state()`;
- `purchase_product_with_wallet_delivery(...)`;
- `sync_order_payment_provider_from_purchase_intent()`.

These are website/database security findings. They do **not** justify any bot direct-DB access and should be remediated by the owning backend.

The verified Aura/wallet internal-integration adjustment functions themselves are not executable by anon/authenticated among the roles checked.

Supabase remediation references for the owning backend:

- public SECURITY DEFINER execute: `https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable`
- authenticated SECURITY DEFINER execute: `https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable`
- mutable search path: `https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable`

### Other security advisor context

- several unrelated utility functions report mutable `search_path`;
- Auth leaked-password protection is reported disabled.

Auth/password settings are website ownership, not bot configuration.

## Performance advisor context

The live advisor also reports upstream opportunities such as:

- unindexed foreign keys;
- RLS policies that repeatedly evaluate auth helpers per row;
- indexes that have not yet been observed as used.

Aura/wallet/Discord-related rows appear in some of those notices. These are performance observations, not authorization failures and should be handled in the backend project after workload review.

## Migration ownership

This repository does not own Supabase migrations. Any DB/API change must be implemented/audited in the website/backend project. This bot consumes only explicitly approved HTTP contracts.

## Secret handling

Never commit or document real:

- Discord bot tokens;
- Internal API HMAC secrets;
- website service credentials;
- Supabase service-role credentials;
- database credentials.
