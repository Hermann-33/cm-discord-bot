# Project Brief

Updated: 2026-08-18

## Product purpose

The Cheater's Market Discord bot is the Discord-facing companion to Cheater's Market. It publishes customer Aura information and gives a small explicitly trusted staff set private operational/admin controls without making Discord the owner of account, wallet, order, payment or fulfillment state.

## Target users

- community members needing read-only Aura/self-service information;
- customers receiving staff-shared read-only support summaries;
- trusted staff needing private user/order diagnostics;
- explicitly allowlisted administrators performing audited Aura, wallet and refund operations through website-owned Internal Integrations API contracts.

## Product scope

Current mainline includes:

- persistent Components V2 Aura leaderboard;
- lifetime/available Aura top-10;
- customer `cm aura` message command;
- `/refresh-leaderboard`;
- private `/cm user` and `/cm order` admin console;
- user/order/fulfillment diagnostics;
- canonical refund;
- confirmed Aura adjustment;
- confirmed wallet adjustment;
- structured sanitized logging and bounded HMAC API transport.

TASK-CM-ADMIN-004 feature-branch scope adds:

- `/cm user` lookup by exact email or selected linked Discord user;
- linked Discord state/user in User Operations;
- explicit customer-safe Share to Chat copies from meaningful `/cm` panels;
- Discord absolute + relative time presentation;
- concise Components V2 mutation audit summaries.

TASK-CM-ADMIN-004 remains feature-branch work until executable verification and merge gates pass.

## Data/business boundary

```text
Discord
  -> standalone bot
  -> HMAC Internal Integrations API
  -> website-owned business/data layer
```

The bot is never a direct Supabase/Postgres client, does not carry a service-role/database credential and has no table/RPC fallback. Website-side per-client `allowedOperations` remains an independent runtime authorization boundary.

TASK-CM-ADMIN-004 adds no API operation and no website/database change; Discord identity lookup reuses the existing `users.overview.read` external-identity selector.

## Accepted product/security direction

- ADR-0005 — customer self-service may remain message-based; admin/staff operations use slash/components/modals.
- ADR-0006 — `/cm` is exact-guild + explicit `BOT_ADMIN_USER_IDS`, usable from any configured-guild channel; DMs/wrong guilds fail closed.
- ADR-0007 — Aura/wallet require explicit five-minute fresh-state-bound confirmation, stable idempotency and audit.
- ADR-0008 — admin sharing must create a separate customer-safe read-only rendering with no controls/private fields; timestamps/audit presentation follow the current Discord UX model.
- refund retains canonical backend preview/re-preview confirmation.
- website remains the mutation/accounting authority.

## Explicit non-goals

The bot must not become:

- a direct database admin client;
- a generic website admin backend;
- the source of truth for Aura/wallet/orders/payments/licenses/delivery/OAuth/Support-role state;
- a purchase-processing automation surface unless separately approved;
- a manual-fulfillment engine without a website-owned operation;
- a role-only admin system;
- a customer-visible admin-control surface;
- a secret-bearing diagnostic console.

## Customer-safe sharing boundary

Share to Chat is a deliberate disclosure action by an authorized admin, not a relaxation of authorization. Public summaries are separately rendered, display-only and field-filtered; they do not inherit the private admin component tree.

## Manual fulfillment

Still blocked by backend contract: `orders.fulfillment.read` is diagnostics-only and there is no manual-fulfillment mutation operation. Purchase processing/direct DB access are not substitutes.

## Current maturity

Production-adjacent and security-sensitive. TASK-CM-ADMIN-003 is merged into `master` at `4b10d74aa80d3fa5c5e5a27b82e4ccf109a880a8`. TASK-CM-ADMIN-004 implementation/tests/docs are on a feature branch; GitHub Actions currently fails before steps, so executable verification remains outstanding.

## Success criteria

A successful bot remains small/auditable, exact-guild scoped, explicitly allowlisted for high-impact controls, API-bounded, idempotent for mutations, fail-closed on stale confirmation state, audit-producing, customer-safe when publishing support summaries, resilient to transport failure and incapable of bypassing website-owned business/data controls.
