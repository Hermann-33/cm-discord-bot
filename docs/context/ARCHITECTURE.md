# Current Architecture

Updated: 2026-08-18

## System boundary

```text
Discord
  -> standalone CM Discord bot
  -> HMAC-authenticated HTTPS
  -> Cheater's Market website Internal Integrations API
  -> website business/data layer
  -> Supabase/Postgres and other backend dependencies
```

The bot has no direct database client, service-role key, RPC/table fallback or DB mutation path. `legacy/` remains frozen/excluded.

## Command surfaces

- customer message command `cm aura`;
- operational `/refresh-leaderboard`;
- private `/cm user` by email or linked Discord user;
- private `/cm order` by public ref or order UUID;
- private `/cm` navigation/refund/Aura/wallet controls;
- authorized Share to Chat buttons that publish separate customer-facing read-only summaries.

ADR-0005 governs customer/admin presentation, ADR-0006 `/cm` authorization, ADR-0007 Aura/wallet mutation confirmation, ADR-0008 the separate public-sharing/control boundary, and ADR-0009 the explicit customer-email disclosure exception.

## Interaction routing

`src/index.ts` constructs one `CmAdminController` handling `/cm` slash commands plus `cm:*` buttons/modals before unhandled chat-input interactions proceed to `/refresh-leaderboard`. `cm aura` remains on `MessageCreate`.

Manual guild registration publishes only two top-level slash commands:

```text
/refresh-leaderboard
/cm
```

`user` and `order` are `/cm` subcommands.

## `/cm` authorization/session boundary

Every `/cm` slash/button/modal interaction requires exact configured guild + non-empty explicit `BOT_ADMIN_USER_IDS` + invoking user in the allowlist. Components/modals additionally require the short-lived session to belong to the same operator.

There is no `/cm` command-channel restriction. `/refresh-leaderboard` retains its separate command-channel/permission checks.

`CmSessionStore` holds bounded in-memory UI state:

- random session UUID;
- operator Discord ID;
- current user overview;
- optional selected order;
- refund proposal;
- Aura/wallet proposal;
- current customer-share view;
- 15-minute inactivity TTL;
- max 100 sessions.

Component custom IDs contain routing/session/index tokens only. They do not carry email, balances, reasons, target UUIDs or credentials.

## User lookup and Discord identity

`/cm user` requires exactly one of email or selected Discord user.

Discord lookup maps to the existing website selector:

```text
external_identity
provider=discord
externalUserId=<Discord user ID>
```

through `users.overview.read`. User overview already returns linked external identities; no new website route or API operation is required.

## Customer-safe sharing

Private admin panels and channel-visible customer summaries are intentionally separate renderers.

```text
private /cm panel
  -> authorized Share to Chat click
  -> session-owned current share view
  -> dedicated customer-safe renderer
  -> current text-capable guild channel
  -> Components V2 display-only message
```

The shared renderer contains no action components/custom IDs. Under ADR-0009 it intentionally includes the canonical customer account email from `session.overview.identity.email`, plus linked Discord identity when available. The email is escaped for Discord presentation.

It continues to omit operator/internal fields such as CM user UUID, internal purchase option IDs, provider/failure codes, admin reasons, audit/transaction/idempotency IDs and credentials. `safeAllowedMentions` prevents identity text from generating notifications.

Sharing is a Discord presentation action only; it does not call a mutation endpoint.

## Presentation helpers

`src/discord/presentation.ts` centralizes Discord-safe text, linked Discord identity rendering and timestamps.

Admin/share/audit date-times use:

```text
<t:unix:f> · <t:unix:R>
```

for viewer-local absolute date/time and relative age.

## Discord audit architecture

`src/discord/adminAudit.ts` renders concise Components V2 refund/Aura/wallet audit summaries. Visible audit content is limited to actionable customer identity, result/change, reason, operator, completion time and replay warning when applicable.

Website immutable audit remains authoritative. Mutation execution still fails closed before backend access when `BOT_AUDIT_LOG_CHANNEL_ID` is missing. Failure to post Discord audit after successful backend mutation is reported without replaying/undoing the business mutation.

## Bot Internal Integrations API surface

Unchanged by TASK-CM-ADMIN-005:

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

users.aura.adjust
  POST /api/internal/integrations/v1/users/aura/adjust

users.wallet.adjust
  POST /api/internal/integrations/v1/users/wallet/adjust
```

No purchase processing, manual-fulfillment mutation or direct DB path exists in active source. Website per-client `allowedOperations` remains independent runtime authorization.

## Order/refund/mutation invariants

Direct order lookup resolves canonical `orders.details.read`, then canonical owner through `users.overview.read(user_id)` and requires equality before creating a session.

Refund remains:

```text
reason
 -> canonical preview
 -> explicit confirmation <= 5m
 -> fresh exact preview equality
 -> execute frozen body/idempotency
 -> backend audit + Discord audit
```

Aura/wallet remain ADR-0007 state-bound flows:

```text
signed delta + reason
 -> fresh overview
 -> current/change/projected confirmation
 -> Confirm <= 5m
 -> fresh exact relevant-balance equality
 -> website adjustment execute
 -> backend audit + Discord audit
```

Manual fulfillment remains diagnostics-only/blocked.

## Configuration

```text
BOT_ADMIN_USER_IDS
BOT_AUDIT_LOG_CHANNEL_ID
```

TASK-CM-ADMIN-005 introduces no environment variable and does not change command registration. `BOT_ADMIN_COMMAND_CHANNEL_ID` remains unsupported.

## Verification architecture

Required executable gate:

```text
npm ci
npm test
npm run typecheck
npm run build
git diff --check
git status --short --untracked-files=all
```

GitHub Actions is the executable source of evidence for TASK-CM-ADMIN-005.

## Fragile boundaries

- HMAC canonicalization/exact-body retries;
- strict DTO mirrors and backend `allowedOperations`;
- authorization before sensitive access;
- operator-bound session ownership;
- customer-share renderer never inheriting private admin controls;
- ADR-0009 email disclosure limited to the canonical customer email and not generalized to other internal fields;
- safe mentions on public/audit output;
- refund fresh-preview equality;
- Aura/wallet fresh-balance equality + stable idempotency;
- audit-channel fail-closed prerequisite;
- no direct DB/purchase-processing/manual-fulfillment shortcuts;
- `/refresh-leaderboard` policy independence.
