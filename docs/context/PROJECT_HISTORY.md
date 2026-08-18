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

TASK-CM-ADMIN-003 added:

- `/cm order reference:<CM-public-ref-or-UUID>`;
- confirmed Aura adjustment;
- confirmed wallet adjustment;
- ADR-0007 fresh-state-bound Aura/wallet confirmation;
- retained canonical refund and blocked manual fulfillment.

Local Node `v24.11.1` verification passed 113/113 tests, typecheck, build, diff checks and focused security scans.

PR #1 was squash-merged into `master` at:

```text
4b10d74aa80d3fa5c5e5a27b82e4ccf109a880a8
```

## 2026-08-18 — Customer-safe sharing / Discord UX task

TASK-CM-ADMIN-004 began from the verified mainline above.

Product direction:

- authorized staff should be able to publish the current meaningful `/cm` state into the channel for customer communication;
- customer copy must contain no admin controls/private internal fields;
- User Operations should show linked Discord state/user;
- `/cm user` should accept email or selected Discord user;
- admin/share/audit times should use Discord absolute + relative timestamps;
- Discord mutation audit should be concise and visually structured.

Current website source already supports `users.overview.read` by `external_identity` and returns linked identity metadata, so no website/API/DB expansion is required.

ADR-0008 records the separate customer-safe renderer/disclosure policy. Implementation is isolated on `task/cm-share-discord-audit-time` / PR #2.

GitHub Actions for PR #2 still fails before job steps are created because of the documented runner/account infrastructure problem. The product owner requested no additional Codex/local test run, but repository governance requires a real executable pass before merge; therefore TASK-CM-ADMIN-004 remains feature-branch/PR work until that gate is satisfied.
