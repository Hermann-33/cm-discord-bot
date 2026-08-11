# Legacy archive and parity audit

Audit date: 2026-08-11 (Australia/Sydney)

This document is the durable behavioral baseline for rebuilding the standalone Cheater's Market Discord bot. It records source behavior, relevant Git history, direct database dependencies, and the current website-owned Internal Integrations API boundary. It does not start the new implementation.

## Evidence and confidence

Primary evidence:

- Local `master` at `a44fbd670baa08f9beffedfe20aab13fbf7fed70`, clean before archival.
- The complete tracked tree at that commit, now under `legacy/`.
- The complete tree at parent commit `fa2dc77ba9f631e2010cde87d171d34f9f439d6a`.
- The full five-commit local history and the patch for the May 29 rendering update.
- GitHub repository metadata and the remote comparison of `fa2dc77` to `a44fbd6`.
- The production-verified website contract in `docs/integrations/internal-integrations-api.md` from the website repository.
- Checked-in website migration `20260528_add_discord_leaderboard_privacy_preferences.sql` for the legacy RPC calculations.
- The referenced Internal API audit task, used as corroboration rather than as a substitute for source.

No live database query was needed. No secret values were inspected or copied. The website documentation says production is enabled and all four read operations and selectors are HTTP-verified; that operational state is user-provided plus website-documented evidence, not independently re-tested by this audit.

## Archive summary

Moved under `legacy/`:

- `.env.example`
- `README.md` as `README.original.md` so this archive notice can occupy `legacy/README.md`
- `index.js`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- all of `src/`, including commands, configuration, Discord helpers, Internal API experiment, leaderboard code, logger, and tests
- ignored local `dist/` and `node_modules/` directories as generated archival artifacts

Left at the root:

- `.git/`: repository history and metadata must remain at the root.
- `.gitignore`: general secret, dependency, build, log, OS, and temporary-file protection applies equally to the archive and future bot.
- `docs/`: rebuild documentation belongs to the future root project rather than to executable legacy code.

There was no `.github/`, workflow, deployment configuration, `AGENTS.md`, Dockerfile, Procfile, or real `.env` in the working tree. The ignored directories are not part of the Git archive and can be reproduced from the tracked lockfile.

## Git baseline

| Item | Value |
| --- | --- |
| Repository | `Hermann-33/cm-discord-bot` |
| Default/local branch | `master` |
| Starting commit | `a44fbd670baa08f9beffedfe20aab13fbf7fed70` |
| Pre-experiment commit | `fa2dc77ba9f631e2010cde87d171d34f9f439d6a` |
| Starting worktree/index | Clean; matched `origin/master` |
| Remote default branch | GitHub reports `master` |
| History policy | Existing history preserved; no rewrite, commit, or push |

History has five commits. `b3206c6` introduced the bot. `31ca167` changed the public leaderboard from two traditional embeds to Components V2, changed `cm aura` from command-channel-only to configured-guild-wide except one blocked channel, and changed Aura output from plain text to the current embed. `a4af8c4` and `fa2dc77` only changed the minimal README. `a44fbd6` is the one-commit Internal API experiment.

For rebuild parity, "original bot behavior" means the observable state at `fa2dc77`, immediately before the experiment. The superseded `b3206c6` rendering is historical evidence, not the default parity target.

## Runtime and startup inventory

