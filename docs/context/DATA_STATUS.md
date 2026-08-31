# Data and Backend Dependency Status

Verified/re-baselined: 2026-08-31

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

Tracked admin/leaderboard source consumes only operations required by existing production surfaces, including:

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

Customer-facing AI support is presently enabled only for the ADR-0015 controlled single-channel test. AI planner/action execution remains read-only. This deployment-mode change does **not** expand website operation permissions or authorize any mutation.

## AI support dynamic lookup mapping

The private `runtime-kb/dynamic-lookups.json` contains canonical lookup concepts for current state. These are planner/runtime knowledge objects, not automatic API permissions.

Known mappings include:

```text
dynamic.order.status           -> orders.details.read
dynamic.fulfillment.status     -> orders.fulfillment.read
dynamic.purchase_intent.status -> purchase-intents.lookup.read
dynamic.user.overview          -> users.overview.read
```

The private runtime source also defines current catalog concepts such as stock, price and product status with an operation label:

```text
catalog.current.read
```

That operation is **not present** in the documented website V1 operation catalog above. Treat this as an unresolved API-contract gap. The Discord bot must not execute it, invent an equivalent endpoint, or answer current stock/price/product/detection state from historical ticket evidence.

## HTTP/HMAC contract

Requests remain POST JSON with no query string and exact raw-body HMAC signing. Transport timestamp/nonce/signature are fresh per HTTP attempt. Mutation UUID idempotency key + logical request body remain stable across retries; same key with changed body conflicts.

AI-support work must not weaken signing, timeout, response-bound or retry semantics.

## User selectors and Discord identity

`users.overview.read` accepts supported user selectors such as canonical user ID, email and external identity according to the website contract. `/cm user discord_user:<selected Discord user>` uses Discord external identity resolution through the approved website API boundary.

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

Pending purchase responses expose only safe support fields required by the private operator UI. If `orderId` becomes available, the bot returns to canonical `orders.details.read`; it does not mutate/process the purchase intent.

## AI first-turn selector rule

An order/public reference can identify **which order** without identifying **what the customer wants about that order**.

Therefore:

```text
bare order selector + no explicit status/payment/delivery intent
 -> preserve order/fulfillment context
 -> clarify requested support action

selector + explicit current-state intent
 -> use the approved relevant live lookup
```

The selector-only overreach documented in the old V3 development checkpoint was repaired before B0-v6. Preserve the invariant; do not reintroduce automatic lookup merely because a selector exists.

## Fulfillment support view

`orders.fulfillment.read` remains read-only diagnostics. Optional support data is bounded/masked. Raw/decrypted license/account secrets are outside the DTO and strict schemas reject unexpected fields.

No manual-fulfillment execute operation exists. The bot must not call DB functions, invent an endpoint or reuse `purchase-intents.process` as a substitute.

## Share to Chat data source

Share to Chat performs no extra backend mutation. It renders from the already-authorized `CmAdminSession`.

ADR-0009 permits canonical customer email. ADR-0011 permits a separately rendered customer-safe pending-purchase summary but keeps provider/provider-status internals, purchase-intent UUIDs/internal option IDs and masked fulfillment support material private.

## Existing mutations remain admin-only

Website-owned admin surfaces remain:

```text
orders.refund.preview
orders.refund.execute
users.aura.adjust
users.wallet.adjust
```

Their existing confirmation/state-equality/idempotency/audit models are unchanged. Customer AI support has no authority to call them.

## Stable relevant errors

```text
NOT_FOUND             -> 404
OPERATION_FORBIDDEN   -> 403
RATE_LIMITED          -> 429
INVALID_ADJUSTMENT    -> 400
INSUFFICIENT_BALANCE  -> 409
IDEMPOTENCY_CONFLICT  -> 409
```

Raw backend error text is never surfaced to customer AI or the customer.

## Database/migration ownership

Live Supabase context is upstream dependency evidence only. This repository owns no DB migration/RLS/grant/function. Any website/API/database change requires separate scope.

## Secret handling

Never commit/log real Discord tokens, HMAC secrets, Groq/OpenRouter keys, website service credentials, Supabase service-role/database credentials or production integration-client key material. Masked fulfillment support values are privileged staff presentation data and must not be republished through customer-safe AI/share output.

## Hosted AI planner data boundary

Primary provider:

```text
Groq openai/gpt-oss-120b
```

The hosted planner receives only a compact sanitized planning payload: masked customer text, bounded support state, and explicit canonical case/clarification/lookup/policy/entity options for the current turn.

Raw transcripts, historical evidence, private evaluation rows, fulfillment material, API request bodies, credentials and the global lookup catalog are forbidden.

The public `support-runtime/` pack is an ADR-0012 sanitized derivative, not a copy of private `runtime-kb/`. Production has no private-repository filesystem dependency.

The active response-reconstruction task may derive new **sanitized customer-response guidance** from the transcript corpus offline, but must preserve the same production boundary: private provenance/evidence stays private; only reviewed safe guidance can enter the public runtime.

## Prospective shadow evidence

Prospective shadow evidence is a separate local evaluation class, `prospective_fresh_ticket_shadow`. It contains sanitized adjudication material and cohort-scoped pseudonyms only; it is neither historical corpus data nor planner input. Shadow execution uses only the approved read adapter and adds no operation, permission, mutation, database credential or private-corpus dependency.

No real prospective cohort has started as of this re-baseline.

## Current AI benchmark/data checkpoint

Development V3 is consumed. B0-v3 failed and was consumed; B0-v4/B0-v5 failed deterministic preflight without hosted calls; B0-v6 passed once at 44/44 accepted/exact, zero fallback and 3/3 restricted safety.

All 1,578 historical tickets influenced the pipeline, so there is no legitimate untouched historical holdout remaining. B0-v6 is synthetic evidence only.

The active response-reconstruction work materially changes routing/knowledge/rendering, so it requires a fresh B0-v7-or-later fixture after the new candidate is frozen, followed by prospective validation before broad rollout.

Do not broaden API permissions or hosted lookup options for benchmark performance, and do not invent the unresolved `catalog.current.read` operation.
