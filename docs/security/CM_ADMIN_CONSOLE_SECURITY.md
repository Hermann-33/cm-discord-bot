# Admin Console Security Model — `/cm`

Updated: 2026-08-18

ADR-0005 governs customer/admin interface separation. ADR-0006 governs shared `/cm` authorization. ADR-0007 governs Aura/wallet confirmation. ADR-0008 governs the separate customer-share renderer and Discord presentation policy. ADR-0009 supersedes ADR-0008 only for the previous prohibition on displaying the canonical customer account email. Refund retains its canonical backend preview/re-preview contract.

## Global `/cm` authorization

Before sensitive backend access or any customer-share action:

1. interaction must be a supported `/cm` slash/button/modal interaction;
2. interaction must be in a guild;
3. guild must exactly equal `DISCORD_GUILD_ID`;
4. `BOT_ADMIN_USER_IDS` must be non-empty;
5. invoking Discord user must be explicitly allowlisted;
6. every component/modal repeats authorization;
7. operator-bound session ownership must pass where applicable.

There is no `/cm` command-channel requirement. DMs, wrong guild, non-whitelisted users and missing allowlist fail closed. Ephemeral output is confidentiality only; roles do not replace explicit user IDs.

The bot never carries database/service-role credentials or calls Supabase/Postgres directly.

## Admin configuration

```text
BOT_ADMIN_USER_IDS
BOT_AUDIT_LOG_CHANNEL_ID
```

`BOT_ADMIN_COMMAND_CHANNEL_ID` is unsupported. `BOT_AUDIT_LOG_CHANNEL_ID` is separate from command authorization and is mandatory before refund/Aura/wallet execute.

## Private session safety

`CmSessionStore` holds bounded/expiring state:

- random session UUID;
- owning operator Discord ID;
- current user overview;
- optional selected order;
- optional refund proposal;
- optional Aura/wallet proposal;
- current customer-share view descriptor/data;
- 15-minute inactivity TTL;
- bounded session count.

Private component custom IDs contain only routing/session/index tokens; no email, balances, reasons, backend UUID targets or credentials. Every component/modal requires the same original operator.

## `/cm user` lookup

Exactly one input is accepted:

- exact email; or
- selected Discord user.

Discord lookup maps to `users.overview.read` with `external_identity/provider=discord`. Both/neither inputs fail before backend access. No user identity supplied by Discord authorizes the operator; the Discord selection is target lookup data only.

The private User Operations panel may display privileged email, wallet/Aura/order state and linked Discord metadata because the interaction remains authorized/private.

## Share to Chat — ADR-0008 + ADR-0009

A Share to Chat button is an **admin action**, not a customer control. The button click runs through the normal shared authorization and session-owner checks.

The bot must never send the private admin component tree to the channel and attempt to “strip buttons” after the fact. Instead `cmShare` builds a separate public view from explicitly approved customer-facing fields.

Public message requirements:

- current text-capable guild channel only;
- Components V2 display components only;
- no Button/Select/Modal/action custom IDs;
- canonical customer account email **included intentionally** from `session.overview.identity.email`;
- email passed through `escapeDiscordText(..., 320)` before display;
- linked Discord identity may be displayed when available;
- no internal CM user UUID;
- no internal purchase option IDs unless explicitly customer-facing by a later decision;
- no admin refund/adjustment reason;
- no backend audit/transaction/idempotency identifiers;
- no internal provider/failure codes;
- no HMAC/API/credential material;
- `safeAllowedMentions` always applied;
- no API mutation or database action.

Customer-relevant status, wallet/Aura summary, public order reference/item/status/amount, fulfillment status/messages and refund/adjustment effects may be shown.

Because Share to Chat publishes into the current channel, the authorized administrator is responsible for using an appropriate channel for disclosure of customer account information.

System/error/authorization panels without an explicit customer-safe model are not shareable.

## Timestamp presentation

