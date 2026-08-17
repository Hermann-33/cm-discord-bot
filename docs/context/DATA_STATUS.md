# Data and Backend Dependency Status

Verified: 2026-08-17

## Bot-side verdict

The current production bot has **no direct Supabase or Postgres access**. It carries no database credential and has no database fallback. Cheater's Market data access is website-owned and reached through the HMAC-authenticated Internal Integrations API.

Current bot source uses only:

- `POST /api/internal/integrations/v1/aura/leaderboards`;
- `POST /api/internal/integrations/v1/aura/lookup`.

The repository currently documents the bot integration credential as limited to the corresponding Aura read operations. No mutation operation is consumed by bot source.

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

This is an **execute primitive**. It does not prove that a bot-facing HTTP preview/confirm endpoint or permission scope is available.

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

This must still be exercised and audited through the website-owned HTTP/business layer before exposing a Discord wallet command.

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

## Critical boundary: HTTP/API status is not inferred from DB

This audit did not inspect the website repository and did not execute an authenticated production mutation request.

Still unverified:

- HTTP paths for Aura/wallet adjustment;
- preview endpoint/state model;
- operation allowlist in the Internal Integrations API;
- whether the bot-dedicated client credential may execute mutation operations;
- selector/target resolution contract exposed to bot;
- single/daily operator caps;
- preview expiry/binding semantics;
- production HTTP smoke behavior.

Database functions are not permission for the Discord bot to bypass the website.

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