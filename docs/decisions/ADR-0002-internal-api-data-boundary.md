# ADR-0002: Internal Integrations API Is the Bot Data Boundary

## Status

Accepted

- Date: 2026-08-17
- Type: Security / Architecture
- Activation evidence: commit `d7a7f4e`

## Context

The original bot used narrow Supabase RPCs. The production rebuild introduced a website-owned HMAC-authenticated Internal Integrations API and removed direct database credentials from the bot.

## Decision

- The production bot must not connect directly to Supabase/Postgres.
- The bot must not carry a service-role/database credential or direct DB fallback.
- Data/business operations are accessed only through explicitly approved Internal Integrations API operations.
- Bot credentials must be dedicated to this deployment and least-privileged.
- Current allowed operations are read-only Aura leaderboard and Aura lookup.
- Future mutations must be new narrow backend API operations; they may not be implemented by reintroducing direct database access.

## Consequences

Benefits:

- database/business authorization stays website-owned;
- credentials can be scoped per integration operation;
- backend can centralize idempotency, audit, validation, and transactional behavior;
- bot compromise has a smaller data blast radius.

Costs:

- mutation features require backend/API work before Discord implementation can complete.

## Security and data impact

HMAC signing, timestamp/nonce replay protection, strict schemas, bounded responses, sanitized errors, and credential scope become critical security controls.

The existing DB function `admin_adjust_aura_balance` is not permission for direct bot use. It may only be considered as a backend implementation primitive after a separate audit.

## Alternatives considered

### Direct Supabase service-role client in bot

Rejected: excessive privilege and bypasses website-owned controls.

### Direct table access with RLS

Rejected: bot service identities and mutation business rules do not belong in Discord runtime.

### Internal API

Accepted.

## Rollback/supersession

Any return to direct database access requires a superseding ADR and explicit security justification.