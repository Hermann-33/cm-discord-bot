# Data and Backend Dependency Status

Verified/re-baselined: 2026-08-17

## Production bot boundary

Production `master` still has no direct Supabase/Postgres access and no database fallback. Its deployed/source API use remains the two Aura read operations:

```text
aura.leaderboards.read
aura.lookup.read
```

`TASK-CM-ADMIN-001` exists on feature branch `task/cm-admin-console` only. It has not been merged, registered, deployed or used to make a live mutation.

## Authoritative Internal Integrations API catalog

Backend contract documentation supplied on 2026-08-17 lists production operations including:

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

Each integration client has an exact `allowedOperations` list. There is no wildcard/master bypass. Endpoint existence is not bot permission.

## HMAC/idempotency contract

Integration routes are POST/JSON/no query string and require the current `cm-integrations-v1` HMAC headers. Exact serialized UTF-8 body bytes are signed.

Transport identity is per attempt:

- fresh 13-digit millisecond timestamp;
- fresh lowercase UUIDv4 nonce;
- fresh HMAC signature.

Business mutation identity is per logical action:

- UUID `idempotencyKey` stable across retries;
- exact request body stable across retries;
- same key + changed body -> `IDEMPOTENCY_CONFLICT`.

## Website source verification for TASK-CM-ADMIN-001

Read-only source inspection was performed against `Thin-Tall-Dude/cheaters-market` commit:

```text
20f6cb52344bade858099febcec2d1c59312f2e5
```

The website was not modified.

### User overview

Verified request:

```text
users.overview.read
POST /api/internal/integrations/v1/users/overview
```

Request contains `userLookupSelectorSchema` and `recentOrdersLimit` from 1 through 10. Response contains:

- full staff email/user identity and external identities;
- account-control/ban state;
- wallet balance/currency;
- available/pending/lifetime Aura fields;
- order/license/account-delivery counts;
- `recentOrders` with a hard max of 10.

Therefore the candidate bot can show only the latest 10 orders from this operation. It pages those locally at five per page. No current Internal Integrations operation was found that pages older orders for a selected user, so the bot must not claim full historical-order coverage or invent a data path.

### Order details

Verified operation:

```text
orders.details.read
POST /api/internal/integrations/v1/orders/details
```

The safe privileged DTO includes canonical order/user identity, full customer email, product/account descriptors, quantity, amount/currency, payment method/provider, status, timestamps and fulfillment summary. It does not expose secret fulfillment material.

### Fulfillment diagnostics

Verified operation:

```text
orders.fulfillment.read
POST /api/internal/integrations/v1/orders/fulfillment
```

Response exposes safe product/account fulfillment diagnostics including delivery IDs, provider code, status, quantities, failure code/user message and manual-required timestamp.

No dedicated Internal Integrations **manual-fulfillment mutation** operation exists in the verified operation catalog/source. The feature branch therefore performs no manual-fulfillment mutation.

### Refund preview/execute

Verified operations:

```text
orders.refund.preview
orders.refund.execute
```

Preview is read-only and returns the server-derived canonical refund consequences including gross refund, final wallet credit and Aura recovery/conversion values.

Execute request accepts only:

- canonical order selector;
- reason 8–1000 characters;
- UUID idempotency key;
- optional strict operator audit context.

Caller cannot choose refund amount, wallet credit, Aura effects, transaction IDs or target user separately from the selected order.

Execute response includes the server-derived refund result, wallet/Aura transaction IDs, admin audit event ID, refund timestamp and `idempotentReplay` state.

### Aura/wallet selector discrepancy resolved

Actual website source shows:

```text
walletAdjustmentRequestSchema -> userLookupSelectorSchema
auraAdjustmentRequestSchema   -> userLookupSelectorSchema
```

`userLookupSelectorSchema` includes:

- `user_id`;
- `email`;
- `external_identity`.

This source evidence supersedes the earlier prose conflict that described external identity as lookup-only while quickstart examples used it for balance mutations.

