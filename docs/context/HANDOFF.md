# Latest Handoff

Updated: 2026-08-18

## Authority

- ADR-0005 — `cm aura` customer message command; admin/staff slash/components/modals.
- ADR-0006 — `/cm` exact configured guild + non-empty explicit `BOT_ADMIN_USER_IDS`; no `/cm` channel restriction.
- ADR-0007 — Aura/wallet five-minute fresh-state-bound confirmation + stable idempotency/audit.
- ADR-0008 — separate customer-facing Share to Chat renderer, no public admin controls, Discord identity/time/audit presentation policy.
- ADR-0009 — supersedes ADR-0008 only for the previous full-email prohibition; the canonical CM account email is intentionally shared.
- `BOT_AUDIT_LOG_CHANNEL_ID` required before refund/Aura/wallet execute.
- no direct Supabase/Postgres.
- manual fulfillment blocked until website owns a dedicated mutation.

## Mainline baseline

```text
master
7a41dbeefae167044091b0aaed8372c3b58acdd0
```

This is the verified/merged TASK-CM-ADMIN-004 result: Share to Chat, Discord-user lookup/link presentation, Discord timestamps and concise audit panels are on mainline.

## Current task

```text
TASK-CM-ADMIN-005
task/cm-share-email
PR #3
```

Requested scope:

- include the customer account email when Share to Chat publishes an order/account/support summary;
- keep the public copy read-only and buttonless;
- retain all other internal-field exclusions and security boundaries;
- run GitHub Actions and directly merge only if clean.

## Implemented behavior

`src/commands/cmShare.ts` uses one customer identity block for shareable User/Orders/Order/Fulfillment/Refund/Aura/Wallet views:

```text
Email: <canonical account email>
Discord: <linked user or Not linked>
```

The email source is `session.overview.identity.email`; rendering uses `escapeDiscordText(..., 320)`.

Still excluded:

- internal CM user UUID;
- internal purchase option IDs;
- internal provider/failure codes;
- admin mutation/refund reasons;
- backend audit/transaction/idempotency IDs;
- credentials/HMAC material;
- private session/custom IDs;
- customer-operable buttons/selects/modals.

Share execution still re-runs `/cm` authorization and requires the original operator-owned session. `safeAllowedMentions` remains applied.

## Tests

`tests/commands/cmShare.test.ts` now requires the escaped customer email in user, recent-orders, direct-order and refund-preview shares while preserving internal-field/control exclusions.

## Unchanged boundaries

No change to:

- Internal Integrations API paths/signing;
- `/cm` authorization;
- `/refresh-leaderboard` policy;
- refund/Aura/wallet mutation logic;
- manual fulfillment;
- website/Supabase;
- environment variables;
- slash-command definition/registration.

## Exact next action

1. obtain a successful GitHub Actions run for the complete TASK-CM-ADMIN-005 branch;
2. update final audit/roadmap evidence to COMPLETE if the gate passes;
3. merge PR #3 directly under the existing product authorization;
4. deploy/restart the new `master` normally;
5. no `npm run register:commands` is required solely for this change because no slash-command definition changed.
