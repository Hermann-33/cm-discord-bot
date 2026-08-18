# Active Context

Updated: 2026-08-18

## Mainline

`master` is currently:

```text
4b10d74aa80d3fa5c5e5a27b82e4ccf109a880a8
```

That squash-merged `TASK-CM-ADMIN-003` and contains:

- customer `cm aura`;
- `/refresh-leaderboard`;
- private `/cm user`;
- direct `/cm order`;
- order/fulfillment navigation;
- canonical refund;
- confirmed Aura adjustment;
- confirmed wallet adjustment;
- ADR-0006 guild-wide `/cm` authorization;
- ADR-0007 balance-adjustment confirmation model.

The bot remains a standalone Node.js/TypeScript process with no direct Supabase/Postgres client, credential, RPC fallback or database mutation path.

## Current task — TASK-CM-ADMIN-004

Feature branch:

```text
task/cm-share-discord-audit-time
```

PR:

```text
#2 — TASK-CM-ADMIN-004: customer-safe sharing and Discord UX
```

Requested/implemented feature-branch scope:

- meaningful `/cm` panels gain **Share to Chat**;
- the public copy is independently rendered, customer-safe, Components V2 and contains no controls;
- `/cm user` supports exact email or selected Discord-user lookup;
- User Operations shows Discord link state/linked user;
- `/cm`, customer-safe share and Discord audit times use absolute + relative Discord timestamps;
- refund/Aura/wallet Discord audit messages are concise Components V2 operational summaries;
- no manual fulfillment, website write, Supabase path or new API operation.

## Shared `/cm` authorization

ADR-0006 remains authoritative:

1. guild interaction;
2. exact `DISCORD_GUILD_ID`;
3. non-empty `BOT_ADMIN_USER_IDS`;
4. invoking Discord user explicitly allowlisted;
5. every slash/button/modal reauthorizes;
6. operator-bound session required for components/modals;
7. no `/cm` command-channel restriction.

The Share to Chat button passes through this same authorization/session gate. Ephemeral output is confidentiality, not authorization.

`/refresh-leaderboard` remains separate and retains its configured command-channel + Discord permission checks.

## `/cm user` lookup

Exactly one of:

```text
email:<exact CM email>
discord_user:<selected Discord user>
```

Discord lookup reuses `users.overview.read` with `external_identity/provider=discord`. Current website source already supports this selector and returns linked external identities, so no website/API permission change is needed.

The private panel displays Linked/Not linked and the linked Discord user, username/display name where returned, and link time.

## Customer-safe sharing — ADR-0008

Normal User/Orders/Order/Fulfillment/Refund/Adjustment panels expose Share to Chat.

The public message is rendered by a dedicated customer-safe path and intentionally omits:

- full email;
- internal CM user UUID;
- backend audit/transaction/idempotency identifiers;
- internal provider/failure codes;
- admin refund/adjustment reasons;
- session/custom IDs or interactive controls.

It contains display components only and `safeAllowedMentions`. Sharing itself does not call a mutation API.

## Time presentation

User/menu/share/audit timestamps use:

```text
<t:unix:f> · <t:unix:R>
```

so Discord renders a locale-aware absolute date/time plus relative age.

## Discord audit presentation

Refund/Aura/wallet Discord audit output now presents useful operational fields only:

- customer account/Discord identity when available;
- action/result;
- reason;
- operator;
- completion time;
- replay note only on actual idempotent replay.

Website immutable audit remains authoritative. Mutation authorization, confirmation, idempotency and audit-channel prerequisites are unchanged.

## Mutation invariants retained

Aura/wallet retain ADR-0007:

```text
fresh overview
  -> private current/change/projected confirmation
  -> Confirm <= 5 minutes
  -> fresh relevant-balance equality
  -> website execute operation
  -> backend audit + Discord audit
```

Refund retains:

```text
orders.refund.preview
  -> explicit confirmation
  -> fresh exact re-preview
  -> orders.refund.execute
```

Manual fulfillment remains blocked/informational because the API still exposes diagnostics only.

## Bot API surface

Unchanged by TASK-CM-ADMIN-004:

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

## Verification state

Implementation + focused tests/docs are on the feature branch. GitHub Actions PR run `32138604602` failed before creating any workflow steps (`steps: null`, no logs), matching the existing Actions infrastructure/billing/spending-limit problem.

Therefore the task is **PARTIAL** until an executable Node 22+ environment actually passes:

```text
npm ci
npm test
npm run typecheck
npm run build
git diff --check
git status --short --untracked-files=all
```

The product owner requested no separate Codex/local run. Repository governance still forbids claiming COMPLETE or merging without an executable pass.

## Exact next gate

1. finish static diff/security/docs review;
2. obtain an executable verification pass;
3. merge PR #2 directly only if all applicable gates pass;
4. deployment/restart and `npm run register:commands` remain separate operational steps after merge;
5. no live refund/Aura/wallet mutation is part of repository verification.