| Concern | Behavior at `fa2dc77` | `a44fbd6` state/classification |
| --- | --- | --- |
| Runtime | Node.js CommonJS package; TypeScript targets ES2022 with Node16 modules; `index.js` requires `dist/index.js` | Shared |
| Discord library | `discord.js` declared `^14.26.4`, lockfile resolved `14.26.4`; REST API version `10` | Shared |
| Intents | `Guilds`, `GuildMessages`, `MessageContent` | Shared |
| Partials | None | Shared |
| Config | Loads `dotenv/config`, then Zod-validates required environment before client creation | API experiment makes Supabase conditional and adds API validation |
| Startup log | JSON log event `bot starting` | Shared |
| Config failure | JSON error event `configuration validation failed`; exits code 1 | Shared shape; experiment adds new failure cases |
| Login | `client.login(DISCORD_BOT_TOKEN)` after handlers are installed | Shared |
| Login failure | JSON error event `sanitized update failure`; stops updater, destroys client, exits 1 | Shared |
| Ready | One-shot `ClientReady`; logs `Discord ready`; starts leaderboard updater | Shared |
| Presence/activity | None configured | Shared |
| Startup leaderboard job | If message ID exists, immediately fetches data and edits the existing message before scheduling | Shared |
| Bootstrap mode | If message ID is absent/blank, creates one leaderboard message, logs its ID and an env instruction, then exits 0 | Shared |
| Schedule | Fixed `setInterval` every 5 minutes, created only after the startup edit succeeds | Shared |
| Overlap | One in-memory `isUpdating` lock shared by startup/scheduled/manual refresh; overlap returns `already-running` | Shared |
| Scheduled failure | Sanitized error log; process stays alive and the next interval remains scheduled | Shared |
| Startup failure | Sanitized error log; process exits 1; no interval starts | Shared |
| Shutdown | One-shot `SIGINT` and `SIGTERM`; idempotent guard; clears interval, destroys Discord client, exits with supplied code | Shared |
| Other process errors | No `uncaughtException` or `unhandledRejection` handler | Shared |
| Command registration | Manual scripts only; startup does not register commands | Experiment adds a second registration script |
| Registration scope | Configured guild only via `Routes.applicationGuildCommands(clientId, guildId)` | Shared for refresh; experiment support command also guild-specific |
| Registration method | REST `POST` of one command object, not bulk `PUT`; repeated-name behavior depends on Discord API response | Shared |

## Complete command matrix

### Parity commands

| Command | Trigger/schema | Scope and authorization | Response behavior | Errors and edge cases |
| --- | --- | --- | --- | --- |
| Aura message command | Exact normalized text `cm aura`. Leading/trailing whitespace is ignored, internal whitespace collapses, and comparison is lowercase. No aliases, prefix variants, options, or extra arguments. | Ignores bot authors. Requires exact configured guild. Silent in DMs/wrong guild. Allowed in every channel except exact `DISCORD_AURA_COMMAND_BLOCKED_CHANNEL_ID`, where it is silent. No Discord permission, role, owner check, or cooldown. Lookup identity is `message.author.id`. | Replies to the invoking message. Linked result is one green embed titled `<sanitized DB display name>'s Aura`, description `Your linked Cheater's Market Aura balance.`, inline fields `Available` and `Lifetime Earned` using the Aura emoji and padded code formatting, footer `Cheater's Market Aura`. Mentions are suppressed and the reply does not ping the author. | No row: `No linked Cheater's Market account was found for your Discord user. Link Discord in your dashboard, then try again.` Any lookup/embed/reply failure logs a sanitized error and attempts `Aura is unavailable right now. Please try again later.` If that fallback reply fails, it is logged. |
| `/refresh-leaderboard` | Slash command, description `Force refresh the Aura leaderboard message.`, no options or subcommands. Default member permission is `ManageGuild`. | Registered only in configured guild. Pre-experiment handler has no separate guild check, so a stale same-named command outside that guild would still be evaluated. Requires exact command channel and runtime `ManageGuild` or `Administrator`. No role/owner check or cooldown. Requires configured leaderboard message ID. | All responses are ephemeral. Wrong channel: `Use this command in the configured bot command channel.` Missing runtime permission: `You do not have permission to refresh the leaderboard.` Missing message ID: `Leaderboard message ID is not configured.` After defer, success: `Leaderboard refreshed.` Concurrent run: `Leaderboard refresh already in progress.` | Refresh error is logged and edits the deferred reply to `Leaderboard refresh failed. Check bot logs.` Reply/defer errors bubble to the outer sanitized interaction logger. |

The experiment adds an explicit wrong-guild ephemeral reply to refresh: `This command is not available in this server.` It also attaches explicit safe allowed-mention settings to refresh replies. Those are security hardening/defense-in-depth changes, not pre-experiment observable behavior in the normally registered guild.

### Experimental commands, not parity requirements

| Command | Exact schema and behavior | Classification |
| --- | --- | --- |
| `/cm-support user` | Parent command description `Use limited Cheater's Market support lookups.`; subcommand description `Look up a limited user support record.` Required `selector` choice: `CM user ID`/`user_id`, `Email`/`email`, or `Discord user ID`/`discord_user_id`; required string `value` described as `The exact user identifier.` Guild/channel checks match refresh; runtime requires `ManageGuild` or `Administrator`; responses are ephemeral; returns a `CM user support record` embed. | Later API experiment only. It did not exist at `fa2dc77`, was inactive by default, required separate manual registration, and targets an obsolete API contract. Do not reproduce for parity without a new product decision. |
| `/cm-support order` | Subcommand description `Look up a limited order support record.` Required `selector` choice: `Order ID`/`order_id` or `Public order reference`/`public_ref`; required string `value` described as `The exact order identifier.` Same guild/channel/permission/ephemeral rules; returns a `CM order support record` embed. | Later API experiment only, with the same caveats. |

