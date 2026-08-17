# Admin Mutation Model — Aura and Wallet

Updated: 2026-08-17

This document is the security/design reference for future high-impact admin commands. It is **not** evidence that bot Aura/wallet mutation commands or their bot HTTP permissions are implemented.

ADR-0006 supersedes ADR-0004's original mandatory admin-command-channel requirement. Under the current shared `/cm` authorization model, high-impact admin controls remain configured-guild-only and explicitly user-ID-whitelisted, but a whitelisted operator may use them from any channel in that guild. All confirmation, idempotency, backend-boundary and audit requirements remain unchanged.

## Goals

Allow a very small set of explicitly trusted Discord users to request audited Aura adjustments and, later, wallet adjustments while preserving website-owned business/data correctness.

## Global command policy

- Slash/component/modal admin mutation surfaces only; no free-form prefix mutation path.
- Configured Cheater's Market guild only.
- No DMs.
- Shared `/cm` admin controls may be invoked from any channel in the configured guild.
- Explicit `BOT_ADMIN_USER_IDS` allowlist is mandatory.
- Optional roles are secondary only.
- Fail closed if required authorization config is missing.
- Safe allowed mentions for every response/audit message.
- Bot never receives direct database credentials.
- `BOT_AUDIT_LOG_CHANNEL_ID` is a separate audit destination and is not a command-location restriction.
- ADR-0005 leaves customer `cm aura` as a separate message command; it is not part of this mutation policy.

## Planned bot configuration

Current shared admin configuration:

```text
BOT_ADMIN_USER_IDS
BOT_AUDIT_LOG_CHANNEL_ID
```

Future domain-specific configuration may add:

```text
BOT_AURA_MANAGER_ROLE_ID
BOT_WALLET_MANAGER_ROLE_ID
BOT_MAX_AURA_ADJUSTMENT_SINGLE
BOT_MAX_AURA_ADJUSTMENT_DAILY
BOT_REQUIRE_AURA_CONFIRMATION_ABOVE
BOT_MAX_WALLET_ADJUSTMENT_SINGLE_CENTS
BOT_MAX_WALLET_ADJUSTMENT_DAILY_CENTS
BOT_REQUIRE_WALLET_CONFIRMATION_ABOVE_CENTS
```

`BOT_ADMIN_COMMAND_CHANNEL_ID` is no longer part of the supported configuration surface under ADR-0006.

The existing HMAC integration credential model should be extended only with explicit least-privilege mutation operation permission. Never use an owner/admin/service-role credential in the bot.

## Verified upstream foundation discovered by `TASK-AUDIT-001`

The website database has advanced beyond the original design assumptions.

### Aura execute primitive exists

Live DB function:

`internal_integration_adjust_aura_balance(...)`

Operation ID:

`users.aura.adjust`

Verified characteristics:

- service-role-only among checked application roles;
- empty `search_path`;
- UUID idempotency key;
- 64-hex request hash;
- advisory lock for same client/operation/idempotency identity;
- persisted replay/conflict result;
- delta bounded to +/-1,000,000,000 Aura;
- reason 1–500;
- strict optional external operator object;
- target existence check;
- negative-result protection;
- Aura transaction + admin audit event;
- integration/client/operator metadata appended to audit event.

### Wallet execute primitive exists

Live DB function:

`internal_integration_adjust_wallet_balance(...)`

Operation ID:

`users.wallet.adjust`

Verified characteristics:

- same service-role-only/idempotency/request-hash/operator model;
- cents delta bounded to +/-100,000,000;
- reason 1–500;
- negative wallet balance rejected;
- wallet transaction + admin audit event;
- integration/client/operator audit metadata.

The underlying `admin_adjust_wallet_balance` creates `wallet_transactions` with type `admin_adjustment`.

A live wallet transaction `AFTER INSERT` trigger calls the funding-state handler. Positive transactions route to funding-lot synchronization and negative transactions to funding-consumption synchronization.

