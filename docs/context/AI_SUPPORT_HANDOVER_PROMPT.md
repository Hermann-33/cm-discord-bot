# AI Support Handover Prompt

Updated: 2026-08-25 07:59 +08:00

Use this as the copy-paste handover prompt for a new ChatGPT/Codex/agent session. Repository documentation and accepted ADRs are authoritative over chat history.

---

## Copy-paste prompt

You are taking over the **Cheater's Market Discord Bot AI-support / ticket-knowledge workstream**.

### Repositories

```text
public:  https://github.com/Hermann-33/cm-discord-bot
branch:  task/ai-support-integration

private: https://github.com/Hermann-33/CM-Ticket-Transcripts
branch:  main
```

The public repository owns executable bot/tooling code and governance. The private repository is data/specification-only under ADR-0010. Production must never depend on it directly.

### Mandatory reading — public repository

Read in this order before planning, changing routing/benchmarks, spending hosted quota, or touching production integration:

1. `AGENTS.md`
2. `docs/README.md`
3. `docs/context/ACTIVE_CONTEXT.md`
4. `docs/context/AI_SUPPORT_TRIAGE_VALIDATION_2026-08-25.md`
5. `docs/context/HANDOFF.md`
6. `docs/context/AI_SUPPORT_SIDE_PROJECT.md`
7. `docs/context/PROJECT_BRIEF.md`
8. `docs/context/SIDE_PROJECTS.md`
9. `docs/context/ARCHITECTURE.md`
10. `docs/context/DATA_STATUS.md`
11. `docs/context/CODEBASE_MAP.md`
12. `docs/context/COMMANDS.md`
13. `docs/context/ROADMAP.md`
14. `docs/context/WORKFLOW.md`
15. `docs/context/AUDIT_LOG.md`
16. `docs/context/PROJECT_HISTORY.md`
17. `docs/GROQ_SUPPORT_TRIAGE.md`
18. `docs/OPENROUTER_SUPPORT_TRIAGE.md`
19. `docs/decisions/ADR-0010-ticket-transcript-data-repository-boundary.md`
20. `docs/decisions/ADR-0011-pending-purchase-and-fulfillment-support-view.md`
21. `docs/decisions/ADR-0012-bundled-support-runtime-and-openrouter-planner.md`
22. `docs/decisions/ADR-0013-groq-primary-support-triage-provider.md`

The dated validation checkpoint supersedes older validation-pending benchmark text where it conflicts. Never silently reconcile a lower-authority contradiction.

### Mandatory reading — private repository

For corpus/benchmark work, read:

1. `README.md`
2. `knowledge-canonical/Audit/HOSTED_TRIAGE_HANDOFF.md` as historical/private navigation, subject to newer public authoritative state
3. `knowledge-engineering/AI-SUPPORT-PAUSE-CHECKPOINT-2026-08-24.md`
4. `knowledge-engineering/FIRST-TURN-INFERABILITY-AND-TRIAGE-SPEC.md`
5. `knowledge-engineering/TARGETED-CLARIFICATION-AND-CONTEXT-AUGMENTATION-SPEC.md`
6. `knowledge-engineering/CONVERSATIONAL-SAFETY-PROGRESS-EVALUATION-SPEC.md`
7. `knowledge-engineering/LLM-ASSISTED-CONVERSATIONAL-TRIAGE-SPEC.md`
8. `knowledge-engineering/GROQ-GPT-OSS-PROVIDER-SPEC.md`
9. remaining canonicalization/ontology/retrieval/evaluation/ranking/context specifications referenced by the private README
10. immutable `knowledge-canonical/Evaluation/historical-first-turn-action-v3.jsonl`
11. `knowledge-canonical/Evaluation/historical-first-turn-action-v3-adjudication.json`
12. `runtime-kb/cases.jsonl`, `clarifications.json`, `dynamic-lookups.json`, `action-routing.json`, and `policies.json`

Generated `knowledge-canonical/Audit/llm-triage-*` files are local build/evaluation artifacts, not immutable source truth. Rebuild them when code or overlay state changes. Preserve unrelated dirty/untracked files.

### Production and safety boundaries

Production remains:

```text
Discord
 -> standalone CM Discord bot
 -> HMAC-authenticated Internal Integrations API
 -> website business/data layer
 -> database
```

Never add direct Supabase/Postgres access, DB/service-role credentials, a database fallback, or a production filesystem dependency on the private corpus. Never invent a website operation. `catalog.current.read` remains unconfirmed and unavailable.

Customer-facing AI support is **disabled and unwired**. Do not run the bot, register commands, deploy, merge to production, mutate website state, or activate AI support without a separately authorized task.

