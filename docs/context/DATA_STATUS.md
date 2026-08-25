# Data and Backend Dependency Status

Verified/re-baselined: 2026-08-24 10:49 +08:00

## Bot-side invariant

The Discord bot has **no direct Supabase/Postgres access**, no service-role/database credential and no table/RPC fallback. Website-owned business/data access occurs only through the HMAC-authenticated Internal Integrations API.

## Website capability catalog

Current documented website V1 operation IDs are:

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

This catalog is not the bot source surface and is not proof of a deployed client's permission. Website clients have explicit non-empty `allowedOperations`; there is no wildcard/master bypass.

`purchase-intents.process` remains forbidden to the Discord bot AI-support design as well as ordinary bot operations.

## Current production/admin bot operation surface

Current tracked admin/leaderboard source intentionally consumes only the operations required by existing production surfaces, including:

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

Source support alone is not runtime authorization. Deployment must use a least-privilege website integration-client `allowedOperations` list.

Customer-facing AI support remains disabled/unwired, so intended support-planner lookup IDs do not by themselves expand the deployed bot's permissions.

## AI support dynamic lookup mapping

The private `runtime-kb/dynamic-lookups.json` contains canonical lookup concepts for current state. These are planner/runtime knowledge objects, not automatic API permissions.

Known mappings include:

```text
dynamic.order.status          -> orders.details.read
dynamic.fulfillment.status    -> orders.fulfillment.read
dynamic.purchase_intent.status -> purchase-intents.lookup.read
dynamic.user.overview         -> users.overview.read
```

The private runtime source also defines current catalog concepts such as stock, price and product status with an operation label:

```text
catalog.current.read
```

That operation is **not present in the currently documented website V1 operation catalog above**. Treat this as an unresolved API-contract gap.

Until a separately scoped website/API review confirms or adds an approved current-catalog operation, the Discord bot must not execute `catalog.current.read`, invent an equivalent endpoint, or answer current stock/price/product/detection state from historical ticket evidence.

## HTTP/HMAC contract

Requests remain POST JSON with no query string and exact raw-body HMAC signing. Transport timestamp/nonce/signature are fresh per HTTP attempt. Mutation UUID idempotency key + logical request body remain stable across retries; same key with changed body conflicts.

AI-support work must not weaken signing, timeout, response-bound or retry semantics.

## User selectors and Discord identity

`users.overview.read` continues to accept supported user selectors such as canonical user ID, email and external identity according to the current website contract. `/cm user discord_user:<selected Discord user>` uses Discord external identity resolution through the approved website API boundary.

Canonical order and pending purchase flows resolve the website-returned `userId` through `users.overview.read(user_id)` and require exact equality before opening an operator session.

## Order and pending-purchase selectors

Canonical order selectors include:

```text
order_id
public_ref
```

Purchase-intent selectors include:

```text
purchase_intent_id
public_ref
```

`/cm order` uses canonical order first. Only stable `NOT_FOUND` permits fallback to `purchase-intents.lookup.read` with the equivalent selector.

Pending purchase responses expose safe support fields including canonical user, purchase kind/item/variant, quantity, amount/currency, payment method/provider, purchase/provider status, optional `orderId`, expiry and creation time. The private admin UI deliberately displays only the subset needed for staff support.

If `orderId` becomes available, the bot returns to canonical `orders.details.read`; it does not mutate/process the purchase intent.

## AI first-turn selector rule

For customer-facing support triage, an order/public reference can identify **which order** without identifying **what the customer wants about that order**.

Therefore:

```text
bare order selector + no explicit status/payment/delivery intent
 -> preserve order/fulfillment context
 -> clarify requested support action

selector + explicit current-state intent
 -> use the approved relevant live lookup
```

The current feature branch still has a known deterministic-router overreach on six V3 selector-only rows. This is documented in `HANDOFF.md` and must be corrected before more hosted evaluation.

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
- `maskedMaterials` is bounded;
- values are masked only;
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

Never commit/log real Discord tokens, HMAC secrets, Groq/OpenRouter keys, website service credentials, Supabase service-role/database credentials or production integration-client key material. Masked fulfillment support values are privileged staff presentation data and must not be republished through customer-safe Share to Chat.

## Hosted AI planner data boundary

The primary hosted provider is Groq `openai/gpt-oss-120b`; OpenRouter is secondary only.

The hosted planner receives only a compact sanitized planning payload: masked customer text, bounded support state, and explicit canonical case/clarification/lookup/policy/entity options for the current turn.

Raw transcripts, historical evidence, private evaluation rows, fulfillment material, API request bodies, credentials and the global lookup catalog are forbidden.

The public `support-runtime/` pack is an ADR-0012 sanitized derivative, not a copy of private `runtime-kb/`. The import allowlist excludes private manifests, routing exemplars, provenance/evidence fields, transcript/fact IDs and historical match-context prose. Production has no private-repository filesystem dependency.

## Current AI benchmark/data checkpoint

The committed V3 adjudication overlay excludes 26 rows. The rebuilt consumed development benchmark retains 236/236 adjudicated rows with review queue 0 and representability 1. The post-fix 40-row Groq prefix had zero unsafe, fallback, invalid, leakage, or semantic-review rows.

The final holdout remains untouched. Do not broaden API permissions or hosted lookup options for benchmark performance, and do not invent the unresolved `catalog.current.read` operation.
