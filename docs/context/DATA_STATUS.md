# Data and Backend Dependency Status

Verified: 2026-08-17

## Bot-side verdict

The current production bot has **no direct Supabase or Postgres access**. It carries no database credential and has no database fallback. All Cheater's Market data access is website-owned and reached through the HMAC-authenticated Internal Integrations API.

Current bot credential scope documented by the repo:

- `aura.leaderboards.read`
- `aura.lookup.read`

## Current API operations

Bot production source currently uses:

- `POST /api/internal/integrations/v1/aura/leaderboards`
- `POST /api/internal/integrations/v1/aura/lookup`

The bot validates both request and response contracts and maps backend errors to sanitized local errors.

## Underlying Supabase dependency — verified context

The website's linked Supabase project was inspected read-only on 2026-08-17 for project context.

Project reference:

- `gcqbayehikvbwvvseyoc`

Relevant historical/read-only Aura functions still present in the database:

- `public.get_discord_aura_leaderboard(integer)`
- `public.get_discord_aura_leaderboards(integer)`
- `public.get_discord_user_aura(text)`

Verified properties for those functions:

- `SECURITY INVOKER`
- `search_path=public`
- `anon`: no execute
- `authenticated`: no execute
- `service_role`: execute

These functions are underlying/historical DB context. The rebuilt bot does not call them directly.

## Existing admin Aura function — important future context

The live DB also contains:

`public.admin_adjust_aura_balance(p_target_user_id uuid, p_actor_user_id uuid, p_delta_aura bigint, p_reason text)`

Verified properties:

- `SECURITY DEFINER`
- `search_path=public`
- executable by `service_role` only among the checked application roles;
- validates non-null target, non-zero delta, and required reason;
- locks/prepares the Aura balance row;
- prevents available Aura from going below zero;
- updates `available_aura`;
- inserts an `aura_transactions` `manual_adjustment` row;
- inserts an `admin_user_operation_events` audit row;
- returns transaction/audit IDs and balance values.

### Critical restriction

The bot must **not** call `admin_adjust_aura_balance` directly. It lacks the complete Discord admin control plane: operator whitelist, guild/channel binding, preview/confirmation, idempotency, caps, bot-specific request identity, and Discord audit-channel evidence. It may only be considered as a website-side primitive behind an audited backend contract.

## Wallet context

Wallet mutation is higher risk than Aura. A safe wallet adjustment must preserve the website wallet ledger model, including transaction/audit semantics and funding-lot behavior where credits create spendable funds. Direct `wallet_balances` overwrite is forbidden.

## Broader DB risk ownership

Earlier database audits identified privileged mutation/security surfaces in the website database. Those are website/backend concerns, not permission for the Discord bot to bypass the website. The rebuilt Internal API boundary deliberately removes DB credentials from the bot and must not be weakened.

## Migration ownership

This repository does not own Supabase migrations. Any required DB/API mutation contract must be implemented and audited in the website/backend project before the bot can consume it.

## Secret handling

Never commit or document real:

- Discord bot tokens;
- Internal API HMAC secrets;
- website service credentials;
- Supabase service-role credentials;
- database credentials.