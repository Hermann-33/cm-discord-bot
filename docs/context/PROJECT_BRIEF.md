# Project Brief

Updated: 2026-08-23

## Product purpose

The Cheater's Market Discord bot is the Discord-facing companion to Cheater's Market. It publishes customer Aura information and gives a small explicitly trusted staff set private operational/admin controls without making Discord the owner of account, wallet, order, payment or fulfillment state.

## Target users

- community members needing read-only Aura/self-service information;
- customers receiving staff-shared read-only support summaries;
- trusted staff needing private user/order/pending-purchase/fulfillment diagnostics;
- explicitly allowlisted administrators performing audited Aura, wallet and canonical-order refund operations through website-owned Internal Integrations API contracts.

## Product scope

Current accepted behavior includes:

- persistent Components V2 Aura leaderboard;
- lifetime/available Aura top-10;
- customer `cm aura` message command;
- `/refresh-leaderboard`;
- private `/cm user` and `/cm order` admin console;
- `/cm user` lookup by exact email or selected linked Discord user;
- `/cm order` canonical order lookup plus ADR-0011 pending purchase-intent fallback;
- linked Discord state/user in User Operations;
- user/order/pending-purchase/fulfillment diagnostics;
- optional private masked fulfillment support metadata for canonical orders;
- canonical order refund;
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

The bot operation surface is deliberately closed. TASK-CM-ADMIN-007 adds only `purchase-intents.lookup.read` for read-only pending-purchase resolution. `purchase-intents.process` remains forbidden.

## Accepted product/security direction

- ADR-0005 — customer self-service may remain message-based; admin/staff operations use slash/components/modals.
- ADR-0006 — `/cm` is exact-guild + explicit `BOT_ADMIN_USER_IDS`, usable from any configured-guild channel; DMs/wrong guilds fail closed.
- ADR-0007 — Aura/wallet require explicit five-minute fresh-state-bound confirmation, stable idempotency and audit.
- ADR-0008 — Share to Chat uses a separate read-only renderer with no customer-operable admin controls or internal/operator fields.
- ADR-0009 — canonical customer account email is intentionally included in shared customer identity.
- ADR-0010 — ticket transcript corpus remains a separate private data-only side project.
- ADR-0011 — `/cm order` is order-first with `NOT_FOUND`-only pending fallback; optional masked fulfillment support is private staff data; pending state has no order-only mutation controls.
- refund retains canonical backend preview/re-preview confirmation.
- website remains the mutation/accounting authority.

## Pending purchase model

A checkout can exist as a purchase intent before a canonical order exists. `/cm order` therefore first asks for canonical order details and, only on stable `NOT_FOUND`, asks for the matching purchase intent. Exact owner resolution remains mandatory.

Pending purchase state is diagnostic/read-only. Refresh can transition the same operator session to the canonical order panel once the website produces the order.

## Fulfillment support model

The website may add an optional support object to `orders.fulfillment.read` containing human-readable type/duration, bounded masked fulfillment material and manual-required state. The bot may display those values only on private authorized admin surfaces.

Support enrichment is not required for core order navigation. Missing optional support is not proof of manual fulfillment. Raw/decrypted fulfillment material is outside the bot contract.

## Customer-safe sharing boundary

Share to Chat is a deliberate disclosure action by an authorized admin, not a relaxation of authorization. Public summaries are separately rendered and display-only; they do not inherit the private admin component tree.

The product-approved customer identity disclosure includes the account email and linked Discord identity. Safe pending-purchase information may also be shared. Internal CM UUIDs, purchase/purchase-intent option IDs, provider/provider-status internals, admin reasons, backend audit/transaction/idempotency identifiers, masked fulfillment support material and credentials remain excluded.

## Explicit non-goals

The bot must not become:

- a direct database admin client;
- a generic website admin backend;
- the source of truth for Aura/wallet/orders/payments/licenses/delivery/OAuth/Support-role state;
- a purchase-processing automation surface unless separately approved;
- a manual-fulfillment engine without a website-owned operation;
- a role-only admin system;
- a customer-visible admin-control surface;
- a raw-secret-bearing diagnostic console.

## Manual fulfillment

Still blocked by backend contract. `orders.fulfillment.read` is read-only diagnostics/support data; no manual-fulfillment execute operation exists. Purchase processing/direct DB access are not substitutes.

## Current maturity

Production-adjacent and security-sensitive. TASK-CM-ADMIN-007 completes the currently available website-side order support integration on the bot branch: pending purchase lookup plus optional masked fulfillment support, without changing mutation authority.

ADR-0012 additionally permits a bundled sanitized canonical support runtime and optional constrained OpenRouter next-action planner. This is scaffolding only: arbitrary customer messages are not connected, the model cannot execute lookups or author ungrounded replies, and activation remains benchmark-gated.

## Success criteria

A successful bot remains small/auditable, exact-guild scoped, explicitly allowlisted for high-impact controls, API-bounded, idempotent for mutations, fail-closed on stale confirmation state, audit-producing, deliberately field-scoped when publishing support summaries, resilient to optional support dependency failure and incapable of bypassing website-owned business/data controls.
