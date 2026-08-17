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

Completed:

- standalone Aura bot;
- Components V2 leaderboard;
- persistent bootstrap/scheduling/manual refresh;
- host compatibility shim;
- legacy archive;
- HMAC Internal Integrations API rebuild;
- removal of direct DB credential/client from active bot.

## Phase 1 — Repository governance and durable memory — COMPLETE

Completed in `TASK-WF-001`:

- root agent rules;
- current context/architecture/data/code/command/roadmap/workflow/handoff docs;
- audit/history documents;
- ADRs;
- admin mutation specialist model.

## Phase 1.5 — Full codebase/dependency re-baseline — COMPLETE WITH EXECUTION GAP

`TASK-AUDIT-001` read every active source file and all root tests/fixtures, audited root config/GitHub state and re-verified live backend dependency metadata.

Full report: `../audits/2026-08-17-full-codebase-audit.md`.

Static/metadata audit is complete. Fresh `npm test`, typecheck, build and dependency scan were not executable in the audit environment and no CI result exists on the audited head.

## Phase 2 — Guild-only slash-command convergence — NEXT

Goal:

- replace `cm aura` with `/aura`;
- keep all commands guild-registered and explicitly guild-guarded at runtime;
- preserve Aura output/privacy/error behavior;
- preserve mention safety;
- remove `MessageContent` and `GuildMessages` intents after the message command is gone, if no other feature requires them;
- move interaction dispatch toward a clean slash-command registry suitable for later admin commands.

Completion requires tests for DM/wrong guild/blocked or allowed command surface and no regressions in API read behavior.

## Phase 3 — Admin authorization foundation — PLANNED

Goal:

- reusable high-impact command guard;
- mandatory `BOT_ADMIN_USER_IDS` whitelist;
- configured admin command channel;
- configured audit-log channel;
- optional per-domain manager roles as secondary gates only;
- fail-closed missing/invalid admin config;
- tests proving no backend mutation request for wrong user/guild/channel/DM.

No mutation execution in this phase.

## Phase 4 — Aura backend HTTP contract verification/integration — PARTIAL UPSTREAM FOUNDATION EXISTS

### Now verified upstream

Live DB contains `internal_integration_adjust_aura_balance(...)` with operation ID `users.aura.adjust`.

Verified foundation includes:

- service-role-only execute among checked roles;
- persistent idempotency/request hash;
- bounded delta/reason;
- target validation;
- external operator audit metadata;
- negative-balance protection;
- Aura ledger/admin audit output.

### Still required

The bot must not infer an HTTP contract from a DB function. Separately verify/implement in the website-owned Internal Integrations API:

- exact Aura adjustment HTTP operation/path;
- dedicated operation permission/scope for the bot client;
- target selector contract;
- preview behavior/state/expiry;
- before/after response contract;
- single/daily cap policy;
- stable error mapping;
- production authenticated smoke verification.

Direct DB access remains forbidden.

## Phase 5 — Aura admin commands — AFTER PHASES 2–4

Target commands:

- `/aura-adjust preview`
- `/aura-adjust confirm`

Requirements:

- whitelist + guild + admin-channel gates before any backend request;
- preview bound to operator/target/delta/reason/expiry;
- confirm uses a stable idempotency key across retries;
- sanitized Discord audit-channel evidence;
- counter-entry reversal model;
- controlled test-account validation;
- source/security audit before production enablement.

## Phase 6 — Wallet adjustment — BACKEND PRIMITIVE EXISTS, BOT WORK STILL LATER/HIGH RISK

Live DB now contains `internal_integration_adjust_wallet_balance(...)`, operation `users.wallet.adjust`, with idempotency/audit/negative-balance controls.

The admin wallet primitive writes a `wallet_transactions` `admin_adjustment` row. The wallet transaction trigger routes positive entries to funding-lot synchronization and negative entries to funding-consumption synchronization.

This is useful upstream foundation, but wallet remains later because it is stored-value/payment-adjacent.

Before bot wallet commands:

- complete and prove Aura path first;
- verify website HTTP wallet adjustment operation/scope;
- require confirmation for every wallet mutation;
- enforce stricter caps;
- verify wallet ledger/funding-state behavior end-to-end;
- preserve immutable audit/counter-entry reversal;
- never fabricate external payment-provider provenance.

Target commands only after those gates:

- `/wallet-adjust preview`
- `/wallet-adjust confirm`.

## Phase 7 — Production hardening and operations

Priority work discovered by full audit:

- repository CI for test/typecheck/build;
- dependency scan/update policy;
- branch protection/rules verification;
- command-registration config split so registration does not require Internal API secrets;
- stronger defense-in-depth log redaction before mutation/user-admin expansion;
- Node runtime/type-definition alignment;
- direct tests for registration route/body and Discord channel helpers;
- scheduler lifecycle hardening;
- credential rotation/runbook;
- host/deployment/rollback runbook;
- centralized logs/monitoring;
- authenticated API smoke verification.

External backend owner also needs to address the Supabase advisor's exposed `SECURITY DEFINER` warnings.

## Current position

Phases 0 and 1 are complete. The full audit is complete as a static/live-metadata re-baseline but has a fresh-execution gap. Phase 2 is the next bot-code change.

Backend database execute primitives for Aura and wallet now exist, so future planning should focus on HTTP/API contract verification and bot authorization—not rebuilding those primitives and not bypassing the website.