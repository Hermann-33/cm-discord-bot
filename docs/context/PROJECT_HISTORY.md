# Project History

Updated: 2026-08-24 10:49 +08:00

This file preserves important chronology without making historical architecture authoritative over current source/ADRs.

## 2026-05-29 — Initial standalone bot

The standalone Discord bot began with leaderboard, `cm aura` and `/refresh-leaderboard`, initially using narrow Supabase RPC access.

## 2026-05-29/30 — Presentation/hosting evolution

Leaderboard moved toward Components V2; `cm aura` became configured-guild-wide except one blocked channel. A root `index.js` host shim was added for hosts that execute the package entry directly. Repository published as `Hermann-33/cm-discord-bot`.

## 2026-08-10/11 — Internal API rebuild and legacy freeze

Commit `6dfe75f` froze old implementation under `legacy/`. Commit `d7a7f4e` rebuilt active production code around the signed website Internal Integrations API:

```text
old active model: bot -> Supabase RPC
current model: bot -> HMAC Internal Integrations API -> website-owned data/business layer
```

Active bot no longer carries Supabase/Postgres credentials.

## 2026-08-17 — Governance/security direction

Repository-resident context/workflow/audits/ADRs were installed. ADR-0005 clarified that `cm aura` intentionally remains a customer message command while staff/admin operations use slash/components/modals.

## 2026-08-17 — Private admin console and guild-wide `/cm`

TASK-CM-ADMIN-001 implemented `/cm user`, private Components V2 navigation and canonical refund. ADR-0006/TASK-CM-ADMIN-002 removed the shared `/cm` command-channel restriction while retaining exact configured guild + explicit `BOT_ADMIN_USER_IDS` + per-interaction authorization/session ownership.

## 2026-08-18 — Direct order + balance controls merged

TASK-CM-ADMIN-003 added `/cm order`, confirmed Aura/wallet adjustment and ADR-0007 fresh-state-bound confirmation while retaining canonical refund and blocked manual fulfillment. PR #1 merged at `4b10d74aa80d3fa5c5e5a27b82e4ccf109a880a8` after 113/113 tests plus typecheck/build/security gates.

## 2026-08-18 — Share to Chat / Discord UX merged

TASK-CM-ADMIN-004 added `/cm user` by email or selected Discord user, linked Discord identity presentation, separate customer-safe Share to Chat rendering, Discord timestamps, concise mutation audits and ADR-0008. PR #2 merged at `7a41dbeefae167044091b0aaed8372c3b58acdd0` after 127/127 tests plus typecheck/build/diff.

## 2026-08-18 — Customer email intentionally added to shared panels

TASK-CM-ADMIN-005 / ADR-0009 changed one disclosure decision: canonical customer account email is intentionally included in Share to Chat customer identity sections. All other no-control/internal-field exclusions remain. PR #3 merged at `9466d6f23a6c2027b0e88c32eb4e78ddeeeb61fd` after 128/128 tests and full verification.

## 2026-08-18 — Admin UI declutter merged

TASK-CM-ADMIN-006 compacted User Operations, recent orders, Order Operations, Delivery Details, mutation result/preview panels and customer shares without changing API/auth/mutation behavior. PR #4 merged at `6cef7695a09c8761d395f5d530bc79b7532c9b9f` after 131/131 tests, typecheck, build and diff check.

## 2026-08-19 — Ticket transcript corpus side project established

ADR-0010 established `Hermann-33/CM-Ticket-Transcripts` as a private data/specification-only repository. Exporter/tooling code lives under `tools/ticket-transcript-exporter/` in the bot repository and remains outside production runtime. The production bot has no runtime dependency on transcript data.

## 2026-08-19 — Pending purchase lookup and fulfillment support implemented

Website-side order support exposed the read boundaries required for canonical order-first pending purchase lookup and optional masked fulfillment support. TASK-CM-ADMIN-007 / ADR-0011 implemented the bot side while retaining `purchase-intents.process`, manual fulfillment and direct DB as forbidden.

## 2026-08-19/20 — Tickety structured corpus completed

Initial transcript-page HTML/Chrome extraction proved to be a JavaScript shell rather than the actual ticket content. HAR inspection identified Tickety's Msgpack API:

```text
GET https://tickety.top/api/ticketTranscript?id=<transcriptId>
Content-Type: application/vnd.msgpack
```

The public tooling decoded this path and converted the complete strict `View Transcript` discovery set into structured data.

Final corpus:

```text
strict transcript records: 1,578
structured tickets:        1,578 / 1,578
messages:                  39,090
extraction failures:       0
```

## 2026-08-20/22 — Exhaustive deep review and canonical KB

The corpus was processed through exhaustive deep-review/evidence/Obsidian graph layers, followed by canonicalization and runtime-KB compilation.

Confirmed state:

