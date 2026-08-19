# Active Context

Updated: 2026-08-19

## Mainline baseline

Current remote `master`:

```text
6cef7695a09c8761d395f5d530bc79b7532c9b9f
```

TASK-CM-ADMIN-006 was verified and squash-merged through PR #4. The previous context that described PR #4 as waiting for merge is stale.

Current production behavior includes:

- customer `cm aura` message command;
- `/refresh-leaderboard`;
- private `/cm user` by exact email or linked Discord user;
- direct `/cm order` by public reference or order UUID;
- compact user/order/delivery navigation;
- canonical refund preview/confirm/re-preview/execute;
- confirmed Aura adjustment;
- confirmed wallet adjustment;
- Share to Chat customer-safe copies;
- Discord timestamps;
- concise Components V2 mutation audit.

The bot remains a standalone Node.js/TypeScript process with no direct Supabase/Postgres client, credential, RPC fallback or database mutation path.

## Current private admin presentation

### User Operations

The private user home prioritizes:

- canonical email;
- Active/BANNED state;
- compact linked Discord identity;
- current wallet;
- available Aura plus pending Aura only when non-zero;
- order count;
- latest order;
- Adjust Aura / Adjust Wallet / Open Recent Order / Order History / Share to Chat.

Routine account/login timestamps, verbose Discord profile metadata, wallet/Aura update timestamps, lifetime Aura totals and license/account-delivery counters are intentionally omitted.

### Orders and delivery

Recent Orders keeps reference, item, status, amount, meaningful quantity and date. If the overview is truncated, the UI uses a compact `Latest N of total` indicator.

Order Operations keeps customer email, order status, customer-facing item information, amount, payment method, placed time, delivered/required quantity, exceptional manual-review state, Refund, Delivery Details, Refresh Order, User Operations and Share to Chat.

The `Delivery Details` view shows meaningful fulfillment status/progress/exception/message information while suppressing provider codes, record bookkeeping and empty fields. No manual-fulfillment mutation exists.

### Refund / adjustments

Preview panels retain decision-relevant values and reason. Success panels retain result and completion time while hiding routine transaction/audit/idempotency bookkeeping. Exceptional replay or Discord-audit-post-failure warnings remain visible when relevant.

The underlying refund/Aura/wallet mutation flows are unchanged.

## Share to Chat disclosure policy

ADR-0008 + ADR-0009 remain authoritative. Shared messages are separately rendered, buttonless Components V2 messages.

Customer email remains intentionally included. Still prohibited from public share:

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

Manual fulfillment remains unsupported. No API, website, Supabase, environment, command-registration or legacy boundary changed by TASK-CM-ADMIN-006.

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

## Parallel side project — CM Ticket Transcript Corpus

ADR-0010 and `SIDE_PROJECTS.md` establish a parallel, non-runtime workstream:

```text
Hermann-33/CM-Ticket-Transcripts
```

The repository is private and data-only. It exists to hold the historical Discord/Tickety support-ticket corpus for analysis.

Key boundary:

- main bot work continues independently;
- no executable exporter/scraper code belongs in the transcript repository;
- no production credentials belong in the transcript repository;
- the production bot does not import, read or depend on the corpus;
- extraction tooling runs outside the data repository and is separately scoped;
- any later runtime integration requires a separate architecture task.

Current transcript side-project phase:

```text
Phase 1 — corpus acquisition
Status: implementation starting
First gate: validate a small representative sample end-to-end before bulk export
```

## Verification baseline

TASK-CM-ADMIN-006 final GitHub Actions verification passed on Node `22.23.2` with:

```text
npm ci: PASS, 0 vulnerabilities
npm test: PASS — 131/131
npm run typecheck: PASS
npm run build: PASS
git diff --check: PASS
```

No slash-command definition changed in TASK-CM-ADMIN-006, so that task required only normal redeploy/restart after merge, not command re-registration.
