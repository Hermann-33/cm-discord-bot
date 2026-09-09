# ADR-0018 — Manual pending-purchase approval and direct-result sharing

Status: Accepted

Date: 2026-09-09

## Context

ADR-0011 intentionally made purchase intents without a canonical order read-only because the bot did not yet consume the website's purchase-processing mutation.

The production Internal Integrations API now exposes and verifies the closed `purchase-intents.process` operation for a trusted integration to manually finalize a human-verified payment. The website, not the bot, derives amount, provider, catalog target, order contents, accounting, fulfillment mode and durable effects.

Separately, ADR-0017 direct Aura, wallet and refund commands returned a final private result but did not create a `CmAdminSession`, so those final results could not use the existing customer-safe **Share to Chat** renderer.

## Decision

### Direct result sharing

Successful direct commands:

```text
/cm aura
/cm balance
/cm refund
```

create an operator-bound expiring `CmAdminSession` after the mutation succeeds.

The session stores only the already returned canonical result needed by the existing share renderer:

- adjustment success for Aura/wallet;
- refund success for refund.

The private final panel includes **Share to Chat**. Public output is still produced only by the dedicated ADR-0008/ADR-0009 customer-safe renderer. Direct-command reasons, audit IDs, transaction IDs and other private mutation metadata are not copied to chat.

This changes presentation/session behavior only. It does not add a new website mutation or weaken ADR-0017 direct-command authorization.

### Manual pending-purchase approval

A purchase-intent panel may expose **Approve Payment** when CM reports a processable source state:

```text
pending
processing
failed
expired
underpaid
```

The control is only for an administrator who has independently verified that the payment should be accepted.

Flow:

```text
pending purchase panel
  -> Approve Payment
  -> reason/evidence modal
  -> fresh purchase-intents.lookup.read
  -> exact owner users.overview.read
  -> private confirmation <= 5 minutes
  -> fresh purchase-intents.lookup.read
  -> exact purchase/user equality + no canonical order
  -> purchase-intents.process with stable UUID idempotency key
  -> refresh purchase intent
  -> canonical order lookup when available
  -> backend audit + sanitized Discord audit
  -> final private result
```

The bot sends only:

- canonical purchase-intent selector;
- reason;
- optional evidence reference;
- stable mutation idempotency key;
- Discord operator audit context.

The bot must not send or derive an accepted amount, provider, product/account identity, core processing mode, finalizer, quantity, currency, Aura values, fulfillment identifiers/material or arbitrary business metadata.

### Processing outcome

If CM returns `processing.status = "processed"` and the purchase lookup exposes a canonical `orderId`, the bot resolves that order, requires exact owner equality, records the success state and presents **Manual Approval Complete** with **Share to Chat**.

If CM returns `processing.status = "processing"`, or a canonical order is not yet visible, the session becomes **Approval Processing**. The approval control is disabled and the operator may only refresh the purchase. The bot does not create a new idempotency key or automatically submit a second process mutation.

The website's durable process state remains authoritative.

### Authorization and audit

Every approval button/modal/confirmation reuses ADR-0006:

- exact configured guild;
- non-empty explicit `BOT_ADMIN_USER_IDS`;
- invoking user explicitly allowlisted;
- operator-bound non-expired session.

`BOT_AUDIT_LOG_CHANNEL_ID` must exist before execute.

The website's immutable integration/business audit is authoritative. The bot also emits a sanitized Discord audit panel with purchase reference, canonical order reference when available, customer identity, result, reason and operator.

Customer AI has zero authority to call `purchase-intents.process`.

### API permission

The bot's dedicated website integration client must now explicitly allow:

```text
purchase-intents.process
```

No wildcard permission or service-role/database credential is permitted.

`purchase-intents.process.status.read` is not required by this implementation because recovery is performed by the existing canonical purchase lookup/refresh path. A future status-polling implementation may add it only with a separate explicit decision.

## Supersession

ADR-0018 supersedes ADR-0011 only where ADR-0011 states that:

- pending purchase intents are always read-only;
- purchase processing is forbidden to the bot;
- `purchase-intents.process` cannot be a bot operation.

ADR-0011 remains authoritative for order-first lookup, canonical-owner equality, pending-purchase disclosure, fulfillment-support metadata and customer-safe sharing.

Manual fulfillment remains forbidden and is not implemented.

## Consequences

Positive:

- authorized staff can recover a verified payment whose normal callback/finalization path did not create the order;
- all order/accounting/fulfillment business logic remains server-owned;
- stable idempotency prevents duplicate logical approval on transport retry;
- a processing response cannot be converted into blind repeated submissions;
- direct mutation results become shareable without exposing private admin metadata.

Operational requirement:

- deploy bot source;
- add exactly `purchase-intents.process` to the bot integration client's website `allowedOperations`;
- no Discord slash-command re-registration is required because this change adds buttons/modals, not new command JSON.

## Rejected alternatives

- Directly update purchase/order rows — rejected; violates the Internal Integrations boundary.
- Let the bot choose the accepted amount — rejected; the API intentionally excludes that field.
- One-click approval with no review state — rejected for a payment-finalization mutation.
- Generate a new idempotency key when CM reports processing — rejected; risks turning recovery into a second logical action.
- Reuse customer AI to approve purchases — rejected; hosted AI remains non-authoritative and mutation-free.