Experimental support guard strings are: `This command is not available in this server.`, `Use this command in the configured bot command channel.`, and `You do not have permission to use this support command.` Stable mapped errors include `No matching record was found.`, `You are not authorized to use this support command.`, `Too many requests. Please wait before trying again.`, `That lookup value is not valid.`, and the default `The internal service is unavailable right now. Please try again later.` These strings are inventory evidence, not required legacy parity.

Both support subcommands defer ephemerally before calling the API and suppress all mentions in the edited response. User selectors trim their value; UUID and email values are lowercased, while Discord IDs retain case after trimming. Order UUIDs are lowercased and public references uppercased. Strict Zod validation then enforces UUID/email/Discord-ID/public-reference shapes.

The user result embed has no color, footer, or timestamp. Its title is `CM user support record`; fields are `User ID`, `Email`, `Orders`, `Banned`, `Discord link`, `Wallet`, and `Aura`. Email is already masked by the API. A linked identity renders as `<Discord ID> (<global name, else username>)`; missing data renders `Not linked` or `Not available`. Wallet renders uppercased currency and two decimal places. Aura renders `<available> available / <lifetime> lifetime`.

The order result embed likewise has no color, footer, or timestamp. Its title is `CM order support record`; fields are `Order ID`, `Public reference`, `Status`, `Customer`, `Kind`, `Item`, `Quantity`, `Amount`, and `Fulfillment rows`. Product item fallback is product slug then license option ID; account item fallback is account name, variant label, then account slug. Fulfillment rows sum product and account delivery arrays. Displayed optional text neutralizes `@`, escapes Discord markdown, and truncates to 200 code units. This archived response shape exposes fulfillment counts that the current production API intentionally omits.

## Leaderboard behavior

The bot renders one Discord Components V2 message, not traditional embeds, in the pre-experiment parity state.

| Element | Exact behavior |
| --- | --- |
| Source boards | `lifetime` and `available` rows returned together by `get_discord_aura_leaderboards(p_limit := 10)` |
| Ranking ownership | Database RPC calculates rank. Bot filters by type, sorts ascending numeric `rank`, and slices each board to 10; it does not recalculate ties or ranks. |
| Lifetime eligibility/order | Active Discord link plus Aura balance and `lifetime_earned_aura > 0`; descending Aura, then earlier `linked_at`, then link `id`; `row_number()` yields unique sequential ranks. |
| Available eligibility/order | Active Discord link plus Aura balance and `available_aura > 0`; descending Aura, then earlier `linked_at`, then link `id`; `row_number()`. |
| Privacy/name projection | `Anonymous` when the account privacy flag is true; otherwise trimmed stored Discord username; fallback `Discord User`. Bot then normalizes whitespace/newlines, escapes Discord markdown, neutralizes `@`, and truncates leaderboard names to 18 Unicode code points with an ellipsis. |
| Top heading | `## <:aura:1509816131282669688> Cheater's Market Aura Leaderboard` |
| Lifetime board | Green accent `0x22c55e`; title `Top 10 Lifetime Aura Earned`; intro `Top linked Discord users ranked by lifetime earned Aura.` |
| Available board | Green accent `0x22c55e`; title `Top 10 Available Aura`; intro `Top linked Discord users ranked by available Aura balance.` |
| Empty state | `No linked users yet.` independently for either board |
| Row format | Rank in width-2 inline code, Aura in comma-formatted width-9 inline code, sanitized name, medal suffix for ranks 1/2/3. Rank 1 row is prefixed `### `. Invalid/non-finite Aura formatting falls back to `0`, though input validation normally rejects such values. |
| Separator | Divider component between boards |
| Footer line | `-# Updated <t:<current-unix-seconds>:R> • Updates every 5 minutes` |
| Message flags | `MessageFlags.IsComponentsV2` |
| Create vs edit | Missing message ID creates one new message then exits. Configured ID fetches and edits that exact message. Edits clear old `content` and `embeds`. No replacement is created when fetch/edit fails. |
| Mentions | Create/edit payloads use `parse: []`; experiment additionally sets empty explicit user/role lists and `repliedUser: false`. |
| Timestamp | Recomputed when the payload is built on each create/edit. A website context file incorrectly says `.setTimestamp(new Date())`; source and Git history prove the parity state uses a Components V2 relative timestamp instead. |

