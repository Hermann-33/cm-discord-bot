# Command Catalog and Policy

Updated: 2026-08-18

## Authorities

- ADR-0005 — customer vs admin command presentation.
- ADR-0006 — shared `/cm` exact-guild + explicit-user authorization.
- ADR-0007 — Aura/wallet confirmation/idempotency/audit.
- ADR-0008 — separate read-only Share to Chat renderer, Discord lookup/time/audit presentation.
- ADR-0009 — canonical customer account email is intentionally included in shared customer identity sections.

No command may directly connect to Supabase/Postgres.

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

Exactly one lookup input is required:

```text
/cm user email:<exact email>
```

or:

```text
/cm user discord_user:<selected Discord user>
```

Email uses `users.overview.read` with the `email` selector. Discord lookup uses the same operation with:

```text
kind=external_identity
provider=discord
externalUserId=<selected user ID>
```

Providing both or neither fails before backend access.

### User Operations presentation

The private home panel intentionally shows only the most actionable summary:

- canonical account email;
- Active/BANNED state;
- compact linked Discord user / Not linked state;
- current wallet balance;
- available Aura and pending Aura when non-zero;
- total order count;
- latest order;
- Adjust Aura;
- Adjust Wallet;
- Open Recent Order;
- Order History;
- Share to Chat.

Routine account/login timestamps, verbose Discord profile metadata, wallet/Aura update times, lifetime Aura totals and license/account-delivery counters are intentionally omitted from the home panel to reduce operational noise.

Timestamps that remain useful in order/result views use Discord absolute + relative format:

```text
<t:unix:f> · <t:unix:R>
```

## `/cm order reference:<CM-public-ref-or-order-UUID>`

Flow:

1. shared authorization;
2. normalize `public_ref` or `order_id`;
3. `orders.details.read` resolves canonical order;
4. `users.overview.read(user_id)` resolves canonical owner;
5. require exact owner/order target match;
6. create operator-bound session and render the standard order panel.

### Order Operations presentation

The private order panel shows:

- public order reference and status;
- customer email;
- customer-facing item/account details;
- quantity only when meaningful (>1);
- amount;
- payment method;
- placed timestamp;
- delivered/requested quantity;
- manual-review warning only when required;
- Refund;
- Delivery Details;
- Refresh Order;
- User Operations;
- Share to Chat.

It intentionally omits internal user UUID, internal option/variant fallback IDs, payment provider, duplicate fulfillment sub-counts, redundant purchase-type labels and duplicate Order History navigation.

## Recent Order History

`users.overview.read` returns at most 10 recent orders; the bot paginates the returned set five per page.

Each entry shows reference, item, status, amount, quantity only when >1 and date/time. If the account has more orders than the overview returned, a compact `Latest N of total` indicator is shown instead of exposing API implementation detail.

## Delivery Details

`orders.fulfillment.read` remains diagnostics-only, but the UI presents only useful operational/customer information:

- fulfillment kind and account delivery kind when relevant;
- status;
- delivered/requested quantity;
- failure only when present;
- manual-review time only when present;
- user message only when present.

Provider codes, record created/updated times, linked-license top counts and empty diagnostic fields are not routinely displayed.

The visible nonfunctional **Manual Fulfillment** button has been removed. No manual-fulfillment execute operation exists and no substitute mutation is permitted.

## Share to Chat

Meaningful private User/Orders/Order/Delivery/Refund/Adjustment panels expose **Share to Chat**.

The click is itself an authorized `/cm` button action and requires the owning session. It sends a separately rendered Components V2 message into the current channel.

The shared copy:

- contains no buttons/selects/modals/custom IDs;
- performs no mutation;
- disables mentions;
- **includes the canonical customer account email** from `session.overview.identity.email`, Discord-escaped for display;
- may include linked Discord identity and customer-relevant current account/wallet/Aura/order/refund/delivery state;
- intentionally omits routine account/login/update/lifetime/activity statistics where they do not help the customer;
- omits internal CM user UUID, internal purchase option IDs, backend audit/transaction/idempotency identifiers, internal provider/failure codes and admin refund/adjustment reasons.

ADR-0009 supersedes ADR-0008 only for the previous prohibition on displaying the full customer email. The rest of the Share to Chat security boundary remains unchanged.

System/error notices without a defined customer-safe representation are intentionally not shareable.

## Aura adjustment

Uses `users.overview.read` + `users.aura.adjust`.

- signed non-zero whole-number delta;
- max magnitude ±1,000,000,000 Aura;
- reason 1–500;
- fresh overview before preview;
- projected negative balance blocked;
- explicit five-minute confirmation;
- second fresh available-Aura equality check;
- stable UUID idempotency/body across retry;
- returned target/delta validation;
- required audit channel;
- backend audit + concise mention-safe Discord audit;
- post-success overview refresh.

The preview panel shows current/change/projected values and reason without exposing the internal target UUID. Success shows applied change, new balance and completion time. Routine backend transaction/audit IDs and `Idempotent replay: No`/`Discord audit: Posted` status lines are hidden; exceptional replay or audit-post failure warnings remain visible.

## Wallet adjustment

Uses `users.overview.read` + `users.wallet.adjust`.

- signed decimal input with max two decimals;
- exact integer-cent conversion;
- max magnitude ±100,000,000 cents;
- projected negative balance blocked;
- same fresh-state/confirmation/idempotency/audit model as Aura;
- website remains authoritative for wallet ledger/funding-state behavior.

Presentation follows the same compact preview/success rules as Aura.

## Refund

Retains the canonical backend model:

```text
orders.refund.preview
  -> explicit confirmation <= 5 minutes
  -> fresh exact preview equality
  -> orders.refund.execute
```

Reason is 8–1000 characters. Caller does not supply refund economics. `BOT_AUDIT_LOG_CHANNEL_ID` is required before execute.

The preview UI retains refund amount, wallet credit, Aura recovered, non-zero unrecoverable Aura and reason. Internal calculation breakdown fields are omitted from routine display. Success retains the outcome and completion time; backend bookkeeping is hidden unless an exceptional warning is needed.

## Discord audit presentation

Refund/Aura/wallet audit messages are concise Components V2 panels showing useful operational context: customer identity when available, action/result, reason, operator and completion timestamp. A replay note appears only for an actual idempotent replay. Website immutable audit remains authoritative; backend transaction/audit IDs are not repeated in the Discord presentation.

## Authorization matrix

| Surface | Audience | Location | Explicit whitelist | Mutation |
| --- | --- | --- | --- | --- |
| `cm aura` | customer | configured guild; blocked channel excluded | no | no |
| `/refresh-leaderboard` | staff/admin | configured guild + command channel | no current whitelist | no |
| `/cm user ...` | admin | any configured-guild channel | **mandatory** | Aura/wallet/refund through controls |
| `/cm order ...` | admin | any configured-guild channel | **mandatory** | refund and owner Aura/wallet through navigation |
| Share to Chat | admin initiates; channel readers consume | current configured-guild channel | **mandatory for click** | **none** |

Manual fulfillment is not exposed as an actionable UI surface and remains unsupported until a dedicated website-owned operation exists.

## Bot API surface

```text
aura.leaderboards.read
aura.lookup.read
users.overview.read
orders.details.read
orders.fulfillment.read
orders.refund.preview
orders.refund.execute
users.aura.adjust
users.wallet.adjust
```

TASK-CM-ADMIN-006 adds no API operation and does not change the slash-command definition. Website per-client `allowedOperations` remains an independent runtime authorization boundary.
