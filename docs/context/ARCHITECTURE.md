# Current Architecture

Updated: 2026-08-19

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
- private `/cm order` by public ref or order/purchase UUID;
- private `/cm` navigation/refund/Aura/wallet controls;
- authorized Share to Chat buttons that publish separate customer-facing read-only summaries.

ADR-0005 governs customer/admin presentation, ADR-0006 `/cm` authorization, ADR-0007 Aura/wallet mutation confirmation, ADR-0008/0009 public sharing and email disclosure, ADR-0010 the transcript side-project boundary and ADR-0011 pending-purchase/fulfillment-support behavior.

## Interaction routing

`src/index.ts` constructs one `CmAdminController` handling `/cm` slash commands plus `cm:*` buttons/modals before unhandled chat-input interactions proceed to `/refresh-leaderboard`. `cm aura` remains on `MessageCreate`.

Manual guild registration still publishes only:

```text
/refresh-leaderboard
/cm
```

`user` and `order` remain `/cm` subcommands. TASK-CM-ADMIN-007 does not change the registration JSON.

## `/cm` authorization/session boundary

Every `/cm` slash/button/modal interaction requires exact configured guild + non-empty explicit `BOT_ADMIN_USER_IDS` + invoking user in the allowlist. Components/modals additionally require the short-lived session to belong to the same operator.

There is no `/cm` command-channel restriction. `/refresh-leaderboard` retains its separate command-channel/permission checks.

`CmSessionStore` holds bounded in-memory UI state:

- random session UUID;
- operator Discord ID;
- current user overview;
- optional selected canonical order;
- optional selected pending purchase intent;
- refund proposal;
- Aura/wallet proposal;
- current customer-share view;
- 15-minute inactivity TTL;
- max 100 sessions.

Component custom IDs contain routing/session/index tokens only; no email, balances, reasons, target UUIDs or credentials.

## `/cm order` resolution architecture — ADR-0011

`/cm order` is one support entry point for both canonical orders and pending checkout state.

```text
input
 -> authorize
 -> normalize order/public selector
 -> orders.details.read
      -> success: canonical order path
      -> stable NOT_FOUND only:
           purchase-intents.lookup.read
             -> if orderId resolves: canonical order path
             -> otherwise: pending purchase path
```

Canonical order path:

```text
order
 -> users.overview.read(user_id)
 -> exact user equality
 -> optional fulfillment support enrichment
 -> operator session/order panel
```

Pending purchase path:

```text
purchase intent
 -> users.overview.read(user_id)
 -> exact user equality
 -> operator session/pending panel
 -> refresh purchase by exact purchase_intent_id
 -> transition to canonical order when available
```

The fallback is never used for authentication, authorization, validation, rate-limit, dependency or other service errors.

## Fulfillment support architecture

`orders.fulfillment.read` remains read-only. Its optional support object may contain:

- human-readable product/account type;
- finite product duration;
- bounded masked `license_key` / `account_token` values;
- canonical manual-required state.

`src/commands/cmOrderSupport.ts` treats automatic support enrichment as best-effort for the order panel. Failure to load it does not block a valid canonical order or existing refund/navigation controls.

Strict DTO validation rejects unexpected/raw secret fields. Missing support or an empty masked list is not interpreted as manual-required.

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

Shared output has no action custom IDs and always uses safe mentions. Canonical customer email is permitted by ADR-0009.

ADR-0011 adds a pending-purchase share view but keeps these fields private:

- purchase-intent UUID/user UUID/internal option IDs;
- provider/provider-status internals;
- masked fulfillment support material;
- admin reasons/audit/transaction/idempotency data;
- HMAC/API credentials.

Masked support material can be displayed only in the private authorized order/delivery UI.

## Discord audit architecture

`src/discord/adminAudit.ts` remains the concise Components V2 refund/Aura/wallet audit surface. Website immutable audit remains authoritative. Mutation execution still fails closed before backend access when `BOT_AUDIT_LOG_CHANNEL_ID` is missing.

TASK-CM-ADMIN-007 adds no mutation or audit type.

## Bot Internal Integrations API surface

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

purchase-intents.lookup.read
  POST /api/internal/integrations/v1/purchase-intents/lookup

orders.refund.preview
  POST /api/internal/integrations/v1/orders/refund/preview

orders.refund.execute
  POST /api/internal/integrations/v1/orders/refund/execute

users.aura.adjust
  POST /api/internal/integrations/v1/users/aura/adjust

users.wallet.adjust
  POST /api/internal/integrations/v1/users/wallet/adjust
```

No `purchase-intents.process`, manual-fulfillment mutation or direct DB path exists in active source. Website per-client `allowedOperations` remains independent runtime authorization.

## Mutation invariants

Pending purchase lookup does not create a mutation path. Refund remains canonical-order-only and keeps preview -> confirmation -> exact re-preview -> execute. Aura/wallet retain ADR-0007 current/change/projected confirmation and final fresh-balance equality.

## Configuration

No new bot environment variable is introduced by TASK-CM-ADMIN-007. Runtime website configuration must grant the bot client `purchase-intents.lookup.read` for pending fallback to work.

Because slash-command JSON is unchanged, command re-registration is not required for this task.

## Parallel non-runtime tooling

ADR-0010 remains unchanged: ticket transcript exporter code under `tools/` is non-production and the private `CM-Ticket-Transcripts` corpus is not a runtime dependency.

## Fragile boundaries

- HMAC canonicalization/exact-body retries;
- strict DTO mirrors and backend `allowedOperations`;
- authorization before sensitive access;
- `NOT_FOUND`-only purchase-intent fallback;
- exact owner equality for canonical and pending targets;
- operator-bound session ownership;
- optional fulfillment support never blocking canonical order controls;
- missing support never implying manual fulfillment;
- masked support material never entering public Share to Chat;
- customer-share renderer never inheriting private admin controls;
- refund fresh-preview equality;
- Aura/wallet fresh-balance equality + stable idempotency;
- audit-channel fail-closed prerequisite;
- no direct DB/purchase-processing/manual-fulfillment shortcuts;
- `/refresh-leaderboard` policy independence.
