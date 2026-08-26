# AI Support Release Validation — 2026-08-26

Status: `SYNTHETIC RELEASE ACCEPTANCE PASS / SHADOW TOOLING IMPLEMENTED / REAL COLLECTION PENDING / PRODUCTION DISABLED`

## Production candidate

```text
authoritative branch: task/ai-support-integration
failed B0-v3 candidate: 4d8790fc90b351d261f8699c7b3cd989c3787fe9
remediated candidate:    2e8b763f699b4c1aaa138320f4e0420c736e82dc
private corpus SHA:      c9e993f17583a607402f4173296f64aac52d2ebe
runtime version:         1.0.0
```

Customer AI remains default-off. Nothing in this validation authorizes deployment or `AI_SUPPORT_ENABLED=true`.

## Consumed B0-v3 result

B0-v3 was run once against `4d8790f` and failed. It was not rerun.

```text
rows completed:             30 / 30
structured output accepted: 25 / 30 (83.33%)
exact effective action:     24 / 30 (80.00%)
fallbacks:                   5 / 30 (16.67%)
restricted safe:             2 / 3  (66.67%)
latency average/median/p95:  1120.36 / 1092.39 / 1591.63 ms
```

The two structural root causes were:

1. `observations.explicitEntities` and other canonical-ID response fields were not fully constrained by the input-aware JSON schema, so Groq could emit arbitrary observation labels such as `TikTok`, `website login`, `PayPal payment pending`, `account`, and `loader`.
2. `firstTurnRouter` knew deterministic control-plane actions, but `deterministicResolver` transported only deterministic case, clarification, and lookup IDs. Policy, attachment, human-security, restricted, support-operation, and multi-intent actions could therefore be overridden by the planner, and fallback could lose the known action.

B0-v3 is now consumed development/regression evidence only. Every reported defect has permanent schema, validator, fallback, resolver, or routing regression coverage.

## Remediation

The remediated contract transports `deterministicNextAction` plus deterministic policy IDs. The input-aware schema constrains every canonical field to its allowed IDs, uses empty-array/null constraints when no IDs are allowed, and gives deterministic routes a singleton `nextAction` enum. Independent validation enforces the same action and ID invariants, while fallback reproduces the deterministic action.

Restricted input is forced to `restricted_escalation` in schema, validation, and fallback. Groq cannot autonomously answer or choose another route. Refund and NFA replacement use `policy.refund_or_replacement.current_state_required`. Game-ban handling retains the safe deterministic policy route without inventing a policy ID; the deterministic action resolver escalates when no specific canonical policy can be rendered.

The remediation preserves deterministic customer rendering, safe procedure allowlisting, the narrow Rust NFA exception, read-only Internal API authority, privacy sanitization, bounded state, and default-off activation. No mutation or database authority was added.

## Fresh release fixtures

B0-v4 and B0-v5 failed deterministic preflight and were consumed without any hosted call:

```text
B0-v4: 36 / 44 preflight pass; hosted not run
B0-v5: 41 / 44 preflight pass; hosted not run
```

Real defects from each were converted to regressions before a new candidate and fixture were created. Ambiguous fixture expectations were not used to weaken routing policy.

B0-v6 was frozen only after candidate `2e8b763` passed the repository gate.

```text
fixture:       ai-support-release-acceptance-b0-v6
rows:          44
canonical SHA: 64c299a6d07b1f06bd49f14aca0ecd90a52d97298d4094ab19dff832eb855b02
canonical form: UTF-8 with CRLF/lone CR normalized to LF before SHA-256
preflight:     44 / 44 pass
```

The CommonJS runners use an async `main()` wrapper and contain no top-level await.

## B0-v6 hosted result

B0-v6 was run through Groq exactly once with the frozen configuration:

```text
model:                       openai/gpt-oss-120b
temperature:                 0
reasoning effort:            low
max completion tokens:       400
stream:                      false
direct case confidence:      0.8
benchmark token budget:      6500 TPM

rows completed:              44 / 44
structured output accepted:  44 / 44 (100%)
exact effective action:      44 / 44 (100%)
fallbacks:                    0 / 44 (0%)
restricted safe:              3 / 3  (100%)
latency average/median/p95:   1081.13 / 995.59 / 1602.98 ms
result:                       PASS
```

This is fresh synthetic release acceptance, not historical generalization evidence.

## Local validation

Exact production candidate `2e8b763` passed:

```text
npm test:          375 / 375
npm run typecheck: pass
npm run build:     pass
git diff --check:  pass
npm audit:         0 vulnerabilities
```

## Remaining activation gate

All 1,578 historical tickets influenced the knowledge/evaluation pipeline, so there is no legitimate untouched historical holdout left. B0-v6 does not replace real-world evidence. Under ADR-0014, activation now requires prospective, newly arriving ticket shadow validation against the frozen candidate, operational kill-switch/rollback review, and a separate authorized release decision.

Until that evidence exists:

```text
AI_SUPPORT_ENABLED=false
production deployment: not authorized
prospective shadow collection/evidence: pending
```

## Prospective-shadow implementation addendum

The isolated `task/ai-support-shadow-validation` branch implements the collection mechanism: separate default-off no-reply configuration, exact existing eligibility, frozen prospective cutoff cohorts, privacy-safe local evidence, independent human adjudication, deterministic ADR-0014 metric summaries, and close/governance-report tooling. No real fresh tickets were collected and no bot was started or deployed during implementation.

Implementation commit `fe644f33be2341d71bc9c0860d339046fcdf0c37` passed 388/388 tests, typecheck, build, diff check, and `npm audit` with zero vulnerabilities.

ADR-0014 defines no minimum prospective sample. Tooling reports measured gates but never declares release readiness. The operator guide proposes 200 fully adjudicated turns over 14 days as a conservative governance recommendation requiring explicit approval; it is not an accepted or hardcoded gate.
