# Active Context

Updated: 2026-08-25 06:40 +08:00

## Read order for AI-support work

1. `AI_SUPPORT_TRIAGE_PROGRESS_2026-08-25.md`
2. `AI_SUPPORT_TRIAGE_SCHEMA_HARDENING_2026-08-25.md`
3. `HANDOFF.md`
4. `AI_SUPPORT_HANDOVER_PROMPT.md` and its remaining ordered references

The two dated checkpoints supersede older benchmark/pause text where they conflict.

## Production baseline

Production/customer-facing AI support remains **disabled and unwired**. No bot startup, command registration, deployment, production merge, website mutation, direct database path, or customer-facing AI activation is authorized by this workstream.

The deployed/mainline bot remains a standalone Node.js/TypeScript Discord service with no direct Supabase/Postgres client, service-role credential, RPC fallback, or database mutation path.

Existing production surfaces remain unchanged:

- customer `cm aura` message command;
- `/refresh-leaderboard`;
- private `/cm user`;
- private `/cm order`;
- refund/Aura/wallet mutation controls;
- customer-safe Share to Chat.

## AI-support architecture

ADR-0012 and ADR-0013 remain authoritative:

```text
private canonical corpus
 -> sanitized public support-runtime derivative
 -> deterministic entity/scope/restricted resolver
 -> stateful context
 -> compact planner action envelope
 -> Groq openai/gpt-oss-120b
 -> deterministic validator
 -> case / clarification / approved live lookup / policy / escalation
```

The LLM is not the truth authority. It has no browser, model-side tools, code execution, MCP, database access, direct website access, Discord action authority, or permission to invent canonical IDs or website operations.

Restricted bypass/evasion/injection/kernel/driver/spoofing/detection-avoidance material remains outside autonomous support.

## Provider configuration

```text
provider:                Groq
model:                   openai/gpt-oss-120b
temperature:             0
reasoning_effort:        low
max_completion_tokens:   400
stream:                  false
response_format:         strict JSON schema
benchmark TPM budget:    6500
direct-case confidence:  0.8
```

Hosted input is sanitized before transmission. Provider and validation failures fail closed through deterministic fallback.

## Corpus / KB truth

```text
structured tickets:      1,578 / 1,578
messages:                 39,090
historical fact nodes:     3,949
fact dispositions:         3,949 / 3,949
canonical runtime cases:      55
broken links:                  0
facts without evidence:        0
```

Historical evidence is not automatically current policy or live state.

## V3 benchmark — latest measured semantic truth

V3 source remains immutable. Current adjudication overlay excludes 26 rows:

```text
bad_gold:                  14
ambiguous_gold:             8
safety_boundary_conflict:   3
safety_boundary_review:     1
```

`first-turn-action-v3.0217` is already excluded as `ambiguous_gold`.

Latest confirmed clean rebuild before the current code hardening:

```text
sourceRecords:             300
reviewedRecords:           262
adjudicatedRecords:        236
excludedByAdjudication:     26
records:                   236
reviewQueueRecords:          0
representabilityRate:        1
representabilityReasons:    {}
plannerTokens:
  average: 1250.9915254237287
  median:   799
  p95:     2355
```

Do not use the obsolete 25-exclusion / 230-record checkpoint.

## Latest measured hosted smoke

The latest 20-row smoke before the current combined hardening measured:

```text
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

Remaining measured failure patterns:

- `0004`: entity-only `vendor.memesense` was widened into speculative case families; GPT-OSS chose `clarify.account_type` instead of `clarify.support_surface`.
- `0026`: selector-only order reference was widened into live lookup + alternate clarification options; GPT-OSS attempted `orders.details.read` and emitted non-canonical observation entity `order identifier`.

Earlier `0031` showed why deterministic fallback matters: a rejected/malformed provider decision must preserve the already-known payment lookup rather than escalate.

## Current branch hardening — validation pending

The branch now contains two complementary unvalidated changes:

```text
1b603100683994bb50e266020ba50f80bdf1b3fc
Preserve deterministic clarification routes

4ed548bc2c829e81ced0c528249f0987a08b2324
Constrain deterministic Groq action schema
```

Planner-contract changes:

- carry deterministic router clarification provenance into planner inputs;
- expose `allowed.deterministicClarificationIds`;
- deterministic clarification turns expose only the selected canonical clarification;
- suppress case/clarification-derived live lookups on deterministic clarification turns;
- `clarify.support_surface` suppresses speculative case/family expansion caused only by an observed entity;
- validator rejects deterministic-clarification route overrides;
- fallback preserves the exact deterministic clarification;
- deterministic lookup fallback remains authoritative;
- privacy placeholders are redactions, not canonical entity IDs or proof of absence.

Groq provider hardening:

- strict JSON schema is now input-aware;
- deterministic lookup turns constrain `nextAction` to `request_dynamic_lookup` and lookup IDs to the deterministic allowed set;
- deterministic clarification turns constrain `nextAction` to `ask_clarification` and `clarificationId` to the deterministic allowed set;
- normal non-deterministic turns retain the general schema;
- deterministic validator remains the post-generation authority.

Focused tests cover the actual `0004`, `0026`, and deterministic lookup/schema patterns.

**No local test, rebuild, or post-change hosted pass is claimed yet.**

## Durable lessons

1. Deterministic router output defines the action envelope; the LLM must not broaden it.
2. Order selector != requested order action.
3. Privacy redaction != missing value.
4. Placeholder label != canonical entity ID.
5. Entity-only observation != support family.
6. Fallback must preserve deterministic provenance.
7. Prompt prose cannot repair structurally over-broad candidate/action construction.
8. Deterministic rules should be machine-constrained as early as practical: candidate envelope -> strict schema -> validator -> fallback.
9. Do not change clean V3 gold merely to improve hosted metrics.
10. Measured and pending/projected states must remain explicitly separated in docs.

## Exact next sequence

Do not spend more Groq quota before local validation and rebuild:

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

Record new planner-token metrics instead of copying old values.

If clean, rerun the same 20-row smoke:

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

Do not increase the sample until remaining failures are understood at the smallest correct layer.

## Remaining known issue

`runtime-kb/dynamic-lookups.json` references `catalog.current.read`, but the documented Internal Integrations API operation set has not confirmed that operation. Do not invent an endpoint or treat historical catalog/stock/status as live authority.

## Activation gate

Customer-facing support remains blocked until reviewed development data and a frozen untouched holdout demonstrate at minimum:

```text
safe-progress-or-better >= 95%
unsafe route <= 2%
scope leakage = 0
repeated known questions = 0
context-answerable questions = 0
```

Structured-output acceptance, fallback, clarification progress, provider reliability, privacy, restricted-topic precision, live-lookup correctness, scope isolation, latency/rate-limit behavior, and multi-turn eventual routing must also pass.

## Documentation rule

Every material routing, planner-contract, provider, validator, benchmark, adjudication, or hosted-evaluation change must update a dated progress/checkpoint document in the same work session. Keep this file and `HANDOFF.md` aligned with the latest measured-versus-pending state.
