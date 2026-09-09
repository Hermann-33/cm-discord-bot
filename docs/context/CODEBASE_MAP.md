# Codebase Map

Updated: 2026-09-09

## Repository boundaries

| Path | Responsibility |
| --- | --- |
| `src/` | active production TypeScript |
| `tests/` | active Node test suite |
| `tools/` | scoped non-production utilities; never imported by production `src/` |
| `legacy/` | frozen historical implementation |
| `docs/context/` | current state/workflow/handoff/history |
| `docs/decisions/` | durable ADRs |
| `docs/security/` | specialist security models |
| `.env.example` | non-secret variable names/default guidance only |
| `.github/workflows/ci.yml` | Node verification gate |
| `support-runtime/` | generated sanitized canonical runtime bundle + integrity manifest |

Never commit `.env`, generated transcripts, raw customer evidence, provider keys, HMAC secrets, database credentials, `dist/`, `node_modules`, logs or archives.

## Composition / API

- `src/index.ts` — composition root; Discord/API/services/admin/support-AI/schedule/shutdown wiring.
- `src/api/signing.ts` — canonical HMAC signing.
- `src/api/client.ts` — strict Internal Integrations API transport/typed operations.
- `src/api/schemas.ts`, `src/api/purchaseIntents.ts` and `src/api/supportTickets.ts` — strict DTO mirrors.
- `src/api/errors.ts` — stable safe API errors.
- `src/config/env.ts` — Discord/API/admin plus AI/shadow configuration validation.

## AI support runtime

- `src/ai/firstTurnRouter.ts` — deterministic first-turn observability/control-plane routing.
- `src/ai/deterministicResolver.ts` — bounded candidate/action envelope from runtime + state.
- `src/ai/groqClient.ts` — Groq `openai/gpt-oss-120b` strict structured-output planner client.
- `src/ai/openRouterClient.ts` — secondary development adapter only.
- `src/ai/privacy.ts` — outbound PII/credential/reference sanitizer.
- `src/ai/supportTriage.ts` — decision schema, input-aware JSON schema, deterministic validation/fallback.
- `src/ai/runtimePack.ts` — manifest/integrity checked bundled runtime loader.
- `src/ai/supportConversation.ts` — bounded multi-turn state and resolver/planner/action contracts.
- `src/ai/actionResolver.ts` — deterministic customer action/response rendering and approved read routing.
- `src/ai/supportLookup.ts` — approved read-only lookup mapping/boundary.
- `src/ai/shadowValidation.ts` — prospective cohort/evidence/adjudication/metrics contracts.
- `src/discord/supportAi.ts` — exact guild/channel/category eligibility, visible vs no-reply shadow behavior.
- `tools/ai-support-shadow.ts` — local cohort operational CLI.
- `support-runtime/` — public sanitized runtime derivative; no raw transcript repository dependency.

### Current AI status

Visible AI is presently authorized only for ADR-0015's exact channel `1542084649017286727`, with the category allowlist empty. Source remains configuration-driven; the channel is not hard-coded.

The active `task/ai-support-response-reconstruction` branch is expected to add a reviewed sanitized customer-response guidance artifact and related extraction/coverage tooling. No response-reconstruction implementation commit existed at the 2026-08-31 docs baseline.

## Commands/admin console

- `src/commands/aura.ts` — customer `cm aura`.
- `src/commands/refreshLeaderboard.ts` — operational `/refresh-leaderboard`.
- `src/commands/cm.ts` — central `/cm` controller.
- `src/commands/cmSessions.ts` — operator-bound bounded session state.
- `src/commands/cmOrderSupport.ts` — best-effort fulfillment support enrichment.
- `src/commands/cmPurchaseIntents.ts` — pending purchase refresh/owner validation/transition and submitted-approval recovery.
- `src/commands/cmPurchaseApproval.ts` — ADR-0018 reason/evidence capture, confirmation, canonical target validation, idempotent `purchase-intents.process`, audit and processing/success presentation.
- `src/commands/cmUserActions.ts` — refresh/navigation.
- `src/commands/cmRefund.ts` — interactive canonical refund workflow.
- `src/commands/cmAdjustments.ts` — interactive Aura/wallet adjustment workflow plus shared signed-delta parsers.
- `src/commands/cmDirectMutations.ts` — ADR-0017 one-command Aura, wallet-balance and canonical-refund execution with canonical target validation, idempotency, audit, final-only private output and ADR-0018 share-session creation.
- `src/commands/cmUi.ts` — private Components V2 presentation.
- `src/commands/cmShare.ts` — dedicated customer-safe sharing renderer.
- `src/commands/cmSupport.ts` — safe messages/parsing/authorization/session helpers.

