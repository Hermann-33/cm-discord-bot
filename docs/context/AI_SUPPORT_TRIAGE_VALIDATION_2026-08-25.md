# AI Support Triage Validation — 2026-08-25

Status: `DEVELOPMENT VALIDATION COMPLETE / FINAL HOLDOUT UNTOUCHED`

This checkpoint records the completed local repair, consumed-development benchmark rebuild, and Groq smoke/expanded evaluation. It supersedes earlier 2026-08-25 validation-pending checkpoints where they conflict.

## Scope and safety boundary

Work stayed on `task/ai-support-integration`. Customer-facing AI remains disabled and unwired. No bot startup, command registration, deployment, production merge, Discord action, website mutation, database access, new Internal Integrations API operation, or final-holdout run occurred.

ADR-0010, ADR-0012, and ADR-0013 remain authoritative. The private corpus is data/specification-only; hosted input is the compact sanitized planner envelope; Groq chooses only a canonical next action; deterministic validation remains authoritative.

## Initial validation finding

The inherited focused tests passed, but the first full suite found one prompt-contract regression: the prompt no longer contained the required `safest next action` instruction. Restoring that exact invariant fixed the failure without expanding the prompt or action set.

The first benchmark rebuild then retained only 226 of 236 adjudicated rows, queuing nine unavailable-lookup rows and one clarification row. The cause was treating every router `clarificationId` as authoritative deterministic provenance. A relevant clarification is not necessarily the selected action.

Repair: the router now emits explicit `deterministicClarificationIds`; the builder consumes only that field. It separately carries deterministic static-case provenance. Narrow router fixes also added current order/fulfillment lookup for account-token retrieval, technical recognition for VBS/virtualization/Secure Boot/TPM, generic support-surface handling for technical praise/feature-only statements, and selector-aware order clarification behavior.

## Hosted failure-driven repairs

### First 20-row run

The first hosted pass had one unsafe row, `0018`: an explicit loader-link request was under-resolved and the planner regained unrelated account/order lookups.

Repair: `case.loader.update` now recognizes explicit loader-link requests. Deterministic static cases are enforced through candidate construction, input-aware Groq schema, deterministic validator, and fallback. Static routes expose no clarification or lookup detours.

### Second 20-row run

Two rows received Groq HTTP 400 because `uniqueItems` is unsupported in Groq's strict-schema subset. Another broad order lookup appeared on an underspecified turn.

Repair: remove unsupported `uniqueItems`; preserve strict item enums and deterministic validation. Mark generic NFA failure-stage and generic order-family clarifications with explicit deterministic provenance.

A subsequent 20-row run was clean: 17 optimal, 3 safe-progress, and no unsafe/fallback/review rows.

### First expanded 40-row run

The expanded prefix exposed one unsafe row, `0054`: an underspecified payment-state turn received global lookup substitutions through `clarify.support_surface`, and the evaluator did not recognize declared operation-backed lookup replacement semantics.

Repair:

- keep the reviewed scoped support-surface clarification when family-relevant, but strip its `liveLookupCanReplace` list so it cannot reintroduce global lookup options;
- preserve canonical lookup `operation` metadata in benchmark inputs;
- exclude `clarify.order_selector` outside order/fulfillment families;
- classify lookup-over-clarification as safe progress only when every predicted lookup is explicitly declared by ID or by mapped operation in the reviewed clarification;
- retain unsafe classification for any unrelated lookup.

Focused regressions cover both the allowed replacement and unrelated-lookup cases.

## Final local benchmark

```text
schemaVersion:              3
sourceRecords:            300
reviewedRecords:          262
adjudicatedRecords:       236
excludedByAdjudication:    26
records:                  236
reviewQueueRecords:         0
rawRepresentabilityRate:    0.9198473282442748
representabilityRate:       1
representabilityReasons:   {}
independentReviewed:      262
independentReviewRate:      1
maxCases:                   8
plannerTokens average:   1122.5042372881355
plannerTokens median:     844
plannerTokens p95:       1858
candidateCases average:     1.9957627118644068
candidateCases max:         8
```

Adjudication categories: 14 bad gold, 8 ambiguous gold, 3 safety-boundary conflicts, and 1 safety-boundary review. V3 itself was not changed.

## Final hosted measurements

Configuration for every final measurement:

```text
provider/model:              Groq / openai/gpt-oss-120b
temperature:                 0
reasoning_effort:            low
max_completion_tokens:       400
stream:                      false
response_format:             strict JSON schema
benchmark token budget/min:  6500
direct-case confidence:      0.8
```

The 20-row figures below are derived from the first 20 records of the same post-fix 40-row result, ensuring one consistent code/provider run:

```text
records:                           20
structuredOutputAcceptanceRate:     1
exactOptimalActionRate:              0.95
optimal:                            17
safe_progress:                       3
safe_no_progress:                    0
unsafe_wrong_route:                  0
unsafe_scope_leakage:                0
invalid:                             0
safeProgressOrBetterRate:            1
unsafeRate:                          0
semanticReviewQueue:                 0
fallbackRate:                        0
latency average/median/p95 ms:     1003.960725 / 1022.6139 / 1222.3352
planner tokens average/median/p95:  999.3 / 840 / 1446
```

Expanded prefix:

```text
records:                           40
structuredOutputAcceptanceRate:     1
exactOptimalActionRate:              0.975
optimal:                            36
safe_progress:                       4
safe_no_progress:                    0
unsafe_wrong_route:                  0
unsafe_scope_leakage:                0
invalid:                             0
safeProgressOrBetterRate:            1
unsafeRate:                          0
semanticReviewQueue:                 0
fallbackRate:                        0
latency average/median/p95 ms:      995.031035 / 989.0279 / 1222.3352
planner tokens average/median/p95:  981.3 / 839 / 1466
```

The four safe-progress rows were inspected. Three exactly selected the reviewed entity-scoped support-surface clarification. One conservatively selected that clarification for an underspecified policy-family turn. None required semantic review.

## Validation evidence

```text
focused tests:      77 / 77 pass
full npm test:     308 / 308 pass
typecheck:         pass
build:             pass
git diff --check:  pass
benchmark:         236 / 236, review queue 0
Groq expanded run: 40 / 40 safe-progress-or-better, no early stop or 429
```

## Durable conclusions

1. Deterministic route provenance must be explicit; a relevant candidate is not automatically authoritative.
2. Deterministic static cases, lookups, and clarifications must share one envelope across candidate construction, provider schema, validator, and fallback.
3. Entity, selector, and redaction observations do not independently establish user intent.
4. A scoped clarification must not inherit global lookup substitutions.
5. Evaluator credit for clarification replacement must follow the canonical `liveLookupCanReplace` contract, including explicit operation mapping, and must fail closed for unrelated lookups.
6. Provider schema features must stay inside Groq's supported strict-schema subset.
7. Development success is not activation approval.

## Remaining gate

The final holdout remains untouched. Do not use it for tuning. A later explicitly authorized activation-readiness task must freeze this implementation, run the final holdout once, review every imperfect row, and complete the privacy/restricted-topic/dynamic-lookup/multi-turn/operational gates before production can be considered.
