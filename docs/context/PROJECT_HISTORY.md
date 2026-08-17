# Project History

Updated: 2026-08-17

This file preserves important chronology without making historical architecture authoritative over current source.

## 2026-05-29 — Initial standalone bot

Commit `b3206c6` introduced the standalone Discord bot. The early bot read Aura data through narrow Supabase RPCs and provided a persistent leaderboard, `cm aura`, and `/refresh-leaderboard`.

The project was deliberately separated from the Cheater's Market website codebase.

## 2026-05-29 — Leaderboard and channel-policy evolution

Commit `31ca167` updated rendering toward Discord Components V2 and changed `cm aura` from a single allowed command channel to configured-guild-wide usage except one blocked channel.

The Aura application emoji ID used by the historical/current presentation is `1509816131282669688`; it is treated as an application-owned presentation asset. The leaderboard evolved to fixed-width rank/Aura labels, username sanitization, medal suffixes, and a relative update timestamp.

## 2026-05-29/30 — Hosting and repository operation

A root `index.js` compatibility shim was introduced so Pterodactyl/BOHosting-style hosts that run `/home/container/index.js` can start the compiled `dist/index.js` entry.

The standalone bot repository was published as `Hermann-33/cm-discord-bot`.

## Website/DB integration work — external context

Separate website work implemented Discord OAuth linking, encrypted OAuth grants, Support-role sync, Aura leaderboard privacy masking, and website-owned data/RPC boundaries. Those systems are not owned by this bot repo.

A one-off live DB adjustment for a test/admin account occurred historically through direct administration. That is not a bot feature and must not be used as the design for Discord admin commands.

## 2026-08-10 — Internal API experiment

Commit `a44fbd6` added an Internal API client experiment. It proved the direction of removing direct bot/database coupling but also contained support lookup experiments that were not part of the required parity target.

## 2026-08-11 — Legacy archive

Commit `6dfe75f` froze the old implementation under `legacy/`. `docs/legacy-parity.md` records exact old behavior, history, and migration evidence.

## 2026-08-11 — Production rebuild

Commit `d7a7f4e` rebuilt active production code around the website Internal Integrations API.

Key architectural change:

```text
Old active model: bot -> Supabase RPC
Current model: bot -> signed Internal Integrations API -> website-owned data layer
```

The rebuilt bot no longer carries Supabase/Postgres credentials.

## 2026-08-17 — Admin scaling/security decisions

Initial accepted direction established:

- bot restricted to configured Cheater's Market server;
- major admin/mutation commands require explicitly whitelisted Discord user IDs;
- roles can be additive but cannot replace user whitelist;
- Aura adjustment desired before wallet adjustment;
- bot remains a thin Discord client with no direct DB mutation;
- mutation operations require narrow signed backend contracts, confirmation/idempotency and immutable audit evidence.

ADR-0005 later clarified that customer `cm aura` intentionally remains a message command while admin/staff operations use guild slash commands.

## 2026-08-17 — Repository governance

`TASK-WF-001` installed durable project memory, workflow, ADRs, audit, codebase/data maps, roadmap and handoff inside the repository.

## 2026-08-17 — Private admin console merged

`TASK-CM-ADMIN-001` implemented `/cm user email:<email>` with private Components V2 user/order navigation and canonical refund preview/confirm/execute safety.

After local Node verification (104/104 tests, typecheck, build and diff check), the feature fast-forwarded into `master` at:

```text
47a28323fdc2c2d18d1edc3f9952f0d817f481f1
```

No deployment, Discord registration or live production mutation was performed as part of the merge task.

## 2026-08-17 — `/cm` becomes guild-wide for whitelisted admins

The product owner removed the shared admin-console command-channel restriction while retaining the configured guild and explicit Discord user-ID whitelist.

ADR-0006 supersedes only the old admin-command-channel requirement from ADR-0004/ADR-0005:

- `/cm` may be invoked from any channel in configured guild by a whitelisted admin;
- DMs/wrong guild/non-whitelisted users remain blocked;
- ephemeral output remains private but is not treated as authorization;
- `BOT_ADMIN_COMMAND_CHANNEL_ID` is removed;
- `BOT_AUDIT_LOG_CHANNEL_ID` remains separate for mutation audit;
- `/refresh-leaderboard` keeps its independent configured channel policy.

Implementation work is isolated on `task/cm-admin-guild-scope` pending executable verification/merge.
