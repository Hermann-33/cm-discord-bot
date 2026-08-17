# Full Codebase and Dependency Audit — 2026-08-17

Audit ID: `TASK-AUDIT-001`

Repository: `Hermann-33/cm-discord-bot`

Audited branch: `master`

Audited starting commit: `b86acf5a6e27ec69b187a2bacf94773faef81500`

Audit type: exhaustive static/source/test/configuration/GitHub-governance review plus read-only verification of the live Supabase dependency metadata relevant to this bot.

## 1. Executive verdict

### Bot source verdict

No critical or high-severity vulnerability was found in the active bot source. The current production bot is small, strongly bounded, read-only with respect to Cheater's Market business data, uses a dedicated HMAC-authenticated website API instead of a database credential, validates external input/output, suppresses Discord mentions, and has meaningful automated tests.

### Overall workflow verdict

`PARTIAL`

Reason: the source and dependency metadata audit is complete, but this audit environment could not execute the private checkout. The current GitHub head has no CI status or workflow run. Therefore `npm test`, `npm run typecheck`, `npm run build`, and `npm audit` are **not freshly verified by this audit** and must not be reported as passing on the basis of source inspection alone.

The audit also found material upstream/backend changes that make the previous roadmap stale: live Aura and wallet internal-integration adjustment primitives now exist in Supabase. The bot does not expose or consume them yet.

## 2. Scope

Audited exhaustively:

- every active production TypeScript file under `src/`;
- every test file listed by the root `npm test` script;
- every checked-in test fixture;
- root package/runtime/build configuration;
- environment-variable validation and secret boundaries;
- Discord intents, handlers, registration, permissions and mention safety;
- Internal Integrations API signing, transport, error and schema behavior;
- leaderboard rendering, persistence, scheduling and shutdown behavior;
- logger behavior and tested redaction properties;
- legacy/current isolation;
- Git branch/PR/workflow status visible to the GitHub integration;
- current repository governance/documentation drift;
- live Supabase project health, relevant migrations, relevant function definitions/grants, RLS state and security/performance advisor output.

Not audited as source code in this task:

- the Cheater's Market website repository;
- website Internal Integrations API route implementation;
- payment/order/delivery/OAuth/Support-role implementation source;
- host/Pterodactyl configuration not tracked in this repository;
- live Discord execution or command registration;
- production HTTP calls using real bot credentials.

Those are explicit boundaries, not assumed passes.

## 3. Repository snapshot

Verified repository facts:

- repository is private;
- default branch is `master`;
- repository branch search returned only `master`;
- no open pull requests were present;
- no GitHub Actions workflow run/status was attached to the audited head;
- no `.github` workflow tree was present in the tracked repository;
- branch-protection metadata could not be read through the installed GitHub integration and is therefore **unverified**, not assumed absent;
- pre-rebuild source remains under `legacy/`;
- current production source is under root `src/`.

Recent history relevant to architecture:

- `b3206c6` — initial Discord bot implementation;
- `31ca167` — leaderboard rendering/channel-policy update;
- `a44fbd6` — website Internal API experiment;
- `6dfe75f` — archive legacy Discord bot;
- `d7a7f4e` — rebuild bot on Internal Integrations API;
- `b86acf5` — repository governance/context system.

No later bot-code commit was present at audit start.

## 4. Active runtime inventory

Root package:

- `cm-discord-bot` v2.0.0;
- Node engine `>=22.0.0`;
- CommonJS package;
- TypeScript source compiled to `dist/`;
- root `index.js` host shim requires `./dist/index.js`.

Direct runtime dependencies are exactly pinned in `package.json`:

- `discord.js` 14.27.0;
- `dotenv` 17.4.2;
- `zod` 4.4.3.

Development dependencies:

- `@types/node` 25.9.1;
- `tsx` 4.22.3;
- `typescript` 6.0.3.

The audit did not run a package-registry vulnerability scan. A lockfile exists, but dependency vulnerability status is **unverified** until `npm audit` or an equivalent approved scan is executed.

