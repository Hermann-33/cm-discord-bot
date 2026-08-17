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

Composition root.

Owns:

- config load/fail-closed startup;
- Discord client/API client/service construction;
- SIGINT/SIGTERM hooks;
- ready/startup schedule;
- current MessageCreate Aura dispatch;
- current InteractionCreate refresh dispatch;
- login failure shutdown.

Audit note: future slash growth needs a cleaner command registry; current hardwired handlers are safe but not scalable.

### `src/api/client.ts`

Owns Internal Integrations API transport:

- only two current read paths;
- strict outbound request validation;
- signed requests;
- timeout;
- 64 KiB response cap;
- retry policy;
- JSON/status/error/response validation.

Security boundary. Future mutations need a distinct idempotency-aware extension, not ad-hoc fetch calls.

### `src/api/signing.ts`

Owns canonical `cm-integrations-v1` request construction and HMAC-SHA256 headers. Fragile protocol boundary.

### `src/api/schemas.ts`

Owns strict read request/response/error DTO validation. Future mutation DTOs belong here or a clearly separated schema module.

### `src/api/errors.ts`

Owns stable safe client error abstraction. Never surface backend raw error messages.

### `src/config/env.ts`

Owns current Discord/API environment validation. Current full loader is also used by command registration, creating avoidable coupling to HMAC secrets.

Future admin config must fail closed and parse explicit user-ID allowlists/caps/channels safely.

### `src/commands/aura.ts`

Current exact `cm aura` message command.

Audit status:

- correct pre-backend guild/blocked-channel guards;
- safe mentions and display sanitization;
- must be replaced by slash `/aura` under ADR-0003.

### `src/commands/refreshLeaderboard.ts`

Current `/refresh-leaderboard` slash command.

Audit status:

- explicit runtime guild guard already exists;
- exact command channel;
- ManageGuild/Administrator runtime permission;
- ephemeral safe responses;
- read-only operational command.

### `src/discord/client.ts`

Owns intents. `GuildMessages` and privileged `MessageContent` are currently required only by message-command Aura behavior and should be removed after slash migration if unused.

### `src/discord/registerCommands.ts`

Owns explicit manual guild bulk-overwrite registration.

Audit note: currently loads complete runtime config. Refactor into an injectable/testable function before expanding command catalog.

### `src/discord/safeMessages.ts`

Owns `safeAllowedMentions` and leaderboard channel/create/edit wrappers. Security boundary for mention suppression.

### `src/leaderboard/format.ts`

Owns Components V2 rendering, names/ranks/Aura formatting, custom emoji and relative timestamp.

### `src/leaderboard/service.ts`

Owns fetch -> create/edit and shared overlap lock.

Audit note: message ID precondition is currently an `as string` invariant enforced by callers rather than the class type.

### `src/leaderboard/types.ts`

Owns the small read-client/domain contracts used by commands/leaderboard.

### `src/scheduler/leaderboardSchedule.ts`

Owns bootstrap, immediate refresh, five-minute timer and scheduled failure behavior.

Audit note: `start()` is not internally idempotent; current `.once(ClientReady)` wiring prevents normal duplicate starts.

### `src/scheduler/shutdown.ts`

Owns idempotent timer stop/Discord destroy/exit. Does not drain an in-flight operation.

### `src/logger/index.ts`

Owns structured JSON logs and current error normalization.

Audit note: current API errors are secret-safe; generic sanitizer is not universal pattern redaction and must be hardened before broader admin/user data flows.

## Test inventory

The root test script explicitly runs:

- `tests/api/signing.test.ts`
- `tests/api/client.test.ts`
- `tests/config/env.test.ts`
- `tests/commands/aura.test.ts`
- `tests/commands/refreshLeaderboard.test.ts`
- `tests/leaderboard/format.test.ts`
- `tests/leaderboard/service.test.ts`
- `tests/scheduler/leaderboardSchedule.test.ts`
- `tests/scheduler/shutdown.test.ts`
- `tests/discord/registerCommands.test.ts`
- `tests/logger/redaction.test.ts`
- `tests/architecture.test.ts`

Fixtures:

- `tests/fixtures/aura-success.json`
- `tests/fixtures/leaderboard-empty.json`
- `tests/fixtures/leaderboard-populated.json`
- `tests/fixtures/refresh-command.json`

See full audit for coverage strengths/gaps.

## Generated/local-only paths

Never commit:

- `.env`;
- `dist/`;
- `node_modules/`;
- logs;
- deployment/local ZIP archives such as prior `CM DC Bot.zip`.

Note: ZIPs are policy-forbidden but not currently protected by a `.gitignore` pattern.

## External ownership

This repo does not own:

- website API route implementation;
- Supabase migrations;
- DB grants/RLS;
- wallet/order/payment/delivery logic;
- OAuth/Support-role systems.

`DATA_STATUS.md` records verified dependency facts only. Cross-repo fixes must happen in their owning project.