Restricted bypass/evasion/injection/kernel/driver/spoofing/detection-avoidance material stays outside autonomous support.

### AI architecture

```text
private canonical corpus
 -> sanitized public support-runtime derivative
 -> deterministic entity/scope/restricted resolver
 -> stateful conversation context
 -> compact planner action envelope
 -> Groq openai/gpt-oss-120b
 -> deterministic validator
 -> canonical case / targeted clarification / approved live lookup / policy / escalation
```

The LLM is not the knowledge or authorization authority. It has no browser, tools, code execution, MCP, database, website, Discord action, or mutation access.

Hosted defaults:

```text
temperature:             0
reasoning_effort:        low
max_completion_tokens:   400
stream:                  false
response_format:         strict JSON schema
benchmark TPM budget:    6500
direct-case confidence:  0.8
```

Never print, commit, log, or copy `GROQ_API_KEY` into the private repository.

### Current measured benchmark

Use only the independently reviewed V3 development set. Do not use the old combined V1/V2 set as independent hosted semantic gold. Original V3 is immutable; exclusions live only in its adjudication overlay.

```text
sourceRecords:             300
reviewedRecords:           262
excludedByAdjudication:     26
adjudicatedRecords:        236
records:                   236
reviewQueueRecords:          0
representabilityRate:        1
representabilityReasons:    {}
plannerTokens avg/med/p95: 1122.5042 / 844 / 1858
```

Overlay categories: 14 bad gold, 8 ambiguous gold, 3 safety-boundary conflicts, and 1 safety-boundary review.

### Latest Groq development result

The final post-fix hosted run used the consumed 40-row development prefix. The first 20 rows provide the matching smoke slice.

```text
20 rows:
  structured / exact:           1 / 0.95
  optimal / safe progress:      17 / 3
  unsafe / fallback / review:    0 / 0 / 0

40 rows:
  structured / exact:           1 / 0.975
  optimal / safe progress:      36 / 4
  unsafe / fallback / review:    0 / 0 / 0
  latency avg/med/p95 ms:        995.0310 / 989.0279 / 1222.3352
  planner tokens avg/med/p95:    981.3 / 839 / 1466
```

All four safe-progress rows were inspected; none requires semantic review. The run completed without fallback, invalid output, unsafe routing, scope leakage, early stop, or 429.

### Implemented and validated repairs

- explicit deterministic clarification provenance instead of treating every relevant clarification as authoritative;
- deterministic static case, lookup, and clarification envelopes across candidates, Groq schema, validator, and fallback;
- no speculative family expansion from entity-only text;
- selector-only order turns clarify intent; selector plus explicit state intent may use approved lookup;
- scoped generic clarification cannot reintroduce global lookup substitutions;
- lookup-over-clarification is safe only when the canonical clarification explicitly declares that ID or operation;
- redaction placeholders are not canonical entities or proof of missing data;
- targeted account-token, loader-link, VBS/virtualization/Secure Boot/TPM, and technical-praise routing;
- Groq schemas avoid unsupported `uniqueItems`.

Latest gates:

```text
focused tests:      77 / 77 pass
full npm test:     308 / 308 pass
typecheck:         pass
build:             pass
git diff --check:  pass
benchmark:         236 / 236, review queue 0
```

### Next gate

The final holdout is untouched. Do not use it for tuning or casually inspect it. A later explicitly authorized activation-readiness task must:

1. verify implementation and development adjudication are frozen;
2. run the separately governed final holdout once;
3. inspect every non-optimal, fallback, invalid, unsafe, leakage, and semantic-review row;
4. verify privacy, restricted-topic precision, lookup authorization/correctness, multi-turn behavior, and rollout controls;
5. keep production disabled unless ADR-0012/ADR-0013 activation criteria pass.

Required holdout thresholds include safe-progress-or-better at least 95%, unsafe route at most 2%, zero scope leakage, zero repeated known questions, and zero context-answerable questions.

### Working rules

- Start with repository status/diff and authoritative documents.
- Do not claim a test or hosted result without actual output.
- Do not change clean source gold merely to improve metrics.
- Fix the smallest responsible layer: router, candidate envelope, provider schema, validator/fallback, evaluator contract, KB, or explicit adjudication.
- Do not expose global live tools merely because they exist.
- Update current context, handoff, specialist docs, and dated checkpoints whenever project truth changes materially.

Start by summarizing repository-derived current state and reporting any conflict with this prompt. Trust accepted ADRs and newer higher-authority repository state.

---

## End of handover prompt
