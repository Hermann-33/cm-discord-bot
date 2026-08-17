# Latest Handoff

Updated: 2026-08-17

## Current task

`TASK-AUDIT-001` — exhaustive re-baseline of the standalone Discord bot and the backend dependency facts that materially affect its next work.

Full report:

`../audits/2026-08-17-full-codebase-audit.md`

## Audited starting state

- GitHub repo: `Hermann-33/cm-discord-bot`
- branch: `master`
- audited starting head: `b86acf5a6e27ec69b187a2bacf94773faef81500`
- active source: root `src/`
- archived source: `legacy/`
- no open PRs;
- no GitHub workflow run/status on the audited head;
- only `master` returned by branch search.

## Audit coverage

Read in full:

- every active production TypeScript file;
- every test file listed by `npm test`;
- every tracked fixture;
- root package/env/build/ignore configuration;
- current governance/current-state docs needed for drift analysis.

Read-only live verification also covered relevant Supabase project health, current migrations, Aura/wallet internal integration adjustment functions, grants, wallet funding trigger path, RLS state and advisor output.

No bot runtime, Discord registration, website source or database mutation was executed.

## Current bot truth

- production bot has no direct DB access;
- API client exposes only leaderboard and Aura lookup reads;
- `cm aura` is still a message command and keeps Message Content intent required;
- `/refresh-leaderboard` is a guild slash command and **already has** an explicit runtime guild guard;
- safe allowed mentions are centralized;
- leaderboard is Components V2;
- scheduled/manual refreshes share one overlap lock;
- legacy is isolated by build/typecheck and architecture tests.

## Backend truth that changed since earlier planning

Live DB now has purpose-built internal-integration execute functions for both Aura and wallet balance adjustments.

They include:

- service-role-only execute among checked roles;
- operation-specific idempotency;
- request hash conflict detection;
- bounded deltas/reasons;
- target validation;
- external operator audit metadata;
- negative-balance protection;
- ledger/admin audit creation.

Wallet adjustment also participates in the wallet funding-state trigger machinery.

Therefore the old roadmap statement “backend balance-adjustment work does not exist” is stale.

## What is still NOT proven

Do not treat the DB functions as bot authorization.

Still requires separate website/API verification:

- exact HTTP mutation paths;
- preview/confirm contract;
- operation allowlist/scopes;
- bot credential mutation permission;
- selector/target resolution exposed by API;
- cap/expiry/state-binding rules;
- authenticated production HTTP smoke test.

Still absent from bot source:

- `/aura` slash replacement;
- `BOT_ADMIN_USER_IDS` authorization;
- admin/audit channels;
- Aura/wallet mutation client DTOs;
- preview/confirm commands;
- Discord mutation audit output.

## Major findings

### Bot/process

1. slash-only policy not yet complete;
2. no current-head CI/fresh execution evidence;
3. command registration is coupled to full secret-bearing runtime config;
4. generic logger is not universal secret/PII redaction;
5. Node types/runtime floor are not aligned;
6. local ZIP accidental-stage defense is weak;
7. several low-severity defensive/test gaps are documented in the full audit.

### Upstream

Supabase security advisor still reports unrelated public/signed-in `SECURITY DEFINER` functions. This belongs to website/database hardening and remains visible because the bot depends on that backend.

## Verification gate status

Static/source audit: complete.

Live DB metadata audit: complete for documented facts.

Fresh execution in this audit: unavailable.

Do **not** claim the following currently pass until executed in a real checkout/CI:

```text
npm test
npm run typecheck
npm run build
npm audit
```

## Exact next engineering action

Recommended order:

1. add CI or otherwise execute/record test + typecheck + build on current head;
2. migrate `cm aura` to guild-only `/aura` and remove unnecessary message intents;
3. implement reusable admin authorization requiring explicit Discord user-ID whitelist + guild + admin channel, with tests and no mutation yet;
4. separately verify the website Internal Integrations API HTTP contract/scope for `users.aura.adjust`;
5. implement Aura preview/confirm client/command flow using stable idempotency;
6. live-test Aura on a controlled test account;
7. only then proceed to wallet command integration.

## Do-not-touch boundaries

- no direct Supabase/Postgres client in bot;
- no direct calls from bot to DB admin/internal functions;
- no wallet command before Aura path is proven;
- no role-only mutation authorization;
- no global or DM mutation commands;
- no `legacy/` edits during active feature work;
- no real secret values in repo/docs/logs.