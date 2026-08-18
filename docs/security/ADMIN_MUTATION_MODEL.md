# Admin Mutation Model — Aura, Wallet and Refund

Updated: 2026-08-18

ADR-0006 governs shared `/cm` authorization. ADR-0007 governs Aura/wallet confirmation. Refund retains its canonical backend preview/re-preview model.

## Global invariants

Every mutation-capable `/cm` interaction must satisfy:

1. supported slash/component/modal admin surface;
2. interaction is in a guild;
3. guild exactly equals configured `DISCORD_GUILD_ID`;
4. `BOT_ADMIN_USER_IDS` is non-empty;
5. invoking Discord user ID is explicitly in that allowlist;
6. every button/modal interaction re-runs the same authorization;
7. operation-specific input and confirmation state are valid;
8. mutation occurs only through an approved HMAC Internal Integrations API operation;
9. `BOT_AUDIT_LOG_CHANNEL_ID` is configured before execute;
10. backend audit remains authoritative and Discord audit is mention-safe.

There is no shared `/cm` command-channel restriction. Discord roles may only add restrictions and never replace the explicit user-ID allowlist.

The bot must never receive direct database/service-role credentials or call Supabase/Postgres tables/functions/RPCs directly.

## Verified website mutation operations

```text
users.aura.adjust
POST /api/internal/integrations/v1/users/aura/adjust

users.wallet.adjust
POST /api/internal/integrations/v1/users/wallet/adjust

orders.refund.execute
POST /api/internal/integrations/v1/orders/refund/execute
```

Common backend properties verified from current website source/contracts:

- strict request schemas;
- canonical user/order selector resolution;
- UUID idempotency keys;
- request-hash replay/conflict semantics;
- transactional website-owned accounting/business logic;
- negative-balance protection for Aura/wallet;
- immutable admin/integration audit evidence;
- stable transaction/audit identifiers;
- optional Discord operator context is audit-only and never authorization.

## Transport idempotency rule

The bot's Internal API client must serialize one logical mutation body before transport retry.

For the same logical mutation:

- target/delta/reason/operator/idempotency key remain identical;
- exact body remains identical;
- timestamp is fresh per HTTP attempt;
- HMAC nonce is fresh per HTTP attempt;
- HMAC signature is fresh per HTTP attempt;
- deterministic conflict errors are not converted into a new logical mutation.

Never generate a new idempotency key simply because transport failed.

## Aura adjustment — ADR-0007

### Inputs

- target comes from the already authorized `/cm` user session;
- signed whole-number `deltaAura`;
- non-zero;
- maximum magnitude `1,000,000,000`;
- reason 1–500 characters.

### Confirmation flow

```text
Adjust Aura
  -> modal
  -> fresh users.overview.read
  -> current available Aura + delta + projected available Aura
  -> explicit private confirmation <= 5 minutes
  -> fresh users.overview.read
  -> exact available-Aura equality with preview state
  -> users.aura.adjust
  -> verify returned target and delta
  -> backend audit + Discord audit
  -> refresh user overview
```

If the current relevant balance changed between preview and confirm, execution fails closed and a new preview is required.

Projected negative available Aura is rejected locally and remains backend-rejected as defense in depth.

The bot never edits pending/lifetime fields or writes an Aura balance directly. Website accounting/audit logic is authoritative.

## Wallet adjustment — ADR-0007

### Inputs

Operator enters a signed decimal amount in major currency units, for example:

```text
+10.00
-5.25
```

Bot requirements:

- at most two decimal places;
- exact conversion to integer cents;
- non-zero;
- maximum magnitude `100,000,000` cents (`1,000,000.00` units);
- reason 1–500 characters.

### Confirmation flow

Mirrors Aura:

```text
Adjust Wallet
  -> modal
  -> fresh users.overview.read
  -> current wallet + cents delta + projected wallet
  -> explicit private confirmation <= 5 minutes
  -> fresh users.overview.read
  -> exact wallet-balance equality with preview state
  -> users.wallet.adjust
  -> verify returned target and delta
  -> backend audit + Discord audit
  -> refresh user overview
```

If no wallet row is returned, the preview uses zero/USD because the verified website wallet adjustment primitive prepares a zero-balance USD row before applying the canonical delta.

Projected negative balance is rejected locally and remains backend-rejected.

The bot never overwrites wallet balances. The website mutation creates the canonical wallet transaction and participates in funding-state logic.

## Why Aura/wallet do not use a dedicated backend preview token

ADR-0007 explicitly supersedes ADR-0004's older dedicated-backend-preview requirement for these two operations.

The accepted safety model is:

- private operator-bound proposal;
- explicit confirmation;
- exact target/delta/reason/operator binding;
- fresh authoritative read before preview;
- fresh authoritative read immediately before first execute;
- exact relevant-balance equality;
- stable backend idempotency;
- website transactional validation/accounting;
- immutable audit.

The in-memory proposal is therefore an operator confirmation/state-binding layer, not the business mutation implementation.

## Refund — canonical backend preview remains required

Refund keeps the existing stronger model because the website exposes:

```text
orders.refund.preview
orders.refund.execute
```

Flow:

```text
Refund
  -> reason modal 8–1000
  -> canonical refund preview
  -> explicit confirmation <= 5 minutes
  -> fresh canonical re-preview
  -> exact full DTO equality
  -> execute with stable idempotency/body
  -> backend audit + Discord audit
```

Caller does not choose refund economics. Website derives refund amount, wallet credit, Aura effects and audit/transaction IDs from the canonical order.

ADR-0007 does not weaken this flow.

## Direct order entry

`/cm order` is a read/navigation entry point, not a new mutation primitive. It resolves canonical `orders.details.read`, resolves the owner overview, verifies target consistency and then reuses the same order/refund/user controls.

## Manual fulfillment — forbidden until backend operation exists

Current website API exposes:

```text
orders.fulfillment.read
```

only.

The bot may show diagnostics and an informational Manual Fulfillment button, but must not:

- call a database function directly;
- reuse `purchase-intents.process` as a substitute;
- invent a hidden endpoint/path;
- mutate order/delivery state locally.

A future manual-fulfillment feature requires a website-owned narrow operation with explicit idempotency, business validation and audit.

## Audit evidence

Backend evidence is authoritative. As applicable it should identify:

- integration client/operation;
- idempotency key/request identity;
- target user/order;
- delta or refund consequence;
- reason;
- transaction IDs;
- admin audit event ID;
- operator audit context;
- replay state;
- timestamp.

Discord audit output should contain only necessary sanitized operational details and must disable mentions.

## Error behavior

Known deterministic adjustment errors:

```text
INVALID_ADJUSTMENT
INSUFFICIENT_BALANCE
IDEMPOTENCY_CONFLICT
NOT_FOUND
```

They must fail safely and not generate a different logical mutation automatically.

Rate limit/authentication/operation-permission/service errors are surfaced through stable safe bot messages without exposing raw backend detail or credential material.

## Forbidden shortcuts

- direct Supabase/Postgres access;
- service-role/database credential in bot;
- role-only admin authorization;
- DM or wrong-guild mutation;
- treating ephemeral visibility as authorization;
- unconfirmed Aura/wallet adjustment;
- skipping the final fresh-state equality check before first Aura/wallet execute;
- changing logical idempotency key/body on retry;
- direct balance overwrite;
- destructive ledger/audit edits for reversal;
- caller-supplied refund economics;
- manual fulfillment without a website mutation operation;
- purchase processing as a fulfillment/admin shortcut;
- secrets/credential values in logs, component IDs or audit messages.
