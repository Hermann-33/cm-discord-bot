# ADR-0019 — Leaderboard failures must not terminate the Discord runtime

Status: Accepted

Date: 2026-09-09

## Context

The standalone process now owns multiple independent product surfaces:

- persistent Aura leaderboard;
- customer `cm aura`;
- `/refresh-leaderboard`;
- private `/cm` admin controls;
- Tickety account-link gating and override;
- the controlled customer-visible AI support surface.

The original leaderboard-era startup behavior treated the leaderboard as the process's only critical workload:

1. if `DISCORD_LEADERBOARD_MESSAGE_ID` was absent, create the bootstrap message and exit successfully;
2. if the configured leaderboard failed its initial refresh, shut down the Discord client and exit with failure.

That coupling is no longer valid. A stale/deleted leaderboard message, Discord permission failure, temporary API failure or missing bootstrap configuration can otherwise take every unrelated Discord surface offline.

Production evidence on 2026-09-09 showed the old bot instance making its normal five-minute Internal Integrations API heartbeat through 04:13 UTC. The PR #21 deployment started at approximately 04:18 UTC, produced startup reconciliation traffic through 04:19 UTC, and then stopped producing backend nonces. The source-level fatal leaderboard startup path was the only normal `ClientReady` path that deliberately destroys the whole Discord runtime.

## Decision

Leaderboard startup is isolated from process liveness.

### Configured leaderboard message

`LeaderboardSchedule.start()` performs the initial refresh in nonfatal mode:

```text
refreshNow({ failOnError: false })
```

and always starts the existing five-minute retry interval.

A failed first refresh is logged by the leaderboard service and retried by the normal schedule. It does not prevent commands, tickets or AI from remaining online.

### Missing leaderboard message id

If no `DISCORD_LEADERBOARD_MESSAGE_ID` is configured, the existing one-shot bootstrap message creation remains unchanged and the scheduler still returns `bootstrap-complete`.

The process no longer exits after that result. It stays online with leaderboard scheduling disabled until the operator stores the created message ID and redeploys/restarts.

### Bootstrap/start exception

If leaderboard startup itself throws, `ClientReady` logs a sanitized leaderboard-specific error and keeps the Discord client connected.

### Shutdown authority

Whole-process shutdown remains reserved for:

- SIGINT;
- SIGTERM;
- Discord login failure.

Leaderboard state is not process-liveness authority.

## Preserved invariants

- five-minute leaderboard cadence;
- scheduler overlap lock;
- explicit `/refresh-leaderboard` behavior;
- leaderboard safe-message rendering;
- no command JSON change;
- no HMAC/API contract change;
- no admin authorization change;
- no environment schema change;
- no direct database access;
- single-replica assumption unchanged.

## Consequences

Positive:

- one broken leaderboard message cannot make all bot commands return "application did not respond";
- temporary leaderboard failures recover on the normal five-minute retry loop;
- ticket gating and AI support remain available during leaderboard incidents;
- bootstrap configuration can be repaired without the bot becoming entirely unavailable.

Trade-off:

- a bot with no configured leaderboard message ID remains online but does not schedule leaderboard edits until the ID is configured.

## Rejected alternatives

- Keep fatal shutdown behavior — rejected because leaderboard availability is no longer equivalent to bot availability.
- Remove initial leaderboard refresh — rejected because early validation remains useful.
- Add a separate process for leaderboard work — unnecessary for this narrow incident; the single-replica architecture remains sufficient.