The preceding `b3206c6` version used two green traditional embeds, medal-or-bold rank labels, bold names, an em dash, footer `Cheater's Market Aura • Updates every 5 minutes`, native embed timestamps, and empty text `No linked Discord users with Aura yet.` Commit `31ca167` deliberately replaced that rendering before the API experiment.

## Scheduler and event matrix

| Event/job | Trigger | Action | Failure/overlap behavior |
| --- | --- | --- | --- |
| Configuration load | Process start | Validate env before creating Discord client | Sanitized log; exit 1 |
| Discord login | Process start | Connect using bot token | Sanitized log; shutdown code 1 |
| Ready bootstrap | First `ClientReady` only | Start leaderboard service | Throws cause shutdown code 1 |
| Initial message creation | Ready and no message ID | Fetch rows, create Components V2 message, log ID/instruction, exit 0 | Any failure exits 1 |
| Startup refresh | Ready and message ID present | Fetch rows and edit target immediately | Failure exits 1; success starts interval |
| Scheduled refresh | Every 300,000 ms after successful startup refresh | Fetch rows and edit same target | Overlap logs `update skipped due to overlap`; other failures log and keep scheduler alive |
| Manual refresh | Authorized slash command | Uses same updater and lock | Ephemeral already-running/success/failure result |
| Message create | Every message visible under configured intents | Evaluate only exact Aura command | Guarded failures as described above |
| Interaction create | Every chat-input interaction | Dispatch refresh; experiment also independently dispatches support when API client exists | Unknown names return silently |
| SIGINT/SIGTERM | One-shot process signal | Stop interval, destroy client, exit 0 | Repeated shutdown calls ignored |

There are no cron jobs, startup migrations, presence updates, database writes, background queues, retries around Supabase, or automatic command-registration jobs.

## Discord permission, channel, and guild matrix

| Surface | Guild | Channel | Discord permission | Role/owner rule | Fail behavior |
| --- | --- | --- | --- | --- | --- |
| `cm aura` | Exact configured guild | Any except exact blocked channel | None | None | Silent on bot author, wrong guild/DM, blocked channel, or non-command |
| Scheduled/startup leaderboard | Bot can access configured target | Exact leaderboard channel | Bot must be able to fetch channel/message and send/edit; code does not preflight permissions | None | Startup exits; scheduled run logs and retries next interval |
| `/refresh-leaderboard` | Guild-specific registration; experiment adds exact runtime guild guard | Exact command channel | Default `ManageGuild`; runtime accepts `ManageGuild` or `Administrator` | No configured role or bot-owner allowlist | Ephemeral denial |
| Experimental `/cm-support` | Exact configured guild | Exact command channel | Default `ManageGuild`; runtime accepts `ManageGuild` or `Administrator` | Archived API expected website-side actor checks; current API has no actor authorization | Ephemeral denial or safe API error |

No guild, channel, or role value is hardcoded in source. All are environment-selected except the hardcoded Aura custom emoji ID. No role ID is used by this bot. Website-owned Discord role sync is outside this repository and must not be folded into the rebuilt bot.

## Direct Supabase/database dependency map

The bot creates one `@supabase/supabase-js` client with the URL and service-role key. Auth session persistence, token refresh, and URL session detection are disabled. It sets `X-Client-Info: cm-discord-aura-leaderboard/1.0.0`. There are exactly two direct database calls and no writes.

| Legacy source/caller | Exact dependency | Input | Required result | Tables/logic behind checked-in RPC | Discord dependency | Access |
| --- | --- | --- | --- | --- | --- | --- |
| `legacy/src/leaderboard/supabaseLeaderboardClient.ts` via startup, scheduled, and manual updater | RPC `get_discord_aura_leaderboards` | `{ p_limit: 10 }` | At most 20 strict rows: `leaderboard_type` = `lifetime`/`available`, positive integer `rank`, `discord_display_name`, nonnegative integer/digit-string `aura` | Active `user_discord_links`, `aura_balances`, optional `user_discord_privacy_preferences`; positive values only; deterministic tie-break and privacy masking described above | Entire leaderboard content, ranks, names, Aura, bootstrap/startup health, scheduled refresh, manual refresh | Read-only RPC, but authenticated with broad service-role credential |
| Same source via `cm aura` | RPC `get_discord_user_aura` | `{ p_discord_user_id: message.author.id }` | One object, array of at most one, or null; fields `discord_display_name`, `available_aura`, `lifetime_earned_aura` | Active exact trimmed Discord link joined to `aura_balances`, optional privacy preference; a missing link or missing balance row yields no row | Whether the no-linked message or Aura embed is shown, its title, and both numeric fields | Read-only RPC, same broad credential |

