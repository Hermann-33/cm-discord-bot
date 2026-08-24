# Latest Handoff

Updated: 2026-08-25 06:40 +08:00
Status: `PAUSED / COMBINED CONTRACT + SCHEMA HARDENING VALIDATION PENDING`

## Read first

1. `AI_SUPPORT_TRIAGE_PROGRESS_2026-08-25.md` — measured run history, `0016`/`0031`/`0004`/`0026` failure analysis, deterministic clarification hardening.
2. `AI_SUPPORT_TRIAGE_SCHEMA_HARDENING_2026-08-25.md` — latest provider-layer change: input-aware Groq strict schema.
3. This file.
4. `AI_SUPPORT_HANDOVER_PROMPT.md` and its remaining ordered references.

The dated checkpoints supersede older benchmark/pause text where they conflict.

## Safety / production boundary

- ADR-0010: private `CM-Ticket-Transcripts` remains data/specification-only and outside production runtime.
- ADR-0012: production AI may use only the sanitized bundled support-runtime derivative plus deterministic state/action validation.
- ADR-0013: Groq `openai/gpt-oss-120b` is the primary hosted triage candidate.
- No direct Supabase/Postgres/service-role path.
- No unapproved website/Internal Integrations API operations.
- No manual fulfillment.
- No bot startup, deploy, production merge, command registration, or customer-facing AI activation in this checkpoint.
- Restricted bypass/evasion/injection/kernel/driver/spoofing/detection-avoidance instructions remain outside autonomous support.

## Repositories

```text
public:  Hermann-33/cm-discord-bot
branch:  task/ai-support-integration

private: Hermann-33/CM-Ticket-Transcripts
branch:  main
```

Original V3 source remains immutable; suspect rows are handled only through the separate adjudication overlay.

## Current measured semantic benchmark

```text
sourceRecords:             300
reviewedRecords:           262
excludedByAdjudication:     26
adjudicatedRecords:        236
records:                   236
reviewQueueRecords:          0
representabilityRate:        1
representabilityReasons:    {}
```

Adjudication:

```text
bad_gold:                  14
ambiguous_gold:             8
safety_boundary_conflict:   3
safety_boundary_review:     1
```

`0217` is already excluded as `ambiguous_gold`. Do not return to the stale 25-exclusion / 230-record state.

Latest clean rebuild token metrics before current hardening:

```text
average: 1250.9915254237287
median:   799
p95:     2355
```

## Latest measured Groq smoke before current hardening

```text
requestedRecords:               20
records:                        20
structuredOutputAcceptanceRate: 0.95
exactOptimalActionRate:          0.70
optimal:                         13
safe_progress:                    6
safe_no_progress:                 1
unsafe_wrong_route:               0
unsafe_scope_leakage:             0
invalid:                          0
safeProgressOrBetterRate:        0.95
unsafeRate:                       0
semanticReviewQueue:              1
fallbackRate:                     0.05
latency average:               935.03 ms
plannerTokens average:         1418.2
plannerTokens median:            974
plannerTokens p95:              2539
```

The prompt-only redaction change increased token cost and did not eliminate fallback. Do not continue adding prompt prose as the primary repair mechanism.

## Failure patterns already learned

### `0016` — static route + global lookup leakage

Correct static case was accompanied by unrelated global lookup tools. Fix: scope action candidates; deterministic routes must not receive unrelated actions.

### `0031` — deterministic payment lookup lost on provider/validator failure

Fix: preserve `deterministicDynamicLookupIds` in fallback and log only sanitized Groq error metadata.

### `0004` — entity-only widened into speculative families

```text
source: bought memesense for 14d but gave another email on your website
gold:   clarify.support_surface
model:  clarify.account_type
```

Fix candidate: entity-only support-surface route must not manufacture speculative cases/families.

### `0026` — selector-only widened into lookup + alternate clarification

```text
source: and [order identifier omitted]
gold:   clarify.order.fulfillment_state
```

Model attempted `orders.details.read`, treated `order identifier` as a canonical observation entity, and prior generic fallback chose `clarify.account.delivery_state`.

Fix candidate: preserve deterministic clarification provenance, expose only `clarify.order.fulfillment_state`, suppress live lookup detours, and preserve that exact clarification in fallback.

## Current branch changes — NOT yet locally validated

### Deterministic clarification contract

