# TASK-CM-ADMIN-006 Audit — Admin UI Declutter

Date: 2026-08-18

Repository: `Hermann-33/cm-discord-bot`

Base at task start:

```text
master
c5a38d80e89934431b74a4a078577cd9ef19694f
```

Feature branch / PR:

```text
task/cm-admin-ui-declutter
PR #4 — TASK-CM-ADMIN-006: declutter admin and order panels
```

## Verdict

`COMPLETE` for implementation, documentation and executable verification. Merge remains conditioned on the GitHub Actions check being green on the current PR head.

## Objective

Reduce unnecessary visual/statistical bloat across the `/cm` private admin console and Share to Chat copies without changing business behavior, authorization, API contracts or mutation safety.

## Private panel changes

### User Operations

Retained:

- canonical customer email;
- account status;
- compact linked Discord identity;
- current wallet balance;
- available Aura and pending Aura when non-zero;
- total order count;
- latest order;
- Adjust Aura / Adjust Wallet / Open Recent Order / Order History / Share to Chat.

Removed from routine display:

- account-created and last-sign-in timestamps;
- Discord username/display-name/link-time details;
- wallet/Aura update timestamps;
- lifetime Aura earned/redeemed;
- license and account-delivery counts.

### Recent Orders

Kept reference, item, status, amount, meaningful quantity, date and navigation. Replaced the verbose API-limit explanation with a compact `Latest N of total` indicator only when the API result is truncated.

### Order Operations

Retained customer email, order status, customer-facing item information, amount, payment method, placed time, delivery progress, Refund, Delivery Details, Refresh Order, User Operations and Share to Chat.

Removed:

- internal CM user UUID;
- internal license-option / variant fallback identifiers;
- purchase type label when redundant with item presentation;
- payment provider;
- license/account/product delivery sub-counts;
- routine `Manual required: No` line;
- duplicate Order History button.

### Delivery Details

Renamed from `Fulfillment Diagnostics` to `Delivery Details` and reduced each record to status, delivered quantity, account delivery kind when relevant, failure only when present, manual-review time only when present and customer message only when present.

Removed provider code, linked-license top count, created/updated timestamps, redundant User Operations navigation and the visible nonfunctional Manual Fulfillment button. Manual fulfillment remains unsupported and no mutation route was added.

### Refund / Aura / Wallet panels

Refund preview retains refund amount, wallet credit, Aura recovered, non-zero unrecoverable Aura and reason. Internal refund-calculation breakdown fields were removed from routine UI.

Success panels retain action result, new balance/credit and completion time. Transaction IDs, backend audit IDs, routine `Idempotent replay: No`, routine `Discord audit: Posted`, internal target UUIDs and redundant Order History buttons were removed. Exceptional replay/audit-post-failure warnings still appear when applicable.

Adjustment preview keeps current/change/projected balances and reason, but removes the internal target UUID and compresses the stale-state explanation. The underlying fresh-state confirmation behavior is unchanged.

## Share to Chat changes

Public shares were independently simplified while retaining ADR-0008/ADR-0009 boundaries:

- canonical customer email remains present;
- linked Discord identity remains present;
- current account/wallet/Aura/order/delivery/refund/adjustment information remains available where useful;
- account/login/update/lifetime/activity statistics and redundant payment/manual-required detail were removed;
- no public controls/custom IDs were added;
- internal CM UUIDs, option IDs, provider/failure internals, admin reasons and backend bookkeeping remain excluded.

## Security / architecture impact

None to the trust boundary.

Unchanged:

- ADR-0006 exact-guild + explicit-user authorization;
- operator-owned session enforcement;
- ADR-0007 Aura/wallet fresh-state confirmation and idempotency;
- canonical refund preview/re-preview/execute flow;
- HMAC API client/signing;
- bot API operation surface;
- website/Supabase ownership;
- environment variables;
- slash-command definition;
- leaderboard behavior;
- `legacy/` isolation;
- manual fulfillment prohibition.

## Verification

The first CI run (`32155910678`) exposed two mistakes only in newly added presentation test assertions; production behavior tests were otherwise green. The assertions were corrected to inspect rendered component content rather than guessing JSON-string escaping.

Implementation-head GitHub Actions run `32156144669` passed on Node `22.23.2`:

```text
npm ci: PASS — 0 vulnerabilities
npm test: PASS — 131/131
npm run typecheck: PASS
npm run build: PASS
git diff --check: PASS
```

After repository context/audit/readme updates, documentation-head run `32156801285` also passed on Node `22.23.2` with the same complete gate:

```text
npm ci: PASS — 0 vulnerabilities
npm test: PASS — 131/131
npm run typecheck: PASS
npm run build: PASS
git diff --check: PASS
```

The passing suite includes authorization, API/signing, mutation, Share to Chat disclosure, registration, architecture/no-direct-DB and legacy-isolation tests in addition to the compact-panel assertions.

## Rollout

No slash-command definition changed. After merge, normal bot redeploy/restart is sufficient; `npm run register:commands` is not required solely for TASK-CM-ADMIN-006.
