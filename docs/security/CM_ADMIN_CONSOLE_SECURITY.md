# Admin Mutation Model — Current Candidate and Future Aura/Wallet

Updated: 2026-08-17

ADR-0004 remains the governing security decision for high-impact Discord mutation surfaces. ADR-0005 keeps customer `cm aura` separate as a message command.

## Global admin authorization rule

Before any candidate admin-console backend request:

1. interaction is in a guild;
2. guild equals configured `DISCORD_GUILD_ID`;
3. exact `BOT_ADMIN_COMMAND_CHANNEL_ID`;
4. invoking Discord user ID is explicitly present in `BOT_ADMIN_USER_IDS`;
5. optional roles may only add restrictions, never replace the whitelist;
6. input/confirmation state is valid for the operation.

DM, wrong guild, wrong channel, non-whitelisted user or missing admin config fail closed.

The bot never receives database credentials and never calls Supabase/Postgres tables/functions directly.

## Candidate configuration now present on feature branch

```text
BOT_ADMIN_USER_IDS
BOT_ADMIN_COMMAND_CHANNEL_ID
BOT_AUDIT_LOG_CHANNEL_ID
```

Future Aura/wallet-specific roles/caps remain design inputs and are not added merely because adjustment endpoints exist.

## Private `/cm user` session safety

`task/cm-admin-console` stores private UI/navigation state in bounded, expiring memory:

- random session UUID;
- owning operator Discord ID;
- user overview;
- selected order;
- optional refund proposal.

Component IDs contain no email/balance/reason/internal target data. Every component/modal interaction re-runs authorization and then requires session ownership by the same operator.

This session is not trusted as sole backend mutation authority.

## Canonical order refund — implemented candidate

Refund is different from Aura/wallet adjustment because the website already exposes a dedicated canonical read-preview plus execute contract:

```text
orders.refund.preview
orders.refund.execute
```

The candidate refund flow is:

1. authorized admin opens a selected order;
2. enters an 8–1000 character reason in a modal;
3. bot calls `orders.refund.preview`;
4. bot shows the canonical consequences privately;
5. operator explicitly confirms within five minutes;
6. bot calls `orders.refund.preview` again immediately before mutation;
7. every strict preview field must match the stored preview and target user/order;
8. bot calls `orders.refund.execute` using one stable logical idempotency key and frozen request body;
9. website owns refund amount, wallet/Aura effects, order state, transaction/audit IDs and immutable business transaction;
10. bot posts a sanitized Discord audit record.

### Refund replay model

The stored proposal freezes:

- order ID;
- reason;
- canonical preview;
- audit operator `{provider: "discord", externalUserId}`;
- UUID idempotency key;
- expiry.

Username/display name are deliberately not included in the execute proposal so a Discord profile rename cannot alter a retry body for the same idempotency key.

The API client serializes the validated execute request exactly once outside its retry loop. Transport retry keeps the same body/idempotency key and regenerates timestamp/nonce/signature.

Deterministic refund conflicts (`ALREADY_REFUNDED`, `REFUND_NOT_ELIGIBLE`, `REFUND_STATE_INVALID`, `IDEMPOTENCY_CONFLICT`) clear the proposal rather than blind retry. A transient/transport failure retains the same proposal so a retry can replay the exact logical action.

### Refund audit model

`BOT_AUDIT_LOG_CHANNEL_ID` must be configured before execute. Backend immutable audit is authoritative. Discord audit is secondary and mention-safe; if the Discord audit post fails after a successful refund, the bot reports that failure without issuing a second refund or trying to rewrite backend history.

No caller supplies refund amount, wallet credit, Aura effects, transaction IDs or target user independently of the selected canonical order.

## Manual fulfillment — blocked

The verified Internal Integrations API exposes `orders.fulfillment.read` diagnostics only. It has no manual-fulfillment execute operation.

Therefore the candidate UI may show diagnostics and a disabled/informational Manual Fulfillment control, but must not invent fulfillment business logic, call database functions or use another unrelated operation as a shortcut.

A future manual-fulfillment feature requires a website-owned narrow mutation contract with explicit authorization, idempotency, audit and fulfillment invariants.

## Aura/wallet selector status — source resolved

Read-only website source at commit `20f6cb52344bade858099febcec2d1c59312f2e5` shows both `auraAdjustmentRequestSchema` and `walletAdjustmentRequestSchema` use `userLookupSelectorSchema`, which accepts `user_id`, `email` and `external_identity`.

That source fact supersedes the earlier prose-document conflict over external identity selectors.

It does **not** authorize bot execution.

## Aura adjustment — still blocked by ADR-0004 confirmation requirement

Backend execute operation exists:

```text
POST /api/internal/integrations/v1/users/aura/adjust
operation: users.aura.adjust
```

But ADR-0004 requires backend-authoritative preview/confirm or equivalent bound confirmation state. Current verified adjustment contract is direct execute and does not provide that accepted confirmation state.

Consequently `task/cm-admin-console` intentionally contains no Aura-adjust API path/method. The visible Adjust Aura control is informational/blocked.

Before Aura execute is added, require:

- exact least-privilege bot client permission;
- accepted ADR-0004-compatible confirmation/state-binding design or a superseding security ADR;
- product/cap rules;
- stable idempotency/retry and audit tests;
- controlled authenticated verification.

## Wallet adjustment — later and stricter

Backend execute operation exists at `users.wallet.adjust`, but wallet remains after a proven Aura path. Candidate source contains no wallet-adjust path/method.

Future wallet controls require, at minimum, the Aura security model plus stricter stored-value caps, transaction/funding-state consistency, confirmation for every mutation, immutable audit and counter-entry reversal. No direct balance overwrite or fabricated payment provenance.

## Required backend client permissions for current candidate

The `/cm user` + order/refund candidate requires only:

```text
users.overview.read
orders.details.read
orders.fulfillment.read
orders.refund.preview
orders.refund.execute
```

The bot client's actual backend allowlist was not modified or verified in TASK-CM-ADMIN-001. Endpoint existence is not permission.

## Forbidden shortcuts

- direct Supabase/Postgres credential or RPC/table call;
- role-only admin authorization;
- global/DM admin mutation commands;
- sensitive target data in component custom IDs;
- refund execute without canonical preview/re-preview/confirmation;
- changing refund idempotency key/body on transport retry;
- caller-supplied refund economics;
- manual fulfillment through DB/unrelated API workarounds;
- Aura/wallet execute path before its independent security gate;
- destructive ledger/audit history editing.
