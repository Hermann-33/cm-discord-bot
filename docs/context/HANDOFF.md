# Latest Handoff

Updated: 2026-08-18

## Authority

- ADR-0005 — `cm aura` customer message command; admin/staff slash/components/modals.
- ADR-0006 — `/cm` exact configured guild + non-empty explicit `BOT_ADMIN_USER_IDS`; no `/cm` channel restriction.
- ADR-0007 — Aura/wallet five-minute fresh-state-bound confirmation + stable idempotency/audit.
- ADR-0008 — separate customer-facing Share to Chat renderer, no public admin controls, Discord identity/time/audit presentation policy.
- ADR-0009 — canonical CM account email is intentionally shared; all other ADR-0008 field/control exclusions remain.
- `BOT_AUDIT_LOG_CHANNEL_ID` required before refund/Aura/wallet execute.
- no direct Supabase/Postgres.
- manual fulfillment blocked until website owns a dedicated mutation.

## Mainline baseline at task start

```text
master
c5a38d80e89934431b74a4a078577cd9ef19694f
```

TASK-CM-ADMIN-005 customer-email sharing is already merged on this lineage.

## Current task

```text
TASK-CM-ADMIN-006
task/cm-admin-ui-declutter
PR #4
status: implementation verified; final documentation-head CI pending
```

Objective: remove unnecessary menu/order/statistical clutter without changing any business operation or security boundary.

## Implemented UI

### User Operations

Shows only:

- email;
- Active/BANNED;
- compact linked Discord identity;
- current wallet;
- available Aura + pending when non-zero;
- total order count;
- latest order;
- Adjust Aura / Adjust Wallet / Open Recent Order / Order History / Share to Chat.

Removed routine profile/login/update/lifetime/license/delivery statistics.

### Orders

Recent order entries retain reference, item, status, amount, meaningful quantity and date. The verbose API-limit note is replaced by a compact truncation indicator only when needed.

Direct Order keeps customer email, customer-facing item, status, amount, payment method, placed time, delivery progress and core controls. Internal user UUID, option IDs, payment provider, duplicate fulfillment sub-counts and redundant navigation are hidden.

### Delivery Details

The previous Fulfillment Diagnostics view is renamed `Delivery Details` and displays status/progress plus failure/manual-review/message only when present. Provider codes, record timestamps, linked-license top count and empty fields are removed.

The visible nonfunctional Manual Fulfillment button is removed. No manual-fulfillment mutation was added; the API remains diagnostics-only.

### Refund / Aura / Wallet

Preview/success panels retain decision/result information but hide internal target UUIDs, routine transaction/audit IDs and routine idempotency/audit-success flags. Exceptional replay or audit-post-failure warnings remain visible when applicable.

### Share to Chat

Public summaries are also compacted. ADR-0009 customer email remains present; no customer controls/custom IDs or additional internal fields are exposed.

## Unchanged boundaries

No change to:

- Internal Integrations API paths/signing/retry behavior;
- `/cm` authorization/session ownership;
- `/refresh-leaderboard` policy;
- refund preview/re-preview/execute;
- Aura/wallet confirmation/fresh-state/idempotency;
- Discord mutation audit authority;
- website/Supabase;
- environment variables;
- slash-command definition/registration;
- leaderboard logic;
- `legacy/`.

## Verification

Initial run `32155910678` failed only two newly written UI test assertions because the tests guessed JSON escaping incorrectly. No production defect was identified. The tests were corrected to inspect rendered component content directly.

Implementation-head run `32156144669` then passed on Node `22.23.2`:

```text
npm ci: PASS, 0 vulnerabilities
npm test: PASS — 131/131
npm run typecheck: PASS
npm run build: PASS
git diff --check: PASS
```

## Exact next action

1. let the completed documentation head run through GitHub Actions;
2. if green, update PR #4 with final evidence and mark ready;
3. squash-merge PR #4 under the existing product authorization;
4. verify new `master` ref;
5. normal Northflank redeploy/restart is sufficient; no `npm run register:commands` is required solely for TASK-CM-ADMIN-006.
