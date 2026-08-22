# Data and Backend Dependency Status

Verified/re-baselined: 2026-08-23

## Bot-side invariant

The Discord bot has **no direct Supabase/Postgres access**, no service-role/database credential and no table/RPC fallback. Website-owned business/data access occurs only through the HMAC-authenticated Internal Integrations API.

## Website capability catalog

Current website source exposes these V1 operation IDs:

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

## Bot operation surface — TASK-CM-ADMIN-007

Current feature source intentionally consumes only:

```text
aura.leaderboards.read
aura.lookup.read
users.overview.read
orders.details.read
orders.fulfillment.read
purchase-intents.lookup.read
orders.refund.preview
orders.refund.execute
users.aura.adjust
users.wallet.adjust
```

The only new bot operation is read-only `purchase-intents.lookup.read`. `purchase-intents.process` remains forbidden.

Deployment must explicitly add `purchase-intents.lookup.read` to the bot integration client's website `allowedOperations`. Source support alone is not runtime authorization.

## HTTP/HMAC contract

Requests remain POST JSON with no query string and exact raw-body HMAC signing. Transport timestamp/nonce/signature are fresh per HTTP attempt. Mutation UUID idempotency key + logical request body remain stable across retries; same key with changed body conflicts.

TASK-CM-ADMIN-007 does not change signing, timeout, response bound or retry semantics.

## User selectors and Discord identity

`users.overview.read` continues to accept `user_id`, `email` and `external_identity`. `/cm user discord_user:<selected Discord user>` uses `external_identity/provider=discord`.

Canonical order and pending purchase flows both resolve the website-returned `userId` through `users.overview.read(user_id)` and require exact equality before opening an operator session.

## Order and pending-purchase selectors

Canonical order selectors:

```text
order_id
public_ref
```

Purchase-intent selectors:

```text
purchase_intent_id
public_ref
```

`/cm order` uses canonical order first. Only stable `NOT_FOUND` permits fallback to `purchase-intents.lookup.read` with the equivalent selector.

Pending purchase responses expose safe support fields including canonical user, purchase kind/item/variant, quantity, amount/currency, payment method/provider, purchase/provider status, optional `orderId`, expiry and creation time. The bot private UI deliberately displays only the subset needed for staff support.

If `orderId` becomes available, the bot returns to canonical `orders.details.read`; it does not mutate/process the purchase intent.

## Fulfillment support view

`orders.fulfillment.read` remains read-only diagnostics. Current website contract may add optional:

```text
support.productTypeLabel
support.productDurationDays
support.maskedMaterials[]
  kind = license_key | account_token
  maskedValue
support.manualRequired
```

Rules:

- `support` is optional/fail-safe;
- `maskedMaterials` is bounded to at most 10 values;
- values are stored masked material only;
- raw/decrypted license/account secrets are outside the DTO;
- bot strict schemas reject unexpected fields;
- missing support or empty masked material does not imply manual-required;
- best-effort support fetch failure must not block an otherwise valid canonical order panel.

No manual-fulfillment execute operation exists. The bot must not call DB functions, invent an endpoint or reuse `purchase-intents.process` as a substitute.

## Share to Chat data source

Share to Chat performs no extra backend mutation. It renders from the already-authorized `CmAdminSession`.

ADR-0009 permits the canonical customer email. ADR-0011 permits a separately rendered customer-safe pending-purchase summary but keeps provider/provider-status internals, purchase-intent UUIDs/internal option IDs and masked fulfillment support material private.

## Refund

Website owns:

```text
orders.refund.preview
orders.refund.execute
```

Refund remains available only after a canonical order exists. The bot retains canonical preview -> explicit confirmation -> fresh exact preview equality -> execute.

## Aura adjustment

`users.aura.adjust` contract and ADR-0007 confirmation/state-equality/idempotency/audit model are unchanged.

## Wallet adjustment

`users.wallet.adjust` contract and ADR-0007 confirmation/state-equality/idempotency/audit model are unchanged. The bot never overwrites wallet balance directly.

## Stable relevant errors

```text
NOT_FOUND             -> 404
OPERATION_FORBIDDEN   -> 403
RATE_LIMITED          -> 429
INVALID_ADJUSTMENT    -> 400
INSUFFICIENT_BALANCE  -> 409
IDEMPOTENCY_CONFLICT  -> 409
```

Pending-purchase fallback is triggered only by `NOT_FOUND` from canonical order lookup. Raw backend error text is never surfaced.

## Database/migration ownership

Live Supabase context is upstream dependency evidence only. This repository owns no DB migration/RLS/grant/function. Any website/API/database change requires separate scope.

## Secret handling

Never commit/log real Discord tokens, HMAC secrets, website service credentials, Supabase service-role/database credentials or production integration-client key material. Masked fulfillment support values are privileged staff presentation data, not reveal credentials, and must not be republished through customer-safe Share to Chat.

## AI planner and support knowledge data boundary

OpenRouter receives only a compact sanitized planning payload: customer text after identifier/credential masking, bounded support state, and explicit canonical case/clarification/lookup/policy/entity options. Raw transcripts, historical evidence, private evaluation rows, fulfillment material, API request bodies and credentials are forbidden.

The public `support-runtime/` pack is an ADR-0012 sanitized derivative, not a copy of private `runtime-kb/`. The import allowlist excludes private manifests, routing exemplars, provenance/evidence fields, transcript/fact IDs and historical match-context prose. Production has no private-repository filesystem dependency.
