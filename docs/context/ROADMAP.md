# Project Roadmap

Updated: 2026-08-17

## Completion rule

A phase is complete only when all applicable Discord behavior, API contract, data/business correctness, security, automated verification, documentation and deployment gates pass.

## Phase 0 — Read-only bot foundation — COMPLETE

Completed:

- customer `cm aura` message command;
- Components V2 leaderboard;
- persistent bootstrap/scheduling/manual refresh;
- host compatibility shim;
- legacy archive;
- HMAC Internal Integrations API rebuild;
- removal of direct DB credential/client from active bot.

## Phase 1 — Repository governance and durable memory — COMPLETE

Completed in `TASK-WF-001`.

## Phase 1.5 — Full codebase/dependency re-baseline — COMPLETE WITH EXECUTION GAP

`TASK-AUDIT-001` audited active source/tests/config/GitHub state and relevant live backend metadata. Its `/aura` migration recommendation was superseded by ADR-0005.

Fresh `npm test`, typecheck, build and dependency-scan evidence/CI still needs to exist for current head.

## Phase 1.6 — Backend API contract re-baseline — COMPLETE FOR DOCUMENTATION EVIDENCE

Authoritative backend documentation supplied on 2026-08-17 now confirms the broader production Internal Integrations API operation catalog, including HTTP execute paths for `users.aura.adjust` and `users.wallet.adjust`, HMAC/retry semantics and mutation idempotency requirements.

This phase does **not** prove bot credential authorization, exact disputed selector behavior, ADR-0004 confirmation compatibility or bot-authenticated production smoke behavior.

## Phase 2 — Command-surface stabilization and admin dispatch foundation — NEXT

Goal:

- preserve `cm aura` as the customer message command;
- preserve its current guild/blocked-channel/API-read/privacy/mention-safety behavior;
- retain `MessageContent`/`GuildMessages` while required;
- keep admin/staff commands guild-only slash commands;
- introduce a clean slash-command registry/dispatcher before multiple admin commands are added;
- keep customer and admin authorization paths clearly separated.

Read-only staff command expansion may follow this dispatcher work, but each command requires explicit bot operation scope and exact DTO verification. No command is accepted merely because a backend endpoint exists.

## Phase 3 — Admin authorization foundation — PLANNED

Goal:

- reusable high-impact slash-command guard;
- mandatory `BOT_ADMIN_USER_IDS` whitelist;
- configured admin command channel;
- configured audit-log channel;
- optional per-domain manager roles as secondary gates only;
- fail-closed missing/invalid admin config;
- tests proving no backend mutation request for wrong user/guild/channel/DM.

No mutation execution in this phase.

## Phase 4 — Aura HTTP mutation contract integration — PARTIAL

Now contract-documented:

- operation `users.aura.adjust`;
- path `/api/internal/integrations/v1/users/aura/adjust`;
- non-zero bounded `deltaAura`;
- reason 1–500;
- UUID logical idempotency key;
- optional operator audit context;
- same-key/same-body replay and changed-body conflict semantics.

Still required before implementation can complete:

- verify bot client operation permission;
- resolve exact mutation selector contract—the full contract says external identity is lookup-only while the quickstart uses it in mutation examples;
- inspect exact strict request/response DTOs;
- reconcile ADR-0004 backend-authoritative preview/confirm requirement with the documented direct execute endpoint/no documented adjustment preview endpoint;
- define/verify bot-side cap policy;
- controlled authenticated smoke verification.

Direct DB access remains forbidden.

## Phase 5 — Aura admin slash commands — AFTER PHASES 2–4

Target remains:

- `/aura-adjust preview`;
- `/aura-adjust confirm`.

Requirements include explicit admin whitelist/guild/channel gates, stable idempotency across retries, ADR-0004-compatible confirmation, sanitized audit output and controlled test-account validation.

## Phase 6 — Wallet admin slash commands — LATER / HIGH RISK

The wallet HTTP execute path is also contract-documented at `/api/internal/integrations/v1/users/wallet/adjust`, and the live DB foundation includes wallet transaction/funding-state machinery.

Before exposing `/wallet-adjust`, prove the Aura admin path first and separately verify wallet bot scope, selectors/DTOs, confirmation policy, stricter caps and ledger/funding-state behavior.

## Phase 7 — Production hardening and operations

Priority work:

- repository CI for test/typecheck/build;
- dependency scan/update policy;
- branch protection/rules verification;
- command-registration config split so registration does not require Internal API secrets;
- stronger defense-in-depth log redaction before admin mutation expansion;
- Node runtime/type-definition alignment;
- registration/helper/scheduler lifecycle tests;
- credential rotation/deployment/rollback runbooks;
- centralized logs/monitoring;
- authenticated API smoke verification.

## Current position

The backend API catalog is no longer the major unknown. The immediate bot-code work remains current-head verification plus clean admin command dispatch/authorization. For each new command, verify its exact bot credential scope and DTO before implementation. Aura mutation additionally requires selector and ADR-0004 confirmation resolution before any execute call.
