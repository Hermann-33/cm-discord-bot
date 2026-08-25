# Codebase Map

Updated: 2026-08-24 10:49 +08:00

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
| `.github/workflows/ci.yml` | Node verification gate |
| `support-runtime/` | generated sanitized canonical runtime bundle; never raw/private evidence |

Never commit `.env`, `dist/`, `node_modules`, logs, archives, generated transcript data or real credentials.

## Active production source

### Runtime/API

- `src/index.ts` — composition root; Discord/API/services/controller/schedule/shutdown wiring.
- `src/api/signing.ts` — fragile canonical HMAC request signing.
- `src/api/client.ts` — strict Internal Integrations API transport and typed operation methods.
- `src/api/schemas.ts` — strict core DTO mirrors/selectors/errors, including optional fulfillment support schema.
- `src/api/purchaseIntents.ts` — strict `purchase-intents.lookup.read` request/response DTO mirror for pending `/cm order` support.
- `src/api/errors.ts` — stable safe API errors.
- `src/config/env.ts` — Discord/API/admin plus hosted-AI environment validation/defaults.

### AI support source — scaffolded, not customer-enabled

- `src/ai/groqClient.ts` — primary hosted Groq structured-output triage client for `openai/gpt-oss-120b`; no automatic retry.
- `src/ai/openRouterClient.ts` — optional secondary OpenRouter development adapter.
- `src/ai/privacy.ts` — outbound planner PII/credential/reference sanitizer.
- `src/ai/supportTriage.ts` — production-side structured decision schema/validation/fallback boundary.
- `src/ai/runtimePack.ts` — integrity-checked loader for the bundled public support runtime only.
- `src/ai/supportConversation.ts` — explicit state model, pending-answer consumption and resolver/planner/action interfaces.
- `src/ai/index.ts` — AI support exports.
- `support-runtime/` — generated sanitized runtime artifacts and integrity metadata; no raw historical evidence/provenance.

Customer-facing Discord entrypoints are intentionally **not wired** to this support planner yet.

Important validator caveat: direct-case validation still needs a future explicit design for case-specific required observable conditions. Do not replace that with a crude `multiple candidate families => reject direct answer` rule.

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

## Current website operation context

Existing admin/leaderboard source uses an explicit least-privilege subset of the HMAC Internal Integrations API. `purchase-intents.process` remains forbidden.

Private AI runtime definitions also contain dynamic lookup concepts. In particular, `dynamic.catalog.*` currently refers to `catalog.current.read`, but that operation is not confirmed in the documented website operation catalog. This is an unresolved API-contract gap, not permission to invent an endpoint or use historical catalog state.

See `DATA_STATUS.md` for the current operation/data boundary.

## Non-production ticket/AI tooling

All executable corpus, canonicalization, routing and hosted-evaluation tooling remains under:

```text
tools/ticket-transcript-exporter/
```

It is not imported by `src/`, not called by production bot startup, and not a runtime dependency on the private corpus repository.

### Corpus discovery/extraction

- `run-ticket-transcript-export.mjs` — strict Discord-history wrapper; exact `View Transcript` link buttons only.
- `export-ticket-transcripts.mjs` — original discovery / legacy HTML-shell acquisition support.
- `export-ticket-payloads.mjs` — schema-v2 Tickety Msgpack API extractor reading existing source logs.
- `prepare-knowledge-analysis.mjs` — offline complete-corpus analysis packer.

### Canonical knowledge / evaluation tooling

- `build-canonical-support-kb.mjs` — canonical graph/runtime compiler for an explicitly supplied private data directory.
- `synthesize-support-cases.mjs` — corpus-wide case synthesis / coverage ledgers / holdout preparation.
- `validate-canonical-support-kb.mjs` — disposition/relationship/wikilink/runtime/privacy validation.
- `validate-canonical-support-evaluation.mjs` — sanitized evaluation-set validation.
- `evaluate-canonical-support-retrieval.mjs` — local deterministic retrieval baseline.
- `build-canonical-clarifications.mjs` — canonical clarification artifacts.
- `select-canonical-clarification.mjs` — information-gain clarification selection.
- `resolve-canonical-support-state.mjs` — deterministic state transition/replay support.

### First-turn / LLM planner tooling

- `first-turn-action-router.mjs` — deterministic first-turn observability/inferability router; currently has the documented bare-order-selector overreach pending correction.
- `build-llm-triage-benchmark.mjs` — creates compact V3 hosted-planner inputs, applies adjudication overlay and checks gold representability.
- `llm-triage-contract.mjs` — planner input construction, turn-scoped lookup exposure, output validation and safe fallback.
- `llm-triage-prompt.mjs` — constrained hosted planner messages/schema/token estimate.
- `groq-triage-provider.mjs` — Groq development provider adapter.
- `openrouter-triage-provider.mjs` — secondary OpenRouter adapter.
- `evaluate-llm-triage.mjs` — hosted planner evaluator, safety/progress classification and benchmark pacing.
- `llm-triage-provider.mjs` — provider/local-endpoint support helpers.
- `support-runtime-privacy.mjs` — hosted benchmark/runtime payload privacy helpers.
- `import-support-runtime-pack.mjs` — operator-controlled allowlisted private-runtime -> public `support-runtime/` importer.

### Relevant tool tests

- `tests/tools/ticketTranscriptExporter.test.mjs`
- `tests/tools/ticketTranscriptPayloadExporter.test.mjs`
- `tests/tools/ticketTranscriptKnowledgeAnalysis.test.mjs`
- `tests/tools/actionRoutingClarifications.test.mjs` — first-turn inferability/routing regression coverage, including payment, NFA, HWID, controller and partnership cases.
- `tests/tools/llmTriageHarness.test.mjs` — planner contract/validation/lookup exposure/representability tests.
- `tests/tools/llmTriageEvaluation.test.mjs`
- `tests/tools/groqTriageProvider.test.mjs`

Production-side Groq coverage also includes `tests/ai/groqClient.test.ts` and related AI support tests.

## Current benchmark checkpoint

Current source V3 remains immutable. The committed adjudication overlay excludes 26 rows. Latest generated planner benchmark:

```text
reviewed:                 262
adjudicated:              236
representable records:    236
review queue:               0
representability:        100%
```

The post-fix 40-row Groq development prefix produced 36 optimal and 4 safe-progress rows, with zero unsafe/fallback/invalid/leakage/review rows. The final holdout remains untouched.

See:

```text
docs/context/HANDOFF.md
docs/context/AI_SUPPORT_SIDE_PROJECT.md
docs/context/AI_SUPPORT_HANDOVER_PROMPT.md
docs/GROQ_SUPPORT_TRIAGE.md
```

before touching these files.

## Private data/specification ownership

`Hermann-33/CM-Ticket-Transcripts` owns:

- raw/structured transcript data;
- deep-review/evidence graph;
- canonical/private runtime-KB source;
- V3 benchmark source labels;
- adjudication overlays;
- knowledge-engineering specifications;
- generated private audit/evaluation artifacts.

It must remain data/specification-only and never become a production filesystem/runtime dependency.

## External ownership

This repo does not own website routes, Supabase migrations/RLS/grants/functions, wallet/order/payment/fulfillment accounting, OAuth/Support-role systems or production website integration-client environment values.

Any website/API/database contract change is a separate task and cannot be inferred from private historical ticket data.
