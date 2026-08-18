# Codebase Map

Updated: 2026-08-18

## Repository boundaries

| Path | Responsibility |
| --- | --- |
| `src/` | active production TypeScript |
| `tests/` | active Node test suite |
| `legacy/` | frozen historical implementation; never import/execute from active source |
| `docs/context/` | canonical current state/workflow/handoff |
| `docs/decisions/` | durable ADRs |
| `docs/security/` | specialist security models |
| `.env.example` | non-secret deployment variable names only |
| `.github/workflows/ci.yml` | Node 22 verification gate |

Never commit `.env`, `dist/`, `node_modules/`, logs, archives or real credentials.

## Active source

### Runtime/API

- `src/index.ts` — composition root; Discord/API/services/controller/schedule/shutdown wiring.
- `src/api/signing.ts` — fragile canonical HMAC request signing.
- `src/api/client.ts` — strict Internal Integrations API transport and typed operation methods.
- `src/api/schemas.ts` — strict Zod DTO mirrors/selectors/errors.
- `src/api/errors.ts` — stable safe API errors.
- `src/config/env.ts` — Discord/API/admin environment validation.

Approved active API paths remain:

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

### Commands/admin console

- `src/commands/aura.ts` — customer `cm aura`.
- `src/commands/refreshLeaderboard.ts` — operational `/refresh-leaderboard`.
- `src/commands/cm.ts` — central `/cm` slash/button/modal controller; email/Discord user lookup; direct order entry; share dispatch; navigation/refund/adjustment routing.
- `src/commands/cmSessions.ts` — operator-bound bounded session plus selected order, mutation proposals and current safe-share view.
- `src/commands/cmUserActions.ts` — refresh user/order and fulfillment navigation; updates safe-share state.
- `src/commands/cmRefund.ts` — canonical refund preview/re-preview/execute/audit and share-success state.
- `src/commands/cmAdjustments.ts` — Aura/wallet parsing, confirmation, fresh-state equality, execute/audit and share-success state.
- `src/commands/cmUi.ts` — private Components V2 user/order/fulfillment/refund/adjustment panels, Discord identity/timestamps and Share to Chat buttons.
- `src/commands/cmShare.ts` — **dedicated customer-safe public renderer and channel publisher**; no admin controls/private fields.
- `src/commands/cmSupport.ts` — safe messages, parsing, authorization wrapper and session retrieval.

### Discord boundaries

- `src/discord/adminAuthorization.ts` — ADR-0006 exact-guild + explicit-user `/cm` authorization.
- `src/discord/adminAudit.ts` — concise mention-safe Components V2 refund/Aura/wallet audit panels.
- `src/discord/presentation.ts` — shared Discord-safe text, linked Discord identity and `<t:...:f> · <t:...:R>` timestamp helpers.
- `src/discord/registerCommands.ts` — manual guild bulk overwrite for `/refresh-leaderboard` + `/cm`.
- `src/discord/safeMessages.ts` — `safeAllowedMentions` and safe leaderboard channel/message helpers.
- `src/discord/client.ts` — intents; Message Content remains intentional while `cm aura` is text-based.

### Leaderboard/lifecycle/logging

- `src/leaderboard/format.ts` — Components V2 leaderboard rendering.
- `src/leaderboard/service.ts` — fetch/create/edit + overlap lock.
- `src/leaderboard/types.ts` — narrow leaderboard/read contracts.
- `src/scheduler/leaderboardSchedule.ts` — bootstrap/immediate/five-minute refresh.
- `src/scheduler/shutdown.ts` — idempotent shutdown.
- `src/logger/index.ts` — structured sanitized logging.

## Root test inventory

API/security:

- `tests/api/signing.test.ts`
- `tests/api/client.test.ts`
- `tests/api/admin-client.test.ts`
- `tests/architecture.test.ts`

Config/auth/registration:

- `tests/config/env.test.ts`
- `tests/config/admin-env.test.ts`
- `tests/discord/adminAuthorization.test.ts`
- `tests/discord/registerCommands.test.ts`

Commands/admin presentation:

- `tests/commands/aura.test.ts`
- `tests/commands/refreshLeaderboard.test.ts`
- `tests/commands/cm.test.ts` — email/Discord user/order routing and pre-backend validation.
- `tests/commands/cmSessions.test.ts` — ownership/expiry/default safe-share view.
- `tests/commands/cmAdjustments.test.ts` — adjustment confirmation/audit/share state.
- `tests/commands/cmShare.test.ts` — customer-safe field/control boundary and channel publish behavior.
- `tests/commands/cmUi.test.ts` — Discord link state and absolute+relative timestamps.
- `tests/discord/adminAudit.test.ts` — concise Components V2 audit + mention safety/time presentation.

Lifecycle/leaderboard/logging:

- `tests/leaderboard/format.test.ts`
- `tests/leaderboard/service.test.ts`
- `tests/scheduler/leaderboardSchedule.test.ts`
- `tests/scheduler/shutdown.test.ts`
- `tests/logger/redaction.test.ts`

## External ownership

This repo does not own website routes, Supabase migrations/RLS/grants/functions, wallet/order/payment/fulfillment accounting, OAuth/Support-role systems or production website integration-client environment values. Read-only website source can verify contracts; cross-repo writes require separate scope.