This resolution does **not** authorize Discord Aura/wallet adjustment. ADR-0004 confirmation/state-binding requirements remain unsatisfied by the direct execute-only adjustment contract, so candidate bot source contains no Aura/wallet execute method/path.

## Candidate bot operation requirement

For `/cm user` + order navigation + refund, the candidate needs only these additional backend permissions:

```text
users.overview.read
orders.details.read
orders.fulfillment.read
orders.refund.preview
orders.refund.execute
```

The actual bot client's `allowedOperations` were not modified or verified in TASK-CM-ADMIN-001. A backend 403 is the expected fail-closed result until explicitly provisioned.

## Aura database/admin foundation

Previously verified live Supabase primitives remain upstream website implementation facts:

```text
public.admin_adjust_aura_balance(...)
public.internal_integration_adjust_aura_balance(...)
operation users.aura.adjust
```

The internal-integration Aura primitive is service-role-only among checked app roles, idempotency/request-hash protected, bounded to non-zero +/-1,000,000,000 Aura, validates target/reason/operator context, protects against negative resulting available Aura, and records Aura transaction/admin audit evidence.

The bot must never call the database function directly.

## Wallet database/admin foundation

Previously verified live primitives remain:

```text
public.admin_adjust_wallet_balance(...)
public.internal_integration_adjust_wallet_balance(...)
operation users.wallet.adjust
```

The internal-integration wallet primitive is service-role-only among checked roles, persistent-idempotency/request-hash protected, bounded to non-zero +/-100,000,000 cents, validates target/reason/operator context, rejects negative resulting wallet balance and writes wallet transaction/admin audit evidence.

A live wallet transaction AFTER INSERT trigger participates in funding-state synchronization: positive transactions route to funding-lot synchronization and negative transactions to funding-consumption synchronization.

This is why wallet remains later/stricter than Aura and cannot be implemented as a direct balance overwrite.

## Live Supabase dependency snapshot

Read-only dependency facts verified 2026-08-17:

- project ref `gcqbayehikvbwvvseyoc`;
- project name `Cheater's Market`;
- region `us-east-1`;
- status `ACTIVE_HEALTHY`;
- Postgres `17.6.1.063`.

The bot never connects directly to this project.

Relevant migration ledger included:

- `20260810024630 add_internal_discord_bot_api_nonce_guard`;
- `20260812104228 add_internal_integration_balance_adjustments`;
- `20260814044248 add_internal_integration_order_refund_execute`;
- `20260815052426 add_internal_integration_purchase_processing_outbox`;
- `20260816050802 add_daily_drop`;
- `20260816050858 tighten_daily_drop_spins_grants`;
- `20260816051116 add_daily_drop_foreign_key_indexes`;
- `20260816064702 list_active_daily_drop_coupons`.

## RLS/upstream security context

Relevant checked tables such as Aura/wallet balances/transactions, integration idempotency, Discord links/privacy and admin operation events have RLS enabled.

The live Supabase security advisor previously reported unrelated public/signed-in executable `SECURITY DEFINER` functions and other backend findings. Those remain website/database ownership. They do not justify any bot direct-DB access or weakening of the Internal API boundary.

The verified Aura/wallet internal-integration adjustment functions themselves were not executable by anon/authenticated among the checked roles.

## Verification limits for candidate bot

Still unverified for TASK-CM-ADMIN-001:

- candidate bot credential's actual new `allowedOperations`;
- dependency-aware `npm test`, typecheck and build on candidate head because GitHub Actions runner startup is blocked by account billing/spending status;
- command registration/deployment behavior;
- authenticated read smoke test with the candidate credential scope;
- controlled refund smoke test.

No live bot mutation was performed.

## Ownership and secret boundary

This bot repo does not own website routes, operation allowlists, Supabase migrations/RLS/grants or business ledgers.

Never commit/document real:

- Discord bot token;
- Internal API HMAC secret/signature/nonce/raw authenticated body;
- Supabase service-role/database credentials;
- private fulfillment material.