The checked-in migrations revoke both RPCs from `PUBLIC`, `anon`, and `authenticated` and grant them to `service_role`. This audit does not claim the live database definition from migrations alone. The production API is the future authority; the rebuilt bot must not contain Supabase packages, URL, keys, RPC names, table names, or database types.

## API capability mapping

Authoritative current operations:

| Legacy requirement | Classification | Current API mapping | Parity note |
| --- | --- | --- | --- |
| Two top-10 Aura leaderboards | COVERED BY EXISTING API | `aura.leaderboards.read` → `POST /api/internal/integrations/v1/aura/leaderboards`, body `{ "limit": 10 }` | Current DTO contains type, rank, display name, and Aura and is designed to replace the legacy RPC. |
| Aura balance by invoking Discord identity | COVERED BY EXISTING API | `aura.lookup.read` → `POST /api/internal/integrations/v1/aura/lookup`, selector `{ kind: "external_identity", provider: "discord", externalUserId }` | Map `NOT_FOUND` and `aura: null` deliberately to the legacy null/no-linked observable behavior. |
| Privacy-aware `discord_display_name` returned by `get_discord_user_aura` | NEEDS NEW GENERIC API CAPABILITY for exact parity | Current Aura DTO contains only `aura`; current user DTO exposes generic external identities but does not promise the legacy Aura privacy projection | Do not request a Discord-only command endpoint. If exact title parity is mandatory, extend a generic safe Aura lookup/profile DTO with an intentional display label/privacy semantic. Otherwise document a visible change such as using a Discord-local name or a neutral title. |
| Guild/channel/permission gates, message editing, formatting, scheduling, and locking | DISCORD-LOCAL ONLY | No API operation | Keep in the bot. Guild/actor data must not be sent as authorization; current API authorization is client credentials plus operation allowlist. |
| Supabase client, service-role credential, RPC error codes | NO LONGER NEEDED | Replace with the single HMAC client and deterministic API errors | Remove entirely after parity tests prove no import/env/runtime path remains. |
| User/order support lookup commands from `a44fbd6` | NO LONGER NEEDED for legacy parity | Existing `users.lookup.read` and `orders.lookup.read` could support a separately approved future feature | They were experimental, inactive, and not part of the bot users/staff knew. Do not register by default. |

No legacy feature requires a write operation. There is therefore no missing mutation API requirement. The current API intentionally has no Aura adjustment, wallet/balance mutation, refund, ban, fulfillment, delivery, credential, or generic action endpoint.

## Archived experiment versus authoritative API

The experiment is not wire-compatible with production:

| Area | Archived `a44fbd6` experiment | Authoritative production contract |
| --- | --- | --- |
| Paths | `/api/internal/discord-bot/v1/**` | `/api/internal/integrations/v1/**`; old paths have no aliases |
| Canonical prefix | `v1` | `cm-integrations-v1` |
| Signed identity | Key ID only | Client ID and key ID |
| Auth headers | No `X-CM-Client-Id` | Requires `X-CM-Client-Id` |
| Request authorization context | Sends guild, Discord actor, event/source | Body cannot provide authorization context; client allowlist is the sole authorization boundary |
| Aura lookup | Dedicated actor-as-subject body and `{ linked, displayName, ... }` response | Generic selector and `{ aura: ... | null }`; missing subject/link is `NOT_FOUND` |
| Identity selector | `discord_user_id` | Generic `external_identity` with provider `discord` |
| Retry status | Network or 502/503/504 once | Contract permits bounded genuinely transient network failure or 503 only |
| Response schemas | Includes legacy Discord-specific and fulfillment shapes | Platform-neutral strict DTOs; order DTO omits fulfillment/delivery data |
| Errors | Older code set lacks newer `OPERATION_FORBIDDEN` and `IDENTITY_PROVIDER_UNSUPPORTED` | Current stable error set includes both |

Reusable ideas from the experiment are strict env validation, exact-byte hashing/signing, secure UUID nonce generation, finite timeout, fresh signing per retry, strict DTO validation, sanitized errors, and mention suppression. Constants, schemas, routes, canonical strings, authorization assumptions, and retry statuses must be rewritten from the current contract.

