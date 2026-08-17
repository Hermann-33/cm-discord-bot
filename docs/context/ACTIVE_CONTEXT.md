# Active Context

Updated: 2026-08-17

## Production state

Production remains the v2 Internal Integrations API rebuild on `master`. The archived pre-rebuild bot remains frozen under `legacy/`.

Production still provides:

- customer message command `cm aura`;
- staff/admin slash command `/refresh-leaderboard`;
- persistent Components V2 Aura leaderboard;
- startup/bootstrap plus five-minute refresh scheduling;
- only the two Aura read operations in deployed bot source/credential documentation.

The production bot has no direct Supabase/Postgres client, credential, RPC fallback, or database mutation path.

## TASK-CM-ADMIN-001 feature branch

Branch `task/cm-admin-console` contains an implementation candidate for a private staff/admin console. It has **not** been merged, registered in Discord, deployed, or exercised against production.

### `/cm user email:<email>`

The command is a configured-guild slash command whose response is deferred as ephemeral and then rendered as a Components V2 panel. The panel is visible only through the invoking interaction and every command/button/modal interaction re-runs:

1. in-guild requirement;
2. exact `DISCORD_GUILD_ID`;
3. exact `BOT_ADMIN_COMMAND_CHANNEL_ID`;
4. explicit invoking Discord user ID in `BOT_ADMIN_USER_IDS`.

Missing admin configuration fails closed. Roles are not used as a replacement for the explicit user-ID whitelist.

The private user panel shows account state, wallet, Aura, counts and the most recent order. Controls include:

- `Adjust Aura` — present but intentionally blocked;
- `Adjust Wallet` — present but intentionally blocked;
- `Open Recent Order`;
- `Order History`.

### Order navigation

The implementation calls `users.overview.read` with `recentOrdersLimit: 10`. Website source verifies that the API accepts only 1–10 recent orders, so the bot paginates the returned set locally at five orders per page. If the user's total order count is greater than 10, the UI states that only the latest 10 are available. No bot or backend operation was invented to retrieve older history.

Opening an order re-fetches authoritative `orders.details.read` data and checks that the returned `userId` still matches the user session. The order panel exposes safe order/payment/fulfillment summary details and navigation to:

- fulfillment diagnostics;
- refund flow;
- refresh order;
- user operations;
- order history.

`orders.fulfillment.read` is diagnostics-only. The current Internal Integrations API has no manual-fulfillment mutation operation, so the `Manual Fulfillment` control is informational/blocked and performs no backend mutation.

### Refund mutation candidate

Refund is the only mutation path present in this feature branch because the backend has a canonical read-preview/execute pair:

- `orders.refund.preview`;
- `orders.refund.execute`.

The implemented flow is:

```text
whitelisted admin -> order -> Refund
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

Transport retries reuse the same serialized mutation body/idempotency key while generating fresh HMAC timestamp/nonce/signature for each HTTP attempt. Operator audit context is deliberately reduced to stable Discord provider + user ID so a username/display-name change cannot alter an idempotent replay body.

A configured `BOT_AUDIT_LOG_CHANNEL_ID` is required before refund execution. Discord audit posting is mention-safe; the backend audit remains authoritative if the Discord audit post subsequently fails.

## Typed API surface on the feature branch

The candidate API client contains only these paths:

- `aura.leaderboards.read`;
- `aura.lookup.read`;
- `users.overview.read`;
- `orders.details.read`;
- `orders.fulfillment.read`;
- `orders.refund.preview`;
- `orders.refund.execute`.

It deliberately contains no `users.aura.adjust`, `users.wallet.adjust`, purchase-processing, direct database or invented manual-fulfillment execute path.

Required backend allowlist additions before this feature can function are therefore:

```text
users.overview.read
orders.details.read
orders.fulfillment.read
orders.refund.preview
orders.refund.execute
```

Actual bot-client `allowedOperations` have not been changed or verified in this task. A 403 remains the correct behavior if the backend credential is not provisioned for one of these operations.

## Backend source verification correction

Read-only inspection of website source at commit `20f6cb52344bade858099febcec2d1c59312f2e5` verified exact DTOs used by this feature.

It also resolves the earlier documentation-only Aura/wallet selector discrepancy: website `auraAdjustmentRequestSchema` and `walletAdjustmentRequestSchema` both use `userLookupSelectorSchema`, which includes `user_id`, `email`, and `external_identity`. Source therefore overrides the older statement that external identity is lookup-only.

This does **not** authorize Aura/wallet implementation. ADR-0004 still requires an accepted backend-authoritative preview/confirm or equivalent confirmation model, which is not present for those direct adjustment execute operations. Aura remains first; wallet remains later/stricter.

## Verification state

A repository CI workflow now exists and attempts:

```text
npm ci
npm test
npm run typecheck
npm run build
git diff --check
```

The first feature-branch GitHub Actions run did not start any step because the GitHub account reported failed recent payments or a spending-limit problem. This is an infrastructure/billing failure, not passing or failing application evidence.

Additional local static checks completed:

- TypeScript syntax transpilation of the drafted changed `.ts` files: no syntax diagnostics;
- no secret-like values found in the drafted feature files;
- no direct Supabase/Postgres client or database mutation path added;
- no Aura/wallet/purchase-processing execute path added.

Fresh dependency-aware `npm test`, typecheck and build remain **unverified** until an executable runner is available.

## Do-not-touch boundaries

- production `master` until verification/review gates pass;
- website source except read-only contract verification;
- direct Supabase/Postgres access;
- customer `cm aura` command behavior/intents;
- `legacy/`;
- real secret values;
- Aura/wallet mutations before ADR-0004 is satisfied;
- manual fulfillment until a dedicated backend operation exists;
- Discord command registration/deployment/live mutation without explicit authorization.

## Exact next engineering gate

1. restore an executable CI/local dependency-aware runner and run test + typecheck + build + diff check;
2. fix any resulting code/type failures;
3. review the feature diff and documentation together;
4. only after approval, provision least-privilege bot API operations and admin channel/user/audit configuration;
5. register/deploy `/cm` only with explicit authorization;
6. perform read-only controlled verification first;
7. perform a refund test only with an explicitly authorized controlled order/account;
8. keep Aura/wallet/manual fulfillment blocked until their independent gates are satisfied.
