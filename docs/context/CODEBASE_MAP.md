# Codebase Map

Updated: 2026-08-17

## Repository root

| Path | Responsibility |
| --- | --- |
| `README.md` | Production setup, architecture boundary, deployment/bootstrap notes |
| `AGENTS.md` | Mandatory agent/developer governance |
| `.env.example` | Non-secret current runtime configuration names |
| `.gitignore` | Secret/build/log/local artifact protection |
| `package.json` | Node runtime, scripts, dependency contract |
| `index.js` | Host compatibility shim requiring `dist/index.js` |
| `tsconfig.json` | Typecheck configuration |
| `tsconfig.build.json` | Production build configuration |
| `src/` | Active production source |
| `tests/` | Active automated tests |
| `legacy/` | Frozen pre-rebuild archive; never import into production |
| `docs/legacy-parity.md` | Historical/parity evidence for old bot |
| `docs/context/` | Current repository truth/workflow/handoff |
| `docs/decisions/` | ADRs |
| `docs/security/` | Specialist security design documents |

## Active source ownership

### `src/index.ts`

Composition root. Loads config, creates API/Discord/leaderboard/scheduler services, wires current message/slash handlers, handles startup/shutdown/login errors.

### `src/api/`

- `client.ts` — HMAC-authenticated Internal Integrations API transport, retry/timeout/response-bound logic.
- `signing.ts` — canonical signing headers/signature construction.
- `schemas.ts` — request/response/error schema validation.
- `errors.ts` — stable local API error abstraction.

This folder is a security boundary.

### `src/config/`

Environment validation and typed runtime config. Current config covers Discord guild/channels/message plus dedicated Internal API credentials and timeout.

### `src/commands/`

- `aura.ts` — current exact `cm aura` message command and Aura balance embed.
- `refreshLeaderboard.ts` — current staff `/refresh-leaderboard` slash command.

Future command work must migrate to the slash-only policy in ADR-0003 rather than multiplying message commands.

### `src/discord/`

- `client.ts` — Discord client/intents.
- `registerCommands.ts` — explicit guild command registration.
- `safeMessages.ts` — mention-suppression/safe Discord payload helpers.

### `src/leaderboard/`

- `format.ts` — Components V2 layout, Aura/rank/display-name formatting and sanitization.
- `service.ts` — read data through the API and create/edit the persistent leaderboard message.
- `types.ts` — read-client/data contracts.

### `src/scheduler/`

- `leaderboardSchedule.ts` — startup, five-minute schedule, shared overlap guard.
- `shutdown.ts` — idempotent schedule/client shutdown.

### `src/logger/`

Structured logging and error sanitization/redaction boundary.

## Test ownership

`package.json` currently runs tests covering:

- API signing;
- API client behavior;
- environment validation;
- Aura command behavior;
- refresh command behavior;
- leaderboard formatting/service;
- scheduler and shutdown;
- command registration;
- logger redaction;
- architecture boundaries.

## Generated/local-only paths

Do not commit:

- `.env`
- `dist/`
- `node_modules/`
- `*.log`
- ZIP/archive files such as local `CM DC Bot.zip`

## Fragile/protected boundaries

- `src/api/signing.ts`
- `src/api/client.ts`
- `src/config/env.ts`
- `src/discord/safeMessages.ts`
- `src/leaderboard/service.ts`
- scheduler overlap/shutdown logic
- `legacy/` and `docs/legacy-parity.md`

## Repository split

This repo does not own the Cheater's Market website, its migrations, payment/wallet/order logic, OAuth linking, Support-role sync, or database. Cross-repo changes require an explicitly scoped backend task.