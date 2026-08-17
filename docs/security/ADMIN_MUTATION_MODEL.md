# Admin Mutation Model — Aura and Wallet

Updated: 2026-08-17

This document is the security/design reference for future high-impact admin commands. It is **not** evidence that bot mutation commands or bot mutation permissions are implemented.

## Goals

Allow a very small set of explicitly trusted Discord users to request audited Aura adjustments and, later, wallet adjustments while preserving website-owned business/data correctness.

## Global command policy

- Slash commands only for admin mutation surfaces.
- Configured Cheater's Market guild only.
- No DMs.
- Mutation commands only in configured admin command channel.
- Explicit `BOT_ADMIN_USER_IDS` allowlist is mandatory.
- Optional roles are secondary only.
- Fail closed if required config is missing.
- Safe allowed mentions for every response/audit message.
- Bot never receives direct database credentials.
- ADR-0005 leaves customer `cm aura` as a separate message command; it is not part of this mutation policy.

## Planned bot configuration

Do not add until the corresponding implementation phase requires it:

```text
BOT_ADMIN_USER_IDS
BOT_ADMIN_COMMAND_CHANNEL_ID
BOT_AUDIT_LOG_CHANNEL_ID
BOT_AURA_MANAGER_ROLE_ID
BOT_WALLET_MANAGER_ROLE_ID
BOT_MAX_AURA_ADJUSTMENT_SINGLE
BOT_MAX_AURA_ADJUSTMENT_DAILY
BOT_REQUIRE_AURA_CONFIRMATION_ABOVE
BOT_MAX_WALLET_ADJUSTMENT_SINGLE_CENTS
BOT_MAX_WALLET_ADJUSTMENT_DAILY_CENTS
BOT_REQUIRE_WALLET_CONFIRMATION_ABOVE_CENTS
```

Use only the dedicated bot HMAC integration credential with explicit least-privilege mutation operation permission. Never use an owner/admin/service-role credential in the bot.

## Verified upstream database foundation

Live DB functions exist for both `users.aura.adjust` and `users.wallet.adjust` integration execution. Among checked application roles they are service-role-only and include persistent idempotency/request-hash protection, bounded delta/reason validation, target checks, negative-balance protection and integration/operator audit metadata.

The wallet path writes a wallet transaction and participates in the funding-state trigger path.

These are backend implementation primitives. The bot must never call them directly.

## Authoritative backend HTTP contract now documented

Backend contract documentation supplied on 2026-08-17 confirms production HTTP execute operations:

```text
POST /api/internal/integrations/v1/users/aura/adjust   -> users.aura.adjust
POST /api/internal/integrations/v1/users/wallet/adjust -> users.wallet.adjust
```

Common mutation transport/business rules:

- `POST` JSON, no query string;
- exact raw UTF-8 body signed with current `cm-integrations-v1` HMAC canonicalization;
- fresh timestamp, lowercase UUIDv4 nonce and signature for every HTTP attempt;
- UUID `idempotencyKey` stable across retries of the same logical action;
- exact same body must accompany replay of the same key;
- same key + changed body yields `IDEMPOTENCY_CONFLICT`;
- optional Discord operator object is audit context only and never authorizes the action;
- machine client permission comes from its exact backend `allowedOperations` list.

Aura execute request fundamentals:

- user selector;
- `deltaAura`, non-zero and bounded to +/-1,000,000,000;
- reason 1–500;
- idempotency key;
- optional operator.

Wallet execute request fundamentals:

- user selector;
- `deltaCents`, non-zero and bounded to +/-100,000,000;
- reason 1–500;
- idempotency key;
- optional operator.

The backend docs state production verification covered success/replay/conflict/failure/cleanup for both adjustment operations. The Discord bot has not independently performed a bot-credential mutation smoke test.

## Critical selector conflict

The full API contract identifies itself as authoritative and says external identity is a lookup selector only. The bot quickstart shows Discord `external_identity` selectors in Aura/wallet adjustment examples.

Do not infer the answer. Before implementing mutation targeting, inspect the actual route schema/source or an updated authoritative contract and determine the accepted selector(s). Until resolved, no mutation command should send a Discord `external_identity` selector merely because the quickstart example does.

## ADR-0004 confirmation gap

ADR-0004 requires a backend-authoritative preview/confirm contract or equivalent confirmation state for high-impact mutations. The supplied backend documentation exposes direct Aura/wallet adjustment execute endpoints and does not document a dedicated Aura/wallet adjustment preview endpoint.

Therefore the existence of `users.aura.adjust` is **not enough** to wire `/aura-adjust confirm` directly today.

Before mutation implementation, one of these must become true without weakening security silently:

1. the backend exposes/defines an ADR-0004-compatible preview/confirm or equivalent state-binding contract; or
2. a new superseding security ADR explicitly changes the confirmation model with adequate justification and equivalent replay/audit safety.

Until then, one-step Discord Aura/wallet mutation is forbidden.

## Aura command model

Target remains:

```text
/aura-adjust preview target:<user> amount:<signed integer> reason:<text>
/aura-adjust confirm preview_id:<opaque id>
```

### Preview requirements

Preview must:

- perform Discord authorization before sensitive backend access;
- resolve target through website API, never DB lookup;
- validate non-zero bounded delta and bounded reason;
- return authoritative current/projected values and warning/cap state;
- not mutate;
- bind confirmation state to operator/target/delta/reason/request identity;
- expire;
- avoid leaking CM user IDs or balances to unauthorized operators.

### Confirm requirements

Confirm must:

- be invoked by the same whitelisted operator;
- remain in exact configured guild/admin channel;
- refer to valid unexpired backend-authoritative confirmation state;
- remain bound to operator/target/delta/reason/request identity;
- send one stable logical idempotency key across retries;
- fail safely if state/permission/caps changed;
- return stable transaction/audit/request identifiers and before/after values;
- post a sanitized Discord audit record.

## Idempotency and retry rule

For mutations:

- transport nonce/timestamp/signature are fresh per HTTP attempt;
- logical idempotency key and exact request content remain stable across retries;
- never create a new adjustment identity merely because transport failed;
- backend replay result is authoritative;
- do not blindly retry deterministic 409 business conflicts.

## Aura data rules

- discretionary grant/deduction affects available Aura through website-owned canonical logic;
- ordinary deduction does not reduce lifetime earned Aura;
- whether an admin grant counts as lifetime earned requires explicit product decision;
- pending Aura remains untouched unless separately designed;
- negative resulting available Aura is rejected;
- reversal is a counter-entry, never destructive history editing.

## Wallet command model — later phase

Target only after Aura is proven:

```text
/wallet-adjust preview target:<user> amount_cents:<signed integer> reason:<text>
/wallet-adjust confirm preview_id:<opaque id>
```

Wallet is payment-adjacent stored value and receives stricter controls:

- cents integers only;
- explicit whitelist and optional wallet-manager role;
- confirmation for every mutation;
- stricter single/daily caps;
- canonical website wallet transaction ledger entry;
- funding-lot/funding-consumption consistency;
- no direct balance overwrite from bot;
- immutable audit event;
- counter-entry reversal;
- no fabricated payment-provider provenance.

## Discord authorization order

For any mutation-capable command:

1. ensure chat-input interaction;
2. ensure in guild;
3. exact configured guild;
4. exact admin command channel;
5. invoking Discord user ID in explicit allowlist;
6. optional domain role;
7. local input validation;
8. backend confirmation/idempotency/business rules.

No backend mutation request should occur before steps 1–6 pass.

## Audit evidence requirements

Backend evidence should capture request/operation ID, idempotency key, confirmation/preview ID where applicable, integration client, operator attribution, internal target, operation/domain, delta/reason, before/after values, ledger transaction ID, admin audit event ID, replay state, stable status/error and timestamp.

Discord audit output should contain only necessary sanitized operator/target Discord identifiers, domain, delta, reason, before/after, backend audit/request identity and timestamp. No emails, secrets or raw credentials by default. Mentions disabled.

## Backend security prerequisite

The live Supabase security advisor still reports unrelated privileged-function findings in the wider website DB. Those are website ownership and are not permission to weaken the bot's Internal API boundary.

## Implementation phases — revised

1. Add executable CI/current-head verification gate.
2. Preserve `cm aura` as the customer message command and keep its required intents/guards.
3. Establish clean admin slash-command dispatch/registration infrastructure.
4. Implement shared explicit whitelist/guild/admin-channel authorization and tests, with no mutation.
5. Verify bot credential scope and exact route DTO/selector for `users.aura.adjust`.
6. Resolve the ADR-0004 confirmation gap before adding any Aura execute path.
7. Add typed Aura confirmation/execute client flow with stable idempotency and Discord audit output.
8. Perform controlled test-account verification and security audit.
9. Only then verify/integrate wallet mutation commands.

## Forbidden shortcuts

- direct Supabase/Postgres credential in bot;
- direct bot RPC/function invocation;
- direct `aura_balances`/`wallet_balances` writes;
- one-step high-impact mutation with no accepted confirmation model;
- role-only authorization;
- global or DM mutation commands;
- in-memory-only confirmation as sole authority;
- changing idempotency key on transport retry;
- deleting/editing ledger history to reverse an error;
- enabling wallet command in the same first pass as Aura.