```text
historical fact nodes:     3,949
fact dispositions:         3,949 / 3,949
canonical runtime cases:   55
broken links:              0
fact nodes without evidence: 0
```

The architecture deliberately separated historical evidence from current/runtime truth, preserving dynamic facts, restrictions, contradictions and unresolved items. Historical tickets were not treated as a flat answer database.

## 2026-08-22/23 — First-turn inferability pivot

Initial retrieval/case-ranking work showed that many customer first turns do not contain enough information to infer the exact eventual historical case. The project changed evaluation/runtime semantics from “always classify a final case immediately” to “choose the safest next support action”.

Normative classes became:

```text
exact_case
family_only
entity_only
control_plane_only
insufficient_context
multi_intent
```

Targeted clarification and stateful context carry-forward became first-class behavior. The assistant must ask follow-up questions rather than guess when necessary.

## 2026-08-23 — Hosted LLM planner scaffold

ADR-0012 added a sanitized public `support-runtime/` derivative, explicit conversation state, hosted-planner input/output contracts, privacy sanitization, canonical-ID/scope/restriction/repetition validation and fail-closed provider behavior. Customer-facing Discord AI remained unwired.

OpenRouter was initially evaluated as a development adapter, but free-account/provider limits made it unsuitable as the preferred path.

## 2026-08-23/24 — Groq GPT-OSS selected as primary development provider

ADR-0013 selected Groq `openai/gpt-oss-120b` as the primary hosted triage candidate while preserving ADR-0012's deterministic and privacy boundaries.

Default planner configuration:

```text
temperature: 0
reasoning_effort: low
max_completion_tokens: 400
strict JSON schema
```

Groq authentication and strict structured outputs were successfully exercised. The provider remained a constrained semantic next-action planner, not a knowledge or execution authority.

## 2026-08-24 — V3 benchmark/gold representability remediation

Hosted smoke runs revealed that apparent model failures mixed genuine model choices with candidate construction defects and stale/ambiguous/safety-conflicting gold.

The older V1/V2 combined reviewed set was rejected as independent hosted-model semantic gold. The independently reviewed V3 set became consumed development gold, with original labels kept immutable and a separate adjudication overlay introduced.

The builder gained explicit gold representability checks so the LLM is not scored against actions it was never allowed to choose.

Targeted router/contract fixes included:

- payment typo normalization (`payed` -> `paid`);
- PayPal/payment-state routing;
- HWID reset recognition;
- explicit NFA activation;
- setup/config recognition;
- media/reseller/partnership recognition;
- current detection-status restricted routing;
- security-report escalation;
- controller compatibility false-positive prevention;
- product-comparison clarification;
- spoofer launch-failure clarification;
- turn-scoped lookup exposure instead of the global lookup catalog.

## 2026-08-24 — 20-row Groq diagnostic and lookup leak

A cleaned 20-row run produced:

```text
structured output acceptance: 100%
safe-progress-or-better:       95%
unsafe_wrong_route:              1 / 20
scope leakage:                   0
fallback:                        0
average latency:             ~823 ms
```

The one unsafe row was `hwid reset plssss`. The planner received the correct static HWID case but also unrelated global lookup options and selected `users.overview.read`.

This was treated as planner-contract leakage, not a clear model-semantic failure. Lookup exposure was tightened. The corrected `0016` planner input was verified offline with the HWID case only, zero live lookups, zero clarifications and a 693-token estimate. No hosted rerun occurred after that correction.

## 2026-08-24 — Current paused benchmark-cleanup checkpoint

The latest user-confirmed V3 rebuild after authoritative deterministic-lookup handling is:

```text
sourceRecords:             300
reviewedRecords:           262
adjudicatedRecords:        237
excludedByAdjudication:     25
representable records:     230
reviewQueueRecords:          7
representabilityRate:      0.9704641350210971
```

Six queue rows are bare/continuation order selectors that the deterministic router over-interprets as direct current-order lookup intent. One row (`0217`) says the order is delivered but `View Order` cannot be opened; its existing fulfillment-state clarification gold is likely stale/ambiguous because that state is already supplied.

The committed adjudication overlay still excludes 25 rows. The proposed `0217` exclusion has not been written. A future 236/236, queue-0 benchmark is only a projection until those changes are implemented and rebuilt.

The workstream was intentionally paused here so current state, architecture, benchmark history, unresolved rows and resume steps could be documented comprehensively.

Authoritative resume guides:

```text
docs/context/AI_SUPPORT_HANDOVER_PROMPT.md
docs/context/ACTIVE_CONTEXT.md
docs/context/AI_SUPPORT_SIDE_PROJECT.md
docs/context/HANDOFF.md
docs/GROQ_SUPPORT_TRIAGE.md
```

Customer-facing AI support remains disabled and unwired. No bot startup, command registration, deployment, website mutation or AI activation is part of this checkpoint.
