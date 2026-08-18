# Admin Console Security Model — `/cm`

Updated: 2026-08-18

ADR-0005 governs customer/admin interface separation. ADR-0006 governs shared `/cm` authorization. ADR-0007 governs Aura/wallet confirmation. Refund retains the canonical backend preview/re-preview contract from the existing admin-console design.

## Global `/cm` authorization

Before sensitive backend access:

1. interaction must be a supported `/cm` slash/button/modal interaction;
2. interaction must be in a guild;
3. guild must exactly equal `DISCORD_GUILD_ID`;
4. `BOT_ADMIN_USER_IDS` must be non-empty;
5. invoking Discord user ID must be explicitly present in that allowlist;
6. every component/modal repeats the authorization check;
7. operator-bound session ownership must pass where applicable.

There is no `/cm` command-channel requirement. DMs, wrong guild, non-whitelisted operators and missing allowlist fail closed.

Ephemeral output is confidentiality/UX only. Roles do not replace the explicit user-ID allowlist.

The bot never carries database credentials and never calls Supabase/Postgres tables/functions/RPCs directly.

## Admin configuration

```text
BOT_ADMIN_USER_IDS
BOT_AUDIT_LOG_CHANNEL_ID
```

`BOT_ADMIN_COMMAND_CHANNEL_ID` is not supported.

`BOT_AUDIT_LOG_CHANNEL_ID` is separate from command authorization and must be configured before refund, Aura adjustment or wallet adjustment execution.

## Private session safety

`CmSessionStore` holds bounded, expiring state:

- random session UUID;
- owning operator Discord ID;
- current user overview;
- optional selected order;
- optional refund proposal;
- optional Aura/wallet adjustment proposal;
- 15-minute inactivity TTL;
- bounded session count.

Component custom IDs contain session/action/index tokens only. They do not embed email, balances, reasons, internal user IDs, order economics or credentials.

Every component/modal requires both shared authorization and session ownership by the original operator.

## `/cm user`

`/cm user email:<email>` resolves `users.overview.read` only after authorization, then creates the private session.

The panel may expose privileged account email, wallet/Aura summaries and recent-order metadata only to the authorized ephemeral interaction.

`TASK-CM-ADMIN-003` activates the Aura and wallet controls under ADR-0007.

## `/cm order`

`/cm order reference:<CM-public-ref-or-order-UUID>` is a new authorized read/navigation entry point.

Security sequence:

1. authorize `/cm` interaction;
2. validate/normalize input to `public_ref` or `order_id`;
3. call `orders.details.read`;
4. use returned canonical `userId` to call `users.overview.read`;
5. require exact returned owner ID match;
6. create an operator-bound session;
7. render the standard order panel.

No caller-provided user identity is trusted separately from the canonical order result.

## Refund

Refund retains the canonical website preview contract:

```text
orders.refund.preview
orders.refund.execute
```

Flow:

1. authorized operator opens selected canonical order;
2. reason modal requires 8–1000 characters;
3. read-only canonical refund preview;
4. private consequence confirmation;
5. five-minute confirmation TTL;
6. fresh canonical preview immediately before execute;
7. every strict preview field must match;
8. execute using one stable logical idempotency key/body;
9. website owns refund economics/accounting/audit;
10. sanitized Discord audit is attempted.

Caller cannot provide refund amount, wallet credit, Aura effects or transaction IDs independently of the selected order.

## Aura adjustment — ADR-0007

The website exposes audited/idempotent `users.aura.adjust`.

Bot flow:

1. authorized `Adjust Aura` button;
2. private modal: signed non-zero whole-number delta + 1–500 character reason;
3. local max magnitude `1,000,000,000`, matching backend;
4. fresh `users.overview.read`;
5. current available Aura + delta + projected Aura shown privately;
6. proposal binds target, delta, reason, operator ID, current available Aura, projected value, UUID idempotency key and five-minute expiry;
7. Confirm reauthorizes and fetches overview again;
8. exact available-Aura equality is required;
9. changed state aborts without mutation;
10. execute `users.aura.adjust` using the frozen logical request;
11. verify returned target/delta;
12. preserve transaction/audit IDs and attempt sanitized Discord audit;
13. refresh user overview best-effort.

Projected negative available Aura is blocked locally and remains backend-rejected.

## Wallet adjustment — ADR-0007

The website exposes audited/idempotent `users.wallet.adjust`.

Bot flow mirrors Aura, with these domain-specific rules:

- operator enters signed decimal major-currency amount;
- at most two decimal places;
- bot converts exactly to integer cents;
- non-zero;
- maximum magnitude `100,000,000` cents;
- relevant state comparison is current wallet balance;
- absent wallet is previewed as zero/USD, matching the verified website primitive;
- projected negative balance is blocked;
- website owns wallet transaction and funding-state accounting.

The bot never directly sets a wallet balance.

## Balance mutation idempotency and retries

The validated request is serialized once before transport retry. One logical mutation therefore keeps the same:

- target;
- delta;
- reason;
- operator context;
- UUID idempotency key;
- raw JSON body.

Every HTTP attempt uses fresh timestamp/nonce/HMAC signature.

Deterministic `INVALID_ADJUSTMENT`, `INSUFFICIENT_BALANCE` and `IDEMPOTENCY_CONFLICT` outcomes fail safely instead of generating a new logical mutation.

Backend audit is authoritative if a Discord audit post fails after successful execution.

## Fulfillment

`orders.fulfillment.read` is diagnostics-only.

Manual Fulfillment remains informational/blocked because no dedicated website mutation exists. The bot must not use direct DB access, purchase processing or another endpoint as a substitute.

## Bot API permission requirements for this console

```text
users.overview.read
orders.details.read
orders.fulfillment.read
orders.refund.preview
orders.refund.execute
users.aura.adjust
users.wallet.adjust
```

API endpoint existence does not itself authorize a deployment credential. Website-side `allowedOperations` remains an independent security boundary and secret configuration is never committed here.

## Mention/log/secret safety

- Components V2 responses use safe mention configuration where applicable.
- Discord mutation audits disable mentions.
- reasons are sanitized/truncated before Discord audit output.
- raw HMAC secrets, signing headers and backend credential values must never be logged or included in component IDs.
- generic errors are mapped to stable safe user messages.

## Forbidden shortcuts

- direct Supabase/Postgres credentials or calls;
- role-only admin authorization;
- DM/wrong-guild mutation;
- treating ephemeral visibility as authorization;
- target/balance/reason data in component custom IDs;
- Aura/wallet execute without explicit confirmation and final fresh-state equality;
- refund execute without canonical preview/re-preview equality;
- changing logical mutation idempotency key/body on retry;
- caller-supplied refund economics;
- direct wallet/Aura balance overwrite;
- destructive ledger/audit history edits;
- manual fulfillment through DB/unrelated API workarounds;
- purchase processing as an admin fulfillment shortcut;
- real secrets in repository/docs/logs.