The archived flag defaults false. In that state, Supabase URL and service-role key remain mandatory and the API credentials are ignored. When true, its parser requires an origin-only HTTPS URL with no credentials/path/query/fragment, a key ID matching `^[a-z0-9][a-z0-9._-]{0,63}$`, canonical standard-base64 secret material of at least 32 decoded bytes, and an integer timeout from 1,000 through 15,000 ms (default 5,000). Enabled API mode makes Supabase optional. Incomplete enabled configuration fails startup closed and reports variable names, not values.

For each request, the experiment serializes the validated body once, signs and sends those exact UTF-8 bytes, creates a timeout controller, and permits at most two attempts. It retries the first transport/timeout failure or HTTP 502/503/504, cancelling a retryable response body and generating fresh timestamp/UUID/signature. It never retries a parsed 4xx. It reads response text, rejects payloads over 64 KiB, parses strict success/error envelopes, discards server error messages, and maps to local deterministic errors. This is useful implementation evidence but is not proof of current-contract correctness.

## Original versus experimental classification

| Functionality/change | Classification | Required parity treatment |
| --- | --- | --- |
| Discord startup, intents, ready flow, bootstrap, five-minute schedule, overlap lock, shutdown | SHARED / UNCHANGED | Preserve unless a documented internal reliability change is invisible to users |
| `cm aura` trigger, guild/blocked-channel behavior, output strings/embed | ORIGINAL BOT BEHAVIOR | Preserve exactly |
| Components V2 two-board leaderboard introduced by `31ca167` | ORIGINAL BOT BEHAVIOR at the required pre-experiment baseline | Preserve exactly; do not revert to first-commit embeds |
| `/refresh-leaderboard` registration, restrictions, and strings | ORIGINAL BOT BEHAVIOR | Preserve; decide whether to retain the experiment's explicit runtime guild guard as safe hardening |
| Explicit empty users/roles/replied-user mention settings | LATER API EXPERIMENT security hardening | Retain; intended output is unchanged |
| Generic `AuraReadClient` interface and manual fetch context | LATER API EXPERIMENT internal refactor | Recreate only where it fits the new contract; never send obsolete actor/guild fields |
| Supabase fallback when API flag is false | LATER API EXPERIMENT rollout mechanism layered over original direct access | Do not preserve. New production root must have no Supabase code or fallback. |
| `/cm-support user` and `/cm-support order` plus registration script | LATER API EXPERIMENT | Exclude from parity implementation pending explicit approval |
| Old HMAC client/schemas/tests and `/discord-bot/v1` paths | LATER API EXPERIMENT, now obsolete | Reference security intent only; reimplement current contract |
| README internal API rollout text | LATER API EXPERIMENT and operationally stale | Archive only; new docs must use production contract |
| Pre-experiment refresh lacking an explicit runtime guild check | UNCERTAIN edge case outside normal guild registration | Recommended security fix: fail closed in wrong guild while retaining the experimental exact denial string; report as a theoretical visible change |
| Command registration via POST rather than bulk overwrite | SHARED / UNCHANGED, but operational intent uncertain | Preserve command definitions, not necessarily this fragile registration mechanism; validate against Discord in a safe guild/app |

All 17 paths changed by `a44fbd6` are accounted for:

| Path | Classification and effect |
| --- | --- |
| `.env.example` | LATER API EXPERIMENT: added enable/base URL/key/secret/timeout names. |
| `README.md` | LATER API EXPERIMENT: replaced the two-line legacy README with inactive rollout documentation that is now contract-stale. |
| `package.json` | LATER API EXPERIMENT: added the test command and separate support registration command; no dependency was added because Zod already existed. |
| `src/commands/auraCommand.ts` | SHARED user behavior; experimental type abstraction and stronger explicit mention suppression. |
| `src/commands/refreshLeaderboardCommand.ts` | SHARED core behavior; experimental explicit guild denial, mention suppression, and manual actor/event context. |
| `src/commands/supportLookupCommands.ts` | LATER API EXPERIMENT only. |
| `src/config/env.test.ts` | LATER API EXPERIMENT tests only. |
| `src/config/env.ts` | ORIGINAL Discord/Supabase config plus LATER API EXPERIMENT conditional provider config. |
| `src/discord/leaderboardMessage.ts` | SHARED message behavior; experimental stronger explicit mention suppression. |
| `src/discord/registerInternalApiCommands.ts` | LATER API EXPERIMENT only. |
| `src/index.ts` | SHARED startup/events plus LATER API EXPERIMENT provider selection and support dispatch. |
| `src/internalApi/client.test.ts` | LATER API EXPERIMENT only; obsolete vectors/contracts. |
| `src/internalApi/client.ts` | LATER API EXPERIMENT only; obsolete wire contract. |
| `src/internalApi/schemas.ts` | LATER API EXPERIMENT only; obsolete request/response schemas. |
| `src/leaderboard/leaderboardUpdater.ts` | SHARED scheduler/render/edit behavior; experimental generic client type and request context plumbing. |
| `src/leaderboard/supabaseLeaderboardClient.ts` | SHARED RPC calls and validation; experimental constructor shape and interface declaration only. |
| `src/leaderboard/types.ts` | ORIGINAL row types plus experimental read-client/context types. |

