# Admin Mutation Model — Aura, Wallet, Refund, Purchase Approval and Ticket Override

Updated: 2026-09-09

ADR-0006 governs shared `/cm` authorization. ADR-0007 governs the existing interactive Aura/wallet confirmation model. ADR-0016 governs the ticket-scoped support access override. ADR-0017 governs direct `/cm aura`, `/cm balance`, and `/cm refund` execution. ADR-0018 governs manual pending-purchase approval and shareable direct results. The existing interactive refund flow retains canonical backend preview/re-preview.

## Global invariants

Every mutation-capable `/cm` interaction must satisfy:

1. supported slash/component/modal admin surface;
2. interaction is in a guild;
3. guild exactly equals configured `DISCORD_GUILD_ID`;
4. `BOT_ADMIN_USER_IDS` is non-empty;
5. invoking Discord user ID is explicitly in that allowlist;
6. every button/modal interaction re-runs the same authorization;
7. operation-specific input and confirmation semantics are valid — interactive flows require their stored confirmation state, while ADR-0017 direct slash submission is itself the confirmation;
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

purchase-intents.process
POST /api/internal/integrations/v1/purchase-intents/process

support.tickets.override
POST /api/internal/integrations/v1/support/tickets/override
```

Common backend properties verified from current website source/contracts:

- strict request schemas;
- canonical user/order selector resolution and immutable ticket-creator binding where applicable;
- UUID idempotency keys;
- request-hash replay/conflict semantics;
- transactional website-owned accounting/business logic as applicable;
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

## Interactive Aura adjustment — ADR-0007

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

## Interactive Wallet adjustment — ADR-0007

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

## Interactive refund — canonical backend preview/re-preview

The existing order-panel refund flow keeps the stronger preview/confirm/re-preview model because the website exposes:

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

ADR-0007 does not weaken this interactive flow. ADR-0017 separately defines the direct slash refund path below.

## Direct Aura / balance / refund — ADR-0017

The allowlisted administrator may execute the following direct slash mutations without the intermediate button/modal confirmation flow:

```text
/cm aura amount:<signed whole number> email:<email>|discord_user:<user> [reason]
/cm balance amount:<signed decimal> email:<email>|discord_user:<user> [reason]
/cm refund reference:<public ref|order UUID> [reason]
```

For these paths, the submitted slash command is the explicit operator confirmation.

### Direct Aura / balance invariants

The bot must:

1. require exactly one target selector: exact email or selected Discord user;
2. parse the amount using the same signed bounds as the interactive flow;
3. resolve a fresh `users.overview.read`;
4. freeze the returned canonical website user ID before execute;
5. reject a locally projected negative balance;
6. require `BOT_AUDIT_LOG_CHANNEL_ID`;
7. generate one fresh UUID idempotency key for the logical mutation;
8. call exactly one website adjustment operation;
9. validate returned target and delta;
10. report the final backend result and post the sanitized Discord audit.

There is intentionally no five-minute proposal, confirm button, or second fresh-state equality comparison on the direct path. The website's transactional validation and negative-balance constraints remain authoritative.

### Direct refund invariants

The bot must:

1. resolve the supplied selector through `orders.details.read`; pending purchase fallback is not used;
2. resolve the exact canonical owner with `users.overview.read(user_id)`;
3. require owner equality;
4. call `orders.refund.preview` immediately before execute to validate current eligibility and exact order/user identity;
5. generate one fresh UUID idempotency key;
6. call `orders.refund.execute` using the frozen canonical order ID, reason and operator;
7. validate returned order/user identity;
8. report only the final completed result and post the sanitized Discord audit.

The direct path does not expose or accept caller-supplied refund economics. The website still derives wallet credit, Aura effects and all canonical refund accounting.

The existing interactive button/modal workflows remain available and retain their older confirmation semantics.

## Support ticket override — ADR-0016

Command:

```text
/cm ticket-allow
```

This mutation exists only to manually bypass the account-link requirement for the current support ticket. It does not alter the customer's website account link and does not create a global Discord-user allowlist.

Inputs are bound by deterministic bot context:

- current Discord ticket channel ID;
- resolved/persisted ticket creator Discord ID;
- invoking administrator Discord ID;
- fixed safe override reason;
- fresh UUID idempotency key.

Flow:

```text
authorize exact guild + BOT_ADMIN_USER_IDS
 -> require configured Discord audit channel
 -> resolve current ticket creator safely
 -> support.tickets.override
 -> require admin_override response state
 -> restore only the creator permissions changed by the CM gate
 -> website audit + Discord audit
```

The website owns durable override state and idempotency. `adminDiscordId` is audit attribution only; it never replaces bot-side human authorization.

`TICKET_CREATOR_MISMATCH` is a deterministic conflict and fails closed. The bot must not retry it using a different creator or invent a new ticket binding.

No second confirmation dialog is required for the ticket override because the operation is narrowly scoped to the current ticket and is already bound to an explicit allowlisted administrator plus backend idempotency/audit. ADR-0017 separately permits single-submission direct Aura/balance/refund commands under its stricter canonical-target and audit rules.

## Direct order entry

`/cm order` is a read/navigation entry point, not a new mutation primitive. It resolves canonical `orders.details.read`, resolves the owner overview, verifies target consistency and then reuses the same order/refund/user controls.

## Manual pending-purchase approval — ADR-0018

Manual approval is a payment-finalization mutation, not a status override. It is available only from an authorized pending-purchase session after staff independently verifies payment.

```text
Approve Payment
  -> reason/evidence modal
  -> fresh purchase lookup + exact owner
  -> private confirmation <= 5 minutes
  -> fresh purchase lookup
  -> purchase-intents.process with stable idempotency key
  -> canonical purchase/order refresh
  -> backend audit + Discord audit
```

The bot never supplies accepted amount, provider, catalog identity, fulfillment mode or order contents. CM derives those from canonical state.

If the process operation reports active processing, the session disables approval resubmission and only exposes refresh. The same logical action never receives a new idempotency key merely because completion is asynchronous.

Customer AI cannot call this mutation.

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
- target user/order/ticket;
- delta, refund consequence, or ticket access override;
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
TICKET_CREATOR_MISMATCH
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
- bypassing confirmation on the existing interactive Aura/wallet or refund flows;
- skipping the final fresh-state equality/re-preview required by those interactive flows;
- executing a direct Aura/balance/refund mutation outside the exact ADR-0017 slash-command path;
- changing logical idempotency key/body on retry;
- direct balance overwrite;
- destructive ledger/audit edits for reversal;
- caller-supplied refund economics;
- global-user or role-only ticket access override;
- hosted-AI/customer access to `support.tickets.override`;
- changing support/staff role overwrites as part of the ticket gate;
- manual fulfillment without a website mutation operation;
- purchase processing as a fulfillment/admin shortcut;
- secrets/credential values in logs, component IDs or audit messages.
