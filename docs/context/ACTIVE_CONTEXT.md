# Active Context

Updated: 2026-08-25 10:59 +08:00

## Read order for AI-support work

1. `AI_SUPPORT_RELEASE_HANDOVER_2026-08-25.md`
2. `AI_SUPPORT_TRIAGE_VALIDATION_2026-08-25.md`
3. `HANDOFF.md`
4. `AI_SUPPORT_HANDOVER_PROMPT.md` and its remaining ordered references

The dated release handover is authoritative for the current paused implementation state. The validation checkpoint remains authoritative for the last fully validated test/benchmark result.

## Current repository state

```text
public repo:    Hermann-33/cm-discord-bot
public branch:  task/ai-support-integration
implementation checkpoint before handover docs: cfb0b163cac43c95e515ba316fa37c100cec4fe2
last fully validated checkpoint:                 803a50bb09cdc6a60b3c736762d285cdac0aa276

private repo:   Hermann-33/CM-Ticket-Transcripts
private branch: main
private HEAD:   c9e993f17583a607402f4173296f64aac52d2ebe
```

The post-`803a50b` production-parity commits must be revalidated before any final holdout is selected or run.

## Production boundary

Customer-facing AI support remains **disabled and unwired**. No bot startup, command registration, deployment, production merge, website mutation, or customer-facing AI activation was performed.

The private `CM-Ticket-Transcripts` repository remains data/specification-only under ADR-0010. Production may use only the sanitized public `support-runtime/` derivative under ADR-0012. Groq `openai/gpt-oss-120b` remains the primary hosted triage candidate under ADR-0013.

The LLM has no tools, browser, code execution, MCP, database access, direct website access, Discord action authority, mutation authority, or permission to invent canonical IDs/API operations. Restricted bypass/evasion/injection/kernel/driver/spoofing/detection-avoidance material remains outside autonomous support.

## Last fully validated development result

The consumed V3 development benchmark was fully representable at the validated checkpoint:

```text
sourceRecords:             300
reviewedRecords:           262
adjudicatedRecords:        236
excludedByAdjudication:     26
records:                   236
reviewQueueRecords:          0
representabilityRate:        1
plannerTokens average:    1122.5042372881355
plannerTokens median:      844
plannerTokens p95:        1858
```

Adjudication remains 14 `bad_gold`, 8 `ambiguous_gold`, 3 `safety_boundary_conflict`, and 1 `safety_boundary_review`. Original V3 is immutable.

Validated Groq development prefix at `803a50b`:

```text
20 rows:
  structuredOutputAcceptanceRate: 1
  exactOptimalActionRate:          0.95
  optimal / safe_progress:         17 / 3
  unsafe / fallback / review:       0 / 0 / 0

40 rows:
  structuredOutputAcceptanceRate: 1
  exactOptimalActionRate:          0.975
  optimal / safe_progress:         36 / 4
  unsafe / fallback / review:       0 / 0 / 0
  latency avg/med/p95 ms:           995.031035 / 989.0279 / 1222.3352
  planner tokens avg/med/p95:       981.3 / 839 / 1466
```

Validation at that checkpoint: focused suite 77/77, full suite 308/308, typecheck pass, build pass, benchmark 236/236, and `git diff --check` pass.

## Post-validation implementation state

Four commits were added after `803a50b`:

```text
cd25bb66  Align runtime triage envelopes with validated planner
317703b7  Use input-aware Groq schema in runtime
66b375ff  Test production deterministic Groq envelopes
cfb0b163  Add production deterministic support resolver
```

This work adds production deterministic case/lookup/clarification envelope parity, input-aware Groq schemas, and a runtime-safe deterministic first-turn resolver with regression tests. These commits were **not** fully revalidated before the pause.

Implementation intentionally stopped before the grounded action resolver, Internal API lookup adapter, Discord conversation persistence/message wiring, activation ADR/review, release freeze tooling, or final holdout tooling were completed.

## Holdout status

The final release holdout was **not selected, inspected, generated, sent to Groq, or scored** during the paused session.

- Do not use consumed V3 as final holdout.
- Do not assume `historical-rule-holdout.jsonl` is eligible without auditing prior use/provenance.
- A valid final holdout must subtract all consumed benchmark/training/routing-exemplar provenance before selection.
- If insufficient truly unused historical records remain, record corpus exhaustion instead of creating a contaminated release metric.

Required activation thresholds remain at least:

```text
safe-progress-or-better >= 95%
unsafe route            <= 2%
scope leakage             0
repeated-known question    0
context-answerable question 0
```

Also require structured-output/provider compatibility, privacy, restricted-topic precision, lookup-adapter correctness, multi-turn behavior, runtime integrity, and rollout/kill-switch review.

## Known API boundary

`support-runtime` may reference abstract operations that are not concrete bot endpoints. Production must map only to existing approved `InternalApiClient` reads and fail closed otherwise. `catalog.current.read` remains unconfirmed/unavailable and must not be invented.

## Temporary session branches

The following non-authoritative pointers were created during release exploration:

```text
task/ai-support-release
task/ai-support-release-staging
task/ai-support-integration-handover
```

Do not merge them merely because they exist. Authoritative implementation work remains on `task/ai-support-integration` unless governance intentionally changes.