## Error and logging inventory

- Logger emits one-line JSON containing `level`, ISO `time`, `event`, and normalized metadata.
- String metadata collapses tabs/newlines/whitespace and truncates after 240 characters plus `...`.
- `sanitizeError` logs only error name and normalized message; non-Errors become `UnknownError` / `An unknown error occurred`.
- The legacy Supabase wrapper includes only returned error codes in thrown messages, not full database errors.
- Startup/config/login failures exit as described above. Scheduled failures do not stop the process.
- There is no Supabase retry, Discord REST retry wrapper, command cooldown, circuit breaker, metrics backend, health endpoint, file logger, or explicit fetch timeout in the direct Supabase path.
- The archived API client retries once, sanitizes server messages/selectors, and caps response text at 64 KiB, but its contract is obsolete.

## Tests, scripts, and deployment assumptions

| Item | Inventory |
| --- | --- |
| `dev` | `tsx src/index.ts` |
| `build` | `tsc` |
| `typecheck` | `tsc --noEmit` |
| `start` | `node dist/index.js` |
| Root shim | `index.js` requires `./dist/index.js`, likely for a host that executes the package entry/root file; no host config proves this |
| Refresh registration | `tsx src/discord/registerCommands.ts` |
| Experimental support registration | `tsx src/discord/registerInternalApiCommands.ts` |
| Tests | Added only by `a44fbd6`: four env tests and 17 mocked Internal API client tests (21 total). No tests cover commands, embeds/components, scheduler, Discord client, logger, registration, or Supabase wrapper. |
| Lint/format | No scripts or configuration |
| Deployment | No `.github`, Docker, Procfile, host manifest, hooks, or auto-deploy configuration in the repository. External hosting/restart details are unknown. |
| Node version | No `engines`, `.nvmrc`, or toolchain pin beyond dependency lockfile/types |

## Proposed new root architecture

```text
src/
  index.ts
  config/
    env.ts
  api/
    client.ts
    errors.ts
    schemas.ts
    signing.ts
  discord/
    client.ts
    registerCommands.ts
    safeMessages.ts
  commands/
    aura.ts
    refreshLeaderboard.ts
  leaderboard/
    format.ts
    service.ts
    types.ts
  scheduler/
    leaderboardSchedule.ts
  logger/
    index.ts
tests/
  api/
  commands/
  leaderboard/
  scheduler/
```

Keep one Discord process, one HMAC API client, plain command modules, and one leaderboard service. Use narrow interfaces only at the HTTP/Discord boundaries. Do not add a bot database, Supabase, Redis, queues, microservices, web framework, or dependency-injection framework. Nothing outside `legacy/` may import from `legacy/`, and production/package/build/test includes must exclude it.

## New bot environment variables

Required:

```text
DISCORD_BOT_TOKEN
DISCORD_CLIENT_ID
DISCORD_GUILD_ID
DISCORD_LEADERBOARD_CHANNEL_ID
DISCORD_COMMAND_CHANNEL_ID
DISCORD_AURA_COMMAND_BLOCKED_CHANNEL_ID
CM_INTERNAL_INTEGRATIONS_API_ORIGIN
CM_INTERNAL_INTEGRATIONS_API_CLIENT_ID
CM_INTERNAL_INTEGRATIONS_API_KEY_ID
CM_INTERNAL_INTEGRATIONS_API_HMAC_SECRET_BASE64
```

Optional with strict defaults/semantics:

```text
DISCORD_LEADERBOARD_MESSAGE_ID
CM_INTERNAL_INTEGRATIONS_API_TIMEOUT_MS
```

`DISCORD_LEADERBOARD_MESSAGE_ID` remains optional only to preserve the legacy one-shot bootstrap flow. The recommended API timeout default is finite; choose and test it during implementation. Do not add `SUPABASE_URL`, any Supabase key, database URL, RPC name, website private-library path, owner CLI credential, or generic JSON credential bundle to the bot.

## Risks and open questions

