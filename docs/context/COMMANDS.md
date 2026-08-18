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

The private User Operations panel shows:

- account status;
- account creation/last sign-in time;
- Discord Linked/Not linked state;
- linked Discord user plus returned username/display name/link time when available;
- wallet balance/update time;
- Aura balances/update time;
- counts;
- most recent order;
- bounded recent Order History;
- Adjust Aura;
- Adjust Wallet;
- Share to Chat.

All `/cm` date/time displays use:

```text
<t:unix:f> · <t:unix:R>
```

for absolute + relative time.

## `/cm order reference:<CM-public-ref-or-order-UUID>`

Flow:

1. shared authorization;
2. normalize `public_ref` or `order_id`;
3. `orders.details.read` resolves canonical order;
4. `users.overview.read(user_id)` resolves canonical owner;
5. require exact owner/order target match;
6. create operator-bound session and render the standard order panel.

Controls include Refund, Fulfillment diagnostics, Refresh Order, User Operations, recent Order History and Share to Chat.

## Share to Chat

Meaningful private User/Orders/Order/Fulfillment/Refund/Adjustment panels expose **Share to Chat**.

The click is itself an authorized `/cm` button action and requires the owning session. It sends a separately rendered Components V2 message into the current channel.

The shared copy:

- contains no buttons/selects/modals/custom IDs;
- performs no mutation;
- disables mentions;
- **includes the canonical customer account email** from `session.overview.identity.email`, Discord-escaped for display;
- may include the linked Discord user and customer-relevant status, wallet/Aura values, order/refund/fulfillment state and timestamps;
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

## Wallet adjustment

Uses `users.overview.read` + `users.wallet.adjust`.

- signed decimal input with max two decimals;
- exact integer-cent conversion;
- max magnitude ±100,000,000 cents;
- projected negative balance blocked;
- same fresh-state/confirmation/idempotency/audit model as Aura;
- website remains authoritative for wallet ledger/funding-state behavior.

## Refund

Retains the canonical backend model:

```text
orders.refund.preview
  -> explicit confirmation <= 5 minutes
  -> fresh exact preview equality
  -> orders.refund.execute
```

Reason is 8–1000 characters. Caller does not supply refund economics. `BOT_AUDIT_LOG_CHANNEL_ID` is required before execute.

## Discord audit presentation

Refund/Aura/wallet audit messages are concise Components V2 panels showing useful operational context: customer identity when available, action/result, reason, operator and completion timestamp. A replay note appears only for an actual idempotent replay. Website immutable audit remains authoritative; backend transaction/audit IDs are not repeated in the Discord presentation.

## Order history and fulfillment

`users.overview.read` returns at most 10 recent orders; the bot paginates the returned set five per page. `orders.fulfillment.read` remains diagnostics-only. Manual Fulfillment stays blocked because no website mutation operation exists.

## Authorization matrix

| Surface | Audience | Location | Explicit whitelist | Mutation |
| --- | --- | --- | --- | --- |
| `cm aura` | customer | configured guild; blocked channel excluded | no | no |
| `/refresh-leaderboard` | staff/admin | configured guild + command channel | no current whitelist | no |
| `/cm user ...` | admin | any configured-guild channel | **mandatory** | Aura/wallet/refund through controls |
| `/cm order ...` | admin | any configured-guild channel | **mandatory** | refund and owner Aura/wallet through navigation |
| Share to Chat | admin initiates; channel readers consume | current configured-guild channel | **mandatory for click** | **none** |
| Manual fulfillment | admin | same `/cm` rule | **mandatory** | **blocked** |

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

TASK-CM-ADMIN-005 adds no API operation and does not change the slash-command definition. Website per-client `allowedOperations` remains an independent runtime authorization boundary.
