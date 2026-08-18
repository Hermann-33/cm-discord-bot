# Active Context

Updated: 2026-08-18

## Mainline baseline before TASK-CM-ADMIN-004 merge

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

## Current task — TASK-CM-ADMIN-004 — VERIFIED FOR MERGE

Feature branch:

```text
task/cm-share-discord-audit-time
```

PR:

```text
#2 — TASK-CM-ADMIN-004: customer-safe sharing and Discord UX
```

Implemented scope:

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
- internal option identifiers;
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

Refund/Aura/wallet Discord audit output presents useful operational fields only:

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

The repository is now public, allowing the standard GitHub-hosted runner to execute. A real CI run first exposed a TypeScript narrowing issue in the new adjustment-success share renderer after the full test suite had passed. That defect was fixed narrowly.

Final executable gate:

```text
GitHub Actions run 32142352087
Node 22.23.2
npm ci: PASS, 0 vulnerabilities
npm test: PASS — 127/127
npm run typecheck: PASS
npm run build: PASS
git diff --check: PASS
```

Static review also confirms no direct DB/Supabase path, no new API operation, no manual-fulfillment/purchase-processing shortcut, no secret/HMAC material and no `legacy/` modification/import.

TASK-CM-ADMIN-004 is therefore **COMPLETE for implementation/verification and authorized for direct PR merge**.

## Exact next action

1. keep PR #2 documentation aligned with the successful executable gate;
2. direct-merge PR #2 under the existing product authorization;
3. deployment/restart and `npm run register:commands` remain separate operational steps after merge because `/cm user` registration changed;
4. no live refund/Aura/wallet mutation is part of repository verification.
