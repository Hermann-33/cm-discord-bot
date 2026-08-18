# Project History

Updated: 2026-08-18

This file preserves important chronology without making historical architecture authoritative over current source/ADRs.

## 2026-05-29 — Initial standalone bot

The standalone Discord bot began with leaderboard, `cm aura` and `/refresh-leaderboard`, initially using narrow Supabase RPC access.

## 2026-05-29/30 — Presentation/hosting evolution

Leaderboard moved toward Components V2; `cm aura` became configured-guild-wide except one blocked channel. A root `index.js` host shim was added for hosts that execute the package entry directly. Repository published as `Hermann-33/cm-discord-bot`.

## 2026-08-10/11 — Internal API rebuild and legacy freeze

Internal API experiments established the direction away from direct database coupling. Commit `6dfe75f` froze old implementation under `legacy/`. Commit `d7a7f4e` rebuilt active production code around the signed website Internal Integrations API:

```text
old active model: bot -> Supabase RPC
current model: bot -> HMAC Internal Integrations API -> website-owned data/business layer
```

Active bot no longer carries Supabase/Postgres credentials.

## 2026-08-17 — Governance/security direction

Repository-resident context/workflow/audits/ADRs were installed. ADR-0005 clarified that `cm aura` intentionally remains a customer message command while staff/admin operations use slash/components/modals.

High-impact controls remain exact-guild, explicitly user-ID allowlisted and website/API bounded.

## 2026-08-17 — Private admin console

TASK-CM-ADMIN-001 implemented `/cm user`, private Components V2 user/order navigation and canonical refund preview/confirm/re-preview/execute. Local verification passed 104/104 tests, typecheck, build and diff check before mainline merge.

## 2026-08-17 — `/cm` guild-wide for whitelisted admins

ADR-0006 removed the shared `/cm` command-channel restriction while retaining exact configured guild + explicit `BOT_ADMIN_USER_IDS` + per-interaction authorization/session ownership. `BOT_ADMIN_COMMAND_CHANNEL_ID` was removed; `/refresh-leaderboard` keeps its separate channel policy.

## 2026-08-18 — Direct order + balance controls merged

TASK-CM-ADMIN-003 added `/cm order`, confirmed Aura adjustment, confirmed wallet adjustment and ADR-0007 fresh-state-bound Aura/wallet confirmation while retaining canonical refund and blocked manual fulfillment.

Local verification passed 113/113 tests, typecheck, build, diff checks and focused security scans. PR #1 was squash-merged into `master` at:

```text
4b10d74aa80d3fa5c5e5a27b82e4ccf109a880a8
```

## 2026-08-18 — Share to Chat / Discord UX merged

TASK-CM-ADMIN-004 added `/cm user` by email or selected Discord user, linked Discord identity presentation, separate customer-safe Share to Chat rendering, Discord timestamps, concise mutation audit summaries and ADR-0008.

Final run `32142352087` passed 127/127 tests, typecheck, build and diff check. PR #2 was merged at:

```text
7a41dbeefae167044091b0aaed8372c3b58acdd0
```

## 2026-08-18 — Customer email intentionally added to shared panels

TASK-CM-ADMIN-005 / ADR-0009 changed one disclosure decision: the canonical customer account email is intentionally included in Share to Chat customer identity sections. The separate read-only renderer, no public controls and all other internal-field exclusions remain.

Implementation and final-documentation GitHub Actions runs passed; PR #3 was squash-merged at:

```text
9466d6f23a6c2027b0e88c32eb4e78ddeeeb61fd
```

## 2026-08-18 — Admin UI declutter

TASK-CM-ADMIN-006 reviewed the complete User Operations, recent orders, direct order, fulfillment, refund, Aura/wallet and Share to Chat presentation surfaces and removed routine operational/statistical bloat.

The task changes presentation only:

- User Operations focuses on status, compact identity, current wallet/Aura, order count/latest order and core actions;
- order views remove internal IDs/provider/redundant fulfillment statistics;
- fulfillment presentation becomes `Delivery Details` and shows exception data only when meaningful;
- the nonfunctional Manual Fulfillment button is removed rather than advertising unavailable capability;
- mutation panels hide routine backend bookkeeping while keeping results and exceptional warnings;
- customer shares are shortened while preserving ADR-0009 email disclosure and ADR-0008 no-control/internal-field rules.

No API/auth/mutation/database/config/registration/leaderboard/legacy change is part of the task.

The first CI run caught two errors in new test assertion escaping only. After correcting those tests, run `32156144669` passed 131/131 tests, typecheck, build and diff check. After documentation updates, run `32156801285` passed the same complete gate. PR #4 is verified for merge subject to a green GitHub Actions status on its current head.
