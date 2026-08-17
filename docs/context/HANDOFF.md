# Latest Handoff

Updated: 2026-08-17

## Current task

`TASK-WF-001` — install a repository-resident governance, context, decision, audit, and handoff system for the standalone Discord bot.

## Starting state

- GitHub repo: `Hermann-33/cm-discord-bot`
- default branch: `master`
- rebuild baseline: `d7a7f4e871d0e6822604fb844a6e93f03b8bf582`
- active production source under `src/`
- pre-rebuild bot frozen under `legacy/`
- existing historical audit: `docs/legacy-parity.md`
- current bot uses the Internal Integrations API rather than Supabase directly.

## Governance work established

The repository now has durable owners for:

- operating rules;
- product brief;
- active architecture;
- data/backend status;
- codebase map;
- command policy;
- roadmap;
- workflow;
- active context;
- audit history;
- project history;
- ADRs;
- admin mutation security model;
- latest handoff.

No application feature behavior is intentionally changed by this documentation task.

## Current engineering truth

- Current `cm aura` is still a message command.
- Current `/refresh-leaderboard` is a guild slash command.
- The current bot is read-only against the website API.
- The desired end state is all slash commands, configured-guild only.
- Major admin commands must require explicit whitelisted Discord user IDs.
- Aura mutation is desired first; wallet mutation follows later under stricter rules.
- The bot must never mutate Supabase/Postgres directly.

## External data verification

Read-only Supabase metadata verification on 2026-08-17 confirmed the underlying Aura read functions and existing `admin_adjust_aura_balance` function described in `DATA_STATUS.md`. This is dependency context only; the rebuilt bot does not call those functions directly.

## Known local-only artifact

A prior local audit reported `CM DC Bot.zip` as an untracked root file. It must remain uncommitted or be removed locally. GitHub's tracked repo does not need that archive.

## Exact next engineering action

Do **not** jump directly to Aura/wallet mutation.

Next technical work should start with Phase 2/3 planning and implementation:

1. migrate `cm aura` to a guild-only slash `/aura` command;
2. make runtime guild/DM guards explicit for all slash commands;
3. create reusable admin authorization based on `BOT_ADMIN_USER_IDS` plus admin command channel, with optional role gates;
4. keep all data access read-only during that phase;
5. then design/implement the website Internal API Aura preview/confirm contract before enabling live `/aura-adjust confirm`.

## Do-not-touch boundaries

- website repo without a separate scoped task;
- direct database credentials/access from this bot;
- `legacy/` archive/history;
- wallet mutation before Aura mutation is proven;
- real secret values;
- live Discord command registration without explicit authorization.