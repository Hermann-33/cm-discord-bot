# TASK-CM-ADMIN-007 — Pending order lookup and fulfillment support audit

Date: 2026-08-19

Status: Implementation verified on PR merge-ref; documentation synchronization in progress.

## Scope

Complete the bot side of the website's `orders.fulfillment.read` support-view extension and fix `/cm order` so valid pending checkout references can be inspected before a canonical order row exists.

Protected boundaries retained:

- no website source edits;
- no Supabase/Postgres/service-role access;
- no `legacy/` use;
- no `/cm` authorization change;
- no refund/Aura/wallet confirmation/idempotency/audit change;
- no Share-to-Chat control disclosure;
- no purchase processing/manual fulfillment mutation;
- no live mutation, command registration or deployment during repository work.

## Website contract evidence

Read-only verification against current website source confirmed:

- `purchase-intents.lookup.read` exists at `/api/internal/integrations/v1/purchase-intents/lookup` and accepts exact `purchase_intent_id` or `public_ref` selectors;
- purchase-intent responses include canonical user, purchase kind/item fields, amount/currency, payment/status fields, optional `orderId`, expiry and creation timestamps;
- `orders.fulfillment.read` has an optional support object containing product/account type, finite duration when known, at most 10 stored masked license/account materials and canonical manual-required state;
- the website support enrichment is fail-safe and never returns raw/decrypted fulfillment secrets.

The website repository was read only. No website/database change was performed by this task.

## Root cause — pending order lookup

Previous `/cm order` called only `orders.details.read`. A pending checkout is still a `purchase_intent`, so a valid pending public reference can correctly return `NOT_FOUND` from the order endpoint.

Fix:

```text
/cm order
  -> orders.details.read
  -> only on NOT_FOUND: purchase-intents.lookup.read
  -> exact users.overview.read(user_id) owner resolution
  -> pending private panel
  -> Refresh Purchase
  -> automatically transition to canonical order when orderId/order becomes available
```

Authorization/service/rate-limit errors do not trigger the fallback.

## Bot implementation

### API layer

Added strict purchase-intent schemas/types in `src/api/purchaseIntents.ts` and the exact API client method/path in `src/api/client.ts`.

The architecture allowlist now includes `purchase-intents.lookup.read` while continuing to forbid `purchase-intents.process` and any manual-fulfillment/direct-DB substitute.

Fulfillment response support metadata is strict and optional. Tests prove base fulfillment responses without `support` still parse and unexpected raw material fields fail validation.

### Sessions/navigation

`CmAdminSession` now supports an optional selected pending purchase and a `purchase-intent` share view.

`src/commands/cmPurchaseIntents.ts` refreshes pending state by exact purchase-intent ID, rechecks owner identity and transitions to the canonical order panel when the website creates the order.

### Order support view

Canonical order opening uses best-effort support enrichment. A failure in `orders.fulfillment.read` does not block the order itself, refund navigation or refresh controls.

Private staff order/delivery panels may display:

- human-readable type;
- finite duration;
- fulfillment provider where useful in the private order panel;
- delivered/requested progress;
- bounded masked license/account material;
- canonical manual-required state.

Missing optional support metadata is not treated as manual fulfillment.

### Pending purchase panel

The private panel shows safe customer/purchase/payment state and exposes only:

- Refresh Purchase;
- User Operations;
- Share to Chat.

It does not expose refund, delivery, purchase-processing or manual-fulfillment controls before a canonical order exists.

### Public Share to Chat boundary

A separate pending-purchase share renderer was added. It includes customer-safe purchase information but omits purchase-intent UUID, user UUID, internal option IDs, provider/provider status and admin internals.

Existing fulfillment Share to Chat intentionally ignores the new support object. Tests specifically prove masked support material and provider internals do not leave the private admin surface.

## Verification evidence

Source implementation head:

```text
8e1c1ff839fdf171403219f0b881c82395d17007
```

GitHub Actions run:

```text
32254272306
```

The workflow checked the PR merge ref against concurrent `master` `087e2d431ff3ddb74e034b9d736c64f1b914abc9`, so the transcript-exporter changes already merged to mainline were included in the executable verification.

Node/npm:

```text
Node 22.23.2
npm 10.9.8
```

Results:

```text
npm ci: PASS — 31 packages installed, 32 audited, 0 vulnerabilities
npm test: PASS — 153/153, 0 failed, 0 skipped
npm run typecheck: PASS
npm run build: PASS
git diff --check: PASS
```

Focused passing tests cover:

- exact pending purchase endpoint/selector/DTO;
- order-first, `NOT_FOUND`-only fallback;
- no fallback for `OPERATION_FORBIDDEN`;
- pending owner resolution;
- transition from purchase intent to canonical order;
- optional fulfillment-support failure not blocking order operations;
- strict masked support response and raw-field rejection;
- no false manual-required inference from absent support;
- no pending refund/delivery controls;
- no masked support material/provider internals in Share to Chat;
- unchanged `/cm` command registration shape;
- no direct database client/credential/path;
- `purchase-intents.process` remains forbidden.

An earlier run failed two new assertions because the test searched serialized text for the word `Refund` while explanatory copy contained that word; no control was exposed. The explanatory copy was clarified and the subsequent full run passed 153/153.

## Deployment requirements

No new bot environment variable and no slash-command definition change were introduced, so Discord command re-registration is not required for this task.

For pending lookups to work after deployment, the website integration client used by this bot must explicitly include:

```text
purchase-intents.lookup.read
```

in its `allowedOperations` list. Endpoint existence alone does not grant permission.

Normal bot deployment/restart is still required after merge. No deployment or live mutation was performed during this repository task.

## Verdict

Repository implementation is `COMPLETE` at the source/verification level. Merge/deployment remain separate operational gates and require explicit authorization.
