# Codebase Map

Updated: 2026-08-17

Full audit coverage: every active source file listed below was read in `TASK-AUDIT-001`.

## Repository root

| Path | Responsibility / audit note |
| --- | --- |
| `README.md` | Production setup, active API boundary, deployment/bootstrap notes |
| `AGENTS.md` | Mandatory agent/developer governance |
| `.env.example` | Non-secret current read-only runtime configuration names |
| `.gitignore` | Env/dependency/build/log/temp protection; currently does not ignore ZIP archives |
| `package.json` | Node/runtime/scripts/dependency contract |
| `package-lock.json` | Locked dependency graph/integrity metadata |
| `index.js` | Host shim requiring `dist/index.js` |
| `tsconfig.json` | Strict typecheck of active src + tests, excludes legacy |
| `tsconfig.build.json` | Production build of `src` only |
| `src/` | Active production source |
| `tests/` | Active test suite |
| `legacy/` | Frozen pre-rebuild archive; never import/execute from active code |
| `docs/legacy-parity.md` | Historical/parity evidence |
| `docs/audits/` | Full point-in-time audit reports |
| `docs/context/` | Canonical current truth/workflow/handoff |
| `docs/decisions/` | Durable ADRs |
| `docs/security/` | Specialist security/implementation guardrails |

## Active source inventory and ownership

### `src/index.ts`

Composition root. Owns config/startup, Discord/API/service construction, shutdown hooks, ready schedule, current customer `MessageCreate` Aura dispatch and current admin `InteractionCreate` refresh dispatch.

Audit note: future admin slash growth needs a cleaner command registry/dispatcher; current hardwired handlers are safe but not scalable.

### `src/api/client.ts`

Owns current Internal Integrations API transport:

- exactly two current read paths;
- strict outbound request validation;
- signed requests;
- timeout;
- 64 KiB response cap;
- current read retry policy;
- JSON/status/error/response validation.

Security boundary. New operations require explicit typed schemas/client methods. Mutations need stable logical idempotency across retries and must not be added as ad-hoc fetch calls.

### `src/api/signing.ts`

Owns canonical `cm-integrations-v1` request construction and HMAC-SHA256 headers. The supplied backend quickstart matches this canonicalization model. Fragile protocol boundary.

### `src/api/schemas.ts`

Owns strict current read request/response/error DTO validation. New operation DTOs belong here or in clearly separated typed schema modules after exact backend DTO verification.

### `src/api/errors.ts`

Owns stable safe client error abstraction. Never surface backend raw error messages.

### `src/config/env.ts`

Owns current Discord/API environment validation. Current full loader is also used by command registration, creating avoidable coupling to HMAC secrets.

Future admin config must fail closed and parse explicit user-ID allowlists/channels/caps safely.

### `src/commands/aura.ts`

Current exact `cm aura` customer message command.

Current status under ADR-0005:

- correct pre-backend guild/blocked-channel guards;
- safe mentions and display sanitization;
- intentional message command;
- **not** a slash-migration target under current product policy.

### `src/commands/refreshLeaderboard.ts`

Current `/refresh-leaderboard` staff/admin slash command with explicit runtime guild guard, exact command channel, ManageGuild/Administrator runtime permission, ephemeral safe responses and read-only operation.

### `src/discord/client.ts`

Owns intents. `GuildMessages` and privileged `MessageContent` are intentionally required by the customer message-command surface while `cm aura` exists.

### `src/discord/registerCommands.ts`

Owns explicit manual guild bulk-overwrite registration. Refactor into an injectable/testable registry/dispatcher foundation before expanding the admin command catalog.

### `src/discord/safeMessages.ts`

Owns `safeAllowedMentions` and leaderboard channel/create/edit wrappers. Security boundary for mention suppression.

### `src/leaderboard/format.ts`

Owns Components V2 rendering, names/ranks/Aura formatting, custom emoji and relative timestamp.

### `src/leaderboard/service.ts`

Owns fetch -> create/edit and shared overlap lock. Message ID precondition is currently an `as string` invariant enforced by callers rather than the class type.

### `src/leaderboard/types.ts`

Owns the small current read-client/domain contracts used by commands/leaderboard.

### `src/scheduler/leaderboardSchedule.ts`

Owns bootstrap, immediate refresh, five-minute timer and scheduled failure behavior. `start()` is not internally idempotent; current `.once(ClientReady)` wiring prevents normal duplicate starts.

### `src/scheduler/shutdown.ts`

Owns idempotent timer stop/Discord destroy/exit. Does not drain an in-flight operation.

### `src/logger/index.ts`

Owns structured JSON logs and current error normalization. Current API errors are secret-safe; generic sanitizer is not universal pattern redaction and should be hardened before broader admin/user data flows.

## Test inventory

The root test script covers API signing/client, config, Aura command, refresh command, leaderboard formatting/service, scheduler/shutdown, command registration, logger redaction and architecture boundaries. See `package.json` and the full audit for exact files and coverage gaps.

## Generated/local-only paths

Never commit `.env`, `dist/`, `node_modules/`, logs or deployment/local ZIP archives such as prior `CM DC Bot.zip`.

ZIPs are policy-forbidden but not currently protected by a `.gitignore` pattern.

## External ownership

This repo does not own website API route implementation, Supabase migrations, DB grants/RLS, wallet/order/payment/delivery logic or OAuth/Support-role systems.

`DATA_STATUS.md` records dependency facts and contract evidence. Cross-repo fixes must happen in their owning project.