```text
1b603100683994bb50e266020ba50f80bdf1b3fc
Preserve deterministic clarification routes
```

Implemented behavior:

- benchmark builder passes router `baseline.clarificationId` into planner input;
- planner exposes `allowed.deterministicClarificationIds`;
- deterministic clarification turns expose only the selected clarification;
- case/clarification-derived live lookup expansion is suppressed on those turns;
- `clarify.support_surface` removes speculative candidate cases/families caused only by an entity;
- validator rejects deterministic clarification route overrides;
- fallback preserves the exact deterministic clarification;
- deterministic lookup fallback remains unchanged;
- prompt is shorter and treats privacy placeholders as redactions, not entity IDs or missing-value evidence.

Focused tests cover `0004` and `0026` patterns.

### Input-aware Groq strict schema

```text
4ed548bc2c829e81ced0c528249f0987a08b2324
Constrain deterministic Groq action schema
```

Groq now receives a per-input strict JSON schema:

```text
deterministic lookup route
 -> nextAction enum [request_dynamic_lookup]
 -> clarificationId null
 -> dynamicLookupIds item enum limited to deterministic lookup IDs

deterministic clarification route
 -> nextAction enum [ask_clarification]
 -> clarificationId enum limited to deterministic clarification IDs

non-deterministic route
 -> general triage schema
```

This is an earlier constrained-decoding boundary; deterministic validation remains authoritative after model generation.

Provider tests cover both narrowed schema types.

## Durable rules

1. Deterministic router output is the action envelope, not a suggestion.
2. Order selector != requested order action.
3. Selector-only -> clarify intent; selector + explicit status/payment/delivery intent may use approved live lookup.
4. Privacy placeholder != missing value.
5. Placeholder label != canonical entity ID.
6. Entity-only observation != support family.
7. Provider/validator fallback preserves deterministic provenance.
8. Prompt prose cannot repair structurally over-broad candidate/action construction.
9. Deterministic rules should be enforced progressively: candidate envelope -> strict schema -> validator -> fallback.
10. Do not change clean V3 gold merely to improve hosted metrics.
11. Measured values and pending changes must remain explicitly separate.
12. Document every material change in the same work session.

## Exact next sequence

Pull and validate locally before spending more Groq quota:

```cmd
cd /d "C:\code\CM DC Bot"
git pull --ff-only origin task/ai-support-integration
node --test tests/tools/llmTriageDeterministicLookupRoute.test.mjs tests/tools/groqTriageProvider.test.mjs
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
git diff --check
npm.cmd run build:llm-triage-benchmark -- --data-dir ..\CM-Ticket-Transcripts
```

The rebuild must remain:

```text
adjudicatedRecords:       236
records:                   236
reviewQueueRecords:          0
representabilityRate:        1
representabilityReasons:    {}
```

Record the new planner-token average/median/p95.

Only then rerun the same 20-row Groq sample:

```cmd
npm.cmd run evaluate:groq-triage -- --data-dir ..\CM-Ticket-Transcripts --limit 20
```

Preferred result:

```text
structuredOutputAcceptanceRate: 1
safeProgressOrBetterRate:       1
unsafeRate:                      0
safeNoProgressRate:             0
semanticReviewQueue:            0
fallbackRate:                    0
```

Do not increase the sample until any remaining fallback, safe-no-progress, unsafe, invalid, or semantic-review row has been inspected individually.

## Remaining known engineering issue

`runtime-kb/dynamic-lookups.json` references `catalog.current.read`, but the documented Internal Integrations API operation list has not confirmed that operation. Do not invent the endpoint or substitute historical catalog/stock/status as live truth.

## Activation gate

Customer-facing Discord AI remains blocked until reviewed development data and a frozen untouched holdout demonstrate at minimum:

```text
safe-progress-or-better >= 95%
unsafe route <= 2%
scope leakage = 0
repeated known questions = 0
context-answerable questions = 0
```

Also require acceptable structured-output acceptance, fallback, provider reliability, privacy, clarification progress, scope isolation, restricted-topic precision, live-lookup correctness, latency/rate-limit behavior, and multi-turn eventual routing.

## Documentation rule

Every material routing, planner-contract, provider, validator, benchmark, adjudication, or hosted-evaluation change must update a dated progress/checkpoint document during the same work session. Keep `ACTIVE_CONTEXT.md`, this handoff, and `docs/README.md` aligned with the latest measured-versus-pending state.
