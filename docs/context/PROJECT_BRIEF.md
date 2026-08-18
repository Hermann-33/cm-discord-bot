# Project Brief

Updated: 2026-08-18

## Product purpose

The Cheater's Market Discord bot is the Discord-facing companion to Cheater's Market. It publishes customer Aura information and gives a very small set of explicitly trusted staff private operational/admin controls without making Discord the owner of account, wallet, order, payment or fulfillment state.

## Target users

- Cheater's Market Discord community members who need read-only Aura information.
- Trusted staff who need private user/order diagnostics.
- Explicitly allowlisted administrators who need audited Aura, wallet and refund operations through narrow website-owned Internal Integrations API contracts.

## Product scope

The bot provides or is implementing:

- one persistent Components V2 Aura leaderboard;
- lifetime and available Aura top-10 boards;
- customer message command `cm aura`;
- staff operational slash command `/refresh-leaderboard`;
- five-minute leaderboard scheduling/bootstrap;
- private `/cm user email:<email>` admin console;
- private `/cm order reference:<CM-public-ref-or-order-UUID>` direct order lookup;
- user overview and bounded recent-order navigation;
- order detail and fulfillment diagnostics;
- canonical refund preview/confirm/execute;
- confirmed Aura adjustment through `users.aura.adjust`;
- confirmed wallet adjustment through `users.wallet.adjust`;
- structured sanitized logging, timeout/retry/response bounds and mention suppression.

`TASK-CM-ADMIN-003` is feature-branch work until verification/merge gates pass; do not describe unmerged source as production solely because it exists on the branch.

## Data/business boundary

The bot is never a database client.

It has no Supabase/Postgres credential, no direct table/RPC fallback and no right to reimplement website accounting/commerce logic.

The architecture is:

```text
Discord
  -> standalone bot
  -> HMAC Internal Integrations API
  -> website-owned business/data layer
```

The bot uses only explicitly implemented API operations. Website-side per-client `allowedOperations` remains an independent runtime permission boundary and secret deployment configuration is never stored here.

## Accepted product/security direction

- ADR-0005: customer self-service may remain message-based; admin/staff operations use slash/components/modals.
- ADR-0006: `/cm` is exact-guild + explicit `BOT_ADMIN_USER_IDS`, usable from any channel in the configured guild; DMs/wrong guilds fail closed.
- ADR-0007: Aura/wallet use an explicit five-minute, fresh-state-bound confirmation with stable backend idempotency and audit.
- refund retains the canonical backend preview/re-preview confirmation flow.
- wallet/Aura/order/refund mutations remain website-owned; Discord is only the authorized operator interface.

## Explicit non-goals

The bot must not become:

- a direct Supabase/Postgres admin client;
- a generic website admin backend;
- the source of truth for Aura, wallet, orders, payments, licenses, delivery, OAuth or Support-role state;
- a purchase-processing automation surface unless separately designed/approved;
- a manual-fulfillment engine without a dedicated website API operation;
- a role-only admin system;
- a secret-bearing diagnostic console.

## Manual fulfillment status

Out of scope for `TASK-CM-ADMIN-003` and technically blocked by backend contract: the current API exposes fulfillment diagnostics but no manual-fulfillment mutation. The bot must not invent a mutation or use purchase processing/direct DB access as a substitute.

## Current maturity

Production-adjacent and security-sensitive. The read-side, admin authorization and refund foundation are hardened. `TASK-CM-ADMIN-003` extends the private admin console with direct order entry plus Aura/wallet mutations using strict mirrored DTOs, fresh state checks, explicit confirmation, stable idempotency and audit. Executable verification and controlled operational rollout remain mandatory before completion.

## Success criteria

A successful bot remains:

- small and auditable;
- exact-guild scoped;
- explicitly allowlisted for high-impact controls;
- backend/API bounded;
- idempotent for mutations;
- fail-closed on stale confirmation state;
- audit-producing;
- resilient to transport failure;
- incapable of bypassing website-owned business/data controls.
