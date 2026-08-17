# Project Brief

Updated: 2026-08-17

## Product purpose

The Cheater's Market Discord bot is the Discord-facing companion to Cheater's Market. It publishes Aura leaderboard data, provides user-facing Aura lookup, and exposes tightly controlled staff operations without making Discord the owner of commerce or account state.

## Target users

- Cheater's Market Discord community members who need read-only Aura information.
- Trusted staff who need operational controls such as manual leaderboard refresh.
- In a future phase, explicitly whitelisted administrators who may request audited Aura or wallet adjustments through a narrow backend contract.

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

The bot is not a database client. It has no Supabase/Postgres credential and no direct database fallback. Its website integration credential is intended to be dedicated to this deployment and currently limited to:

- `aura.leaderboards.read`
- `aura.lookup.read`

## Accepted direction

The desired command end state is:

- the bot is usable only in the configured Cheater's Market guild;
- all user-invoked commands are slash commands;
- admin/mutation commands are restricted to explicit whitelisted Discord user IDs, with optional role checks as an additional gate;
- Aura adjustment is the first mutation feature;
- wallet adjustment is a later, higher-risk feature;
- mutation execution happens behind a narrow signed backend API, never through direct bot database access.

## Explicit non-goals

The bot must not become:

- a direct Supabase/Postgres admin client;
- the source of truth for Aura, wallet, orders, payments, licenses, delivery, OAuth, or Support-role state;
- a general website admin backend;
- a place where business-critical mutations are implemented only in Discord code;
- a secret-bearing diagnostic console.

## Current maturity

Production-adjacent and security-sensitive. The read-only rebuild is substantially hardened and tested. The future admin mutation feature is a design target only; it is not authorized for live implementation until the backend mutation contract, authorization, idempotency, caps, confirmation, and audit model exist.

## Success criteria

A successful bot remains small, auditable, guild-scoped, least-privileged, resilient to Discord/API failures, and incapable of bypassing website-owned business/data controls.