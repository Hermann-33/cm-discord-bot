# Active Context

Updated: 2026-08-17

## Mainline repository state

`master` contains the v2 Internal Integrations API bot plus `TASK-CM-ADMIN-001` at commit `47a28323fdc2c2d18d1edc3f9952f0d817f481f1`.

Current tracked implementation includes:

- customer message command `cm aura`;
- staff/admin slash command `/refresh-leaderboard`;
- persistent Components V2 Aura leaderboard;
- startup/bootstrap plus five-minute refresh scheduling;
- `/cm user email:<email>` private admin console;
- user overview and latest-ten order navigation;
- order detail and fulfillment diagnostics;
- canonical refund preview/confirm/execute flow with backend + Discord audit handling.

`TASK-CM-ADMIN-001` was locally verified before merge with `npm test` (104/104), typecheck, build and `git diff --check`, then fast-forwarded to `master`. It was **not** deployed, Discord commands were not registered, production environment values were not changed and no live API mutation/refund was performed as part of that task.

The bot still has no direct Supabase/Postgres client, credential, RPC fallback or database mutation path.

## TASK-CM-ADMIN-002 — guild-wide `/cm` authorization

Branch:

```text
task/cm-admin-guild-scope
```

implements the product decision captured by ADR-0006:

- `/cm` remains limited to the configured `DISCORD_GUILD_ID`;
- DMs and wrong guilds fail closed;
- explicit invoking Discord user ID in `BOT_ADMIN_USER_IDS` remains mandatory;
- roles do not replace the explicit user-ID whitelist;
- `/cm` may be used from **any channel inside the configured guild**;
- `BOT_ADMIN_COMMAND_CHANNEL_ID` is removed from the supported configuration surface;
- all `/cm` command/button/modal responses remain ephemeral/private where designed;
- `BOT_AUDIT_LOG_CHANNEL_ID` remains separate and is still required before refund execution.

Ephemeral visibility is not treated as authorization. Guild + explicit user whitelist are the authorization boundary; operation-specific confirmation, idempotency, backend permissions and audit requirements remain unchanged.

`/refresh-leaderboard` is not part of this change and retains its existing configured command-channel/permission checks.

## `/cm user email:<email>`

The command is a configured-guild slash command whose response is deferred as ephemeral and then rendered as a Components V2 panel.

On `TASK-CM-ADMIN-002`, every command/button/modal interaction re-runs:

1. in-guild requirement;
2. exact `DISCORD_GUILD_ID`;
3. non-empty explicit `BOT_ADMIN_USER_IDS`;
4. invoking Discord user ID membership in that whitelist.

Missing whitelist configuration fails closed.

The private user panel shows account state, wallet, Aura, counts and the most recent order. Controls include:

- `Adjust Aura` — present but intentionally blocked;
- `Adjust Wallet` — present but intentionally blocked;
- `Open Recent Order`;
- `Order History`.

## Order navigation

The bot calls `users.overview.read` with `recentOrdersLimit: 10`. Website source verifies that the API accepts only 1–10 recent orders, so the bot paginates the returned set locally at five orders per page. If total order count exceeds ten, the UI states that only the latest ten are available. No unsupported older-history operation is invented.

Opening an order re-fetches authoritative `orders.details.read` data and checks that the returned `userId` still matches the user session.

`orders.fulfillment.read` is diagnostics-only. The current Internal Integrations API has no manual-fulfillment mutation operation, so the visible Manual Fulfillment control remains blocked/informational.

## Refund mutation

Refund remains the only mutation path in `/cm` because the backend exposes a canonical pair:

- `orders.refund.preview`;
- `orders.refund.execute`.

Flow:

```text
whitelisted admin in configured guild
  -> order -> Refund
  -> reason modal
  -> backend refund preview
  -> private consequence preview
  -> explicit Confirm Refund
  -> five-minute confirmation TTL
  -> fresh backend re-preview
  -> exact consequence comparison
  -> execute using one stable UUID idempotency key/body
  -> backend immutable audit
  -> sanitized Discord audit channel record
```

Transport retries reuse the same serialized mutation body/idempotency key while generating fresh HMAC timestamp/nonce/signature for each HTTP attempt. Operator audit context remains stable Discord provider + user ID.

A configured `BOT_AUDIT_LOG_CHANNEL_ID` is required before refund execution. Discord audit posting is mention-safe; backend audit remains authoritative if Discord audit posting fails after successful execution.

## Typed API surface

Current API client contains only these approved paths:

- `aura.leaderboards.read`;
- `aura.lookup.read`;
- `users.overview.read`;
- `orders.details.read`;
- `orders.fulfillment.read`;
- `orders.refund.preview`;
- `orders.refund.execute`.

It contains no Aura-adjust, wallet-adjust, purchase-processing, direct-database or invented manual-fulfillment execute path.

The `/cm` flow requires backend client permission for:

```text
users.overview.read
orders.details.read
orders.fulfillment.read
orders.refund.preview
orders.refund.execute
```

Endpoint existence is not client authorization. Actual deployed bot-client scope must be provisioned separately before use.

## Aura/wallet status

Website source verification established that Aura/wallet adjustment schemas accept `userLookupSelectorSchema`, including `user_id`, email and external identity.

Aura/wallet execution remains blocked in the bot because the accepted confirmation/state-binding requirements are not yet satisfied by the direct execute-only adjustment contract. Aura remains first; wallet remains later/stricter.

## Current verification gate for TASK-CM-ADMIN-002

The branch has source/tests/docs changes but has not yet been dependency-aware verified or merged by this task.

Required before completion/merge:

```text
npm ci
npm test
npm run typecheck
npm run build
git diff --check
```

Also verify no direct DB path, forbidden adjustment/purchase-processing path, secret leakage, legacy modification or unsafe mention regression.

## Do-not-touch boundaries

- website source except separately authorized read-only contract verification;
- direct Supabase/Postgres access;
- customer `cm aura` behavior/intents;
- `/refresh-leaderboard` channel policy in this task;
- `legacy/`;
- real secret values;
- Aura/wallet mutations before their independent security gate;
- manual fulfillment until a dedicated backend operation exists;
- Discord command registration/deployment/live mutation without explicit authorization.

## Exact next engineering gate

1. run dependency-aware tests/typecheck/build/diff check on `task/cm-admin-guild-scope`;
2. review the authorization/config diff;
3. merge only if all gates pass;
4. remove stale `BOT_ADMIN_COMMAND_CHANNEL_ID` from deployment environment when operational configuration is next touched;
5. keep `BOT_ADMIN_USER_IDS` mandatory and configure `BOT_AUDIT_LOG_CHANNEL_ID` before refund execution;
6. registration/deployment and controlled live testing remain separate explicit actions.