## 5. Production source coverage

Every active source file was read in full:

### Composition

- `src/index.ts`

### Internal API

- `src/api/client.ts`
- `src/api/errors.ts`
- `src/api/schemas.ts`
- `src/api/signing.ts`

### Commands

- `src/commands/aura.ts`
- `src/commands/refreshLeaderboard.ts`

### Configuration

- `src/config/env.ts`

### Discord

- `src/discord/client.ts`
- `src/discord/registerCommands.ts`
- `src/discord/safeMessages.ts`

### Leaderboard

- `src/leaderboard/format.ts`
- `src/leaderboard/service.ts`
- `src/leaderboard/types.ts`

### Logging

- `src/logger/index.ts`

### Scheduler

- `src/scheduler/leaderboardSchedule.ts`
- `src/scheduler/shutdown.ts`

No active source file was omitted.

## 6. Architecture and data-boundary audit

### PASS — no direct database coupling

The active bot has no Supabase package, no Supabase environment variable, no Postgres client and no database fallback.

`tests/architecture.test.ts` also enforces that the active source and root dependencies do not reintroduce `@supabase/supabase-js` or `SUPABASE_`.

Current data path:

```text
Discord
  -> standalone CM Discord bot
  -> HMAC-authenticated HTTPS
  -> Cheater's Market Internal Integrations API
  -> website-owned business/data layer
  -> Supabase/Postgres
```

This boundary is materially safer than the archived direct-service-role design.

### PASS — legacy is excluded

- root typecheck excludes `legacy`;
- production build excludes `legacy`;
- architecture test scans active source for imports/execution of the archive;
- current source contains no legacy import.

`legacy/` remains historical evidence only.

## 7. Internal API signing audit

`src/api/signing.ts` constructs an eight-line canonical request containing:

1. signature version;
2. client ID;
3. key ID;
4. timestamp;
5. nonce;
6. uppercase method;
7. pathname;
8. SHA-256 hash of raw body.

The canonical request is signed with HMAC-SHA256.

Headers emitted are limited to:

- `Content-Type: application/json`;
- `X-CM-Client-Id`;
- `X-CM-Key-Id`;
- `X-CM-Timestamp`;
- `X-CM-Nonce`;
- `X-CM-Signature`.

### PASS

The signing tests contain a fixed authoritative vector and verify that path, method, body, timestamp, nonce, client identity and key identity changes invalidate the signature.

No signing weakness was found in bot source.

## 8. Internal API transport audit

Current production paths are only:

- `POST /api/internal/integrations/v1/aura/leaderboards`;
- `POST /api/internal/integrations/v1/aura/lookup`.

Transport controls:

- strict request validation before fetch;
- configured HTTPS origin only;
- fresh timestamp/nonce/signature per attempt;
- AbortController timeout;
- timeout range 1–15 seconds;
- maximum response body 64 KiB;
- size enforced using both `Content-Length` fast rejection and streamed byte count;
- JSON content-type requirement;
- JSON parse failure rejected;
- strict response schema validation;
- server error text is not trusted or exposed;
- stable code/status pairing validation;
- one retry for HTTP 503;
- one retry for transport failure;
- no retry for normal stable API errors;
- no retry for 502/504 by current policy.

### PASS for current read-only operations

The current retry model is appropriate for idempotent reads.

### Future mutation constraint

Do **not** blindly reuse read retry semantics for mutation calls. A mutation client must send one stable idempotency key/request identity across retries and must rely on backend idempotency. A retry must not create a new logical adjustment.

## 9. API schema audit

Schemas are strict and reject extra fields.

Read limits:

- leaderboard request limit 1–10;
- response at most 20 rows;
- leaderboard type limited to `lifetime|available`;
- rank positive integer;
- Aura values non-negative integers;
- display names length 1–100;
- lookup selector fixed to Discord external identity;
- API request IDs must be UUIDs;
- update timestamps require offset-aware datetime strings.

