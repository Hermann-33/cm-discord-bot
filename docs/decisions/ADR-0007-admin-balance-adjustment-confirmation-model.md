# ADR-0007: Admin Balance Adjustment Confirmation Model

## Status

Accepted — supersedes ADR-0004/ADR-0005 and derived specialist guidance only where they require a dedicated backend preview endpoint or Aura-before-wallet deployment sequencing for `users.aura.adjust` and `users.wallet.adjust`

- Date: 2026-08-18
- Type: Security / Product / Data mutation / Discord administration

## Context

The Cheater's Market Internal Integrations API now exposes production, audited, idempotent balance-adjustment operations:

```text
users.aura.adjust
POST /api/internal/integrations/v1/users/aura/adjust

users.wallet.adjust
POST /api/internal/integrations/v1/users/wallet/adjust
```

Current website source verifies that both operations:

- accept the canonical user lookup selector;
- require a non-zero bounded delta;
- require a reason;
- require a UUID idempotency key;
- accept strict audit-only external operator context;
- resolve and mutate the canonical website-owned user balance transactionally;
- reject a resulting negative balance;
- persist transaction/audit evidence;
- return stable transaction and audit IDs plus replay state.

The website does not expose a separate Aura/wallet preview endpoint. ADR-0004 originally required a backend-authoritative preview/confirm contract before these Discord mutations could be enabled. The product owner has explicitly chosen to enable both Aura and wallet controls now while preserving a two-step confirmation, fresh-state binding, backend idempotency and immutable audit.

## Decision

### Authorization remains unchanged

Every Aura/wallet interaction must retain the shared `/cm` authorization model from ADR-0006:

1. supported `/cm` slash/component/modal interaction;
2. guild interaction only;
3. exact configured `DISCORD_GUILD_ID`;
4. non-empty explicit `BOT_ADMIN_USER_IDS`;
5. invoking Discord user ID present in that allowlist;
6. reauthorization on every button/modal interaction.

Discord roles alone remain insufficient. There is no `/cm` command-channel requirement.

### Balance confirmation model

For Aura and wallet adjustments, a dedicated backend preview endpoint is no longer required provided the bot implements all of the following:

1. adjustment amount and reason are collected in a private modal;
2. the bot fetches a fresh `users.overview.read` snapshot before presenting confirmation;
3. the confirmation proposal is bound to:
   - exact target user ID;
   - exact adjustment kind;
   - exact delta;
   - exact reason;
   - exact relevant pre-adjustment balance state;
   - projected resulting balance;
   - exact Discord operator ID;
   - one stable UUID idempotency key;
   - an expiry no longer than five minutes;
4. immediately before execute, the bot fetches `users.overview.read` again;
5. if the relevant current balance differs from the confirmation snapshot, execution fails closed and a new confirmation is required;
6. if the snapshot still matches, the bot calls exactly one website-owned adjustment operation with the frozen target/delta/reason/operator/idempotency identity;
7. transport retries reuse the exact logical request body/idempotency key while generating fresh HMAC timestamp/nonce/signature;
8. backend result target/delta are validated before success is shown;
9. `BOT_AUDIT_LOG_CHANNEL_ID` is required before execution;
10. backend immutable audit remains authoritative and a sanitized Discord audit record is attempted after success.

The in-memory confirmation is therefore not the business mutation authority. It is an operator confirmation/state-binding layer in front of the website's transactional/idempotent execute operation.

### Aura adjustment

- input is a signed whole-number Aura delta;
- maximum magnitude matches the verified backend contract: `1,000,000,000` Aura;
- zero is rejected;
- projected available Aura may not be negative;
- the backend remains authoritative for final validation and accounting;
- pending/lifetime values are not directly edited by the bot.

### Wallet adjustment

- operator enters a signed major-currency amount with at most two decimal places;
- bot converts it exactly to integer cents before confirmation/execution;
- maximum magnitude matches the verified backend contract: `100,000,000` cents (`1,000,000.00` currency units);
- zero is rejected;
- projected wallet balance may not be negative;
- when no wallet row exists, the verified website primitive prepares a zero-balance USD wallet row; the bot may present the same zero/USD preview assumption;
- the website owns the wallet transaction ledger and funding-state side effects; the bot never overwrites a balance directly.

### Sequencing change

ADR-0004's Aura-first/wallet-later rollout sequencing is superseded for this `/cm` implementation. Aura and wallet controls may ship in the same task because both website execute contracts and their idempotent/audited accounting primitives are verified. Each still uses its own explicit confirmation and audit path.

### Manual fulfillment remains out of scope

This decision does not authorize manual fulfillment. The current Internal Integrations API exposes fulfillment diagnostics only and no manual-fulfillment mutation operation. The bot must not invent one or reuse purchase processing as a substitute.

## Security properties retained

This ADR does not weaken:

- configured-guild restriction;
- explicit `BOT_ADMIN_USER_IDS` allowlist;
- per-interaction reauthorization;
- private/ephemeral admin UI;
- HMAC-authenticated website API boundary;
- no direct Supabase/Postgres access;
- stable mutation idempotency identity across retry;
- backend business validation and transactional accounting;
- immutable backend audit evidence;
- sanitized Discord audit destination;
- fail-closed behavior on changed state or missing audit configuration.

## Consequences

Benefits:

- Aura and wallet operations become usable without adding redundant website preview endpoints;
- stale confirmations fail closed when the relevant balance changes;
- the website remains the only system that performs business/accounting mutations;
- retries remain safe through backend idempotency;
- operator actions remain attributable in backend and Discord audit evidence.

Costs:

- confirmation state is held in the single bot process for up to five minutes;
- the confirmation snapshot is a read-then-compare model rather than an opaque backend preview token;
- there is still a narrow race between the final read and execute, resolved safely by the backend's transactional balance constraints but not by compare-and-swap semantics;
- broad deployment credentials increase blast radius independently of the source operation set, so deployment scope should still be reviewed separately.

## Rollback/supersession

Reverting Aura/wallet controls to a dedicated backend preview-token model can be done with a later ADR. Removing confirmation, fresh-state comparison, explicit user-ID authorization, stable idempotency, backend audit, or the no-direct-database boundary requires another explicit security decision.
