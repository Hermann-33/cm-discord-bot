# Command Catalog and Policy

Updated: 2026-08-23

## Authorities

- ADR-0005 — customer vs admin command presentation.
- ADR-0006 — shared `/cm` exact-guild + explicit-user authorization.
- ADR-0007 — Aura/wallet confirmation/idempotency/audit.
- ADR-0008 — separate read-only Share to Chat renderer, Discord lookup/time/audit presentation.
- ADR-0009 — canonical customer account email is intentionally included in shared customer identity sections.
- ADR-0011 — canonical-order-first pending purchase fallback and private fulfillment support metadata boundary.

No command may directly connect to Supabase/Postgres.

## AI support activation state

ADR-0012 support planner/service scaffolding is not connected to Discord. There is no AI support command and arbitrary `MessageCreate` traffic is not routed to OpenRouter. Customer-facing activation requires a separate benchmark-backed task.

## `cm aura`

Customer message command. Keeps configured-guild/blocked-channel guards, bot-author protection, privacy/sanitization and safe mentions.

## `/refresh-leaderboard`

Operational guild slash command. Keeps exact configured guild + configured command channel + `ManageGuild|Administrator`. It is independent from `/cm` authorization.

## `/cm` shared authorization

Before sensitive backend access, every slash/button/modal interaction requires:

1. guild interaction;
2. exact `DISCORD_GUILD_ID`;
3. non-empty `BOT_ADMIN_USER_IDS`;
4. invoking Discord user explicitly allowlisted;
5. operator-bound unexpired session for subsequent components/modals.

A whitelisted admin may use `/cm` from any channel inside the configured guild. `BOT_ADMIN_COMMAND_CHANNEL_ID` is not supported.

## `/cm user`

Exactly one lookup is required:

```text
/cm user email:<exact email>
/cm user discord_user:<selected Discord user>
```

Email and Discord target resolution both use `users.overview.read`. Both/neither input fails before backend access.

### User Operations presentation

Private User Operations shows canonical email, account status, linked Discord state, current wallet, available/lifetime Aura, pending Aura when non-zero, order/license/account counts, latest order and the core controls.

Useful timestamps use:

```text
<t:unix:f> · <t:unix:R>
```

## `/cm order reference:<CM-public-ref-or-order/purchase-UUID>`

ADR-0011 flow:

1. shared `/cm` authorization;
2. normalize input as public reference or UUID;
3. call `orders.details.read` first;
4. on success, resolve canonical owner with `users.overview.read(user_id)` and require equality;
5. **only when order lookup returns stable `NOT_FOUND`**, call `purchase-intents.lookup.read` with equivalent `public_ref` or `purchase_intent_id` selector;
6. resolve purchase-intent owner with `users.overview.read(user_id)` and require equality;
7. if the intent already has a resolvable `orderId`, open the canonical order;
8. otherwise create an operator-bound pending-purchase session.

No pending fallback is allowed for authentication, authorization, validation, rate-limit, dependency or other service errors.

### Pending Purchase presentation

The private pending panel may show:

- public purchase reference;
- pending/current purchase status;
- canonical customer email and linked Discord identity;
- customer-facing item/account type/game where available;
- quantity when meaningful;
- amount/currency;
- payment method;
- safe provider status in the private panel;
- created/expiry timestamps;
- Refresh Purchase;
- User Operations;
- Share to Chat.

It deliberately does **not** expose order-only Refund or Delivery Details controls before a canonical order exists. It also does not display the purchase-intent UUID, internal option IDs or payment provider name.

`Refresh Purchase` repeats exact purchase-intent lookup, rechecks owner identity and automatically transitions to the canonical Order Operations panel once the website order exists.

## Canonical Order Operations

The private canonical order panel shows:

- public order reference and status;
- customer email and linked Discord identity;
- customer-facing item/account details;
- human-readable product/account type where available;
- quantity when meaningful;
- amount;
- payment method;
- placed timestamp;
- delivery progress;
- optional private support duration/provider/masked material;
- manual-review warning only when canonical state requires it;
- Refund;
- Delivery Details;
- Refresh Order;
- User Operations;
- Share to Chat.

Support enrichment is best-effort; failure to fetch it does not block the order/refund/navigation panel.

## Delivery Details

`orders.fulfillment.read` remains diagnostics-only.

The private panel may show the optional support view:

- human-readable type;
- finite duration;
- at most 10 stored masked license/account materials;
- manual-required state.

Per-fulfillment status/progress/exception/message fields remain visible when useful. Raw/decrypted material is never accepted. Missing support or an empty masked list is not interpreted as manual-required.

No Manual Fulfillment execute control exists.

## Share to Chat

Meaningful private User/Orders/Order/Pending Purchase/Delivery/Refund/Adjustment panels can expose **Share to Chat**.

The click is an authorized `/cm` action and requires the owning session. It sends a separately rendered, buttonless Components V2 message into the current channel with safe mentions.

Shared customer identity intentionally includes canonical account email (ADR-0009) and linked Discord identity when present.

### Pending Purchase share

May include:

- public purchase reference;
- safe item/variant/game;
- amount/currency;
- payment method;
- purchase status;
- created/expiry time.

Must omit:

- purchase-intent UUID;
- internal CM user UUID;
- internal option IDs;
- payment provider/provider status;
- operator/admin internals;
- interactive controls.

### Fulfillment share

The public delivery summary may show customer-relevant status/progress/message fields, but **must not expose** the private `support.maskedMaterials` or provider internals.

The private masked support view is not a customer credential-reveal surface.

## Aura adjustment

Unchanged ADR-0007 model:

- signed non-zero whole-number delta;
- max ±1,000,000,000 Aura;
- reason 1–500;
- fresh overview before preview;
- projected negative balance blocked;
- explicit five-minute confirmation;
- second fresh available-Aura equality check;
- stable UUID idempotency/body;
- required audit channel;
- website execution + backend/Discord audit.

## Wallet adjustment

Unchanged ADR-0007 model with exact decimal-to-cent parsing, max ±100,000,000 cents and final fresh wallet-balance equality.

## Refund

Canonical order only:

```text
orders.refund.preview
  -> explicit confirmation <= 5 minutes
  -> fresh exact preview equality
  -> orders.refund.execute
```

A pending purchase intent has no refund control until a canonical order exists.

## Authorization matrix

| Surface | Audience | Location | Explicit whitelist | Mutation |
| --- | --- | --- | --- | --- |
| `cm aura` | customer | configured guild; blocked channel excluded | no | no |
| `/refresh-leaderboard` | staff/admin | configured guild + command channel | no current whitelist | no |
| `/cm user ...` | admin | any configured-guild channel | **mandatory** | Aura/wallet/refund through canonical order navigation |
| `/cm order ...` | admin | any configured-guild channel | **mandatory** | pending read-only; canonical order may expose refund/navigation |
| Share to Chat | admin initiates; channel readers consume | current configured-guild channel | **mandatory for click** | **none** |

Manual fulfillment remains unsupported until a dedicated website-owned mutation operation exists.

## Bot API surface

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

Website per-client `allowedOperations` remains an independent runtime authorization boundary. Deployment must add `purchase-intents.lookup.read` to the bot client for pending lookup to work.

TASK-CM-ADMIN-007 does not change slash-command JSON, so command re-registration is not required.