### LOW — permissive Discord ID length

Discord IDs are validated as 5–32 decimal digits. This is intentionally generic but broader than normal Discord snowflake length. It does not create a direct authorization bypass because the backend owns identity resolution, but a future slash-command refactor can use a more exact Discord-native ID contract if desired.

### LOW — JavaScript numeric precision is not explicitly bounded

Read DTOs use JavaScript `number` integers without `Number.isSafeInteger`/max bounds. Current business amounts are expected far below the safe-integer ceiling and live adjustment functions have explicit caps, so no current defect was observed. Future high-value mutation DTOs must retain explicit numeric caps.

## 10. Environment/configuration audit

`src/config/env.ts` validates all current runtime configuration with Zod.

Positive findings:

- required strings are trimmed;
- Discord identifiers are numeric;
- API origin must be HTTPS origin-only with no credentials/path/query/hash;
- integration IDs follow a narrow identifier regex;
- HMAC secret must be canonical standard Base64 and decode to at least 32 bytes;
- invalid configuration reports variable names, not secret values;
- leaderboard message ID is the only intentionally optional snowflake;
- timeout has a bounded default.

### MEDIUM-LOW — command registration is coupled to full production config

`src/discord/registerCommands.ts` calls the same `loadConfig()` as the runtime. As a result, merely registering Discord commands requires valid Internal API HMAC configuration and unrelated leaderboard/channel variables.

This is not a runtime vulnerability, but it violates least-secret operational design: command registration should ideally require only the Discord token/client/guild plus command-specific configuration.

Recommended later fix: introduce a registration-specific config loader or dependency-injected registration function.

## 11. Discord client and intent audit

Current intents:

- `Guilds`;
- `GuildMessages`;
- privileged `MessageContent`.

`MessageContent` exists solely because `cm aura` remains a message command.

### MEDIUM — accepted slash-only architecture not yet implemented

ADR-0003 requires all command surfaces to converge on guild-only slash commands. `cm aura` is therefore known migration debt.

Impact:

- privileged Message Content intent remains necessary;
- the client receives message content it should no longer need after migration;
- command dispatch is split between `MessageCreate` and `InteractionCreate`.

This is not a current privilege bypass: the message command has explicit guild and blocked-channel guards. The correct remediation is `/aura` migration, then removal of `GuildMessages`/`MessageContent` if no other feature requires them.

## 12. `cm aura` command audit

Positive findings:

- exact normalized trigger only;
- bot-authored messages ignored;
- DMs/wrong guild return before backend access;
- configured blocked channel returns before backend access;
- lookup uses invoking Discord user ID;
- API-provided display name is sanitized;
- `@` mention injection is neutralized;
- Discord markdown is escaped;
- allowed mentions are disabled;
- not-found and service failures return safe messages;
- errors are logged through sanitized local error handling.

Tests explicitly prove zero backend calls for bot messages, DMs, wrong guild and blocked channel.

### UX note

A resolved account with `aura: null` is intentionally mapped to the generic unavailable response to preserve legacy behavior. This is not a security defect but may be revisited during `/aura` migration.

## 13. `/refresh-leaderboard` audit

Positive findings:

- command is built as a slash command;
- default Discord permission is `ManageGuild`;
- runtime handler explicitly rejects wrong guild;
- exact command channel required;
- runtime accepts `ManageGuild` or `Administrator`;
- missing leaderboard message ID rejected;
- responses are ephemeral;
- safe allowed mentions used for initial replies;
- manual refresh shares the same service lock as scheduled refresh;
- failures are sanitized.

The current implementation already contains the explicit runtime guild guard; older wording suggesting it still needed to be added was documentation drift.

### Future rule

Do not copy the `ManageGuild|Administrator` model to money/Aura mutation commands. ADR-0004 requires explicit Discord user-ID allowlisting for high-impact mutations.

## 14. Command registration audit

Registration uses:

`Routes.applicationGuildCommands(clientId, guildId)`

