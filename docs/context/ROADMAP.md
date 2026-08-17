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

`TASK-AUDIT-001` audited every active source file, root tests/fixtures, config/GitHub state and relevant live backend metadata.

The audit's recommendation to migrate `cm aura` to `/aura` was based on ADR-0003 and is superseded by ADR-0005 after product clarification.

Fresh `npm test`, typecheck, build and dependency scan still need executable evidence/CI.

## Phase 2 — Command-surface stabilization and admin dispatch foundation — NEXT

Goal:

- **preserve** `cm aura` as the customer message command;
- preserve its guild/blocked-channel/API-read/privacy/mention-safety behavior;
- retain `MessageContent`/`GuildMessages` because they are intentionally required by the customer surface;
- keep admin/staff commands guild-only slash commands;
- introduce a clean slash-command registry/dispatcher before multiple admin commands are added;
- keep customer and admin command authorization paths clearly separated.

No customer `/aura` migration is planned.

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

## Phase 4 — Aura backend HTTP contract verification/integration — PARTIAL UPSTREAM FOUNDATION EXISTS

Live DB contains `internal_integration_adjust_aura_balance(...)`, operation `users.aura.adjust`, with service-role-only execute, persistent idempotency/request hash, bounded input, target validation, operator audit metadata and negative-balance protection.

Still required at the website API layer:

- exact Aura adjustment HTTP operation/path;
- operation permission/scope for bot client;
- target selector contract;
- preview behavior/state/expiry;
- before/after response contract;
- single/daily cap policy;
- stable error mapping;
- authenticated smoke verification.

Direct DB access remains forbidden.

## Phase 5 — Aura admin slash commands — AFTER PHASES 2–4

Target:

- `/aura-adjust preview`;
- `/aura-adjust confirm`.

Requirements include explicit admin whitelist/guild/channel gates, stable idempotency across retries, backend-authoritative preview/confirm, sanitized audit output and controlled test-account validation.

## Phase 6 — Wallet admin slash commands — LATER / HIGH RISK

Live DB contains `internal_integration_adjust_wallet_balance(...)`, operation `users.wallet.adjust`, and wallet funding-state trigger machinery.

Before exposing `/wallet-adjust`, prove the Aura admin path first and verify the website HTTP wallet contract/scope, ledger/funding-state behavior, stricter caps and confirmation policy.

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

External backend owner also needs to address Supabase advisor warnings unrelated to the bot.

## Current position

The customer `cm aura` message command is intended current behavior. The next bot-code work is admin-command infrastructure and verification—not converting the customer command to slash.
