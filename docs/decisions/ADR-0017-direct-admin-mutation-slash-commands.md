# ADR-0017: Direct Admin Mutation Slash Commands

## Status

Accepted — supersedes ADR-0004 and ADR-0007 only for the explicit direct slash-command paths defined here. Existing button/modal adjustment and refund flows remain unchanged and retain their existing confirmation models.

- Date: 2026-09-09
- Type: Security / Product / Data mutation / Discord administration

## Context

Cheater's Market administrators already have private `/cm` controls for:

- Aura adjustment;
- wallet balance adjustment;
- canonical-order refund.

Those existing controls are intentionally multi-step:

```text
open user/order
 -> modal
 -> preview
 -> confirm button
 -> execute
```

The product owner explicitly requested faster direct slash-command paths for trusted allowlisted administrators:

```text
/cm aura
/cm balance
/cm refund
```

The direct commands should execute the requested mutation in one operator action and return the final completed result rather than another preview/confirmation panel.

The website already owns the mutation primitives and enforces bounded deltas, non-negative balances, refund eligibility/state, idempotency and immutable audit evidence. No new website mutation operation is needed.

## Decision

### Direct command surfaces

The bot adds:

```text
/cm aura amount:<signed integer> email:<email> [reason:<text>]
/cm aura amount:<signed integer> discord_user:<user> [reason:<text>]

/cm balance amount:<signed decimal> email:<email> [reason:<text>]
/cm balance amount:<signed decimal> discord_user:<user> [reason:<text>]

/cm refund reference:<public ref|order UUID> [reason:<text>]
```

For Aura and balance, exactly one of `email` or `discord_user` is required.

Positive amounts add value. Negative amounts deduct value. Zero is rejected.

The `reason` option is optional for operator convenience. When omitted, the bot supplies a fixed auditable reason identifying the direct Discord admin command.

### Authorization

Every direct command retains ADR-0006 authorization:

1. guild interaction only;
2. exact configured `DISCORD_GUILD_ID`;
3. non-empty `BOT_ADMIN_USER_IDS`;
4. invoking Discord user explicitly allowlisted.

Discord roles alone are not sufficient. There is no shared command-channel restriction.

### Audit requirement

`BOT_AUDIT_LOG_CHANNEL_ID` remains mandatory before any direct mutation.

Successful direct mutations:

- remain attributable to the invoking Discord administrator in the website operator context;
- use a fresh logical UUID idempotency key;
- rely on the website's immutable mutation/audit records as authoritative;
- attempt the existing sanitized Discord audit message after backend success.

If Discord audit delivery fails after the backend mutation succeeds, the command still reports the completed mutation and clearly notes the Discord audit delivery failure.

### Direct Aura / balance execution

The bot:

1. validates the signed amount using the same bounds/parsing rules as the existing modal flow;
2. resolves the target through `users.overview.read`;
3. freezes the resolved canonical website user ID before mutation;
4. rejects a locally projected negative balance;
5. calls exactly one of:
   - `users.aura.adjust`
   - `users.wallet.adjust`
6. validates returned target and delta;
7. returns the final completed result immediately.

The direct path intentionally does **not** create a five-minute proposal or require a confirm button. The website remains authoritative for transactional negative-balance prevention and final accounting.

### Direct refund execution

The bot:

1. resolves the supplied reference through `orders.details.read`;
2. accepts only a canonical order;
3. resolves and validates the canonical order owner;
4. calls `orders.refund.preview` immediately before execution as an eligibility/consequence sanity check;
5. validates preview order/user identity;
6. immediately calls `orders.refund.execute` with the same frozen order, reason, operator and one fresh idempotency key;
7. validates returned order/user identity;
8. returns the final completed result immediately.

There is no user-facing refund preview or confirm button in this direct path.

Pending purchase intents are not refundable through `/cm refund`.

### Output

Direct mutation replies remain private/ephemeral.

Success output is final-state only and contains no confirmation button:

- target identity;
- applied Aura/wallet delta or refund result;
- resulting balance/wallet credit;
- completion time;
- reason;
- audit-delivery note when applicable.

The existing button-driven UI remains available as an alternative workflow.

## Security properties retained

This decision does not weaken:

- exact-guild restriction;
- explicit Discord administrator allowlist;
- private/ephemeral mutation output;
- mandatory audit-channel configuration before execution;
- HMAC-authenticated Internal Integrations API boundary;
- no direct Supabase/Postgres access;
- strict canonical target validation;
- bounded deltas;
- backend negative-balance checks;
- refund eligibility/state validation;
- backend transactional accounting;
- UUID idempotency;
- immutable backend audit evidence;
- sanitized Discord audit;
- customer AI having no mutation authority.

## Deliberate change from prior ADRs

For only the new direct `/cm aura`, `/cm balance`, and `/cm refund` subcommands, the administrator's slash-command submission itself is the explicit confirmation.

Therefore these direct paths do not require:

- a modal confirmation step;
- an intermediate customer-visible/admin preview panel;
- a second confirm button;
- the five-minute in-memory confirmation proposal from ADR-0007;
- a second pre-execute balance equality comparison.

The existing interactive button/modal flows continue to use their prior confirmation and fresh-state rules.

## Consequences

Benefits:

- frequent administrative corrections/refunds require one command instead of several UI interactions;
- final result is returned immediately;
- no new website API operation or credential is added;
- existing audit/idempotency/backend validation boundaries remain.

Costs:

- an authorized administrator can execute a money-like mutation with a single submitted slash command;
- mistyped signed amounts or order references have less UI friction before execution;
- the command must therefore remain restricted to the explicit administrator allowlist and private reply surface.

## Deployment

This changes Discord guild command JSON. After deployment, run:

```text
npm run register:commands
```

once so Discord receives the three new subcommands.

No new environment variable or website `allowedOperations` entry is required because the direct commands reuse operations already required by the existing button flows.