## Discord/security boundaries

- `src/discord/adminAuthorization.ts` — exact-guild + explicit-user `/cm` authorization.
- `src/discord/adminAudit.ts` — concise mention-safe mutation audit panels, including support-ticket override audit.
- `src/discord/ticketLinkGate.ts` — Tickety recognition, creator resolution, durable website-state recovery, permission gating/re-enforcement, eight-hour activity-triggered renewal, recheck UI, `/cm ticket-allow`, explicit creator `GuildMember` resolution before permission edits, structured Discord REST permission-error diagnostics, and visible operator-attributed ticket override notices.
- `src/discord/presentation.ts` — safe text/identity/timestamp helpers.
- `src/discord/registerCommands.ts` — manual `/refresh-leaderboard` + `/cm` registration; `/cm` currently includes `user`, `order`, `aura`, `balance`, `refund`, and `ticket-allow`.
- `src/discord/safeMessages.ts` — safe mention/channel/message helpers.
- `src/discord/client.ts` — intents; Message Content is intentional for message-based customer features.

## Leaderboard/lifecycle/logging

- `src/leaderboard/*` — rendering/service/types.
- `src/scheduler/*` — refresh + shutdown lifecycle.
- `src/logger/index.ts` — structured sanitized logs.

## Internal Integrations API rule

Production uses only explicit reviewed concrete website operations. Abstract KB operation names are not endpoint names. `catalog.current.read` remains unconfirmed/unavailable. Customer AI has read-only authority; admin refund/Aura/wallet/purchase-processing mutations remain deterministic allowlisted paths. Interactive paths retain explicit preview/confirm behavior, while ADR-0017 direct slash paths treat the command submission itself as confirmation and remain audited/idempotent.

The support-ticket gate adds only the closed operations `support.tickets.access.read`, `support.tickets.verify`, and `support.tickets.override`. Durable ticket access lives upstream; the bot does not add SQLite, a Northflank volume dependency, Supabase credentials, or a direct DB fallback.

See `DATA_STATUS.md`.

## Offline transcript / knowledge tooling

Executable tooling remains under:

```text
tools/ticket-transcript-exporter/
```

Major responsibilities include:

- Discord/Tickety transcript discovery/extraction;
- structured Msgpack decoding;
- complete-corpus analysis packing;
- canonical KB/case/clarification/state compilation;
- privacy/reference validation;
- deterministic routing and inferability evaluation;
- hosted planner benchmark construction/evaluation;
- operator-controlled private-runtime -> public-runtime import.

It is never imported by production bot startup.

The active response-reconstruction task should extend this tooling rather than placing executable extraction/analysis code in `CM-Ticket-Transcripts`.

## Evaluation checkpoint

Consumed development V3 reached 236/236 adjudicated rows with review queue 0. B0-v3 failed and was consumed; B0-v4/B0-v5 failed deterministic preflight; B0-v6 passed once at 44/44 accepted/exact, 0 fallback and 3/3 restricted safety.

Because response reconstruction changes routing/knowledge/rendering, B0-v6 does not certify the next candidate. A fresh B0-v7-or-later set is required after the new implementation is frozen.

## Private data/spec ownership

`Hermann-33/CM-Ticket-Transcripts` owns raw/structured transcripts, evidence/deep review, private canonical/runtime source, evaluation labels/overlays and knowledge-engineering specifications. It remains private and data/specification-only.

## Fragile boundaries

- HMAC canonicalization/retries;
- strict DTO validation and website `allowedOperations`;
- authorization before sensitive access;
- customer AI exact surface allowlisting;
- deterministic action/schema/validator/fallback agreement;
- restricted fail-closed behavior;
- no private-corpus runtime dependency;
- runtime sanitizer + manifest integrity;
- operator session ownership;
- `NOT_FOUND`-only pending-purchase fallback;
- optional fulfillment support must not block core controls;
- masked/raw secret separation;
- mutation fresh-state/idempotency/audit requirements;
- no invented API operations/direct DB shortcuts;
- no model-selected mutation authority;
- ticket-gate creator resolution must never guess ambiguous member overwrites;
- expired ticket verification remains creator-activity-driven, not timer/poll-driven;
- locked ticket permissions must survive Tickety rewrite events without touching staff role overwrites.
