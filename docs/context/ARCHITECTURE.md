# Current Architecture

Updated: 2026-08-17

## Repository/mainline architecture

`master` is a standalone Node.js/TypeScript Discord bot backed exclusively by the HMAC-authenticated Cheater's Market Internal Integrations API:

```text
Discord
  -> standalone CM Discord bot
  -> HMAC-authenticated HTTPS
  -> website-owned Internal Integrations API
  -> website business/data layer
  -> Supabase/Postgres and other backend dependencies
```

No active bot code may regain direct Supabase/Postgres access. `legacy/` remains frozen.

Current tracked command surfaces are:

- customer message command `cm aura`;
- staff/admin guild slash command `/refresh-leaderboard`;
- private admin guild slash command `/cm user email:<email>` plus its Components V2 buttons/modals.

ADR-0005 governs the customer/admin interface split. ADR-0006 governs the shared `/cm` guild-wide channel authorization policy and supersedes the admin-command-channel requirement inherited from ADR-0004/ADR-0005.

`TASK-CM-ADMIN-001` is merged into `master` at `47a28323fdc2c2d18d1edc3f9952f0d817f481f1`. It was repository-verified before merge but was not registered/deployed or exercised through a live production mutation as part of that task.

## Interaction routing

`src/index.ts` constructs `CmAdminController` and gives it first chance to handle `/cm` chat-input interactions plus `cm:*` buttons/modals. Unhandled chat-input interactions continue to `/refresh-leaderboard`; customer `MessageCreate` handling for `cm aura` is unchanged.

The admin command is:

```text
/cm user email:<exact CM email>
```

The slash reply is deferred with the ephemeral flag and edited into a Components V2 panel. Component/modal navigation edits or follows up on the same private interaction context where applicable.

## Admin authorization boundary

### Mainline before TASK-CM-ADMIN-002

The merged TASK-CM-ADMIN-001 implementation uses configured guild + configured admin command channel + explicit `BOT_ADMIN_USER_IDS`.

### TASK-CM-ADMIN-002 target architecture

ADR-0006 intentionally removes the channel as an authorization factor for `/cm`.

`src/discord/adminAuthorization.ts` on `task/cm-admin-guild-scope` enforces, before any CM admin-console backend request:

1. interaction is in a guild;
2. guild exactly equals configured `DISCORD_GUILD_ID`;
3. `BOT_ADMIN_USER_IDS` is configured/non-empty;
4. invoking Discord user ID is explicitly present in `BOT_ADMIN_USER_IDS`.

The interaction channel is not checked. Therefore a whitelisted admin may use `/cm` from any channel in the configured guild.

Every `/cm` command/button/modal interaction repeats this guard. Roles are not a substitute for the explicit ID whitelist. Ephemeral output is a confidentiality control, not an authorization substitute.

`/refresh-leaderboard` is separate and retains its own exact command-channel plus Discord permission checks.

## Private session model

`CmSessionStore` holds short-lived in-memory navigation state:

- random UUID session ID;
- invoking operator Discord ID;
- current user overview;
- selected order;
- optional refund proposal;
- 15-minute inactivity TTL;
- maximum 100 sessions with oldest-session eviction.

Component custom IDs contain session/action/index identifiers only. They do not embed user email, backend user UUID, refund reason, balances or HMAC material. Session lookup also requires the current operator ID, preventing another whitelisted admin from taking over another operator's panel.

The in-memory session is UI/navigation state, not sole mutation authority: refund confirmation performs a fresh backend preview immediately before execute.

## Internal API surface

Current bot client implements only:

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

No Aura-adjust, wallet-adjust, purchase-processing or manual-fulfillment execute path exists in active source.

Exact user/order/refund schemas were verified read-only against website source commit `20f6cb52344bade858099febcec2d1c59312f2e5` before TASK-CM-ADMIN-001 implementation.

## User and order navigation

`users.overview.read` is requested with `recentOrdersLimit: 10`. The website schema accepts only 1–10, so the UI pages the returned latest ten locally at five orders per page. There is no current Internal Integrations API operation that pages older orders for one user; the bot does not invent one.

Opening an order calls `orders.details.read` and rejects a target mismatch if returned `userId` differs from the private-session user.

`orders.fulfillment.read` provides diagnostics only. Because the website exposes no manual-fulfillment mutation operation through this API, the visible Manual Fulfillment control is blocked/informational and makes no mutation request.

## Refund mutation architecture

Refund is the only mutation path because the website owns an explicit canonical preview/execute contract:

```text
whitelisted operator in configured guild
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

Before execute, the bot requires `BOT_AUDIT_LOG_CHANNEL_ID`, reruns the backend refund preview and compares the full strict DTO to the stored preview. A changed preview aborts execution. Backend audit is authoritative; Discord audit failure is logged/shown without attempting to undo or duplicate the backend refund.

## Aura and wallet status

Read-only website source verification resolved the earlier selector-document discrepancy: Aura/wallet adjustment request schemas use `userLookupSelectorSchema`, including user ID, email and external identity.

Those execute operations remain absent from bot source because the accepted confirmation/state-binding model is not yet satisfied by the direct execute-only adjustment endpoints. Wallet remains later and stricter than Aura.

## Configuration surface

After TASK-CM-ADMIN-002, admin-specific configuration is:

```text
BOT_ADMIN_USER_IDS
BOT_AUDIT_LOG_CHANNEL_ID
```

`BOT_ADMIN_USER_IDS` may remain absent at global startup so non-admin read behavior can load, but `/cm` fails closed when the whitelist is empty. `BOT_AUDIT_LOG_CHANNEL_ID` is separately required before refund execution.

`BOT_ADMIN_COMMAND_CHANNEL_ID` is removed. A stale external environment variable with that name is ignored and should be removed from deployment configuration to avoid false assumptions.

No real IDs or secrets are committed.

## Verification architecture

`.github/workflows/ci.yml` defines Node 22 verification:

```text
npm ci
npm test
npm run typecheck
npm run build
git diff --check
```

TASK-CM-ADMIN-001 was locally verified before merge because GitHub-hosted Actions could not start due account billing/spending-limit state.

TASK-CM-ADMIN-002 must repeat dependency-aware test/typecheck/build/diff verification before merge. The repository connector implementation step does not itself substitute for executable verification.

## Fragile boundaries

- HMAC canonicalization and exact-body retry semantics;
- backend client `allowedOperations`;
- strict mirrored DTOs/selectors;
- configured-guild + explicit-user whitelist authorization ordering;
- ephemeral/private Components V2 navigation;
- operator-bound session ownership and expiry;
- refund preview/re-preview/idempotency behavior;
- mention-safe audit output;
- customer/admin command separation;
- `/refresh-leaderboard` channel policy remaining independent;
- no direct DB access;
- Aura-before-wallet sequencing;
- no invented manual-fulfillment mutation.