with `REST.put`, so it is a guild-scoped bulk overwrite and cannot create a global command through the current code path.

Startup does not automatically register commands.

### LOW — registration test is too shallow

The existing registration test freezes `buildRefreshLeaderboardCommand()` JSON but does not execute an injectable registration function and does not assert the REST route/body.

Recommendation: refactor command registration into a testable function and assert the exact guild route and complete command list, especially before adding admin commands.

## 15. Discord message-safety audit

`safeAllowedMentions` is centralized:

```text
parse: []
users: []
roles: []
repliedUser: false
```

Leaderboard create/edit wrappers always inject it.

Aura replies also use it.

Display names normalize whitespace, truncate, escape Discord markdown and neutralize `@`.

### PASS

No mention-injection path was found in current command or leaderboard output.

### LOW — helper lacks a focused channel-shape test

`fetchLeaderboardChannel()` validates text-based/send/message-fetch capabilities, but there is no dedicated test for wrong channel shapes/fetch failures. Service tests exercise the happy path.

## 16. Leaderboard formatting audit

Current presentation matches the accepted Components V2 design:

- one persistent message;
- global custom Aura emoji;
- lifetime board then available board;
- top ten per board;
- API rank preserved, not recomputed;
- width-2 rank code label;
- width-9 minimum Aura code label;
- medal suffix for ranks 1–3;
- first row `###` emphasis;
- privacy-aware API display name followed by bot sanitization;
- relative Discord timestamp;
- edit payload clears legacy `content`/`embeds`;
- `MessageFlags.IsComponentsV2` preserved.

Fixture tests freeze populated and empty payloads.

### PASS

No formatting regression or injection issue was found.

## 17. Leaderboard service audit

`LeaderboardService`:

- fetches data through the read client;
- creates initial message in bootstrap mode;
- edits only the configured message ID during normal refresh;
- never creates a replacement on ordinary edit failure;
- uses safe create/edit wrappers;
- holds one in-memory `isRefreshing` overlap lock;
- always releases the lock in `finally`.

Tests verify safe mentions, exact message ID edit, overlap behavior and lock release after failure.

### LOW — message-ID invariant is asserted by cast, not encoded in type

`refreshNow()` casts `discordLeaderboardMessageId as string`. Current schedule/command flow prevents normal calls without an ID, but the service itself does not encode this precondition. A future refactor should prefer a constructor invariant or explicit guard.

## 18. Scheduler audit

Behavior:

- no configured message -> one bootstrap create and no interval;
- configured message -> immediate startup refresh;
- interval begins only after successful startup refresh;
- fixed five-minute interval;
- scheduled failures are nonfatal;
- manual/scheduled/startup refreshes share the service lock;
- stop clears the interval.

Tests cover all of those behaviors.

### LOW — `start()` is not idempotent

Calling `LeaderboardSchedule.start()` repeatedly can install multiple intervals. Current production wiring uses `discordClient.once(Events.ClientReady)`, so there is no normal reachable double-start path today.

Recommended defensive improvement: track started/stopped state and reject/ignore duplicate starts.

## 19. Shutdown/process lifecycle audit

Positive findings:

- SIGINT and SIGTERM use one-shot handlers;
- shutdown is idempotent;
- interval is stopped;
- Discord client is destroyed;
- exit code is controlled by caller.

### LOW now / important before mutations — no in-flight drain

Shutdown does not await an active leaderboard/API operation. For the current read-only bot that is tolerable. Before mutation commands exist, graceful shutdown should ensure an in-progress confirmation request cannot be abandoned in an ambiguous local state; backend idempotency remains the primary correctness guarantee.

### LOW — no top-level `uncaughtException`/`unhandledRejection` policy

Known asynchronous handlers are locally caught. There is no explicit process-level last-resort policy. This is a resilience/observability improvement, not evidence of a current unhandled path.

## 20. Logger and secret-handling audit

Logger behavior:

- JSON lines;
- fixed level/time/event/meta shape;
- control whitespace collapsed;
- string meta bounded to 240 characters;
- `sanitizeError()` emits only error name and normalized message;
- API client errors intentionally replace server detail with safe local messages.

Tests prove that API secret, signature, nonce, Discord lookup selector, raw lookup body and server-provided sensitive detail are not emitted in the exercised API-error logging path.

### LOW current / MEDIUM before mutations — generic error sanitizer is not a universal secret scrubber

`sanitizeError()` does not pattern-redact arbitrary tokens, Discord IDs, emails or HMAC material if some future library places them directly into `Error.message`.

Current bot code avoids constructing such error messages, so no current leak was found.

Before admin mutation/user lookup expands, add defense-in-depth redaction for known credential/header patterns and keep user/target identifiers out of generic exception messages.

## 21. TypeScript/build configuration audit

`tsconfig.json`:

- `strict: true`;
- ES2022 target;
- Node16 module/module resolution;
- no emit for typecheck;
- force consistent casing;
- legacy excluded.

`tsconfig.build.json`:

- emits only `src`;
- output `dist`;
- source maps enabled;
- tests/legacy excluded.

### MEDIUM-LOW — Node runtime/type-definition skew

The package promises Node `>=22` while development types are `@types/node` 25.9.1. That can permit code to typecheck against Node 25 APIs that are unavailable on a Node 22 production host.

No current source usage of an unavailable API was found. Align the type major with the supported production runtime, or intentionally raise/document the runtime floor.

## 22. Test-suite audit

Every test file referenced by `npm test` was inspected:

- API signing vector and tamper cases;
- API client request/response/error/retry/timeout/size behavior;
- config validation and secret-safe errors;
- Aura command guards/output/injection handling;
- refresh command authorization/failure behavior;
- Discord command JSON fixture;
- leaderboard formatting fixtures;
- leaderboard service message/lock behavior;
- scheduler startup/failure/stop behavior;
- shutdown idempotence;
- logger redaction;
- architecture-boundary scans.

### Strong coverage

The tests are not superficial. They directly check several security invariants, including no backend call before Aura command guards, no direct DB dependency, response strictness, mention suppression, API signing, retry material freshness and log secret exclusion.

### Coverage gaps

1. command registration REST route/body is not directly tested;
2. `safeMessages` wrong-channel/error paths lack focused tests;
3. scheduler double-start behavior is not tested;
4. no end-to-end test covers `src/index.ts` event wiring;
5. architecture DB-client guard is string-based and cannot prove that every possible future database library is absent;
6. no mutation-command tests exist because mutation commands do not exist yet;
7. no fresh runtime test/build result is available from this audit environment.

## 23. GitHub/CI/governance audit

Observed:

- private repository;
- only `master` returned by branch search;
- no open pull requests;
- no GitHub Actions workflow runs on the audited head;
- no `.github` workflow in tracked tree;
- commit status list empty;
- branch-protection endpoint not readable by installed integration.

### MEDIUM — no automated current-head verification evidence

The repository has a real test suite but no repository-local CI to prove every pushed commit passes it.

Recommended:

- add GitHub Actions for `npm ci`, `npm test`, `npm run typecheck`, `npm run build`, and `git diff --check`/equivalent;
- add dependency audit policy separately;
- require the checks through branch protection if repository policy allows;
- keep deployment/Discord registration separate from CI.

Branch protection must be verified through an account/tool that can read repository rules before claiming it is configured.

## 24. Repository hygiene audit

`.gitignore` correctly ignores:

- `.env` and `.env.*` except `.env.example`;
- `node_modules`;
- `dist`;
- logs;
- common temporary/OS files.

### LOW — archives are not ignored

A prior local audit found `CM DC Bot.zip` untracked. `.gitignore` does not contain `*.zip`.

No ZIP is tracked in GitHub, but this remains an accidental-stage risk. Either remove local deployment archives from the repo working directory or explicitly ignore archive patterns according to project policy.

## 25. Deployment/operations audit

Repository documents:

