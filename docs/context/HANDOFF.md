# Latest Handoff

Updated: 2026-08-25 07:59 +08:00
Status: `DEVELOPMENT VALIDATION COMPLETE / FINAL HOLDOUT NOT RUN / PRODUCTION DISABLED`

## Read first

1. `AI_SUPPORT_TRIAGE_VALIDATION_2026-08-25.md` — definitive repair history, tests, benchmark, and hosted results.
2. `ACTIVE_CONTEXT.md` — concise current state and remaining gate.
3. `AI_SUPPORT_HANDOVER_PROMPT.md` and its ordered references.

The validation checkpoint supersedes earlier validation-pending and stale 25-exclusion/230-record text.

## Boundaries

- Public repository: `Hermann-33/cm-discord-bot`, branch `task/ai-support-integration`.
- Private repository: `Hermann-33/CM-Ticket-Transcripts`, branch `main`, data/specification-only under ADR-0010.
- Original V3 is immutable; exclusions live only in its adjudication overlay.
- No bot startup, command registration, deployment, production merge, website mutation, direct database access, or customer-facing AI activation occurred.
- No unapproved website operation was added. `catalog.current.read` remains unresolved and unavailable.
- The final holdout remains untouched.

## Current measured state

```text
V3 source/reviewed/adjudicated: 300 / 262 / 236
adjudication exclusions:        26
consumed records:               236
review queue:                     0
representability:                 1
planner tokens avg/med/p95:      1122.5042 / 844 / 1858

Groq 20-row prefix:
  structured / exact:           1 / 0.95
  optimal / safe progress:      17 / 3
  unsafe / fallback / review:    0 / 0 / 0

Groq 40-row prefix:
  structured / exact:           1 / 0.975
  optimal / safe progress:      36 / 4
  unsafe / fallback / review:    0 / 0 / 0
  latency avg/med/p95 ms:        995.0310 / 989.0279 / 1222.3352
  planner tokens avg/med/p95:    981.3 / 839 / 1466
```

Hosted configuration remained Groq `openai/gpt-oss-120b`, temperature 0, reasoning effort low, max completion tokens 400, streaming false, strict structured output, and a 6,500 estimated-token/minute benchmark budget.

## What changed

The deterministic router now explicitly marks authoritative static-case and clarification routes. The planner cannot broaden those routes with sibling cases, alternate clarifications, or unrelated lookups. Groq receives the same constrained envelope in its strict schema; the validator and safe fallback enforce it again.

Additional narrow repairs cover account-token context lookup, loader-link questions, VBS/virtualization/Secure Boot/TPM signals, feature praise without a support request, and order-selector intent. Scoped `clarify.support_surface` rows retain the reviewed clarification but lose global lookup substitutions. Evaluation only treats a live lookup as a safe clarification replacement when the canonical clarification explicitly declares that lookup ID or operation.

## Validation evidence

```text
focused regression tests: 77 / 77 pass
full npm test:            308 / 308 pass
typecheck:                pass
build:                    pass
git diff --check:         pass
benchmark rebuild:        236 / 236, queue 0
hosted 40-row run:         complete, no 429, no fallback, no unsafe row
```

The private data repository has no source/specification change from this task. Generated benchmark/result files remain local audit artifacts; preserve the pre-existing Obsidian graph edit and unrelated untracked files.

## Next gate

Do not tune on or casually inspect the final holdout. When an explicit activation-readiness task authorizes it:

1. confirm the implementation and adjudicated development set are frozen;
2. run the separately governed untouched final holdout once;
3. inspect every non-optimal, fallback, invalid, unsafe, leakage, or semantic-review row;
4. verify privacy, restricted-topic precision, lookup authorization, multi-turn state, and operational rollout controls;
5. keep production disabled unless all ADR-0012/ADR-0013 activation criteria pass.
