# ADR-0004: Admin Mutation Command Security Model

## Status

Accepted design — implementation blocked until backend contract exists

- Date: 2026-08-17
- Type: Security / Data mutation / Discord administration

## Context

Future staff want the bot to adjust Aura and eventually wallet balances. These operations can alter financially relevant/account state and cannot rely on ordinary Discord permissions or direct database access.

## Decision

### Authorization

Every mutation command must require, before any backend mutation call:

1. command is a slash command;
2. interaction is in a guild;
3. guild ID equals configured Cheater's Market guild;
4. channel equals configured admin command channel;
5. invoking Discord user ID is explicitly present in `BOT_ADMIN_USER_IDS`;
6. optional per-domain role/permission gate passes;
7. inputs and confirmation state are valid.

Discord roles alone are insufficient. User-ID allowlisting is mandatory.

### Execution model

- Bot is a thin interface.
- Mutation occurs through a dedicated signed Internal Integrations API preview/confirm contract.
- Bot does not directly call Supabase tables/functions or carry database mutation credentials.
- Preview does not mutate.
- Confirm is bound to the preview/operator/target/amount/reason, expires, and is idempotent.
- Backend writes immutable audit evidence and returns stable IDs/before/after data.
- Discord posts a sanitized audit-channel summary.

### Product sequencing

1. Aura adjustment first.
2. Wallet adjustment later, after Aura is proven.

Wallet commands require stricter caps and ledger/funding-lot correctness and must never directly overwrite wallet balance.

### Reversal model

Administrative corrections are counter-entries referencing the original adjustment, not deletion/editing of historical ledger/audit rows.

## Consequences

Benefits:

- stolen/overprivileged Discord role alone cannot authorize money-like mutations;
- backend owns business/data correctness;
- duplicate confirmations can be made safe;
- every mutation is attributable and auditable.

Costs:

- extra backend work and operational configuration;
- two-step user flow;
- wallet feature is intentionally delayed.

## Explicitly forbidden

- prefix mutation commands;
- DMs or wrong-guild mutation;
- role-only authorization;
- direct `supabase.from(...)` mutation from bot;
- direct call from bot to `admin_adjust_aura_balance`;
- direct `aura_balances`/`wallet_balances` overwrite;
- mutation without idempotency/audit/confirmation;
- wallet mutation in the first Aura implementation phase.

## Detailed design

See `../security/ADMIN_MUTATION_MODEL.md`.

## Rollback/supersession

Any weakening of the whitelist, backend boundary, confirmation, idempotency, or audit requirements requires a superseding security ADR.