1. Exact `cm aura` title parity needs the legacy privacy-aware display name, which the current Aura lookup DTO does not expose. Decide whether to request a generic API addition or deliberately use a neutral/Discord-local title.
2. Decide whether `aura: null` and API `NOT_FOUND` should both map to the legacy no-linked string. That is the closest observable parity because the old inner join returned no row for both missing link and missing balance.
3. Confirm whether `/cm-support` should be intentionally discarded. Evidence says experimental/inactive, not legacy behavior.
4. Confirm the custom Aura emoji is available to the rebuilt bot in the deployment guild; the ID is hardcoded.
5. Confirm the target message is already a Components V2 message and the bot has channel view/send/history/edit permissions. The old guard also required a send-capable channel even for editing.
6. Decide whether to retain the one-shot missing-message-ID bootstrap or provide a safer explicit bootstrap script while preserving the resulting message.
7. Command registration currently uses POST and is manual. Establish desired idempotent registration and deletion policy before touching the live guild.
8. Hosting, Node version, health checks, log collection, restart policy, and GitHub auto-deploy target are absent from the repository and need operational decisions.
9. `MessageContent` is a privileged intent and is required for `cm aura`; confirm it remains enabled in the Discord application.
10. The website `DISCORD_AURA_BASELINE.md` contains a stale statement that the leaderboard uses native embed timestamps; bot source proves Components V2. Correct it in the website context through that repository's own workflow, not here.
11. The archived experiment's API client is incompatible with production. Accidentally copying its routes/signing/actor model will fail authentication or route resolution.

## Recommended implementation order

1. Freeze parity fixtures from the pre-experiment source: exact strings, command JSON, component JSON, name/Aura formatting, empty states, and lock behavior.
2. Scaffold the new root TypeScript package and strict env parser, with `legacy/` excluded from compilation/tests/runtime.
3. Implement the current eight-line signing contract and strict response/error schemas from the authoritative website documentation, including exact body bytes, finite timeout, sanitized logging, and a bounded retry only for permitted transient failures.
4. Implement the API Aura leaderboard adapter and prove its normalized output matches legacy rows.
5. Resolve the Aura display-name/API question, then implement exact `cm aura` guards and replies.
6. Implement Components V2 formatting as golden-tested pure functions.
7. Implement the leaderboard service, bootstrap path, startup refresh, five-minute scheduler, overlap lock, and graceful shutdown.
8. Implement `/refresh-leaderboard` and safe guild command registration; do not add support commands unless separately approved.
9. Add cheap-hosting/deployment files only after the target is chosen; keep secrets in the host/GitHub secret store.
10. Run the full validation and a staged Discord/API smoke test before any production registration or deployment.

## Validation strategy

- Unit-test env success/failure without ever echoing credentials.
- Verify the authoritative deterministic signing vector byte-for-byte, including client ID, exact pathname, no trailing newline, canonical base64, and exact transmitted body.
- Test fresh timestamp/UUID/signature per retry, allowed retry statuses only, timeout, response-size limit, strict unknown-field rejection, and deterministic safe error mapping.
- Assert logs/exceptions never contain secrets, signatures, nonces, raw bodies, selectors, email/order IDs, credentials, licenses, delivery data, or server error messages.
- Golden-test Discord command JSON and every exact user-visible string.
- Golden-test Components V2 JSON for populated, empty, long/markdown/mention names, ranks/medals, large Aura values, and timestamps with an injected clock.
- Unit-test wrong guild, DM, blocked/wrong channel, bot author, permission, no-message-ID, unknown command, no-link/null-Aura, API failures, fallback-reply failure, and allowed mentions.
- Use fake Discord/API adapters to test startup bootstrap, immediate edit, interval scheduling, failure continuation, shared overlap lock, and idempotent shutdown without sleeping.
- Run `npm ci`, typecheck, tests, build, lint/format if added, `git diff --check`, dependency/secret scans, and an import scan proving root code has no `legacy`, Supabase, RPC, table, or service-role references.
- Use a bot-dedicated least-privilege production API client, never owner CLI credentials. Smoke-test only the two Aura read operations needed for parity.
- In a controlled Discord guild/message, verify registration, exact public/ephemeral behavior, edit-not-create behavior, mention suppression, Components V2 rendering, and the five-minute cycle before production changeover.

## Audit verdict

The archive and behavioral evidence are sufficient to begin a new implementation after the Aura display-label decision. No new bot source has been created at the root, and no commit, push, deployment, command registration, API call, or database mutation was performed.