- Node 22+ long-running process;
- `dist/index.js` startup;
- root hosting shim;
- leaderboard bootstrap procedure;
- manual guild command registration;
- structured log collection expectation.

Not tracked/verified:

- Pterodactyl/BOHosting startup configuration;
- automatic restart policy;
- health check;
- metrics/alerting;
- secret rotation automation;
- deployment pipeline;
- rollback automation.

### MEDIUM-LOW operational reproducibility gap

The application is deployable, but host configuration remains external state. A production runbook should record the exact host start command, Node version, required intents/permissions, secret rotation procedure and rollback steps without recording secret values.

## 26. Legacy archive audit

The archived implementation is intentionally not treated as active production code.

Controls verified:

- excluded by build/typecheck;
- prohibited by architecture test;
- detailed behavioral evidence retained in `docs/legacy-parity.md`;
- no active import into `src`.

### PASS

Do not clean, modernize or delete legacy files during normal bot work; they are restoration/audit evidence.

## 27. Live backend dependency re-baseline

Read-only Supabase verification was performed because the bot depends indirectly on the website-owned backend.

Project:

- ref `gcqbayehikvbwvvseyoc`;
- name `Cheater's Market`;
- region `us-east-1`;
- status `ACTIVE_HEALTHY`;
- Postgres 17.6.1.063.

Current migration ledger returned by Supabase includes:

- `20260810024630 add_internal_discord_bot_api_nonce_guard`;
- `20260812104228 add_internal_integration_balance_adjustments`;
- `20260814044248 add_internal_integration_order_refund_execute`;
- `20260815052426 add_internal_integration_purchase_processing_outbox`;
- `20260816050802 add_daily_drop`;
- `20260816050858 tighten_daily_drop_spins_grants`;
- `20260816051116 add_daily_drop_foreign_key_indexes`;
- `20260816064702 list_active_daily_drop_coupons`.

The previous bot docs were stale because they predated the balance-adjustment migration.

## 28. Live Aura adjustment foundation

Verified function:

`public.internal_integration_adjust_aura_balance(text, uuid, text, uuid, bigint, text, jsonb)`

Properties:

- `SECURITY DEFINER`;
- empty `search_path`;
- `anon`: no execute;
- `authenticated`: no execute;
- `service_role`: execute;
- operation ID `users.aura.adjust`;
- validates client identity format;
- requires UUID idempotency key;
- requires 64-hex request hash;
- non-zero Aura delta;
- delta bounded to +/-1,000,000,000 Aura;
- reason length 1–500;
- optional external operator object has a strict shape;
- transaction-level advisory lock on client/operation/idempotency identity;
- persistent idempotency replay/conflict behavior;
- target existence validation;
- calls the existing admin Aura adjustment primitive;
- below-zero result mapped to `insufficient_balance`;
- validates transaction/audit IDs before success;
- augments the admin audit event with integration/client/operator metadata.

This is a strong **execute primitive**, not proof that an HTTP bot-facing mutation endpoint, preview lifecycle, user whitelist, command caps or bot credential permission is deployed.

## 29. Live wallet adjustment foundation

Verified function:

`public.internal_integration_adjust_wallet_balance(text, uuid, text, uuid, integer, text, jsonb)`

Properties:

- same service-role-only grant posture;
- empty `search_path`;
- operation ID `users.wallet.adjust`;
- idempotency/request-hash/operator validation;
- delta bounded to +/-100,000,000 cents;
- reason length 1–500;
- rejects negative resulting wallet balance;
- calls `admin_adjust_wallet_balance`;
- validates wallet transaction/audit IDs;
- augments integration/operator audit metadata;
- persists idempotent result.

`admin_adjust_wallet_balance`:

- creates/locks wallet balance row;
- preserves/evaluates currency;
- rejects negative resulting balance;
- updates balance;
- inserts `wallet_transactions` with type `admin_adjustment`;
- inserts `admin_user_operation_events` with before/after metadata.