The bot still must not call DB functions directly.

## Authoritative backend HTTP contract supplied 2026-08-17

Backend contract documentation confirms production execute operations:

```text
POST /api/internal/integrations/v1/users/aura/adjust   -> users.aura.adjust
POST /api/internal/integrations/v1/users/wallet/adjust -> users.wallet.adjust
```

Common mutation transport/business rules:

- `POST` JSON with no query string;
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

The backend docs state production verification covered success/replay/conflict/failure/cleanup for both adjustment operations. The Discord bot has not independently performed a bot-credential adjustment mutation smoke test.

## Selector status — resolved by website source

A prior documentation conflict existed between the full API prose and quickstart examples over `external_identity` targeting.

Read-only website source verification at commit `20f6cb52344bade858099febcec2d1c59312f2e5` resolved that conflict: both `auraAdjustmentRequestSchema` and `walletAdjustmentRequestSchema` use `userLookupSelectorSchema`, which accepts `user_id`, `email`, and `external_identity`.

This resolves selector semantics only. It does **not** authorize bot Aura/wallet execution or bypass the remaining confirmation/client-scope gates.

## Confirmation gap

ADR-0004 still governs the confirmation/idempotency/backend-boundary requirements not superseded by ADR-0006. It requires a backend-authoritative preview/confirm contract or equivalent confirmation state for high-impact mutations.

The verified Aura/wallet adjustment API contract exposes direct execute endpoints and does not provide an accepted dedicated preview/state-binding mechanism.

Therefore the existence of `users.aura.adjust` is **not enough** to wire a one-step Discord adjustment command today.

Before mutation implementation, one of these must become true without weakening security silently:

1. the backend exposes/defines an ADR-0004-compatible preview/confirm or equivalent state-binding contract; or
2. a new superseding security ADR explicitly changes the confirmation model with adequate justification and equivalent replay/audit safety.

Until then, one-step Discord Aura/wallet mutation is forbidden.

## Aura command model

Conceptual flow:

```text
shared /cm Aura control
  -> input target/amount/reason
  -> preview or equivalent bound confirmation state
  -> explicit confirm
  -> idempotent execute
  -> backend audit + Discord audit
```

### Preview requirements

Preview must:

- perform Discord authorization before any sensitive backend request;
- resolve target through website API, not DB lookup;
- validate non-zero bounded delta and bounded reason;
- return current available Aura, projected value, cap/warning status, opaque preview identity and expiry;
- not mutate data;
- avoid leaking CM user IDs or balances to unauthorized operators.

The existing DB execute primitive and documented direct HTTP execute endpoint are not themselves a preview mechanism.

### Confirm requirements

Confirm must:

- be invoked by the same whitelisted operator;
- remain in the configured guild;
- refer to a valid unexpired preview or equivalent backend-authoritative confirmation state;
- be bound to operator/target/delta/reason/request identity;
- send one stable logical idempotency key across retries;
- fail safely if state/permission/caps changed;
- return stable transaction/audit/request identifiers and before/after balances;
- post a sanitized Discord audit record to the configured audit destination.

Under ADR-0006 there is no mandatory admin command-channel check for this shared `/cm` flow.

## Idempotency and retry rule

Current API client creates fresh nonce/timestamp/signature on each HTTP attempt, which is correct.

For mutations:

- nonce/timestamp/signature should still be fresh per HTTP attempt;
- **logical idempotency key and request content/hash must remain stable across retries**;
- never generate a new adjustment identity merely because transport failed;
- backend replay result is authoritative;
- do not blindly retry deterministic 409 business conflicts.

The live integration DB functions already persist idempotency by client + operation + UUID key and reject request-hash conflicts. The supplied HTTP contract matches that logical replay model.

## Aura data rules

