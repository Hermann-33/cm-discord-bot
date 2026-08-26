# Groq Support-Triage Setup

Updated: 2026-08-25 07:59 +08:00

Groq `openai/gpt-oss-120b` is the primary hosted candidate for the constrained support-triage planner under ADR-0013. Customer-facing Discord support is wired default-off under ADR-0014, remains disabled, and is not deployed.

Read `context/AI_SUPPORT_TRIAGE_VALIDATION_2026-08-25.md` and `context/HANDOFF.md` for the latest measured state.

## Environment

```text
GROQ_API_KEY=<secret>
GROQ_MODEL=openai/gpt-oss-120b
GROQ_REASONING_EFFORT=low
```

Only the key must be supplied. Never commit, print, log, or copy it into the transcript repository.

## Hosted boundary

The client calls only:

```text
POST https://api.groq.com/openai/v1/chat/completions
```

Validated request controls:

- model `openai/gpt-oss-120b`;
- temperature 0;
- max completion tokens 400;
- reasoning effort low;
- streaming false;
- strict JSON-schema output;
- no model tools, browser, code execution, MCP, direct website/database access, Discord action authority, or executable support actions.

Hosted inputs are sanitized. Raw transcripts, evidence prose, full fact corpora, emails, Discord identifiers, order/purchase identifiers, credentials, tokens, URLs/private links, fulfillment material, and sensitive live context are not sent. Canonical IDs required for constrained planning remain.

## Deterministic authority

Canonical truth, scope, restricted-topic boundaries, state transitions, executable operations, validation, and fallback remain deterministic.

The deterministic router can explicitly select authoritative case, clarification, lookup, policy, attachment, restricted, human-security, support-operation, and multi-intent envelopes.

```text
static case   -> exact canonical case; no lookup or clarification detour
live lookup   -> exact approved lookup set; no case or clarification detour
clarification -> exact canonical question; no case or lookup detour
```

The same envelope is enforced in candidate construction, the input-aware Groq schema, the post-generation validator, and safe fallback. Non-deterministic turns receive only case/family/clarification-relevant actions, never the global lookup catalog.

A scoped `clarify.support_surface` may remain when it is the reviewed family-relevant action, but it cannot inherit global live-lookup substitutions. Evaluation credits a live lookup as replacing a reviewed clarification only when every predicted lookup is explicitly declared by ID or mapped operation in that clarification's `liveLookupCanReplace` contract.

Provider, transport, schema, or validation failures fail closed. There is no automatic provider retry or failover. Groq's supported strict-schema subset does not accept `uniqueItems`; do not add it to provider schemas.

## Development benchmark

Source:

```text
knowledge-canonical/Evaluation/historical-first-turn-action-v3.jsonl
```

V3 is immutable. Bad, ambiguous, and safety-conflicting rows are represented only in:

```text
knowledge-canonical/Evaluation/historical-first-turn-action-v3-adjudication.json
```

The overlay excludes 26 rows: 14 bad gold, 8 ambiguous gold, 3 safety-boundary conflicts, and 1 safety-boundary review. The retained 236 rows have independent review metadata.

Rebuild consumed development inputs with:

```cmd
npm.cmd run build:llm-triage-benchmark -- --data-dir ..\CM-Ticket-Transcripts
```

Required preflight:

```text
adjudicatedRecords:       236
records:                   236
reviewQueueRecords:          0
representabilityRate:        1
representabilityReasons:    {}
```

Latest rebuild:

```text
planner tokens average: 1122.5042372881355
planner tokens median:   844
planner tokens p95:     1858
candidate cases average:   1.9957627118644068
candidate cases max:       8
```

Generated files under the private repository's `knowledge-canonical/Audit/` are local audit artifacts unless a separate data-governance task explicitly scopes them for commit.

## Hosted development evaluation

Run only after the benchmark and local gates are clean:

```cmd
npm.cmd run evaluate:groq-triage -- --data-dir ..\CM-Ticket-Transcripts --limit 20
```

Default pacing uses an estimated 6,500 planner tokens/minute and stops after the first provider HTTP 429. The final post-fix evaluation used one 40-row run; its first 20 rows provide the matching smoke prefix.

```text
20-row prefix:
  structured acceptance:    1
  exact optimal:            0.95
  optimal / safe progress: 17 / 3
  unsafe / fallback/review: 0 / 0 / 0

40-row prefix:
  structured acceptance:    1
  exact optimal:            0.975
  optimal / safe progress: 36 / 4
  unsafe / fallback/review: 0 / 0 / 0
  latency avg/med/p95 ms:   995.0310 / 989.0279 / 1222.3352
  tokens avg/med/p95:       981.3 / 839 / 1466
```

The four safe-progress rows were reviewed; none required semantic review. See the dated validation checkpoint for failure history and repairs.

## Validation baseline

Current production-candidate gates:

```text
full npm test:     375 / 375 pass
typecheck:         pass
build:             pass
git diff --check:  pass
npm audit:         0 vulnerabilities
B0-v6 preflight:   44 / 44
B0-v6 hosted:      44 / 44 accepted and exact; 0 fallback; 3 / 3 restricted safe
```

Do not run the bot, register commands, deploy, enable customer-facing support, or perform production/live website operations as part of benchmark validation.

## Activation gate

The consumed B0-v3 run failed and was never rerun. B0-v4 and B0-v5 failed deterministic preflight without hosted calls. Fresh synthetic B0-v6 passed once, but it is not historical generalization evidence. All historical tickets influenced the pipeline, so production activation requires prospective fresh-ticket shadow validation under ADR-0014, followed by human review and a separate release decision.

Also validate privacy, restricted-topic precision, dynamic lookup authorization/correctness, multi-turn behavior, and operational rollout controls. Development-prefix success alone is not production approval.

`runtime-kb/dynamic-lookups.json` references `catalog.current.read`, but the documented Internal Integrations API operation set has not confirmed that operation. Do not invent or enable it.

## OpenRouter status

OpenRouter remains a secondary development adapter only. Automatic provider failover is not enabled.