A verified `AFTER INSERT` trigger on `wallet_transactions` calls `handle_wallet_transaction_funding_state()`, which routes positive transactions to funding-lot sync and negative transactions to funding-consumption sync.

Therefore the backend already has meaningful wallet ledger/funding-state mechanics for an admin adjustment. The bot still must not bypass the website Internal Integrations API.

## 30. Relevant live DB access posture

Verified for all four adjustment primitives checked:

- `admin_adjust_aura_balance`;
- `admin_adjust_wallet_balance`;
- `internal_integration_adjust_aura_balance`;
- `internal_integration_adjust_wallet_balance`.

Role execute matrix:

- `anon`: false;
- `authenticated`: false;
- `service_role`: true.

Relevant tables including Aura/wallet/audit/idempotency/Discord privacy tables have RLS enabled.

`internal_integration_idempotency` stores:

- client ID;
- operation ID;
- idempotency UUID;
- request hash;
- response result;
- creation timestamp.

## 31. Upstream security advisor findings

Supabase security advisor still reports warnings outside this bot repository.

### HIGH upstream/backend risk — publicly executable privileged functions remain

Advisor output reports `SECURITY DEFINER` functions executable by `anon` and/or `authenticated`, including examples such as:

- `complete_product_delivery_generation(...)`;
- `handle_aura_redemption_wallet_funding_link()`;
- `handle_wallet_transaction_funding_state()`;
- `purchase_product_with_wallet_delivery(...)`;
- `sync_order_payment_provider_from_purchase_intent()`.

This is not a direct bot-code vulnerability because the rebuilt bot has no Supabase credential/path. It is nevertheless a serious website/database hardening item and should remain visible before highly privileged integration scope expands.

The newly verified internal Aura/wallet adjustment functions themselves are **not** exposed to anon/authenticated among the roles checked.

### Other advisor context

- many service-only tables report RLS enabled with no browser policies; that is consistent with the existing service-only design and is informational rather than automatically defective;
- several unrelated helper functions report mutable `search_path` warnings;
- Auth leaked-password protection is reported disabled;
- performance advisor reports unindexed foreign keys, per-row auth RLS init-plan opportunities and many currently unused indexes.

These belong to website/backend ownership and must not be “fixed” from the bot repository.

## 32. Mutation readiness re-assessment

Previous roadmap assumption:

> balance-adjustment backend work does not exist yet.

That assumption is obsolete.

Current verified state:

### Already implemented upstream

- database-level internal integration Aura execute primitive;
- database-level internal integration wallet execute primitive;
- service-role-only grants;
- persistent idempotency;
- request hash conflicts;
- integration/operator audit metadata;
- negative-balance protection;
- Aura ledger/admin audit;
- wallet ledger/admin audit;
- wallet funding-state trigger path.

### Still not implemented/verified in this bot

- `/aura` slash replacement;
- reusable whitelist authorization;
- admin channel/audit channel config;
- `/aura-adjust preview|confirm`;
- `/wallet-adjust preview|confirm`;
- mutation request/response schemas/client methods;
- mutation-specific retry/idempotency behavior in bot client;
- Discord audit messages;
- admin limits/caps configuration.

### Still not verified in the website HTTP layer

- exact HTTP paths for Aura/wallet adjustments;
- whether preview endpoints exist;
- operation IDs/scopes exposed through the Internal Integrations API;
- whether the bot-dedicated credential is permitted those operations;
- target selector contract available to the bot;
- daily/single cap enforcement at HTTP/business layer;
- preview expiry/state binding;
- production authenticated HTTP smoke result.

Do not infer those from the database functions.

## 33. Findings by severity

### Critical

None found in active bot source.

### High

- **UPSTREAM-H01:** live Supabase advisor still reports public/signed-in execution of several unrelated `SECURITY DEFINER` functions. Owner: website/database project.

### Medium