`/cm`, customer-shared panels and Discord audit use:

```text
<t:unix:f> · <t:unix:R>
```

This avoids server-local string formatting and lets Discord show locale-aware absolute date/time plus relative age.

## `/cm order`

Direct order entry remains:

1. authorize;
2. normalize `public_ref` or `order_id`;
3. `orders.details.read` canonical order;
4. `users.overview.read(user_id)` canonical owner;
5. require owner equality;
6. create operator-owned session;
7. render private order panel.

No caller-provided independent user identity is trusted against order ownership.

## Refund

```text
orders.refund.preview
orders.refund.execute
```

Security flow:

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

Caller never supplies refund amount/wallet credit/Aura effects independently of the order.

## Aura adjustment — ADR-0007

- signed non-zero integer;
- max ±1,000,000,000 Aura;
- reason 1–500;
- fresh overview before confirmation;
- current/change/projected private preview;
- five-minute TTL;
- second fresh exact available-Aura equality;
- stable UUID idempotency/body;
- `users.aura.adjust` only after equality;
- returned target/delta validated;
- website owns accounting/immutable audit;
- concise Discord audit + best-effort user refresh.

Projected negative Aura is blocked locally and backend-rejected.

## Wallet adjustment — ADR-0007

Mirrors Aura with exact signed decimal-to-integer-cents parsing, max ±100,000,000 cents, fresh exact wallet-balance equality and `users.wallet.adjust`. Missing wallet preview uses verified zero/USD behavior. Website owns wallet ledger/funding-state accounting; bot never overwrites a balance.

## Mutation idempotency/retry

One logical mutation retains target/delta/reason/operator/UUID idempotency/raw request body. Each HTTP attempt gets fresh timestamp/nonce/HMAC signature. Deterministic adjustment/refund/idempotency conflicts fail safely rather than generating a new logical mutation.

Backend immutable audit remains authoritative if Discord audit posting fails after successful execution.

## Discord audit presentation

Audit messages are private operational evidence in the configured audit channel, not authorization. They use concise Components V2 summaries containing useful customer identity, change/result, reason, operator and completion time. Replay warning appears only when relevant. Backend transaction/audit IDs are intentionally not repeated as display noise; the website record remains authoritative.

## Fulfillment

`orders.fulfillment.read` is diagnostics-only. Manual fulfillment remains blocked because no dedicated website mutation exists. No DB/purchase-processing/unrelated endpoint substitute is allowed.

## API permission requirements

```text
users.overview.read
orders.details.read
orders.fulfillment.read
orders.refund.preview
orders.refund.execute
users.aura.adjust
users.wallet.adjust
```

TASK-CM-ADMIN-005 adds no API permission. Website `allowedOperations` remains an independent security boundary.

## Mention/log/secret safety

- private/public/audit Components V2 output uses safe mentions where applicable;
- public Discord identities are display-only and non-notifying;
- customer email is intentionally visible only in Share to Chat output and remains escaped for Discord rendering;
- reasons are sanitized/truncated before private audit display;
- raw HMAC/signing headers/API secrets/request credentials never belong in logs/components;
- generic backend failures are mapped to stable safe messages.

## Forbidden shortcuts

- direct DB/service-role access;
- role-only admin authorization;
- DM/wrong-guild admin mutation/share;
- treating ephemeral output as authorization;
- copying private admin panels into public chat;
- customer-visible admin buttons/selects/modals/custom IDs;
- exposing fields beyond the explicit ADR-0008/ADR-0009 public disclosure set;
- Aura/wallet execute without confirmation/final fresh-state equality;
- refund execute without canonical fresh preview equality;
- changing mutation idempotency body/key on retry;
- caller-supplied refund economics;
- direct balance overwrite/destructive ledger edits;
- manual fulfillment through DB/purchase-processing/unrelated endpoint;
- real secrets in repo/docs/logs.
