# Active Context

Updated: 2026-08-18

## Mainline state

`master` is at:

```text
5baa260bb1f804c6c0e9878f2cb5be003564a915
```

That mainline includes the private `/cm user` console, canonical refund flow, and ADR-0006 guild-wide `/cm` authorization. The deployed bot has subsequently been operationally configured by the product owner, but deployment/runtime state is external to this repository and is not inferred from source alone.

The bot remains a standalone Node.js/TypeScript process with no direct Supabase/Postgres client, credential, RPC fallback or database mutation path.

## Current implementation task — TASK-CM-ADMIN-003

Feature branch:

```text
task/cm-admin-controls-order
```

Draft PR:

```text
#1 — TASK-CM-ADMIN-003: balance controls and direct order lookup
```

Task scope explicitly approved by the product owner:

- enable Aura adjustment from the existing `/cm user` panel;
- enable wallet/balance adjustment from the existing `/cm user` panel;
- add direct `/cm order reference:<CM-public-ref-or-order-UUID>` lookup;
- direct order panels must retain refund, fulfillment diagnostics, refresh, user operations and recent-order navigation;
- do **not** implement manual fulfillment.

No website source mutation is part of this task. Website source is read-only contract evidence. No bot deployment, Discord command registration or live production mutation is performed by the repository implementation step.

## Shared `/cm` authorization

ADR-0006 remains authoritative:

1. interaction must be in a guild;
2. guild ID must exactly equal `DISCORD_GUILD_ID`;
3. `BOT_ADMIN_USER_IDS` must be non-empty;
4. invoking Discord user ID must be explicitly allowlisted;
5. every command/button/modal interaction re-runs authorization;
6. there is no `/cm` command-channel restriction.

Ephemeral/private output is confidentiality, not authorization. Roles do not replace the explicit user-ID whitelist.

`/refresh-leaderboard` remains separate and retains its configured command-channel and Discord permission checks.

## `/cm user email:<email>`

The existing private Components V2 panel continues to show:

- full privileged account email;
- active/banned state;
- wallet balance/currency;
- available/pending/lifetime Aura;
- counts;
- most recent order;
- latest-ten order navigation.

On `TASK-CM-ADMIN-003`, the existing Aura and wallet buttons become active controls instead of informational blockers.

## `/cm order reference:<...>`

New direct order entry point:

```text
/cm order reference:CM-...
```

or:

```text
/cm order reference:<order UUID>
```

Flow:

1. shared `/cm` authorization;
2. input normalized to documented `public_ref` or `order_id` selector;
3. `orders.details.read` resolves the canonical order;
4. `users.overview.read` resolves the canonical owner by returned `userId`;
5. owner/order IDs must match;
6. operator-bound private session opens directly on the normal order panel.

The order panel retains:

- Refund;
- Fulfillment diagnostics;
- Refresh Order;
- User Operations;
- recent Order History.

## Aura and wallet mutation model

ADR-0007 supersedes ADR-0004 only for the earlier requirement that Aura/wallet use a dedicated backend preview endpoint and for the old Aura-first/wallet-later rollout sequence.

Both controls use a private two-step state-bound confirmation:

```text
whitelisted admin
  -> adjustment modal (signed delta + reason)
  -> fresh users.overview.read
  -> private current / change / projected preview
  -> explicit Confirm within five minutes
  -> fresh users.overview.read
  -> require exact relevant balance equality
  -> execute website-owned users.aura.adjust or users.wallet.adjust
  -> validate target/delta result
  -> backend transaction + immutable audit
  -> sanitized Discord audit
  -> refresh user overview
```

Rules:

- Aura delta is a non-zero whole integer, max magnitude `1,000,000,000`;
- wallet input allows at most two decimal places and is converted exactly to cents, max magnitude `100,000,000` cents;
- projected negative balances are blocked locally and remain backend-rejected;
- one UUID idempotency key/request body is frozen per logical adjustment;
- transport retry gets fresh HMAC timestamp/nonce/signature;
- `BOT_AUDIT_LOG_CHANNEL_ID` is required before execute;
- backend audit is authoritative if Discord audit posting fails.

The bot never calls database functions directly and never overwrites a balance.

## Refund

Refund keeps its existing, stronger canonical backend preview model:

```text
orders.refund.preview -> explicit confirmation -> fresh exact re-preview -> orders.refund.execute
```

ADR-0007 does not change refund behavior.

## Manual fulfillment

Still deliberately blocked.

`orders.fulfillment.read` is diagnostics-only and the current website Internal Integrations API exposes no manual-fulfillment mutation operation. No purchase-processing or direct-DB shortcut is permitted.

## Typed bot API surface on TASK-CM-ADMIN-003

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

No `purchase-intents.process` client path is added.

Backend operation existence is separate from deployed credential authorization. The product owner has separately stated that the production bot client allowlist was expanded; the repository does not store or expose that secret configuration.

## Verification state

Source/tests/docs are being implemented on the feature branch. Completion still requires executable verification:

```text
npm ci
npm test
npm run typecheck
npm run build
git diff --check
git status --short --untracked-files=all
```

Also require focused scans for:

- direct DB/Supabase access;
- purchase-processing or invented manual-fulfillment paths;
- secret/HMAC material;
- `legacy/` modification/import;
- authorization/audit regression.

Do not mark the task `COMPLETE` or merge solely from connector-side source inspection if those executable gates have not passed.

## Exact next engineering gate

1. finish current source/docs review;
2. run/obtain the Node 22 verification gate for the feature branch;
3. fix only task-related failures;
4. review final diff and secret/boundary scans;
5. merge only after applicable gates pass;
6. deployment and guild command re-registration remain separate operational steps after merge.