- normal discretionary grant/deduction affects available Aura through website-owned transactional logic;
- ordinary deduction does not reduce lifetime earned Aura;
- whether an admin grant counts as lifetime earned requires explicit product decision;
- pending Aura remains untouched unless separately designed;
- negative resulting available Aura rejected;
- reversal is a counter-entry, never destructive history editing.

## Wallet command model — later phase

Wallet is payment-adjacent stored value and receives stricter controls.

Conceptual flow:

```text
shared /cm Wallet control
  -> input target/amount/reason
  -> preview or equivalent bound confirmation state
  -> explicit confirm
  -> idempotent execute
  -> backend audit + Discord audit
```

Required rules:

- cents integers only;
- explicit whitelist and optional wallet-manager role;
- confirmation for every wallet mutation;
- stricter single/daily caps;
- website wallet transaction ledger entry;
- funding-lot/funding-consumption consistency;
- balance update in website transaction;
- no direct balance overwrite from bot;
- immutable audit event;
- counter-entry reversal;
- no fabricated payment-provider provenance.

The verified upstream wallet primitive already writes a wallet transaction and participates in funding-state trigger logic, and the HTTP execute path is documented. Bot scope, confirmation and controlled end-to-end verification remain required before Discord use.

## Discord authorization order

For any mutation-capable control using the shared `/cm` authorization boundary:

1. ensure the interaction is a supported admin slash/component/modal interaction;
2. ensure it is in a guild;
3. require exact configured guild;
4. require non-empty `BOT_ADMIN_USER_IDS`;
5. require invoking Discord user ID in the explicit allowlist;
6. apply any optional domain role restriction;
7. perform local input/confirmation validation;
8. apply backend preview/confirm authorization/business rules.

No sensitive backend request or mutation should occur before the applicable Discord authorization steps pass. The Discord channel is not an authorization factor under ADR-0006.

## Audit evidence requirements

Backend evidence should capture, as applicable:

- request/operation ID;
- idempotency key;
- preview ID;
- integration client ID;
- operator provider/external user ID;
- target resolved user identity internally;
- operation type/domain;
- delta/reason;
- before/after values;
- ledger transaction ID;
- admin audit event ID;
- idempotent replay state;
- stable status/error code;
- timestamp.

Discord audit output should contain only necessary sanitized operator/target identifiers, domain, delta, reason, before/after, backend audit/request identity and timestamp. No secrets or raw internal credentials. Mentions disabled.

## Backend security prerequisite

The live Supabase security advisor still reports unrelated public/signed-in `SECURITY DEFINER` functions in the wider website DB. The integration adjustment functions themselves were verified service-role-only among checked roles.

The wider findings remain website ownership and should be addressed by that project. They are not permission to weaken the bot's Internal API boundary.

## Implementation phases — revised

1. Keep executable CI/current-head verification gate.
2. Preserve `cm aura` as the customer message command and keep its required intents/guards.
3. Maintain clean admin slash/component/modal dispatch infrastructure.
4. Maintain shared explicit whitelist + configured-guild authorization and tests under ADR-0006, with no role-only fallback.
5. Verify bot credential scope for `users.aura.adjust` before adding that operation to bot source.
6. Resolve the confirmation/state-binding gap before adding any Aura execute path.
7. Add typed Aura confirmation/execute client flow with stable idempotency and Discord audit output.
8. Perform test-account live verification and security audit only with explicit authorization.
9. Only then verify/integrate wallet HTTP mutation and controls.

## Forbidden shortcuts

- direct Supabase/Postgres credential in bot;
- direct bot RPC/function invocation;
- direct `aura_balances`/`wallet_balances` writes;
- one-step high-impact mutation with no accepted confirmation model;
- role-only authorization;
- global or DM mutation commands;
- treating ephemeral visibility as authorization;
- in-memory-only confirmation as sole authority;
- changing idempotency key on transport retry;
- deleting/editing ledger history to reverse an error;
- enabling wallet mutation in the same first pass as Aura.
