# Codebase Map

Updated: 2026-08-20

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
- `src/api/client.ts` — strict Internal Integrations API transport and typed operation methods, including pending purchase lookup.
- `src/api/schemas.ts` — strict core DTO mirrors/selectors/errors, including optional fulfillment support schema.
- `src/api/purchaseIntents.ts` — strict `purchase-intents.lookup.read` request/response DTO mirror for pending `/cm order` support.
- `src/api/errors.ts` — stable safe API errors.
- `src/config/env.ts` — Discord/API/admin environment validation.

Approved active API operations:

```text
aura.leaderboards.read
aura.lookup.read
users.overview.read
orders.details.read
orders.fulfillment.read
purchase-intents.lookup.read
orders.refund.preview
orders.refund.execute
users.aura.adjust
users.wallet.adjust
```

### Commands/admin console

- `src/commands/aura.ts` — customer `cm aura`.
- `src/commands/refreshLeaderboard.ts` — operational `/refresh-leaderboard`.
- `src/commands/cm.ts` — central `/cm` slash/button/modal controller; user lookup; canonical order-first + pending fallback; navigation/refund/adjustment/share routing.
- `src/commands/cmSessions.ts` — operator-bound bounded session with selected canonical order or pending purchase, mutation proposals and share view.
- `src/commands/cmOrderSupport.ts` — best-effort optional canonical-order fulfillment support enrichment; never blocks core order panel.
- `src/commands/cmPurchaseIntents.ts` — pending purchase refresh/owner validation and automatic transition to canonical order.
- `src/commands/cmUserActions.ts` — refresh user/order and explicit delivery-detail navigation.
- `src/commands/cmRefund.ts` — canonical refund preview/re-preview/execute/audit and share-success state.
- `src/commands/cmAdjustments.ts` — Aura/wallet parsing, confirmation, fresh-state equality, execute/audit and share-success state.
- `src/commands/cmUi.ts` — private Components V2 user/order/pending/delivery/refund/adjustment presentation.
- `src/commands/cmShare.ts` — dedicated customer-facing renderer governed by ADR-0008/0009/0011; masked support material excluded.
- `src/commands/cmSupport.ts` — safe messages, parsing, authorization wrapper and session retrieval.

### Discord boundaries

- `src/discord/adminAuthorization.ts` — ADR-0006 exact-guild + explicit-user `/cm` authorization.
- `src/discord/adminAudit.ts` — concise mention-safe Components V2 refund/Aura/wallet audit panels.
- `src/discord/presentation.ts` — Discord-safe text, identity and timestamp helpers.
- `src/discord/registerCommands.ts` — manual guild bulk overwrite for `/refresh-leaderboard` + `/cm`; TASK-CM-ADMIN-007 does not change command JSON.
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

### Ticket transcript exporter and analysis preparation

- `tools/ticket-transcript-exporter/run-ticket-transcript-export.mjs` — strict Discord-history wrapper that allows only exact `View Transcript` link buttons through discovery.
- `tools/ticket-transcript-exporter/export-ticket-transcripts.mjs` — original Discord discovery + HTML/Chrome acquisition module; retained for source-log discovery and historical raw-shell evidence.
- `tools/ticket-transcript-exporter/export-ticket-payloads.mjs` — schema-v2 structured extractor that reads `source-logs.jsonl`, calls Tickety's fixed `/api/ticketTranscript?id=<id>` endpoint, decodes `application/vnd.msgpack`, resolves message authors, and writes real message-level JSON/text/raw Msgpack artifacts.
- `tools/ticket-transcript-exporter/prepare-knowledge-analysis.mjs` — offline deterministic packer that consolidates the completed local schema-v2 data repository into line-addressable `analysis-input/corpus.ndjson`, deterministic review excerpts and corpus statistics for exhaustive knowledge-graph analysis.
- `tools/ticket-transcript-exporter/README.md` — discovery + structured extraction workflow.
- `tests/tools/ticketTranscriptExporter.test.mjs` — strict button discovery, URL restrictions, Discord-log parsing and legacy HTML helper tests.
- `tests/tools/ticketTranscriptPayloadExporter.test.mjs` — structured-export CLI, payload validation, user resolution and text-projection tests.
- `tests/tools/ticketTranscriptKnowledgeAnalysis.test.mjs` — analysis-packer path safety, complete-corpus consolidation, deterministic excerpting and provenance/statistics tests.

Boundary:

```text
Stage 1
Discord REST read-only history
  -> exact View Transcript button
  -> CM-Ticket-Transcripts/source-logs.jsonl

Stage 2
source-logs.jsonl
  -> https://tickety.top/api/ticketTranscript?id=<id>
  -> application/vnd.msgpack
  -> schema-v2 local corpus files

Stage 3
complete schema-v2 local corpus
  -> offline analysis packer
  -> CM-Ticket-Transcripts/analysis-input/corpus.ndjson
  -> CM-Ticket-Transcripts/analysis-input/review.ndjson
  -> corpus statistics/provenance
  -> source-grounded knowledge-graph review
```

The structured extraction stage does not rescan Discord and does not use the Discord bot token. It uses a local no-save `msgpackr` installation rather than adding a production dependency.

The analysis-packing stage makes no network calls and does not summarize with an LLM. Its review file is a deterministic triage aid only; original transcript records remain authoritative for any rule promoted into the final support knowledge graph.

No transcript tool is imported by `src/`, included in `tsconfig.build.json`, started by the bot, or connected to the Internal Integrations API/database.

## Root test inventory relevant to TASK-CM-ADMIN-007

- `tests/api/admin-client.test.ts` — pending lookup contract, optional fulfillment support, raw-field rejection, existing mutation retry contracts.
- `tests/commands/cm.test.ts` — order-first pending fallback, exact owner resolution, canonical transition, non-NOT_FOUND no-fallback.
- `tests/commands/cmUi.test.ts` — pending controls/private support rendering/manual inference safeguards.
- `tests/commands/cmShare.test.ts` — pending public field boundary; masked support/provider leakage prevention.
- `tests/architecture.test.ts` — exact API allowlist/no DB/no purchase-processing/manual-fulfillment shortcuts.
- `tests/discord/registerCommands.test.ts` — unchanged `/cm user` + `/cm order` command registration.

Side-project tooling coverage:

- `tests/tools/ticketTranscriptExporter.test.mjs`
- `tests/tools/ticketTranscriptPayloadExporter.test.mjs`
- `tests/tools/ticketTranscriptKnowledgeAnalysis.test.mjs`

All prior config/auth/refund/Aura/wallet/leaderboard/lifecycle/logging tests remain part of the root `npm test` gate.

## External ownership

This repo does not own website routes, Supabase migrations/RLS/grants/functions, wallet/order/payment/fulfillment accounting, OAuth/Support-role systems or production website integration-client environment values.

`Hermann-33/CM-Ticket-Transcripts` owns generated historical transcript corpus and derived data-only knowledge-analysis artifacts. The production bot has no runtime dependency on that repository.
