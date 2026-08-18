# Active Context

Updated: 2026-08-18

## Mainline baseline

TASK-CM-ADMIN-005 was verified and merged into `master`; the task-start baseline for the current work is:

```text
c5a38d80e89934431b74a4a078577cd9ef19694f
```

Current mainline behavior includes customer `cm aura`, `/refresh-leaderboard`, private `/cm user` by email/Discord user, direct `/cm order`, order/delivery navigation, canonical refund, confirmed Aura/wallet adjustment, Share to Chat, Discord timestamps and concise Components V2 mutation audit.

The bot remains a standalone Node.js/TypeScript process with no direct Supabase/Postgres client, credential, RPC fallback or database mutation path.

## Current task — TASK-CM-ADMIN-006

Feature branch / PR:

```text
task/cm-admin-ui-declutter
PR #4 — TASK-CM-ADMIN-006: declutter admin and order panels
```

Objective: remove routine UI/statistical noise while preserving all operational controls and security/business behavior.

### User Operations

The private user home now prioritizes:

- canonical email;
- Active/BANNED state;
- compact linked Discord identity;
- current wallet;
- available Aura plus pending Aura only when non-zero;
- order count;
- latest order;
- Adjust Aura / Adjust Wallet / Open Recent Order / Order History / Share to Chat.

Routine account/login timestamps, verbose Discord profile metadata, wallet/Aura update timestamps, lifetime Aura totals and license/account-delivery counters are no longer displayed there.

### Orders and delivery

Recent Orders keeps reference, item, status, amount, meaningful quantity and date. If the overview is truncated, the UI uses a compact `Latest N of total` indicator instead of API-implementation prose.

Order Operations keeps customer email, order status, customer-facing item information, amount, payment method, placed time, delivered/required quantity, exceptional manual-review state, Refund, Delivery Details, Refresh Order, User Operations and Share to Chat.

It no longer routinely displays internal user UUID, option IDs, payment provider, redundant delivery sub-counts, purchase-type labels or a duplicate Order History button.

The previous `Fulfillment Diagnostics` panel is now `Delivery Details`. Provider codes, created/updated timestamps, linked-license top count and empty diagnostic fields are removed. Failure/manual-review/message lines appear only when meaningful. The visible nonfunctional Manual Fulfillment button is removed; no manual-fulfillment mutation exists.

### Refund / adjustments

Preview panels retain decision-relevant values and reason. Success panels retain result and completion time while hiding routine transaction/audit/idempotency bookkeeping. Exceptional idempotent-replay or Discord-audit-post-failure warnings remain visible when they actually occur.

The underlying refund/Aura/wallet mutation flows are unchanged.

## Share to Chat disclosure policy

ADR-0008 + ADR-0009 remain authoritative. The shared message is still a separately rendered, buttonless Components V2 message.

Customer email remains intentionally included. Shared views are also decluttered to customer-relevant current state and outcomes; routine login/update/lifetime/activity statistics are removed.

Still prohibited from public share:

- internal CM user UUID;
- internal purchase option IDs;
- backend audit/transaction/idempotency identifiers;
- internal provider/failure codes;
- admin refund/adjustment reasons;
- session/custom IDs or interactive controls;
- HMAC/API/credential material.

`safeAllowedMentions` remains applied.

## Authorization / mutation invariants

ADR-0006 remains authoritative for `/cm`: exact configured guild, non-empty explicit `BOT_ADMIN_USER_IDS`, invoking user allowlisted, per-interaction reauthorization and operator-owned sessions. `/refresh-leaderboard` retains its separate channel/permission policy.

Aura/wallet retain ADR-0007 fresh-overview -> private confirmation -> fresh relevant-balance equality -> website execute -> audit. Refund retains canonical preview -> confirmation -> fresh exact re-preview -> execute.

Manual fulfillment remains unsupported. No API, website, Supabase, environment, command-registration or legacy boundary changed.

## Bot API surface

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

## Verification

Implementation-head GitHub Actions run `32156144669` passed on Node `22.23.2` with 131/131 tests, typecheck, build and diff check. The first CI attempt had caught two faulty new test assertions only; those assertions were corrected.

After README/context/audit updates, documentation-head run `32156801285` also passed the full Node 22 gate:

```text
npm ci: PASS, 0 vulnerabilities
npm test: PASS — 131/131
npm run typecheck: PASS
npm run build: PASS
git diff --check: PASS
```

TASK-CM-ADMIN-006 is `COMPLETE` for implementation/documentation verification. PR #4 may merge once the GitHub Actions check is green on its current head.

No slash-command definition changed, so TASK-CM-ADMIN-006 does not require `npm run register:commands` solely for this change.
