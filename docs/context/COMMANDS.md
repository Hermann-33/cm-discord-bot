# Command Catalog and Policy

Updated: 2026-08-17

## Product command-surface rule

ADR-0005 supersedes ADR-0003 where they conflict.

- **customers/self-service:** message/text commands;
- **staff/admin:** configured-guild slash commands.

`cm aura` remains a customer message command. Both customer and admin surfaces must use approved website Internal Integrations API operations and must never connect directly to Supabase/Postgres.

## Production commands

### `cm aura`

Intentional customer message command with bot-author, exact-guild, blocked-channel, privacy/sanitization and safe-mention guards. `GuildMessages` and privileged `MessageContent` remain intentional while this command exists.

### `/refresh-leaderboard`

Current operational guild slash command with exact runtime guild/channel checks, `ManageGuild|Administrator`, ephemeral result and shared overlap-locked refresh service.

## Feature-branch command — not registered/deployed

### `/cm user email:<email>`

Implemented on `task/cm-admin-console` as a private ephemeral Components V2 staff/admin console.

Authorization occurs before any user/order API request:

1. guild interaction only;
2. exact configured guild;
3. exact `BOT_ADMIN_COMMAND_CHANNEL_ID`;
4. invoking Discord user ID in mandatory `BOT_ADMIN_USER_IDS`.

Missing admin config fails closed. Every button and modal interaction repeats the same checks and is additionally bound to a short-lived session owned by the original operator.

#### User panel

Shows:

- full account email returned by privileged `users.overview.read`;
- active/banned state;
- wallet balance/currency;
- available/pending/lifetime Aura;
- account/order/license counts;
- most recent order.

Buttons:

- **Adjust Aura** — blocked; no adjustment API method/path exists in feature source;
- **Adjust Wallet** — blocked; no adjustment API method/path exists in feature source;
- **Open Recent Order**;
- **Order History**.

#### Order history

`users.overview.read` is requested with the backend maximum `recentOrdersLimit: 10`. The returned latest 10 are paginated five per page with one `Open N` button for each order. The UI explicitly warns when the account has more than 10 total orders.

There is currently no Internal Integrations API operation that pages older user order history; do not fabricate one in the bot.

#### Order panel

`orders.details.read` is re-fetched when an order is opened. Available controls:

- **Refund**;
- **Fulfillment**;
- **Refresh Order**;
- **User Operations**;
- **Order History**.

`Fulfillment` uses `orders.fulfillment.read` only. `Manual Fulfillment` is shown as unavailable because no dedicated mutation operation exists.

#### Refund flow

Refund is the only mutation implemented in the candidate console:

1. authorized operator opens Refund;
2. modal requires reason 8–1000 characters;
3. bot calls `orders.refund.preview`;
4. bot displays canonical refund consequences privately;
5. operator explicitly confirms within five minutes;
6. bot calls preview again and requires identical canonical consequences;
7. bot executes `orders.refund.execute` with a stable UUID idempotency key/body;
8. backend audit identifiers are preserved and a sanitized Discord audit record is attempted.

Deterministic refund conflicts clear the confirmation and do not blindly retry. Transient failures preserve the original logical idempotency identity for safe retry.

## Authorization matrix

| Surface | Audience | Interface | Guild/channel | Explicit whitelist | Mutation |
| --- | --- | --- | --- | --- | --- |
| `cm aura` | customer | message | configured guild; blocked channel excluded | no | no |
| `/refresh-leaderboard` | staff/admin | slash | configured guild + command channel | no current whitelist | no |
| `/cm user ...` | admin | slash + private components/modals | configured guild + admin channel | **mandatory** | refund only |
| Aura control inside `/cm` | admin | button | same | **mandatory** | **blocked** |
| Wallet control inside `/cm` | admin | button | same | **mandatory** | **blocked** |
| Manual fulfillment control | admin | button | same | **mandatory** | **blocked** |

## Feature API operations

The candidate `/cm` flow requires these bot-client permissions:

```text
users.overview.read
orders.details.read
orders.fulfillment.read
orders.refund.preview
orders.refund.execute
```

Endpoint existence is not authorization. The bot credential's actual allowlist remains external/backend-owned and was not changed in this task.

## Aura/wallet status

Website source verification resolves the old selector discrepancy: adjustment schemas use `userLookupSelectorSchema`, which includes external identity. Aura/wallet are nevertheless still blocked because ADR-0004 confirmation/state-binding requirements are not satisfied by the direct execute-only adjustment API contract.

Direct DB calls remain forbidden.
