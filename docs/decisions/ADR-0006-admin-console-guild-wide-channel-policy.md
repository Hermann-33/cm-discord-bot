# ADR-0006: Guild-Wide Admin Console Channel Policy

## Status

Accepted — supersedes the admin-command-channel requirement in ADR-0004 and ADR-0005 where they conflict

- Date: 2026-08-17
- Type: Security / Product / Discord authorization

## Context

The `/cm` admin console is a guild-scoped slash-command surface for explicitly trusted operators. Its user/order panels, confirmations and errors are returned ephemerally to the invoking operator, while mutation audit evidence is written separately to the configured audit channel and to the website-owned backend audit trail.

ADR-0004 originally required every high-impact mutation interaction to occur in one configured admin command channel. TASK-CM-ADMIN-001 implemented that rule through `BOT_ADMIN_COMMAND_CHANNEL_ID`.

The product owner has now chosen a different operational model: a whitelisted administrator should be able to use `/cm` from any channel inside the configured Cheater's Market guild. Channel location is not an authorization principal for this console. Guild membership plus an explicit Discord user-ID allowlist are the mandatory Discord authorization boundary.

Ephemeral visibility is confidentiality/UX, not authorization. The explicit allowlist remains mandatory even though console output is private.

## Decision

For `/cm` and future mutation-capable controls that use the shared CM admin authorization boundary:

1. interaction must be a Discord slash/component/modal interaction handled by the admin controller;
2. interaction must be in a guild;
3. guild ID must exactly equal configured `DISCORD_GUILD_ID`;
4. `BOT_ADMIN_USER_IDS` must be non-empty;
5. invoking Discord user ID must be explicitly present in `BOT_ADMIN_USER_IDS`;
6. optional role/domain checks may add restrictions but may never replace the explicit user-ID allowlist;
7. operation-specific validation, confirmation, idempotency and backend authorization must still pass.

There is **no admin command-channel authorization check** for `/cm`.

`BOT_ADMIN_COMMAND_CHANNEL_ID` is removed from the supported bot configuration surface rather than being assigned special empty-value semantics. A stale copy of that variable in an external host environment has no authorization effect and should be removed operationally to avoid confusion.

`BOT_AUDIT_LOG_CHANNEL_ID` remains separate. It is still required before refund execution so the bot can attempt the sanitized Discord mutation audit record. Backend immutable audit evidence remains authoritative.

## Scope

This decision changes only the shared `/cm` admin-console channel restriction.

It does **not** remove or weaken:

- configured-guild restriction;
- DM rejection;
- explicit `BOT_ADMIN_USER_IDS` authorization;
- per-interaction reauthorization for buttons/modals;
- operator-bound private sessions;
- ephemeral console output;
- refund preview/re-preview/explicit confirmation;
- refund idempotency/replay protections;
- backend operation allowlists/business validation;
- backend and Discord audit requirements;
- direct-database prohibition.

It also does not change `/refresh-leaderboard`. That separate operational command retains its configured command-channel and Discord permission checks unless a later decision changes it.

## Consequences

Benefits:

- trusted operators can use `/cm` from any channel in the configured guild;
- configuration is simpler and no longer contains an admin channel that provides no identity authorization;
- private admin output remains visible only to the invoking operator;
- the actual authorization factors remain explicit and testable.

Costs:

- one defense-in-depth/operational-segregation layer is intentionally removed;
- a whitelisted operator can accidentally invoke `/cm` from an ordinary guild channel, although the response remains ephemeral;
- audit and confirmation controls become even more important for mutations.

## Supersession

The following older requirements are no longer authoritative for `/cm` and shared high-impact admin-console authorization:

- ADR-0004 authorization step requiring `channel == configured admin command channel`;
- ADR-0005 wording that high-impact mutations require an admin command channel;
- specialist/context documentation derived from those statements.

All other ADR-0004 and ADR-0005 requirements remain in force.

## Rollback/supersession

Reintroducing a mandatory admin command channel, allowing DMs/wrong-guild execution, removing the explicit user-ID allowlist, or changing the audit/confirmation boundary requires another explicit policy/security change. Removal of the allowlist, confirmation, idempotency or backend audit requirements requires a superseding security ADR.
