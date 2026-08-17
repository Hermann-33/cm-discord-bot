# Admin Mutation Model — Aura and Wallet

Updated: 2026-08-17

This document is the detailed security/design reference for future high-impact admin commands. It is not evidence that mutation commands are implemented.

## Goals

Eventually allow a very small set of explicitly trusted Discord users to request audited Aura adjustments and, later, wallet adjustments while preserving website-owned business/data correctness.

## Global command policy

- Slash commands only.
- Configured Cheater's Market guild only.
- No DMs.
- Mutation commands only in the configured admin command channel.
- `BOT_ADMIN_USER_IDS` allowlist is mandatory.
- Optional roles are additive only.
- Fail closed if required config is missing.
- Use safe allowed mentions for every response/audit message.

## Planned environment names

Do not add these until the corresponding implementation phase requires them:

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

The existing Internal Integrations API HMAC model should be extended with dedicated least-privilege mutation operations/credential scope. Do not reuse an owner or unrelated integration credential.

## Aura command model

Planned commands:

```text
/aura-adjust preview target:<user> amount:<signed integer> reason:<text>
/aura-adjust confirm preview_id:<opaque id>
```

### Preview

Preview must:

- perform all Discord-side authorization before the request;
- resolve target through the backend, not by direct DB lookup;
- validate non-zero integer delta and single-operation cap;
- require trimmed, bounded reason;
- return current available Aura, delta, projected available Aura, warnings/cap status, opaque preview ID, and expiry;
- not mutate data.

### Confirm

Confirm must:

- be invoked by the same whitelisted operator;
- occur in the same configured guild/admin surface;
- refer to an unexpired backend-stored/signed preview;
- be bound to operator, target, delta, reason/hash, and preview state;
- use an idempotency key;
- fail safely if target state/caps changed;
- return immutable adjustment, Aura transaction, audit event, request IDs, and before/after balances.

## Recommended backend request identity

The existing HMAC API design already signs client/key ID, timestamp, nonce, method, path, and raw body. Mutation operations should additionally carry stable operation/idempotency identifiers and a dedicated allowlisted operation scope.

The backend — not the bot — is authoritative for target resolution, balance math, daily caps, idempotency, and transaction/audit creation.

## Aura data rules

- Normal admin grant/deduction changes available Aura through website-owned transactional logic.
- Ordinary deductions do not reduce `lifetime_earned_aura`.
- Whether a discretionary admin grant counts as lifetime earned must be an explicit product rule; do not infer it.
- `pending_aura` remains untouched in v1 unless separately designed.
- Negative resulting available Aura is rejected unless a later explicit policy authorizes debt.
- Reversal is a counter-entry referencing the original adjustment.

The live DB has an `admin_adjust_aura_balance` function that already updates available Aura and writes Aura/admin audit rows. The bot must not call it directly; a website backend may evaluate it as an internal primitive after audit.

## Wallet command model — later phase

Planned only after Aura mutation is proven:

```text
/wallet-adjust preview target:<user> amount_cents:<signed integer> reason:<text>
/wallet-adjust confirm preview_id:<opaque id>
```

Wallet is higher risk because it is stored-value/payment-adjacent.

Required additional rules:

- cents-based integers only;
- confirmation for every wallet mutation;
- stricter single and daily caps;
- website wallet transaction ledger entry;
- funding-lot creation/linkage when credits create spendable funds and the website model requires it;
- balance update in the same backend transaction;
- no direct balance overwrite;
- immutable admin audit event;
- counter-entry reversal;
- no payment-provider fabrication or pretending an admin credit came from an external payment.

## Audit record requirements

Backend audit evidence should capture at least:

- request/operation ID;
- idempotency key;
- preview ID;
- operator Discord user ID;
- operator display identifier suitable for logs;
- guild ID;
- channel ID;
- target Discord user ID;
- resolved CM user ID;
- operation domain/type;
- signed delta/reason;
- before/after relevant balances;
- ledger transaction ID;
- audit event ID;
- status and stable error code;
- creation timestamp.

Do not put secrets, raw credentials, or unnecessary personal data into Discord audit messages.

## Discord audit-channel message

Successful confirmations should post a sanitized summary containing:

- operator Discord ID;
- target Discord ID;
- domain (Aura/wallet);
- delta;
- reason (sanitized/bounded);
- before/after amount;
- backend audit/adjustment ID;
- timestamp/request ID.

Mention parsing must be disabled.

Failures worth auditing include rejected confirmation, cap violation, stale preview, duplicate/idempotent replay result, backend unavailable, or authorization anomalies. Ordinary unauthorized users should not receive sensitive target/balance information.

## Failure behavior

Fail closed for:

- missing/invalid admin config;
- DM/wrong guild;
- wrong channel;
- non-whitelisted user;
- failed optional role gate;
- malformed or zero delta;
- cap violation;
- unlinked/unknown target;
- stale/expired preview;
- preview/operator mismatch;
- state changed since preview when backend policy requires refresh;
- negative result;
- backend authentication failure;
- backend unavailable/invalid response.

## Implementation phases

1. Slash-only/guild-only command convergence.
2. Shared admin authorization foundation and tests.
3. Aura preview backend operation.
4. `/aura-adjust preview` integration.
5. Aura confirm backend operation with transaction/idempotency/audit.
6. `/aura-adjust confirm` integration and test-account live verification.
7. Audit and hardening.
8. Separate wallet contract/implementation phase.

## Forbidden shortcuts

- direct DB credential in bot;
- direct DB table writes;
- direct DB admin-function invocation from bot;
- one-step high-value mutation with no preview/confirm;
- relying solely on Discord roles;
- global commands or DM execution;
- in-memory-only confirmation state as the sole source of truth;
- editing/deleting ledger history to reverse an error;
- adding wallet mutation in the same first pass as Aura mutation.