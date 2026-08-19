# Codebase Map

Updated: 2026-08-19

## Repository boundaries

| Path | Responsibility |
| --- | --- |
| `src/` | active production TypeScript |
| `tests/` | active Node test suite |
| `tools/` | explicitly scoped non-production utilities; never imported by `src/` |
| `legacy/` | frozen historical implementation; never import/execute from active source |
| `docs/context/` | canonical current state/workflow/handoff |
| `docs/decisions/` | durable ADRs |
| `docs/security/` | specialist security models |
| `.env.example` | non-secret deployment variable names only |
| `.github/workflows/ci.yml` | Node 22 verification gate |

Never commit `.env`, `dist/`, `node_modules`, logs, archives, generated transcript data or real credentials.

## Active production source

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
- `src/commands/cmSessions.ts` — operator-bound bounded session plus selected order, mutation proposals and current share view.
- `src/commands/cmUserActions.ts` — refresh user/order and delivery-detail navigation; updates share state.
- `src/commands/cmRefund.ts` — canonical refund preview/re-preview/execute/audit and share-success state.
- `src/commands/cmAdjustments.ts` — Aura/wallet parsing, confirmation, fresh-state equality, execute/audit and share-success state.
- `src/commands/cmUi.ts` — compact private Components V2 presentation.
- `src/commands/cmShare.ts` — compact dedicated customer-facing renderer governed by ADR-0008/ADR-0009.
- `src/commands/cmSupport.ts` — safe messages, parsing, authorization wrapper and session retrieval.

### Discord boundaries

- `src/discord/adminAuthorization.ts` — ADR-0006 exact-guild + explicit-user `/cm` authorization.
- `src/discord/adminAudit.ts` — concise mention-safe Components V2 refund/Aura/wallet audit panels.
- `src/discord/presentation.ts` — shared Discord-safe text, identity and timestamp helpers.
- `src/discord/registerCommands.ts` — manual guild bulk overwrite for `/refresh-leaderboard` + `/cm`.
- `src/discord/safeMessages.ts` — safe mention/channel/message helpers.
- `src/discord/client.ts` — intents; Message Content remains intentional while `cm aura` is text-based.

### Leaderboard/lifecycle/logging

- `src/leaderboard/format.ts` — Components V2 leaderboard rendering.
- `src/leaderboard/service.ts` — fetch/create/edit + overlap lock.
- `src/leaderboard/types.ts` — narrow leaderboard/read contracts.
- `src/scheduler/leaderboardSchedule.ts` — bootstrap/immediate/five-minute refresh.
- `src/scheduler/shutdown.ts` — idempotent shutdown.
- `src/logger/index.ts` — structured sanitized logging.

## Non-production tooling

### Ticket transcript exporter

- `tools/ticket-transcript-exporter/export-ticket-transcripts.mjs` — Phase T1 standalone Discord/Tickety corpus exporter.
- `tools/ticket-transcript-exporter/README.md` — local execution/sample/bulk workflow.
- `tests/tools/ticketTranscriptExporter.test.mjs` — URL allowlisting, Discord-log parsing, HTML text extraction, attachment candidates, message-count heuristics and sample/bulk CLI safety tests.

Boundary:

```text
tools/ticket-transcript-exporter
  -> Discord REST read-only history
  -> Tickety transcript HTTPS read
  -> local CM-Ticket-Transcripts checkout
```

It is not imported by `src/`, is not included in `tsconfig.build.json`, is not started by the bot and does not call the Internal Integrations API or database.

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
- `tests/commands/cm.test.ts`
- `tests/commands/cmSessions.test.ts`
- `tests/commands/cmAdjustments.test.ts`
- `tests/commands/cmShare.test.ts`
- `tests/commands/cmShareAuthorization.test.ts`
- `tests/commands/cmUi.test.ts`
- `tests/discord/adminAudit.test.ts`

Lifecycle/leaderboard/logging:

- `tests/leaderboard/format.test.ts`
- `tests/leaderboard/service.test.ts`
- `tests/scheduler/leaderboardSchedule.test.ts`
- `tests/scheduler/shutdown.test.ts`
- `tests/logger/redaction.test.ts`

Side-project tooling:

- `tests/tools/ticketTranscriptExporter.test.mjs`

## External ownership

This repo does not own website routes, Supabase migrations/RLS/grants/functions, wallet/order/payment/fulfillment accounting, OAuth/Support-role systems or production website integration-client environment values.

`Hermann-33/CM-Ticket-Transcripts` owns the generated historical transcript corpus only. The production bot has no runtime dependency on that repository.
