# Active Context

Updated: 2026-08-25 07:59 +08:00

## Read order for AI-support work

1. `AI_SUPPORT_TRIAGE_VALIDATION_2026-08-25.md`
2. `HANDOFF.md`
3. `AI_SUPPORT_HANDOVER_PROMPT.md` and its remaining ordered references

The validation checkpoint supersedes earlier 2026-08-25 benchmark and validation-pending text where they conflict.

## Production boundary

Production/customer-facing AI support remains **disabled and unwired**. No bot startup, command registration, deployment, production merge, website mutation, direct database path, or customer-facing AI activation was authorized or performed.

The production bot surfaces and hard architecture boundaries are unchanged. The private `CM-Ticket-Transcripts` repository remains data/specification-only under ADR-0010. Production may use only the sanitized public `support-runtime/` derivative under ADR-0012. Groq `openai/gpt-oss-120b` remains the primary hosted triage candidate under ADR-0013.

The LLM has no tools, browser, code execution, MCP, database access, direct website access, Discord action authority, or permission to invent canonical IDs or website operations. Restricted bypass/evasion/injection/kernel/driver/spoofing/detection-avoidance material remains outside autonomous support.

## Current development result

The consumed V3 development benchmark is fully representable:

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
  average: 1122.5042372881355
  median:   844
  p95:     1858
```

Adjudication remains 14 `bad_gold`, 8 `ambiguous_gold`, 3 `safety_boundary_conflict`, and 1 `safety_boundary_review`. Original V3 is immutable.

Post-fix Groq development run, first 20 rows:

```text
structuredOutputAcceptanceRate: 1
exactOptimalActionRate:          0.95
optimal:                         17
safe_progress:                    3
safe_no_progress:                 0
unsafe_wrong_route:               0
unsafe_scope_leakage:             0
invalid:                          0
safeProgressOrBetterRate:         1
unsafeRate:                       0
semanticReviewQueue:              0
fallbackRate:                     0
latency average:               1003.960725 ms
latency median:                1022.6139 ms
latency p95:                   1222.3352 ms
plannerTokens average:          999.3
plannerTokens median:           840
plannerTokens p95:             1446
```

Post-fix expanded 40-row prefix:

```text
structuredOutputAcceptanceRate: 1
exactOptimalActionRate:          0.975
optimal:                         36
safe_progress:                    4
safe_no_progress:                 0
unsafe_wrong_route:               0
unsafe_scope_leakage:             0
invalid:                          0
safeProgressOrBetterRate:         1
unsafeRate:                       0
semanticReviewQueue:              0
fallbackRate:                     0
latency average:                995.031035 ms
latency median:                 989.0279 ms
latency p95:                   1222.3352 ms
plannerTokens average:          981.3
plannerTokens median:           839
plannerTokens p95:             1466
```

Strict hosted parameters remained: temperature 0, reasoning effort low, max completion tokens 400, streaming false, strict JSON schema, and 6,500 estimated planner tokens/minute.

## Validated hardening

- deterministic clarification provenance is explicit instead of inferred from every baseline clarification;
- deterministic static cases, lookups, and clarifications constrain the candidate envelope, Groq schema, validator, and fallback;
- entity-only observations do not manufacture support families;
- selector-only order turns clarify the requested action while selector + explicit state intent can use approved lookups;
- scoped generic clarifications cannot reintroduce global live lookups;
- a lookup is credited as replacing a reviewed clarification only when its ID or operation is explicitly declared in `liveLookupCanReplace`;
- redaction placeholders remain evidence that a value was present, not canonical entities or proof of absence;
- targeted account-token, loader-link, VBS/virtualization/Secure Boot/TPM, and non-request technical language now route at the narrowest deterministic layer.

Validation: focused suite 77/77, full suite 308/308, typecheck pass, build pass, benchmark 236/236, and `git diff --check` pass.

## Remaining gate

The untouched final holdout was **not run**. Development results satisfy the measured safety target, but they do not authorize activation. Before customer-facing enablement, freeze the implementation and run the separately governed final holdout, then review privacy, restricted-topic precision, dynamic lookup correctness, multi-turn behavior, and operational rollout controls.

`runtime-kb/dynamic-lookups.json` still references `catalog.current.read`, which is not confirmed in the documented Internal Integrations API operation set. Do not invent or enable that operation.
