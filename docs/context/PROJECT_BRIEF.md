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

Current release behavior includes:

- persistent Components V2 Aura leaderboard;
- lifetime/available Aura top-10;
- customer `cm aura` message command;
- `/refresh-leaderboard`;
- private `/cm user` and `/cm order` admin console;
- `/cm user` lookup by exact email or selected linked Discord user;
- linked Discord state/user in User Operations;
- user/order/fulfillment diagnostics;
- canonical refund;
- confirmed Aura adjustment;
- confirmed wallet adjustment;
- explicit Share to Chat copies from meaningful `/cm` panels;
- Discord absolute + relative time presentation;
- concise Components V2 mutation audit summaries.

## Data/business boundary

```text
Discord
  -> standalone bot
  -> HMAC Internal Integrations API
  -> website-owned business/data layer
```

The bot is never a direct Supabase/Postgres client, does not carry a service-role/database credential and has no table/RPC fallback. Website-side per-client `allowedOperations` remains an independent runtime authorization boundary.

Discord identity lookup reuses the existing `users.overview.read` external-identity selector. Share to Chat uses already-authorized session data and adds no API operation, website route, environment value or database dependency.

## Accepted product/security direction

- ADR-0005 — customer self-service may remain message-based; admin/staff operations use slash/components/modals.
- ADR-0006 — `/cm` is exact-guild + explicit `BOT_ADMIN_USER_IDS`, usable from any configured-guild channel; DMs/wrong guilds fail closed.
- ADR-0007 — Aura/wallet require explicit five-minute fresh-state-bound confirmation, stable idempotency and audit.
- ADR-0008 — Share to Chat must use a separate read-only renderer with no customer-operable admin controls or internal/operator fields.
- ADR-0009 — supersedes ADR-0008 only for the previous email prohibition: the canonical customer account email is intentionally included in shared customer identity sections.
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

Share to Chat is a deliberate disclosure action by an authorized admin, not a relaxation of authorization. Public summaries are separately rendered and display-only; they do not inherit the private admin component tree.

The product-approved customer identity disclosure now includes the account email and linked Discord identity. Internal CM UUIDs, internal option IDs, admin reasons, backend audit/transaction/idempotency identifiers, provider/failure codes and credentials remain excluded.

Because the message is posted into the current channel, the authorized operator is responsible for choosing an appropriate channel before sharing customer account information.

## Manual fulfillment

Still blocked by backend contract: `orders.fulfillment.read` is diagnostics-only and there is no manual-fulfillment mutation operation. Purchase processing/direct DB access are not substitutes.

## Current maturity

Production-adjacent and security-sensitive. TASK-CM-ADMIN-004 is merged into mainline and established the Share to Chat/Discord UX model. TASK-CM-ADMIN-005 is the explicit follow-up that allows the canonical customer account email in shared summaries under ADR-0009.

## Success criteria

A successful bot remains small/auditable, exact-guild scoped, explicitly allowlisted for high-impact controls, API-bounded, idempotent for mutations, fail-closed on stale confirmation state, audit-producing, deliberately field-scoped when publishing support summaries, resilient to transport failure and incapable of bypassing website-owned business/data controls.
