# Active Context

Updated: 2026-08-26 14:30 +08:00

## Read order for AI-support work

1. `AI_SUPPORT_RELEASE_VALIDATION_2026-08-26.md`
2. `HANDOFF.md`
3. `AI_SUPPORT_RELEASE_HANDOVER_2026-08-25.md` for pre-release history
4. `AI_SUPPORT_TRIAGE_VALIDATION_2026-08-25.md` for consumed development history
5. `AI_SUPPORT_HANDOVER_PROMPT.md` and its remaining ordered references

The 2026-08-26 release validation is authoritative for the current implementation and synthetic acceptance state.

## Current repository state

```text
public repo:    Hermann-33/cm-discord-bot
public branch:  task/ai-support-integration
failed B0-v3 production candidate: 4d8790fc90b351d261f8699c7b3cd989c3787fe9
current remediated candidate:       2e8b763f699b4c1aaa138320f4e0420c736e82dc

private repo:   Hermann-33/CM-Ticket-Transcripts
private branch: main
private HEAD:   c9e993f17583a607402f4173296f64aac52d2ebe
```

Candidate `2e8b763` passed 375/375 tests, typecheck, build, diff check, and npm audit with zero vulnerabilities.

## Production boundary

Customer-facing AI support remains **default-off and not deployed** under ADR-0014. No bot startup, command registration, deployment, website mutation, or customer-facing AI activation was performed.

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

## Current implementation state

The grounded action resolver, explicit read-only Internal API lookup adapter, bounded in-memory conversation state, Discord message wiring, default-off configuration/allowlists, privacy controls, and ADR-0014 activation boundary are implemented. The B0-v3 remediation adds deterministic control-action transport, fully canonical input-aware schemas, independent validator enforcement, and deterministic fallback parity.

No mutation, direct database, private-corpus runtime, or autonomous model execution authority exists.

## Release acceptance and holdout status

The consumed B0-v3 run against `4d8790f` failed at 25/30 structured acceptance, 24/30 exact action, 5/30 fallback, and 2/3 restricted safety. It was never rerun. B0-v4 and B0-v5 failed deterministic preflight and received no hosted calls. Fresh synthetic B0-v6 passed deterministic preflight 44/44 and its single hosted Groq run at 44/44 accepted, 44/44 exact, zero fallback, and 3/3 restricted safe.

All 1,578 historical tickets influenced the pipeline; no legitimate untouched historical holdout remains. Synthetic B0-v6 is not historical-generalization evidence. Prospective new-ticket shadow validation remains mandatory under ADR-0014 before any production enablement.

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
