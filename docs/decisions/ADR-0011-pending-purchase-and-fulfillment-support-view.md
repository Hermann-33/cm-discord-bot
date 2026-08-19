# ADR-0011 — Pending purchase lookup and fulfillment support view

Status: Accepted

Date: 2026-08-19

## Context

`/cm order` originally resolved only canonical `orders` rows through `orders.details.read`. A checkout can exist in `purchase_intents` before the website creates the canonical order, so a valid pending CM public reference returned `NOT_FOUND` even though the purchase existed.

The website also extended the existing `orders.fulfillment.read` response with an optional privileged support object containing human-readable product/account type information, finite duration when known, bounded **masked** fulfillment material and canonical manual-required state. The extension is additive and fail-safe; raw/decrypted fulfillment secrets are not part of the contract.

The bot must consume both website capabilities without weakening `/cm` authorization, canonical ownership checks, mutation confirmation, public-share disclosure rules or the no-direct-database boundary.

## Decision

### Unified `/cm order` entry

`/cm order reference:<reference>` remains one staff entry point for both canonical orders and pre-order purchase intents.

Lookup order is mandatory:

1. authorize the `/cm` interaction before backend access;
2. normalize the input as `order_id` or `public_ref`;
3. call `orders.details.read` first;
4. only when that call returns stable `NOT_FOUND`, call `purchase-intents.lookup.read` using the equivalent `purchase_intent_id` or `public_ref` selector;
5. never use the purchase-intent fallback for authentication, authorization, rate-limit, validation, dependency or other service errors;
6. resolve the canonical owner with `users.overview.read(user_id)` and require exact user-ID equality before creating the operator session.

If a purchase intent already contains `orderId`, the bot attempts the canonical order immediately. A pending-purchase refresh repeats the exact purchase-intent lookup and automatically transitions to the normal order panel once the canonical order becomes resolvable.

### Pending purchase controls

A purchase intent without a canonical order is read-only support state. The private panel may show safe purchase/payment status, amount, dates and customer identity, but order-only controls are unavailable until the canonical order exists.

In particular, a pending purchase does not expose:

- refund controls;
- delivery/fulfillment controls;
- purchase processing;
- manual fulfillment;
- any direct database action.

`purchase-intents.process` remains forbidden to the bot and is not a lookup/fulfillment shortcut.

### Fulfillment support metadata

The bot may consume the optional `orders.fulfillment.read.support` object:

- `productTypeLabel`;
- `productDurationDays`;
- at most 10 masked `license_key` / `account_token` values;
- `manualRequired`.

The bot DTO remains strict and rejects unexpected raw-material fields. Support enrichment is optional: inability to load the support view must not prevent the already-authorized canonical order panel from opening or its existing refund/navigation controls from functioning.

A missing support object or empty masked-material list is **not** evidence that manual fulfillment is required. Manual-required presentation must come from canonical fulfillment/manual state.

### Disclosure boundary

Masked fulfillment material is privileged staff support data. It may appear only in the private authorized `/cm` order/delivery UI. It must not be copied into Share to Chat.

Customer-safe pending-purchase sharing may include the canonical customer email (ADR-0009), linked Discord identity, public purchase reference, safe item/variant/game, amount, payment method, status and customer-relevant dates. It must omit purchase-intent UUIDs, internal option IDs, provider identifiers/provider status, masked fulfillment material, operator/admin internals, credentials and interactive admin controls.

ADR-0008 and ADR-0009 continue to govern the public renderer.

### API surface

The bot least-privilege operation set adds exactly:

```text
purchase-intents.lookup.read
```

No new environment variable or slash-command definition is required. Deployed website client configuration must explicitly allow this operation before pending lookup can succeed.

## Security invariants retained

- ADR-0006 exact guild + explicit `BOT_ADMIN_USER_IDS` authorization on every `/cm` interaction;
- operator-bound expiring sessions;
- ADR-0007 Aura/wallet confirmation/idempotency/audit model;
- canonical refund preview/re-preview/execute model;
- website-owned business/accounting authority;
- no Supabase/Postgres/service-role credential or fallback in the bot;
- no manual-fulfillment mutation;
- no purchase-processing shortcut;
- no raw/decrypted fulfillment secret disclosure;
- safe public rendering remains separate from private admin rendering.

## Consequences

Positive:

- pending CM purchase references become supportable through the existing `/cm order` command;
- canonical orders receive richer but bounded staff support context;
- pending-to-order transition happens without inventing a new Discord command;
- website and bot remain independently least-privilege scoped.

Trade-offs:

- deployment must add `purchase-intents.lookup.read` to the bot integration client's website allowlist;
- pending purchases do not have refund/delivery controls until the website creates a canonical order;
- masked material is intentionally useful only to authorized staff and cannot be propagated by Share to Chat.

## Rejected alternatives

- Query purchase intents first for every order lookup — rejected because canonical order is authoritative once it exists.
- Fall back on every order error — rejected because it could hide permission/auth/service failures.
- Use `purchase-intents.process` to make a pending purchase actionable — rejected; it is a mutation/business workflow, not a lookup fallback.
- Treat missing masked material as manual-required — rejected because the support object is optional/fail-safe.
- Expose masked material in customer-shared panels — rejected because the support extension is privileged staff metadata.
- Add direct Supabase/Postgres lookup — rejected by ADR-0001/ADR-0002 and current architecture.
