# Admin Console Security Model — `/cm`

Updated: 2026-08-19

ADR-0005 governs customer/admin interface separation. ADR-0006 governs shared `/cm` authorization. ADR-0007 governs Aura/wallet confirmation. ADR-0008 governs the separate customer-share renderer and Discord presentation policy. ADR-0009 permits canonical customer email in the public customer identity block. ADR-0011 governs pending-purchase fallback and optional masked fulfillment support. Refund retains canonical backend preview/re-preview.

## Global `/cm` authorization

Before sensitive backend access or any customer-share action:

1. supported `/cm` slash/button/modal interaction;
2. guild interaction;
3. guild exactly equals `DISCORD_GUILD_ID`;
4. `BOT_ADMIN_USER_IDS` non-empty;
5. invoking Discord user explicitly allowlisted;
6. every component/modal repeats authorization;
7. operator-bound session ownership passes where applicable.

There is no `/cm` command-channel requirement. DMs, wrong guild, non-whitelisted users and missing allowlist fail closed. Ephemeral output is confidentiality only; Discord roles do not replace explicit user IDs.

The bot never carries database/service-role credentials or calls Supabase/Postgres directly.

## Admin configuration

```text
BOT_ADMIN_USER_IDS
BOT_AUDIT_LOG_CHANNEL_ID
```

`BOT_ADMIN_COMMAND_CHANNEL_ID` is unsupported. Audit-channel configuration is separate from command authorization and mandatory before refund/Aura/wallet execute.

TASK-CM-ADMIN-007 adds no environment variable.

## Private session safety

`CmSessionStore` holds bounded/expiring state:

- random session UUID;
- owning operator Discord ID;
- current user overview;
- optional selected canonical order;
- optional selected pending purchase intent;
- optional refund proposal;
- optional Aura/wallet proposal;
- current customer-share view descriptor/data;
- 15-minute inactivity TTL;
- bounded session count.

Private component IDs contain only routing/session/index tokens; no email, balances, reasons, backend target UUIDs or credentials. Every component/modal requires the original operator.

## `/cm user` lookup

Exactly one of exact email or selected Discord user is accepted. Discord selection is target lookup data only and never operator authorization.

## `/cm order` — ADR-0011

Security flow:

```text
authorize
 -> normalize public ref / UUID
 -> orders.details.read
      -> success: canonical order path
      -> stable NOT_FOUND only: purchase-intents.lookup.read
```

The bot must **not** use purchase-intent lookup as fallback for authentication, operation permission, validation, rate-limit, dependency or other service errors.

### Canonical order path

1. resolve order;
2. resolve owner through `users.overview.read(user_id)`;
3. require exact owner equality;
4. optionally enrich with fulfillment support;
5. create operator-bound session;
6. render private order panel.

### Pending purchase path

1. resolve exact purchase intent using `purchase_intent_id` or `public_ref`;
2. resolve owner through `users.overview.read(user_id)`;
3. require exact owner equality;
4. if a canonical `orderId` now resolves, switch to canonical order path;
5. otherwise render private read-only Pending Purchase panel.

A pending refresh repeats exact purchase-intent lookup and owner validation before updating the panel or transitioning to the order.

No caller-provided independent user identity is trusted against order/purchase ownership.

## Pending purchase control boundary

Before a canonical order exists, the panel may expose only support/navigation actions such as Refresh Purchase, User Operations and Share to Chat.

It must not expose:

- Refund;
- Delivery Details/fulfillment mutation;
- `purchase-intents.process`;
- manual fulfillment;
- direct DB/RPC action.

Pending purchase lookup is diagnostic/read-only.

## Fulfillment support metadata — private staff only

`orders.fulfillment.read` remains read-only and may return optional:

```text
support.productTypeLabel
support.productDurationDays
support.maskedMaterials[]
support.manualRequired
```

Security requirements:

- support enrichment is optional/fail-safe;
- at most 10 masked materials;
- accepted kinds are `license_key` and `account_token`;
- bot DTO is strict and rejects unexpected raw-material fields;
- raw/decrypted fulfillment secrets, secret-table values and credentials are not part of the contract;
- a failure to fetch support must not block an already-authorized canonical order panel;
- missing support or empty masked material is not evidence of manual-required;
- manual-required UI must come from canonical fulfillment/manual state.

Masked material is a staff support hint, not a reveal credential.

## Share to Chat — ADR-0008 + ADR-0009 + ADR-0011

Share to Chat is an **admin action**, not a customer control. The click runs through normal `/cm` authorization and session-owner checks.

The private admin component tree is never reused as the public message. `cmShare` builds a separate display-only Components V2 view from explicitly approved fields.

Public message requirements:

- current text-capable guild channel only;
- no Button/Select/Modal/action custom IDs;
- canonical customer email intentionally included and escaped;
- linked Discord identity may be shown;
- safe customer-relevant state only;
- no internal CM user UUID;
- no purchase-intent UUID;
- no internal purchase option IDs;
- no admin refund/adjustment reason;
- no backend audit/transaction/idempotency identifiers;
- no provider/provider-status internals;
- **no masked fulfillment support material**;
- no HMAC/API/credential material;
- `safeAllowedMentions` always applied;
- no mutation/database action.

Pending Purchase public summaries may include public ref, safe item/variant/game, amount, payment method, purchase status and customer-relevant timestamps.

Because Share to Chat publishes in the current channel, the authorized administrator remains responsible for choosing an appropriate disclosure channel.

## Refund

Canonical-order-only security flow remains:

1. authorized selected canonical order;
2. reason 8–1000;
3. canonical preview;
4. private confirmation;
5. five-minute TTL;
6. fresh preview immediately before execute;
7. strict full preview equality;
8. stable logical idempotency key/body;
9. website-owned refund economics/accounting/audit;
10. concise mention-safe Discord audit.

Pending purchase intents have no refund control.

## Aura / Wallet adjustments

ADR-0007 remains unchanged: fresh overview, current/change/projected private preview, explicit <=5-minute confirmation, second fresh exact relevant-balance equality, stable UUID idempotency/body, website execute, returned target/delta verification, backend audit and concise Discord audit.

## Mutation idempotency/retry

TASK-CM-ADMIN-007 adds no mutation. Existing mutation transport keeps stable logical body/idempotency and fresh timestamp/nonce/HMAC per HTTP attempt.

## API permission requirements

```text
users.overview.read
orders.details.read
orders.fulfillment.read
purchase-intents.lookup.read
orders.refund.preview
orders.refund.execute
users.aura.adjust
users.wallet.adjust
```

Website `allowedOperations` is independent. The deployed bot client must explicitly allow `purchase-intents.lookup.read` for pending lookup.

## Mention/log/secret safety

- private/public/audit Components V2 output uses safe mentions where applicable;
- public Discord identity is display-only/non-notifying;
- reasons are sanitized/truncated before private audit display;
- raw HMAC/signing headers/API secrets/request credentials never belong in logs/components;
- generic backend failures map to stable safe messages;
- masked support material never leaves private authorized staff output.

## Forbidden shortcuts

- direct DB/service-role access;
- role-only admin authorization;
- DM/wrong-guild admin mutation/share;
- treating ephemeral visibility as authorization;
- fallback to purchase-intent lookup on non-`NOT_FOUND` order errors;
- customer-visible admin controls/custom IDs;
- exposing pending purchase internal IDs/provider state;
- exposing masked support material through Share to Chat;
- interpreting missing optional support as manual fulfillment;
- Aura/wallet execute without final fresh-state equality;
- refund execute without canonical fresh preview equality;
- changing mutation idempotency body/key on retry;
- caller-supplied refund economics;
- direct balance overwrite/destructive ledger edits;
- manual fulfillment through DB/purchase processing/unrelated endpoint;
- real secrets in repo/docs/logs.
