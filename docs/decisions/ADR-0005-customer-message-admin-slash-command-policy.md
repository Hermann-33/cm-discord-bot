# ADR-0005: Customer Message Commands and Admin Slash Commands

## Status

Accepted — supersedes ADR-0003 where the two conflict

- Date: 2026-08-17
- Type: Product / Security / Discord interface

## Context

The bot has two distinct audiences and interaction models:

1. customers using simple self-service commands such as `cm aura`;
2. staff/admin operators using operational or high-impact commands such as `/refresh-leaderboard` and future Aura/wallet administration.

ADR-0003 previously required all command surfaces to converge on slash commands and classified `cm aura` as migration debt. The product owner clarified that this was not the intended UX: `cm aura` is specifically a customer-facing text command, while slash commands are intended for admin/staff surfaces.

## Decision

### Customer-facing commands

- Customer/self-service commands may remain message/text commands.
- `cm aura` remains the canonical customer Aura command.
- `cm aura` is **not** a migration target for `/aura` under the current product policy.
- The configured-guild and blocked-channel guards remain mandatory before any backend call.
- Customer message commands must retain safe mention behavior and sanitized output.
- `MessageContent` and `GuildMessages` intents are accepted requirements while customer message commands depend on them.

### Admin/staff commands

- Admin/staff operational and mutation commands use Discord slash commands.
- Admin slash commands are registered to the configured Cheater's Market guild, not globally.
- Runtime guild checks remain mandatory even when registration is guild-scoped.
- DMs fail closed.
- Operational commands retain their required channel/permission checks.
- High-impact mutation commands additionally follow ADR-0004: explicit Discord user-ID allowlist, admin channel, confirmation/idempotency/audit requirements, and backend-only mutation.

### Data boundary

Command presentation does not change the data architecture.

Both customer message commands and admin slash commands use approved website Internal Integrations API operations. Neither command type may directly connect to Supabase/Postgres or receive database credentials.

## Consequences

Benefits:

- preserves the intended low-friction customer UX;
- keeps admin capabilities discoverable/typed and clearly separated from customer commands;
- avoids exposing admin command surfaces through free-form prefix parsing;
- makes the customer/admin trust boundary explicit in code and documentation.

Costs:

- privileged Message Content intent remains intentionally required while customer message commands exist;
- the bot must support both `MessageCreate` and `InteractionCreate` surfaces;
- tests must preserve the separate authorization rules for each surface.

## Supersession of ADR-0003

ADR-0003 remains historical evidence of the earlier slash-only decision, but the following ADR-0003 conclusions are no longer authoritative:

- “all command surfaces should converge on slash commands”;
- “`cm aura` is a migration target”;
- “remove Message Content intent after `/aura` migration.”

ADR-0003 remains relevant only where it agrees with this ADR, especially the requirement that admin slash commands remain guild-scoped and fail closed outside the configured guild.

## Current-state mapping

Current source already matches the intended split:

- customer: `cm aura` message command;
- staff/admin operational: `/refresh-leaderboard` slash command.

Future high-impact admin commands such as `/aura-adjust` and `/wallet-adjust` remain slash-only and must satisfy ADR-0004.

## Rollback/supersession

Any future decision to make customer commands slash-only, make admin commands message-based, or allow global/DM admin execution requires a new ADR.
