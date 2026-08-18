# Command Catalog and Policy

Updated: 2026-08-18

## Product command-surface rule

ADR-0005 governs customer vs admin command presentation. ADR-0006 governs shared `/cm` authorization. ADR-0007 governs Aura/wallet confirmation and execution.

- **customers/self-service:** message/text commands are allowed;
- **staff/admin:** configured-guild slash commands;
- **`/cm` authorization:** exact configured guild + non-empty explicit `BOT_ADMIN_USER_IDS`; usable from any channel in that guild;
- **ephemeral visibility:** privacy only, never authorization;
- **admin mutations:** explicit confirmation, stable idempotency, website-owned mutation, backend audit, sanitized Discord audit.

No command may directly connect to Supabase/Postgres.

## Current command surfaces

### `cm aura`

Customer message command. Keeps bot-author, configured-guild, blocked-channel, privacy/sanitization and safe-mention guards.

### `/refresh-leaderboard`

Operational guild slash command. Keeps exact configured guild + configured command channel + `ManageGuild|Administrator` runtime permission checks. It is independent from `/cm` authorization.

### `/cm user email:<email>`

Private Components V2 admin console. It resolves `users.overview.read`, creates an operator-bound expiring session and shows account, wallet, Aura, counts and recent orders.

User-panel controls:

- **Adjust Aura** — active on `TASK-CM-ADMIN-003` under ADR-0007;
- **Adjust Wallet** — active on `TASK-CM-ADMIN-003` under ADR-0007;
- **Open Recent Order**;
- **Order History**.

### `/cm order reference:<CM-public-ref-or-order-UUID>`

Added by `TASK-CM-ADMIN-003` as a direct private order entry point.

Flow:

1. shared `/cm` authorization runs before backend access;
2. input is normalized to the documented `public_ref` or `order_id` selector;
3. `orders.details.read` resolves the canonical order;
4. `users.overview.read` resolves the canonical order owner;
5. target IDs must match;
6. an operator-bound session opens directly on the normal order panel.

The order panel therefore has the same controls as an order reached from `/cm user`:

- Refund;
- Fulfillment diagnostics;
- Refresh Order;
- User Operations for the order owner;
- that user's bounded recent Order History.

## Aura adjustment

`Adjust Aura` uses:

```text
users.overview.read
users.aura.adjust
```

Flow:

1. modal accepts a signed non-zero whole-number Aura delta and 1–500 character reason;
2. maximum magnitude is `1,000,000,000` Aura, matching the verified website contract;
3. bot fetches a fresh user overview before displaying confirmation;
4. confirmation stores target, exact delta/reason/operator, exact current available Aura, projected Aura, one UUID idempotency key and a five-minute expiry;
5. confirm fetches user overview again and requires the relevant balance to be unchanged;
6. changed balance fails closed without mutation;
7. unchanged balance executes `users.aura.adjust` using the frozen request identity;
8. returned target/delta must match;
9. backend audit/transaction IDs are preserved and a sanitized Discord audit is attempted;
10. user overview is refreshed after success.

Negative projected available Aura is blocked locally and remains backend-rejected as defense in depth.

## Wallet adjustment

`Adjust Wallet` uses:

```text
users.overview.read
users.wallet.adjust
```

Flow mirrors Aura but the modal accepts a signed decimal currency amount with at most two decimal places. The bot converts it exactly to integer cents before confirmation.

Maximum magnitude is `100,000,000` cents (`1,000,000.00` currency units), matching the verified website contract. A negative projected balance is blocked. When the website has no wallet row, its verified admin primitive prepares a zero-balance USD row; the preview uses that same zero/USD assumption.

## Balance confirmation and audit rules

ADR-0007 supersedes only the earlier requirement that Aura/wallet must have a separate backend preview endpoint and the old Aura-first/wallet-later sequencing.

For both adjustments:

- all command/button/modal interactions reauthorize guild + explicit admin user ID;
- session is bound to the original operator;
- confirmation expires after five minutes;
- final fresh balance must exactly match the preview balance;
- one stable logical idempotency key/body is reused across retry;
- HMAC timestamp/nonce/signature remain fresh per transport attempt;
- `BOT_AUDIT_LOG_CHANNEL_ID` is mandatory before execute;
- backend immutable audit is authoritative;
- Discord audit is secondary and mention-safe.

## Order history

`users.overview.read` is requested with `recentOrdersLimit: 10`, the backend maximum. The returned latest ten are paginated locally at five per page. No unsupported older-history API is invented.

## Refund

Refund retains the stronger canonical backend preview/re-preview model:

```text
orders.refund.preview
orders.refund.execute
```

Reason is 8–1000 characters; confirmation expires after five minutes; a fresh canonical preview must exactly match before execute; one stable idempotency key/body is used across retry; `BOT_AUDIT_LOG_CHANNEL_ID` is mandatory.

## Fulfillment

`orders.fulfillment.read` remains diagnostics-only. The current website API has no manual-fulfillment mutation operation. Manual Fulfillment remains blocked/informational and no substitute operation is used.

## Authorization matrix

| Surface | Audience | Location | Explicit whitelist | Mutation |
| --- | --- | --- | --- | --- |
| `cm aura` | customer | configured guild; blocked channel excluded | no | no |
| `/refresh-leaderboard` | staff/admin | configured guild + command channel | no current whitelist | no |
| `/cm user ...` | admin | any channel in configured guild | **mandatory** | Aura / wallet / refund through controls |
| `/cm order ...` | admin | any channel in configured guild | **mandatory** | refund and owner Aura/wallet through navigation |
| Manual fulfillment | admin | same `/cm` rule | **mandatory** | **blocked** |

## Bot API surface after TASK-CM-ADMIN-003

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

The website's per-client `allowedOperations` still controls runtime authorization independently of source. No purchase-processing or direct-database path is added.
