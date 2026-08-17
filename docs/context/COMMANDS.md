# Command Catalog and Policy

Updated: 2026-08-17

## Product command-surface rule

ADR-0005 supersedes ADR-0003 where they conflict. ADR-0006 supersedes the admin-command-channel requirement inherited from ADR-0004/ADR-0005 for the shared `/cm` admin console.

- **customers/self-service:** message/text commands are allowed;
- **staff/admin:** configured-guild slash commands;
- **`/cm` admin authorization:** configured guild + explicit `BOT_ADMIN_USER_IDS`, usable from any guild channel;
- **ephemeral visibility:** privacy only, not an authorization replacement.

`cm aura` remains a customer message command. Both customer and admin surfaces use approved website Internal Integrations API operations and never connect directly to Supabase/Postgres.

## Current tracked commands

### `cm aura`

Intentional customer message command with bot-author, exact-guild, blocked-channel, privacy/sanitization and safe-mention guards. `GuildMessages` and privileged `MessageContent` remain intentional while this command exists.

### `/refresh-leaderboard`

Operational guild slash command with exact runtime guild/channel checks, `ManageGuild|Administrator`, ephemeral result and shared overlap-locked refresh service.

ADR-0006 does not change this command; its configured command channel remains part of its operational authorization.

### `/cm user email:<email>`

Merged into tracked source by TASK-CM-ADMIN-001 as a private ephemeral Components V2 staff/admin console. It was not registered/deployed as part of that task.

TASK-CM-ADMIN-002 changes its shared authorization policy to:

1. guild interaction only;
2. exact configured `DISCORD_GUILD_ID`;
3. non-empty mandatory `BOT_ADMIN_USER_IDS`;
4. invoking Discord user ID in that whitelist;
5. **no command-channel restriction**.

Every button and modal repeats the same checks and is additionally bound to a short-lived session owned by the original operator.

`BOT_ADMIN_COMMAND_CHANNEL_ID` is removed from the supported environment surface. A stale host variable with that name has no authorization effect.

#### User panel

Shows:

- full account email returned by privileged `users.overview.read`;
- active/banned state;
- wallet balance/currency;
- available/pending/lifetime Aura;
- account/order/license counts;
- most recent order.

Buttons:

- **Adjust Aura** — blocked; no adjustment API method/path exists in active source;
- **Adjust Wallet** — blocked; no adjustment API method/path exists in active source;
- **Open Recent Order**;
- **Order History**.

#### Order history

`users.overview.read` is requested with backend maximum `recentOrdersLimit: 10`. The returned latest ten are paginated five per page with one Open button per order. The UI explicitly warns when the account has more than ten total orders.

There is currently no Internal Integrations API operation that pages older user order history; do not fabricate one in the bot.

#### Order panel

`orders.details.read` is re-fetched when an order is opened. Available controls:

- **Refund**;
- **Fulfillment**;
- **Refresh Order**;
- **User Operations**;
- **Order History**.

`Fulfillment` uses `orders.fulfillment.read` only. Manual Fulfillment is shown as unavailable because no dedicated mutation operation exists.

#### Refund flow

Refund is the only mutation implemented in the console:

1. authorized operator opens Refund;
2. modal requires reason 8–1000 characters;
3. bot calls `orders.refund.preview`;
4. bot displays canonical refund consequences privately;
5. operator explicitly confirms within five minutes;
6. bot calls preview again and requires identical canonical consequences;
7. bot executes `orders.refund.execute` with a stable UUID idempotency key/body;
8. backend audit identifiers are preserved and a sanitized Discord audit record is attempted.

`BOT_AUDIT_LOG_CHANNEL_ID` remains required before execute. The audit channel is not the command channel and does not determine where `/cm` may be invoked.

Deterministic refund conflicts clear confirmation and do not blindly retry. Transient failures preserve the original logical idempotency identity for safe retry.

## Authorization matrix

| Surface | Audience | Interface | Location | Explicit whitelist | Mutation |
| --- | --- | --- | --- | --- | --- |
| `cm aura` | customer | message | configured guild; blocked channel excluded | no | no |
| `/refresh-leaderboard` | staff/admin | slash | configured guild + configured command channel | no current whitelist | no |
| `/cm user ...` | admin | slash + private components/modals | **any channel in configured guild** | **mandatory** | refund only |
| Aura control inside `/cm` | admin | button | same `/cm` guild-wide rule | **mandatory** | **blocked** |
| Wallet control inside `/cm` | admin | button | same `/cm` guild-wide rule | **mandatory** | **blocked** |
| Manual fulfillment control | admin | button | same `/cm` guild-wide rule | **mandatory** | **blocked** |

## Current `/cm` API operations

The console requires these bot-client permissions:

```text
users.overview.read
orders.details.read
orders.fulfillment.read
orders.refund.preview
orders.refund.execute
```

Endpoint existence is not authorization. The bot credential's actual allowlist remains backend-owned and must be provisioned separately before use.

## Aura/wallet status

Website source verification resolves the old selector discrepancy: adjustment schemas use `userLookupSelectorSchema`, which includes external identity. Aura/wallet are nevertheless still blocked because the accepted confirmation/state-binding requirements are not satisfied by the direct execute-only adjustment API contract.

Direct DB calls remain forbidden.