- **BOT-M01:** accepted all-slash architecture is not complete; `cm aura` still requires privileged Message Content intent.
- **BOT-M02:** no CI/workflow/current-head execution evidence; fresh tests/typecheck/build/audit are unverified.
- **BOT-M03:** command-registration script requires the complete runtime config including Internal API HMAC material.
- **OPS-M04:** deployment/host configuration is external and not reproducibly versioned; branch-protection state is also unverified through the current integration.

### Medium before mutation / Low current

- **BOT-ML01:** generic `sanitizeError()` is not a universal secret/PII redactor.
- **BOT-ML02:** Node `>=22` runtime contract and `@types/node` 25.x can drift.

### Low

- **BOT-L01:** `.gitignore` does not ignore ZIP archives despite known local archive history.
- **BOT-L02:** scheduler `start()` is not idempotent, although current `.once(ClientReady)` wiring prevents normal double start.
- **BOT-L03:** shutdown does not drain in-flight operations.
- **BOT-L04:** command registration route/body lacks a direct test.
- **BOT-L05:** `safeMessages` wrong-channel/failure behavior lacks focused tests.
- **BOT-L06:** Discord ID regex is broader than normal snowflake size.
- **BOT-L07:** read amount schemas do not explicitly enforce JS safe-integer maximum.
- **BOT-L08:** no explicit process-level unhandled-exception/rejection policy.
- **BOT-L09:** `LeaderboardService` message-ID precondition is encoded through an `as string` cast rather than a type/runtime invariant.

## 34. Recommended remediation order

### P0 — external owner

1. Website/database team audits and hardens the advisor-reported public `SECURITY DEFINER` functions.

### P1 — bot architecture / verification

2. Add repository CI for test/typecheck/build and dependency scanning policy.
3. Migrate `cm aura` to guild-only `/aura`.
4. Remove Message Content/GuildMessages intents if no feature still requires them.
5. Implement reusable explicit Discord-user-ID whitelist authorization and admin channel guard before any mutation command.
6. Separately verify the website HTTP Internal Integrations API mutation endpoints/operation allowlist and bot credential scope; do not infer them from DB functions.

### P2 — mutation readiness

7. Add typed mutation client/schema paths using stable idempotency keys across retries.
8. Add backend-authoritative preview/confirm or equivalent safe confirmation contract before live adjustment commands.
9. Add Discord audit-channel output and tests.
10. Prove Aura adjustment end-to-end on a test account before wallet command work.

### P2 — engineering hardening

11. decouple command-registration config from Internal API secrets;
12. add defense-in-depth logger redaction;
13. align Node type definitions with supported runtime;
14. make registration and safe-message helpers directly testable.

### P3

15. ignore/remove local archives;
16. make scheduler start idempotent;
17. encode message-ID precondition;
18. consider graceful drain and top-level process error policy.

## 35. Completion evidence and limitations

Verified by direct source inspection:

- all active source files;
- all listed tests and fixtures;
- package/build/env configuration;
- current Git history/branch/PR/workflow state visible to GitHub integration;
- live Supabase metadata/functions/grants/advisors relevant to the bot boundary.

Not freshly executed:

```text
npm test
npm run typecheck
npm run build
npm audit
git diff --check on a local checkout
```

There is no CI result at the audited head to substitute for those execution gates.

No live Discord action, command registration, production API call or DB mutation was performed.

## 36. Final audit conclusion

The rebuilt bot is materially better isolated and safer than the archived implementation. Its active data path is narrow, signed, read-only and test-oriented. No direct database access, secret logging path, mention injection or guild bypass was found in current source.

The largest changes since the previous bot planning context are upstream: the database now contains purpose-built, idempotent, audited Aura and wallet internal-integration adjustment primitives. This removes a major backend foundation blocker, but it does **not** authorize the bot to mutate balances yet. The bot still lacks the accepted slash-only command architecture, whitelist control plane, mutation client/DTOs, preview/confirm workflow and verified HTTP/API credential scope.

The next bot work should therefore be architecture/authorization convergence and HTTP-contract verification—not direct database access and not a one-step wallet/Aura command.