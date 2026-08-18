# Codebase Map

Updated: 2026-08-18

## Repository boundaries

| Path | Responsibility |
| --- | --- |
| `src/` | active production TypeScript |
| `tests/` | active Node test suite |
| `legacy/` | frozen historical implementation; never import/execute from active source |
| `docs/context/` | canonical current state/workflow/handoff |
| `docs/decisions/` | durable ADR history |
| `docs/security/` | specialist security models |
| `.env.example` | non-secret deployment variable names only |
| `package.json` | runtime/scripts/dependency contract |
| `.github/workflows/ci.yml` | Node 22 verification gate |

Never commit `.env`, `dist/`, `node_modules/`, logs, local deployment archives or real credentials.

## Active production source

### Composition/runtime

#### `src/index.ts`

Composition root. Builds config, Discord client, Internal API client, leaderboard service/schedule and `CmAdminController`. Routes `cm aura` messages and admin interactions, and installs shutdown hooks.

### Internal Integrations API

#### `src/api/signing.ts`

Fragile protocol boundary for canonical `cm-integrations-v1` HMAC request signing. Do not change casually.

#### `src/api/client.ts`

Owns strict HTTP transport, timeout/response bounds, exact-body signing/retry and typed operation methods.

`TASK-CM-ADMIN-003` approved paths:

```text
aura.leaderboards.read
aura.lookup.read
users.overview.read
orders.details.read
orders.fulfillment.read
orders.refund.preview
orders.refund.execute
users.aura.adjust
users.wallet.adjust
```

Mutation requests are validated/serialized once before the transport retry loop, preserving one logical body/idempotency identity while transport signing material changes per attempt.

#### `src/api/schemas.ts`

Strict Zod mirrors for all approved request/response/error DTOs. `TASK-CM-ADMIN-003` adds exact Aura/wallet adjustment DTOs and documented adjustment bounds/errors.

#### `src/api/errors.ts`

Stable local client error abstraction. Raw backend messages are not trusted as user-facing content.

### Configuration

#### `src/config/env.ts`

Validates Discord and HMAC API environment configuration. Shared `/cm` admin config is `BOT_ADMIN_USER_IDS` plus optional-at-startup `BOT_AUDIT_LOG_CHANNEL_ID`; mutation execution itself requires the audit channel.

### Commands/admin console

#### `src/commands/aura.ts`

Intentional customer message command `cm aura` under ADR-0005.

#### `src/commands/refreshLeaderboard.ts`

Operational `/refresh-leaderboard` slash command with its own configured channel and permission checks.

#### `src/commands/cm.ts`

Central `/cm` slash/button/modal controller.

Owns:

- `/cm user email:<email>` entry;
- `/cm order reference:<public-ref-or-UUID>` entry;
- shared guild/user authorization routing;
- session creation;
- user/order/fulfillment/refund/adjustment component dispatch;
- manual-fulfillment blocked response.

#### `src/commands/cmSessions.ts`

Operator-bound bounded in-memory sessions, selected order, refund proposal and Aura/wallet adjustment proposal state.

#### `src/commands/cmUserActions.ts`

User/order navigation and fulfillment diagnostics:

- refresh user;
- open recent order;
- refresh selected order;
- open fulfillment diagnostics.

#### `src/commands/cmRefund.ts`

Canonical refund reason -> preview -> confirm -> fresh re-preview -> execute -> audit flow. Existing security boundary; `TASK-CM-ADMIN-003` does not weaken it.

#### `src/commands/cmAdjustments.ts`

Added by `TASK-CM-ADMIN-003`.

Owns:

- signed Aura/wallet delta parsing;
- exact decimal-to-cents wallet conversion;
- local backend-bound limit checks;
- fresh overview before preview;
- five-minute state-bound confirmation;
- final fresh overview/equality check;
- `users.aura.adjust` / `users.wallet.adjust` execution;
- result target/delta verification;
- audit + post-success overview refresh;
- safe deterministic/transient error behavior.

#### `src/commands/cmUi.ts`

Components V2 builders for user, order history, order, fulfillment, refund, adjustment preview/success and safe notice panels.

#### `src/commands/cmSupport.ts`

Shared safe API messages, parsing, authorization wrapper and operator-bound session retrieval.

### Discord boundaries

#### `src/discord/adminAuthorization.ts`

ADR-0006 shared `/cm` authorization: exact configured guild + non-empty explicit `BOT_ADMIN_USER_IDS`; no admin command-channel restriction.

#### `src/discord/adminAudit.ts`

Mention-safe Discord audit output for refund and Aura/wallet adjustment results. Backend audit is authoritative.

#### `src/discord/registerCommands.ts`

Manual guild command bulk overwrite. Top-level slash commands remain `/refresh-leaderboard` and `/cm`; `user`/`order` are `/cm` subcommands.

#### `src/discord/safeMessages.ts`

Central safe mention configuration and safe leaderboard message helpers.

#### `src/discord/client.ts`

Discord intents. `GuildMessages` + privileged `MessageContent` remain intentional while customer `cm aura` is text-based.

### Leaderboard/scheduler/logger

- `src/leaderboard/format.ts` — Components V2 leaderboard rendering/sanitization.
- `src/leaderboard/service.ts` — fetch/create/edit + overlap lock.
- `src/leaderboard/types.ts` — narrow read/domain contracts.
- `src/scheduler/leaderboardSchedule.ts` — bootstrap/start/five-minute refresh.
- `src/scheduler/shutdown.ts` — idempotent schedule stop/Discord destroy.
- `src/logger/index.ts` — structured sanitized logging.

## Tests in root `npm test`

API/security:

- `tests/api/signing.test.ts`
- `tests/api/client.test.ts`
- `tests/api/admin-client.test.ts` — user/order/refund/Aura/wallet client contracts and retry identity
- `tests/architecture.test.ts` — no DB/legacy/forbidden operation regression

Config/auth:

- `tests/config/env.test.ts`
- `tests/config/admin-env.test.ts`
- `tests/discord/adminAuthorization.test.ts`
- `tests/discord/registerCommands.test.ts`

Commands:

- `tests/commands/aura.test.ts`
- `tests/commands/refreshLeaderboard.test.ts`
- `tests/commands/cm.test.ts` — `/cm user` and direct `/cm order`
- `tests/commands/cmSessions.test.ts`
- `tests/commands/cmAdjustments.test.ts` — changed-state abort and successful confirmed adjustment

Leaderboard/lifecycle/logging:

- `tests/leaderboard/format.test.ts`
- `tests/leaderboard/service.test.ts`
- `tests/scheduler/leaderboardSchedule.test.ts`
- `tests/scheduler/shutdown.test.ts`
- `tests/logger/redaction.test.ts`

## External ownership

This repository does **not** own:

- website API route implementation;
- Supabase migrations/RLS/grants/functions;
- wallet/order/payment/fulfillment accounting logic;
- OAuth/Support-role systems;
- production website integration-client env values.

Read-only website source may be used to verify contracts. Cross-repo mutations require separate explicit scope.
