# TASK-CM-ADMIN-003 Implementation Audit — 2026-08-18

Repository: `Hermann-33/cm-discord-bot`

Base:

```text
master
5baa260bb1f804c6c0e9878f2cb5be003564a915
```

Feature branch:

```text
task/cm-admin-controls-order
```

Draft PR:

```text
#1 — TASK-CM-ADMIN-003: balance controls and direct order lookup
```

## Verdict

`PARTIAL`

Implementation, tests and governance updates are present on the feature branch, but executable Node verification has not run. GitHub Actions creates the `verify` job and marks it failed before any workflow step exists (`steps: []`, no job log), matching the repository's previously documented Actions execution/billing/spending-limit infrastructure problem.

Do not report `npm test`, typecheck or build as passing until a clean Node 22 checkout executes the required gate.

## Authorized scope

Product owner explicitly requested:

- activate Aura adjustment controls;
- activate wallet/balance adjustment controls;
- add direct `/cm order` lookup;
- preserve order refund and user-navigation controls;
- leave manual fulfillment unimplemented.

## External contract verification

Cheater's Market website source was inspected read-only before implementation.

Verified facts:

- `users.aura.adjust` strict request/response contract;
- `users.wallet.adjust` strict request/response contract;
- Aura max magnitude ±1,000,000,000;
- wallet max magnitude ±100,000,000 cents;
- mutation reason 1–500;
- UUID idempotency;
- stable transaction/audit/replay response fields;
- `INVALID_ADJUSTMENT` -> HTTP 400;
- `INSUFFICIENT_BALANCE` -> HTTP 409;
- order selector accepts `order_id` or `public_ref`;
- wallet adjustment primitive prepares a missing wallet as zero/USD and writes canonical wallet/audit records;
- no manual-fulfillment mutation operation exists.

No website source/environment/secret was changed by this bot task.

## Architecture/security decision

ADR-0007 was added because the requested Aura/wallet implementation conflicted with ADR-0004's older requirement for a dedicated backend adjustment preview endpoint and Aura-first/wallet-later sequencing.

ADR-0007 supersedes those two constraints only for `users.aura.adjust` and `users.wallet.adjust`.

Retained security properties:

- exact configured guild;
- mandatory explicit `BOT_ADMIN_USER_IDS`;
- reauthorization on every command/button/modal;
- operator-bound expiring sessions;
- private Components V2 output;
- no direct DB access;
- website-owned transactional mutation;
- five-minute explicit adjustment confirmation;
- fresh overview before preview;
- fresh overview immediately before first execute;
- exact relevant-balance equality;
- stable logical idempotency body/key;
- required `BOT_AUDIT_LOG_CHANNEL_ID`;
- backend immutable audit + sanitized Discord audit.

Refund keeps its existing canonical backend preview/re-preview model.

## Implemented behavior

### Direct order

```text
/cm order reference:<CM-public-ref-or-order-UUID>
```

- authorizes before backend access;
- normalizes selector;
- resolves canonical order via `orders.details.read`;
- resolves canonical owner via `users.overview.read(user_id)`;
- requires target equality;
- opens normal private order panel;
- retains Refund, Fulfillment diagnostics, Refresh, User Operations and recent Order History.

### Aura adjustment

```text
Adjust Aura
-> signed integer delta + reason
-> fresh overview
-> current/change/projected preview
-> Confirm <= 5 minutes
-> fresh overview equality check
-> users.aura.adjust
-> target/delta result validation
-> backend + Discord audit
-> overview refresh
```

### Wallet adjustment

Same model, with exact decimal-to-integer-cents parsing and wallet-specific bounds/accounting.

### Manual fulfillment

Not implemented. Existing control remains blocked/informational because only `orders.fulfillment.read` exists.

## API/source boundary

Feature-branch bot client operations:

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

Explicitly absent:

```text
purchase-intents.process
manual-fulfillment execute
Supabase/Postgres direct calls
internal integration DB primitives
```

## Test changes

Added/updated coverage for:

- `/cm` registration with `user` + `order` subcommands;
- direct public-ref order API request;
- canonical order-owner lookup;
- Aura adjustment API stable-body retry;
- wallet integer-cents API request;
- changed-balance confirmation abort;
- missing audit-channel fail-closed behavior before backend access;
- successful confirmed Aura execute + audit + refresh;
- architecture operation allowlist/forbidden-path scans.

## CI evidence

For feature-branch/PR commits, GitHub Actions `CI` runs are created, but the `verify` job completes as failure with no steps and no job log. Example behavior observed on current task commits:

```text
job: verify
status: completed
conclusion: failure
steps: []
logs_url: null
```

Therefore this is an infrastructure execution failure, not a test failure and not a test pass.

## Required completion gate

Run in a clean Node 22 checkout:

```text
npm ci
npm test
npm run typecheck
npm run build
git diff --check
git status --short --untracked-files=all
```

Then perform focused scans for:

- direct database/Supabase access;
- purchase processing;
- invented manual fulfillment;
- real secrets/HMAC material;
- legacy modification/import;
- authorization/audit regression.

Only after all applicable gates pass should the PR become ready and merge.

## Operational exclusions

No repository implementation action performed:

- bot deployment/restart;
- Discord command registration;
- production Aura adjustment;
- production wallet adjustment;
- production refund;
- production API smoke mutation;
- website repo write;
- API credential/env modification.
