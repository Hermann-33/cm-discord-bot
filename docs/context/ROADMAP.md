# Project Roadmap

Updated: 2026-08-17

## Completion rule

A phase is complete only when all applicable tracks pass:

1. Discord/user-facing behavior;
2. API/service contract;
3. data/business correctness;
4. security/authorization/secret handling;
5. automated tests/typecheck/build;
6. documentation/ADRs/handoff;
7. deployment/live verification when explicitly required.

## Phase 0 — Read-only bot foundation — COMPLETE

Completed history includes:

- initial standalone Aura bot;
- leaderboard rendering evolution to Components V2;
- guild-wide Aura lookup except one blocked channel;
- persistent leaderboard bootstrap/scheduling/manual refresh;
- hosting `index.js` shim;
- legacy archive;
- rebuild on the HMAC Internal Integrations API with no direct DB access.

## Phase 1 — Repository governance and durable memory — CURRENT

Goal:

- establish `AGENTS.md`, current context, architecture, data status, codebase map, command policy, workflow, ADRs, audit log, history, handoff, and specialist admin security model.

Completion:

- repository context becomes authoritative;
- future sessions can work without old chat transcripts;
- current vs historical vs planned behavior is explicit.

## Phase 2 — Guild-only slash-command convergence — PLANNED

Goal:

- replace `cm aura` message command with `/aura`;
- make all command handling explicitly guild-only at runtime;
- keep guild registration explicit/manual;
- preserve current read-only Aura behavior and mention safety;
- remove the need for Message Content intent once no message command depends on it, if no other feature requires it.

## Phase 3 — Admin authorization foundation — PLANNED

Goal:

- reusable mutation-command guard;
- mandatory `BOT_ADMIN_USER_IDS` whitelist;
- admin command channel;
- audit log channel;
- optional per-domain manager roles;
- fail-closed missing config;
- tests for wrong user/guild/channel/DM.

No mutation execution yet.

## Phase 4 — Aura adjustment backend contract — BLOCKED ON BACKEND WORK

Goal:

- dedicated signed preview and confirm operations in the Internal Integrations API;
- backend target resolution;
- idempotency;
- single/daily caps;
- immutable audit evidence;
- before/after snapshots;
- transaction-safe Aura ledger/balance mutation;
- stable errors.

The Discord bot must not directly call DB functions.

## Phase 5 — Aura admin commands — PLANNED AFTER PHASE 4

Commands:

- `/aura-adjust preview`
- `/aura-adjust confirm`

Requirements:

- whitelist + guild + channel gates;
- preview bound to operator/target/delta/reason and expiry;
- confirm uses backend idempotency;
- Discord audit-channel evidence;
- counter-entry reversal model;
- test account live validation before production use.

## Phase 6 — Wallet adjustment — LATER / HIGH RISK

Commands:

- `/wallet-adjust preview`
- `/wallet-adjust confirm`

Additional requirements:

- cents-based integer amounts;
- stricter caps;
- confirmation for every wallet mutation;
- wallet transaction ledger correctness;
- funding-lot creation/linkage where credits become spendable funds;
- no direct balance overwrite;
- immutable backend/admin audit trail.

Aura mutation must be proven first.

## Phase 7 — Production hardening and operations

Potential work:

- credential rotation/runbook;
- centralized structured log collection;
- rate-limit/abuse monitoring;
- command registration/deployment runbook;
- authenticated end-to-end API smoke verification;
- disaster/rollback procedures;
- review of whether deprecated legacy/read DB functions can be removed by their owning backend.

## Current position

The read-only rebuild is the active implementation. Governance is being installed. The next engineering change should not skip directly to wallet/Aura mutation.