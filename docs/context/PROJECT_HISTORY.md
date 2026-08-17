# Project History

Updated: 2026-08-17

This file preserves the important chronology without making historical architecture authoritative over current source.

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

The rebuilt bot no longer carries Supabase/Postgres credentials. The dedicated API credential is read-only for Aura leaderboard and Aura lookup.

## 2026-08-17 — Admin scaling decisions

Accepted future product/security decisions:

- the bot should be restricted to the configured Cheater's Market server;
- all command surfaces should converge on slash commands;
- major admin/mutation commands must require explicitly whitelisted Discord user IDs;
- role checks can be additive but cannot replace the user whitelist;
- Aura adjustment is the first desired mutation feature;
- wallet adjustment is desired later and carries stricter ledger/cap/confirmation requirements;
- bot code must remain a thin Discord client and must not directly mutate database tables/functions;
- mutation operations require a narrow signed backend preview/confirm contract with idempotency and immutable audit evidence.

## 2026-08-17 — Repository governance

`TASK-WF-001` installs durable project memory, workflow, ADRs, audit, codebase/data maps, roadmap, and handoff inside the repo so future work no longer depends on conversation transcripts.