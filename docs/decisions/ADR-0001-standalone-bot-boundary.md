# ADR-0001: Standalone Bot and Legacy Boundary

## Status

Accepted

- Date: 2026-08-17
- Type: Architecture
- Activation evidence: commits `6dfe75f` and `d7a7f4e`

## Context

Cheater's Market has a website/business backend and a separate Discord process. Earlier work risked conflating site and bot responsibilities, and the repository also contains a historical bot implementation.

## Decision

- `Hermann-33/cm-discord-bot` owns the standalone Discord process only.
- Website/payment/wallet/order/OAuth/Support-role/database ownership remains outside this repo.
- Active production code lives under `src/`.
- `legacy/` is frozen historical source and must never be imported into active runtime code.
- `docs/legacy-parity.md` remains evidence/history, not the current architecture definition.

## Consequences

Benefits:

- smaller blast radius;
- clear ownership;
- old behavior remains inspectable without contaminating production;
- bot deployments can evolve independently.

Costs:

- cross-system features require explicit API contracts and coordinated backend work.

## Security and data impact

The bot cannot assume that Discord authorization or local code grants authority over website business data. Cross-boundary operations require a trusted website-owned interface.

## Alternatives considered

### Put bot code in the website repo

Rejected: increases coupling and blast radius.

### Keep legacy source mixed with active source

Rejected: invites accidental imports and stale assumptions.

## Scope boundaries

This ADR does not prohibit coordinated website work; it requires that such work be separately scoped and owned.

## Rollback/supersession

A future architecture change requires a new ADR. Do not rewrite this record.