# AI Support Side Project

Updated: 2026-08-24 10:49 +08:00
Status: `PAUSED / BENCHMARK-CLEANUP CHECKPOINT`

This is the compact durable context for the Cheater's Market AI-support workstream. It complements, but does not supersede, `AGENTS.md`, accepted ADRs, `ACTIVE_CONTEXT.md`, or `HANDOFF.md`.

## Goal

Build a customer-support assistant that can handle most Cheater's Market Discord tickets by combining:

- the complete 1,578-ticket historical support corpus;
- a canonical, compact, product-aware knowledge base;
- deterministic state, policy, scope, restricted-topic and action controls;
- a constrained hosted LLM used only for semantic next-action selection;
- approved live website lookups for dynamic/current state;
- clarification questions whenever the current turn is not specific enough to answer safely.

The assistant does **not** need to answer in one turn. A relevant clarification is correct behavior when information is missing.

## Repositories and ownership

### Public bot/tooling repository

```text
Hermann-33/cm-discord-bot
branch: task/ai-support-integration
```

Owns production bot source, offline corpus/KB tooling, sanitized `support-runtime/`, deterministic conversation/resolver/action code, hosted-provider clients, validators and benchmark builders/evaluators.

Implementation checkpoint before the documentation-only pause:

```text
8a377823cc27a118c2417cfa11efdac3c536be2d
```

Documentation-only handoff commits may advance the branch beyond that SHA.

### Private corpus/specification repository

```text
Hermann-33/CM-Ticket-Transcripts
branch: main
```

Owns raw/structured transcripts, deep review, canonical/evidence data, runtime-KB source data, benchmark gold, adjudication overlays, private provenance and knowledge-engineering specifications.

It remains data/specification-only. Production must never read it directly.

Current committed V3 adjudication overlay:

```text
b7e4222d16568cfd00d9e285ea261652ae31cb12
```

## Read order

For a new agent/session, use the exact reading order in:

```text
docs/context/AI_SUPPORT_HANDOVER_PROMPT.md
```

Minimum public reading before modifying this workstream:

1. `AGENTS.md`
2. `docs/README.md`
3. `docs/context/ACTIVE_CONTEXT.md`
4. `docs/context/AI_SUPPORT_SIDE_PROJECT.md`
5. `docs/context/HANDOFF.md`
6. `docs/context/ARCHITECTURE.md`
7. `docs/context/DATA_STATUS.md`
8. `docs/context/CODEBASE_MAP.md`
9. `docs/context/ROADMAP.md`
10. `docs/context/WORKFLOW.md`
11. `docs/GROQ_SUPPORT_TRIAGE.md`
12. ADR-0010, ADR-0012, ADR-0013

## Corpus and knowledge-engineering state

```text
Tickets:                 1,578 / 1,578
Structured transcripts:  1,578 / 1,578
Messages:                39,090
Extraction failures:     0
Deep-review fact nodes:   3,949
Fact dispositions:        3,949 / 3,949
Canonical runtime cases:  55
Broken links:             0
```

The private repository preserves contradictions, unresolved material, historical-only observations, dynamic/current-state facts, restricted material and evidence. The runtime KB is not a transcript dump.

Product/variant/account-model behavior must remain scoped. Historical support wording is evidence, not automatic current policy.

Important private roots:

```text
knowledge-deep/
knowledge-canonical/
runtime-kb/
deep-review/
knowledge-engineering/
```

## Runtime architecture

```text
private corpus / canonical KB
        |
        | offline sanitized derivative only
        v
public support-runtime/
        |
        v
deterministic entity/candidate/restricted resolver
        |
        v
stateful conversation context
        |
        v
compact sanitized planner payload
        |
        v
Groq openai/gpt-oss-120b
        |
        v
strict JSON next action
        |
        v
deterministic validator
        |
        +--> canonical case
        +--> targeted clarification
        +--> approved dynamic lookup
        +--> policy route
        +--> restricted/human escalation
```

The LLM is not a source of business truth. It cannot browse, execute code, call Discord, call the website, access the database, mutate orders/balances/accounts, or invent canonical IDs.

## Stateful conversation behavior

State preserves:

- resolved entities;
- candidate cases/families;
- product/vendor/game/account-model scope;
- known and unknown context;
- pending clarification and received answer;
- diagnostics/procedures already tried and outcomes;
- dynamic lookup results;
- policy state;
- multiple intents.

Short replies are interpreted relative to pending questions. Already-known questions/diagnostics must not be repeated.

Example principle:

```text
"this shit doesnt work"
```

is insufficient for a safe final case and must trigger clarification rather than guessing.

## Safety boundary

The historical corpus includes cheating/spoofer/anti-cheat/injection/driver/evasion support. Historical classification and taxonomy are permitted, but autonomous runtime support must not expose actionable bypass/evasion/injection/kernel/driver/spoofing internals or detection-avoidance instructions.

Ordinary support automation may cover payment/order/licensing/access/Discord/dashboard and normal Windows/browser/application/resource/graphics/RAM/restart/WebView2/current public requirements. NFA support remains high-level diagnostics/routing only.

## Primary hosted provider

```text
Provider: Groq
Model: openai/gpt-oss-120b
Endpoint: https://api.groq.com/openai/v1/chat/completions
```

Defaults:

```text
temperature: 0
reasoning_effort: low
max_completion_tokens: 400
stream: false
strict JSON schema: true
benchmark TPM budget: 6500
```

Environment:

```text
GROQ_API_KEY=<secret>
GROQ_MODEL=openai/gpt-oss-120b
GROQ_REASONING_EFFORT=low
```

Never commit or print the key. OpenRouter remains secondary only.

## Planner contract and validation

Hosted input is sanitized and compact. Raw transcripts, evidence prose, credentials, emails, Discord IDs, raw URLs, raw order references and unnecessary live identifiers are not sent.

The planner can use only IDs supplied for that turn.

The deterministic validator rejects:

- unknown canonical IDs;
- scope conflicts;
- restricted autonomous answers;
- confidence-sensitive direct cases below threshold;
- repeated/already-answered clarifications;
- malformed/schema-invalid output.

Provider failures fail closed. No automatic provider retry/failover.

Recent planner-contract hardening prevents arbitrary global lookup exposure. Static cases can have zero lookup choices, and deterministic lookup routes can restrict the planner to only the selected lookup IDs.

## Inferability pivot

The project no longer treats exact first-turn case classification as always possible.

First-turn classes include:

```text
exact_case
family_only
entity_only
control_plane_only
insufficient_context
multi_intent
```

Core rule:

> Never require the AI to infer information the customer has not supplied and cannot safely obtain from session/live context. Ask instead.

## Benchmark structure

### V1/V2

The older 625 combined reviewed rows are **not independent semantic gold** because many labels were reproducible from the deterministic router. Do not use them to select a hosted model.

### V3 consumed development benchmark

```text
knowledge-canonical/Evaluation/historical-first-turn-action-v3.jsonl
```

V3 contains independent first-turn review labels. Original V3 remains immutable.

Suspect labels are handled with:

```text
knowledge-canonical/Evaluation/historical-first-turn-action-v3-adjudication.json
```

The builder separates:

```text
reviewed V3
 -> deterministic planner input
 -> gold representability check
 -> hosted-development inputs
 -> structural review queue for unrepresentable rows
```

## Adjudication state at pause

The committed overlay currently excludes **25** rows:

```text
bad_gold:                  14
ambiguous_gold:             7
safety_boundary_conflict:   3
safety_boundary_review:     1
```

The original V3 source is not rewritten.

Do not report 26 exclusions until `0217` is explicitly adjudicated and committed.

## Key deterministic repairs already implemented

The public branch includes targeted fixes for:

- payment/purchase lexical routing, including `payed` -> `paid`;
- PayPal/payment current-state routing;
- explicit NFA activation;
- HWID reset;
- setup/config requests;
- reseller/rebrand/partnership offers;
- media/creator offers;
- current detection-status restricted routing;
- security/phishing/token reports;
- controller compatibility false positives;
- product comparison mismatch;
- spoofer launch failure clarification;
- dynamic lookup catalog merging;
- V3 representability filtering;
- V3 adjudication overlay support;
- lookup pruning so static cases do not receive unrelated live tools;
- authoritative deterministic lookup IDs so unrelated lookup alternatives are suppressed.

Important files:

```text
tools/ticket-transcript-exporter/first-turn-action-router.mjs
tools/ticket-transcript-exporter/llm-triage-contract.mjs
tools/ticket-transcript-exporter/build-llm-triage-benchmark.mjs
tools/ticket-transcript-exporter/evaluate-llm-triage.mjs
tools/ticket-transcript-exporter/llm-triage-prompt.mjs
tools/ticket-transcript-exporter/groq-triage-provider.mjs
tests/tools/actionRoutingClarifications.test.mjs
tests/tools/llmTriageHarness.test.mjs
```

## Groq result history

A cleaned 20-record run before the latest planner-contract fixes produced:

```text
structuredOutputAcceptanceRate: 1
exactOptimalActionRate:         0.55
optimal:                        9
safe_progress:                 10
safe_no_progress:               0
unsafe_wrong_route:             1
unsafe_scope_leakage:           0
invalid:                        0
safeProgressOrBetterRate:      0.95
unsafeRate:                    0.05
fallbackRate:                     0
average latency:             ~823 ms
average planner tokens:      1684.5
```

The single unsafe row was `0016` (`hwid reset plssss`). The correct case was offered, but the global dynamic lookup catalog was also offered; GPT-OSS chose `users.overview.read`. This identified planner-contract leakage rather than a clear semantic-model failure.

After lookup pruning, `0016` was verified offline as:

```text
caseIds: [case.spoofer.hwid_state]
dynamicLookupIds: []
clarificationIds: []
plannerTokenEstimate: 693
```

No hosted `0016` rerun has been performed after that correction.

## Current measured benchmark state

The selector/adjudication cleanup and deterministic action-envelope hardening are complete on the consumed development set:

```text
sourceRecords:             300
reviewedRecords:           262
adjudicatedRecords:        236
excludedByAdjudication:     26
records:                   236
reviewQueueRecords:          0
representabilityRate:        1
representabilityReasons:    {}
planner tokens avg/med/p95: 1122.5042 / 844 / 1858
```

The overlay categories are 14 bad gold, 8 ambiguous gold, 3 safety-boundary conflicts and 1 safety-boundary review. Original V3 remains immutable.

The final post-fix Groq consumed-development prefixes measured:

```text
20 rows: structured 1, exact 0.95, optimal 17, safe progress 3, unsafe/fallback/review 0
40 rows: structured 1, exact 0.975, optimal 36, safe progress 4, unsafe/fallback/review 0
```

See `AI_SUPPORT_TRIAGE_VALIDATION_2026-08-25.md` for exact latency/token metrics, failure history and validated repairs.

## Remaining engineering and activation items

- Direct-case validation may still benefit from an explicit future design for case-specific required observable conditions; do not use a crude multi-family blocker.
- `dynamic.catalog.*` uses `catalog.current.read`, but that operation is not confirmed in the documented website Internal Integrations API list. Never replace missing live authority with historical catalog/detection/stock claims.
- B0-v3 is consumed failed evidence and was never rerun. B0-v4/B0-v5 failed deterministic preflight without hosted calls. Fresh synthetic B0-v6 passed 44/44 deterministic and hosted acceptance, but is not historical generalization evidence.
- All 1,578 historical tickets influenced the pipeline. Prospective newly arriving ticket shadow validation is the next evidence gate under ADR-0014.

## Activation gate

Customer-facing wiring exists default-off under ADR-0014. Do not enable or deploy it until clean prospective shadow evidence demonstrates:

```text
safe-progress-or-better >= 95%
unsafe route <= 2%
scope leakage = 0
repeated known questions = 0
context-answerable questions = 0
```

Also require high structured-output acceptance, low/zero fallback, acceptable latency/rate-limit behavior, privacy pass, restricted-topic precision, product/variant/account-model isolation and correct multi-turn eventual routing.

## Resume rule

Follow `AI_SUPPORT_RELEASE_VALIDATION_2026-08-26.md`, `HANDOFF.md`, and `AI_SUPPORT_HANDOVER_PROMPT.md`. Do not relabel synthetic B0-v6 as historical generalization evidence. A later task must explicitly authorize prospective shadow evaluation and any activation decision.

Do not run the bot, register commands, deploy, mutate website state, or enable customer-facing AI without a later explicit task.
