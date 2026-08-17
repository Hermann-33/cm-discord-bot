# Current Architecture

Updated: 2026-08-17

## Production architecture

Production `master` remains the standalone Node.js/TypeScript Discord bot backed exclusively by the HMAC-authenticated Cheater's Market Internal Integrations API:

```text
Discord
  -> standalone CM Discord bot
  -> HMAC-authenticated HTTPS
  -> website-owned Internal Integrations API
  -> website business/data layer
  -> Supabase/Postgres and other backend dependencies
```

No bot code may regain direct Supabase/Postgres access. `legacy/` remains frozen.

Production command surfaces remain `cm aura` (customer message command) and `/refresh-leaderboard` (staff/admin guild slash command). ADR-0005 remains authoritative for customer/admin command-surface separation.

## TASK-CM-ADMIN-001 candidate architecture

Branch `task/cm-admin-console` adds a private admin-console candidate without changing production `master`.

### Interaction routing

`src/index.ts` constructs `CmAdminController` and gives it first chance to handle `/cm` chat-input interactions plus `cm:*` buttons/modals. Unhandled chat-input interactions continue to `/refresh-leaderboard`; customer `MessageCreate` handling for `cm aura` is unchanged.

The candidate command is:

```text
/cm user email:<exact CM email>
```

The slash reply is deferred with the ephemeral flag and edited into a Components V2 panel. Component/modal navigation edits the same private interaction response where applicable.

### Admin authorization boundary

`src/discord/adminAuthorization.ts` enforces, before any CM admin-console backend request:

1. interaction is in a guild;
2. exact configured `DISCORD_GUILD_ID`;
3. `BOT_ADMIN_COMMAND_CHANNEL_ID` is configured and matches;
4. `BOT_ADMIN_USER_IDS` is configured and explicitly contains the invoking Discord user ID.

All `/cm` command/button/modal interactions repeat this guard. Missing admin configuration fails closed. Roles are not a substitute for the explicit ID whitelist.

### Private session model

`CmSessionStore` holds short-lived in-memory navigation state:

- random UUID session ID;
- invoking operator Discord ID;
- current user overview;
- selected order;
- optional refund proposal;
- 15-minute inactivity TTL;
- maximum 100 sessions with oldest-session eviction.

Component custom IDs contain session/action/index identifiers only. They do not embed user email, backend user UUID, refund reason, balances or HMAC material. Session lookup also requires the current operator ID, preventing another whitelisted admin from taking over another operator's panel.

The in-memory session is UI/navigation state, not the sole authority for refund execution: refund confirmation performs a fresh backend preview immediately before execute.

## Candidate Internal API surface

The feature-branch client adds typed methods only for:

```text
aura.leaderboards.read
  POST /api/internal/integrations/v1/aura/leaderboards

aura.lookup.read
  POST /api/internal/integrations/v1/aura/lookup

users.overview.read
  POST /api/internal/integrations/v1/users/overview

orders.details.read
  POST /api/internal/integrations/v1/orders/details

orders.fulfillment.read
  POST /api/internal/integrations/v1/orders/fulfillment

orders.refund.preview
  POST /api/internal/integrations/v1/orders/refund/preview

orders.refund.execute
  POST /api/internal/integrations/v1/orders/refund/execute
```

No Aura-adjust, wallet-adjust, purchase-processing or manual-fulfillment execute path exists in the candidate bot source.

Exact user/order/refund schemas were verified read-only against website source commit `20f6cb52344bade858099febcec2d1c59312f2e5` rather than inferred from prose documentation.

### User and order navigation

`users.overview.read` is requested with `recentOrdersLimit: 10`. The website schema accepts only 1–10, so the UI pages the returned latest ten locally at five orders per page. There is no current Internal Integrations API operation that pages older orders for one user; the bot does not invent one.

Opening an order calls `orders.details.read` and rejects a target mismatch if the returned `userId` differs from the user held by the private session.

`orders.fulfillment.read` provides diagnostics only. Because the website exposes no manual-fulfillment mutation operation through this API, the visible `Manual Fulfillment` control is blocked/informational and makes no mutation request.

## Refund mutation architecture

Refund is the only mutation path in the candidate because the website already owns an explicit canonical preview/execute contract:

```text
whitelisted operator
  -> Refund button
  -> reason modal (8-1000 chars)
  -> orders.refund.preview
  -> private consequence panel
  -> explicit Confirm Refund
  -> confirmation TTL <= 5 minutes
  -> orders.refund.preview again
  -> exact canonical consequence comparison
  -> orders.refund.execute
  -> website transaction + immutable backend audit
  -> sanitized Discord audit message
```

The execute proposal freezes:

- target order ID;
- reason;
- canonical preview;
- stable operator audit context (`provider=discord`, invoking external user ID only);
- UUID idempotency key;
- expiry.

`src/api/client.ts` serializes the validated request body once outside the transport retry loop. A retry therefore reuses the exact mutation body and logical idempotency key while generating a fresh timestamp, nonce and HMAC signature per HTTP attempt.

Before execute, the bot requires `BOT_AUDIT_LOG_CHANNEL_ID`, reruns the backend refund preview and compares the full strict DTO to the stored preview. A changed preview aborts execution. Backend audit is authoritative; Discord audit failure is logged and shown without attempting to undo or duplicate the backend refund.

## Aura and wallet status

Read-only website source verification resolves the earlier selector-document discrepancy: `auraAdjustmentRequestSchema` and `walletAdjustmentRequestSchema` use `userLookupSelectorSchema`, which includes user ID, email and external identity.

Those execute operations remain absent from bot source because ADR-0004 still requires an accepted backend-authoritative preview/confirm or equivalent confirmation-state model for balance/Aura adjustment. Wallet remains later and stricter than Aura.

## Configuration surface added by candidate

```text
BOT_ADMIN_USER_IDS
BOT_ADMIN_COMMAND_CHANNEL_ID
BOT_AUDIT_LOG_CHANNEL_ID
```

They are optional at global startup so existing read-only production behavior can still load configuration, but `/cm` fails closed when the admin whitelist/channel is missing and refund execute additionally fails closed when the audit channel is missing.

No real IDs or secrets are committed.

## Verification architecture

The feature branch adds `.github/workflows/ci.yml` for Node 22:

```text
npm ci
npm test
npm run typecheck
npm run build
git diff --check
```

The first workflow run for feature commit `9f6417374e6564d02a76d0c589320793aa2c0c62` did not start a runner because GitHub reported an account billing/spending-limit problem. Zero workflow steps executed, so dependency-aware test/typecheck/build proof is still missing.

## Fragile boundaries

- HMAC canonicalization and exact-body retry semantics;
- backend client `allowedOperations`;
- strict mirrored DTOs/selectors;
- guild/channel/user whitelist authorization ordering;
- ephemeral/private Components V2 navigation;
- operator-bound session ownership and expiry;
- refund preview/re-preview/idempotency behavior;
- mention-safe audit output;
- customer/admin command separation;
- no direct DB access;
- Aura-before-wallet sequencing;
- no invented manual-fulfillment mutation.
