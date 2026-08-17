# Active Context

Updated: 2026-08-17

## Current state

The production bot was rebuilt on the Cheater's Market Internal Integrations API. The default branch is `master`; the rebuild baseline is commit `d7a7f4e871d0e6822604fb844a6e93f03b8bf582` (`Rebuild Discord bot on Internal Integrations API`). The pre-rebuild bot is archived under `legacy/`.

The current code is read-only with respect to Cheater's Market data. It does not use Supabase directly.

## Current implemented commands

- `cm aura` — message command, configured guild only, blocked in one configured channel.
- `/refresh-leaderboard` — guild slash command, configured command channel, staff permission checks.

## Accepted command direction

The desired end state is guild-only slash commands for all command surfaces. The current `cm aura` message command must eventually be replaced by a slash command such as `/aura` rather than treated as the final interface.

Major mutation commands must additionally require whitelisted Discord user IDs. Roles may be a secondary check, never the sole authorization mechanism.

## Current data/API posture

The bot currently calls only read operations through the Internal Integrations API:

- Aura leaderboard read
- Aura lookup read

No live admin mutation command is implemented or authorized.

## Future mutation scope

Desired eventual admin capabilities:

1. Aura adjustment — first mutation phase.
2. Wallet adjustment — later, stricter phase.

Both require preview/confirm, idempotency, caps, immutable audit evidence, dedicated backend operations, and strict guild/channel/user authorization. Direct DB mutation from the bot is prohibited.

## Verification facts

Repository source inspected for this governance task confirms:

- Node 22+ / TypeScript / discord.js rebuild;
- HMAC Internal API client;
- no current Supabase dependency in production source;
- dedicated read-operation boundary documented in the README;
- `legacy/` archive and `docs/legacy-parity.md` exist;
- test/typecheck/build scripts exist in `package.json`.

Live backend metadata verified on 2026-08-17 is summarized in `DATA_STATUS.md`.

## Known local checkout note

A prior local Codex audit reported the common checkout path as `C:\code\CM DC Bot` and an untracked `CM DC Bot.zip`. That ZIP is a local artifact and must never be committed. Repository-relative documentation does not depend on the local folder name.

## Do-not-touch boundaries

- website repo unless separately scoped;
- direct Supabase/Postgres access;
- `legacy/` history;
- real environment values/secrets;
- mutation command implementation before the backend contract is approved.

## Exact next engineering gate

Before implementing Aura/wallet mutation commands:

1. migrate command architecture toward guild-only slash commands;
2. establish reusable admin authorization based on explicit Discord user-ID allowlisting;
3. define/implement a narrow signed backend preview/confirm contract for Aura;
4. only then implement live Aura confirmation;
5. wallet follows in a later audited phase.