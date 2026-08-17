# Latest Handoff

Updated: 2026-08-17

## Authoritative command/security policy

- ADR-0005 keeps `cm aura` as the customer message command and admin/staff operations as configured-guild slash commands.
- ADR-0006 supersedes the admin-command-channel requirement from ADR-0004/ADR-0005 for the shared `/cm` admin console.
- `/cm` authorization is configured guild + explicit `BOT_ADMIN_USER_IDS`; DMs/wrong guild/non-whitelisted users fail closed.
- A whitelisted admin may invoke `/cm` from any channel in the configured guild.
- Ephemeral output is privacy, not authorization.
- `BOT_AUDIT_LOG_CHANNEL_ID` remains required before refund execute.
- No direct Supabase/Postgres access is permitted.

`/refresh-leaderboard` remains a separate operational command and keeps its existing configured command-channel/permission checks.

## Mainline state

`TASK-CM-ADMIN-001` is merged into `master` at:

```text
47a28323fdc2c2d18d1edc3f9952f0d817f481f1
```

Before merge it passed local dependency-aware verification:

- `npm test` — 104/104;
- `npm run typecheck`;
- `npm run build`;
- `git diff --check`.

It was not registered/deployed and did not perform a live API mutation/refund as part of that task.

## Current task branch

```text
task/cm-admin-guild-scope
```

TASK-CM-ADMIN-002 changes only the shared `/cm` location/config policy plus required tests/docs.

### Runtime/config change

- removes `BOT_ADMIN_COMMAND_CHANNEL_ID` from `src/config/env.ts` and `.env.example`;
- removes exact channel matching from `src/discord/adminAuthorization.ts`;
- preserves configured-guild restriction;
- preserves mandatory explicit `BOT_ADMIN_USER_IDS`;
- preserves per-interaction authorization for command/buttons/modals;
- preserves refund audit-channel requirement;
- does not change `/refresh-leaderboard`.

A stale external `BOT_ADMIN_COMMAND_CHANNEL_ID` variable is ignored by the config loader and should be removed from deployment environment later to avoid confusion.

### Tests changed

- admin authorization accepts the same whitelisted user from another channel in configured guild;
- wrong guild/DM/non-whitelisted/missing whitelist still fail closed;
- `/cm user` performs backend lookup from another configured-guild channel for a whitelisted admin;
- config no longer exposes `botAdminCommandChannelId`;
- architecture test prevents reintroduction of `BOT_ADMIN_COMMAND_CHANNEL_ID` into active source/environment example.

## `/cm` capability state

Tracked console remains:

- ephemeral/private Components V2 user operations panel;
- `users.overview.read`;
- latest ten orders paginated five per page;
- `orders.details.read`;
- `orders.fulfillment.read` diagnostics;
- order-to-user navigation;
- canonical refund preview/re-preview/confirm/execute;
- stable refund idempotency/retry behavior;
- backend immutable audit + sanitized Discord audit.

Deliberately blocked:

- Aura adjustment;
- wallet adjustment;
- manual fulfillment.

## Backend/API dependencies

Console deployment needs least-privilege bot-client permission for:

```text
users.overview.read
orders.details.read
orders.fulfillment.read
orders.refund.preview
orders.refund.execute
```

Endpoint existence is not client authorization. Deployment credentials/allowlists were not modified in this task.

## Verification state for TASK-CM-ADMIN-002

Connector-side source edits are implemented on the feature branch, but executable Node verification has not been run by this task.

Before merge run in a clean Node 22 checkout:

```text
npm ci
npm test
npm run typecheck
npm run build
git diff --check
git status --short --untracked-files=all
```

Also perform focused scans for direct DB access, forbidden Aura/wallet/purchase-processing execute paths, secrets, legacy changes and mention-safety regressions.

## Exact next action

1. fetch/switch to `task/cm-admin-guild-scope` in the local Codex checkout;
2. run the full verification gate above;
3. fix only task-related failures;
4. merge/push only if all checks pass and working tree is clean;
5. do not register/deploy/start the bot or call production APIs unless separately authorized;
6. when deployment config is later updated, remove `BOT_ADMIN_COMMAND_CHANNEL_ID`, retain `BOT_ADMIN_USER_IDS`, and configure `BOT_AUDIT_LOG_CHANNEL_ID` before refund use.

## Do-not-touch

- no direct DB client/RPC;
- no customer `cm aura` migration;
- no `/refresh-leaderboard` channel-policy change in this task;
- no role-only admin authorization;
- no Aura/wallet execute path until its independent confirmation gate is satisfied;
- no manual fulfillment without a website-owned operation;
- no real secrets in repo/docs/logs;
- no live refund without explicit controlled-test authorization.
