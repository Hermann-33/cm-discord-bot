# Project Brief

Updated: 2026-08-17

## Product purpose

The Cheater's Market Discord bot is the Discord-facing companion to Cheater's Market. It publishes Aura leaderboard data, provides user-facing Aura lookup, and exposes tightly controlled staff operations without making Discord the owner of commerce or account state.

## Target users

- Cheater's Market Discord community members who need read-only Aura information.
- Trusted staff who need operational/read controls.
- In a future phase, explicitly whitelisted administrators who may request audited Aura or wallet adjustments through narrow website-owned Internal Integrations API operations.

## Current production scope

The rebuilt bot currently provides:

- one persistent Discord Components V2 Aura leaderboard message;
- lifetime and available Aura top-10 boards;
- the self-service `cm aura` message command;
- the staff-only guild slash command `/refresh-leaderboard`;
- five-minute scheduled leaderboard refresh;
- startup bootstrap when a leaderboard message ID is not yet configured;
- HMAC-authenticated read-only requests to the website Internal Integrations API;
- structured sanitized logging, bounded responses, timeout/retry controls, mention suppression, and tests.

## Current data boundary

The bot is not a database client. It has no Supabase/Postgres credential and no direct database fallback. Its currently documented website integration credential remains limited to:

- `aura.leaderboards.read`
- `aura.lookup.read`

The backend Internal Integrations API itself now has authoritative production contract documentation for additional read and mutation operations. That API capability is not automatically bot permission; every integration client has an exact `allowedOperations` list.

## Accepted direction

ADR-0005 is the command-surface authority and supersedes ADR-0003 where they conflict:

- customer/self-service commands may remain message/text commands;
- `cm aura` remains the canonical customer Aura command;
- staff/admin operational and mutation commands use configured-guild slash commands;
- high-impact admin/mutation commands require explicit whitelisted Discord user IDs, with roles only as optional additional gates;
- Aura adjustment is the first mutation feature;
- wallet adjustment is later and higher risk;
- mutation execution occurs through narrow signed backend API operations, never through direct bot database access.

## Explicit non-goals

The bot must not become:

- a direct Supabase/Postgres admin client;
- the source of truth for Aura, wallet, orders, payments, licenses, delivery, OAuth, or Support-role state;
- a general website admin backend;
- a place where business-critical mutations are implemented only in Discord code;
- a secret-bearing diagnostic console.

## Current maturity

Production-adjacent and security-sensitive. The read-only rebuild is substantially hardened. Backend documentation now confirms production Aura/wallet adjustment execute operations and other support/read operations, but bot mutation implementation remains blocked until exact bot credential scope, mutation selector semantics, strict DTOs, ADR-0004-compatible confirmation/idempotency behavior and authorization controls are verified and implemented.

## Success criteria

A successful bot remains small, auditable, guild-scoped, least-privileged, resilient to Discord/API failures, and incapable of bypassing website-owned business/data controls.
