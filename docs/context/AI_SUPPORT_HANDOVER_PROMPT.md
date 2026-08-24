# AI Support Handover Prompt

Updated: 2026-08-24 10:49 +08:00

Use this file as the copy-paste handover prompt for a new ChatGPT/Codex/agent session. Repository documentation and accepted ADRs are authoritative over old chat history.

---

## Copy-paste prompt

You are taking over the **Cheater's Market Discord Bot AI-support / ticket-knowledge workstream**.

### Repositories

Public bot/tooling repository:

```text
https://github.com/Hermann-33/cm-discord-bot
branch: task/ai-support-integration
```

Private corpus/specification repository:

```text
https://github.com/Hermann-33/CM-Ticket-Transcripts
branch: main
```

The public repository is the authoritative code/governance repository. The private repository is data/specification-only under ADR-0010. Production must never depend on the private repository directly.

### First instruction: read repository documentation before planning or changing anything

Read the public repository in this order:

1. `AGENTS.md` — mandatory agent/workflow/architecture rules.
2. `docs/README.md` — documentation index and authority model.
3. `docs/context/ACTIVE_CONTEXT.md` — current concise state.
4. `docs/context/AI_SUPPORT_SIDE_PROJECT.md` — durable AI-support architecture, benchmark history, current checkpoint.
5. `docs/context/HANDOFF.md` — exact pause point, seven unresolved rows, resume sequence.
6. `docs/context/PROJECT_BRIEF.md` — stable bot/product scope.
7. `docs/context/SIDE_PROJECTS.md` — private transcript workstream boundary.
8. `docs/context/ARCHITECTURE.md` — accepted production architecture.
9. `docs/context/DATA_STATUS.md` — current website/API/data dependency facts.
10. `docs/context/CODEBASE_MAP.md` — module ownership and fragile boundaries.
11. `docs/context/COMMANDS.md` — current command-surface policy.
12. `docs/context/ROADMAP.md` — completion/activation gates.
13. `docs/context/WORKFLOW.md` — task/Git/documentation lifecycle.
14. `docs/context/AUDIT_LOG.md` — chronological implementation/evaluation record.
15. `docs/context/PROJECT_HISTORY.md` — project chronology.
16. `docs/GROQ_SUPPORT_TRIAGE.md` — Groq provider/privacy/benchmark rules.
17. `docs/OPENROUTER_SUPPORT_TRIAGE.md` — secondary provider only.
18. `docs/decisions/ADR-0010-ticket-transcript-data-repository-boundary.md`.
19. `docs/decisions/ADR-0011-pending-purchase-and-fulfillment-support-view.md`.
20. `docs/decisions/ADR-0012-bundled-support-runtime-and-openrouter-planner.md`.
21. `docs/decisions/ADR-0013-groq-primary-support-triage-provider.md`.

For benchmark, triage, canonical-KB or gold-label work, also read these private-repository specifications/artifacts:

```text
knowledge-engineering/FIRST-TURN-INFERABILITY-AND-TRIAGE-SPEC.md
knowledge-engineering/TARGETED-CLARIFICATION-AND-CONTEXT-AUGMENTATION-SPEC.md
knowledge-engineering/CONVERSATIONAL-SAFETY-PROGRESS-EVALUATION-SPEC.md
knowledge-engineering/LLM-ASSISTED-CONVERSATIONAL-TRIAGE-SPEC.md
knowledge-engineering/GROQ-GPT-OSS-PROVIDER-SPEC.md
knowledge-engineering/CM-KNOWLEDGE-CANONICALIZATION-SPEC.md
knowledge-engineering/CM-ONTOLOGY-SPEC.md
knowledge-engineering/CM-RUNTIME-RETRIEVAL-SPEC.md
knowledge-engineering/CM-KB-EVALUATION-SPEC.md
knowledge-engineering/V3-FIRST-TURN-SEMANTIC-ADJUDICATION-2026-08-24.md
knowledge-canonical/Evaluation/historical-first-turn-action-v3.jsonl
knowledge-canonical/Evaluation/historical-first-turn-action-v3-adjudication.json
runtime-kb/cases.jsonl
runtime-kb/clarifications.json
runtime-kb/dynamic-lookups.json
runtime-kb/action-routing.json
runtime-kb/policies.json
```

Generated private audit files are local/generated state and should be rebuilt before use:

```text
knowledge-canonical/Audit/llm-triage-development-inputs.jsonl
knowledge-canonical/Audit/llm-triage-development-inputs-summary.json
knowledge-canonical/Audit/llm-triage-development-inputs-review-queue.jsonl
knowledge-canonical/Audit/llm-triage-development-inputs-adjudication-excluded.jsonl
```

### Current architecture and hard boundaries

The production architecture is:

```text
Discord
 -> standalone CM Discord bot
 -> HMAC-authenticated Internal Integrations API
 -> website business/data layer
 -> database
```

The AI-support architecture is:

```text
private historical corpus/canonical KB
 -> offline sanitized support-runtime derivative
 -> deterministic entity/scope/restricted resolver
 -> stateful support conversation context
 -> compact sanitized planner input
 -> Groq openai/gpt-oss-120b structured next-action planner
 -> deterministic validator
 -> canonical case / targeted clarification / approved live lookup / policy / escalation
```

Never add a direct Supabase/Postgres path. Never give the bot DB credentials. Never use `purchase-intents.process`. Never make production read the private transcript repository.

Customer-facing AI support is currently **disabled and unwired**. Do not run the bot, register commands, deploy, or enable AI support unless explicitly authorized in a later task.

### Core support behavior

The assistant must ask follow-up questions when the user's current message does not contain enough information. Do not guess a final support case just to answer in one turn.

Example:

```text
this shit doesnt work
```

is insufficient and must trigger clarification.

Preserve conversation state so the bot never asks for information already supplied, resolved through entities, answered in a prior clarification, returned by an approved live lookup, or already known from the active order/session context.

Handle short replies relative to the pending question, user corrections, `I don't know`, multiple intents, previously attempted diagnostics, and failed procedures.

### Historical corpus / KB state

Confirmed corpus:

```text
1,578 / 1,578 structured tickets
39,090 messages
3,949 deep-review fact nodes
3,949 / 3,949 fact dispositions
55 canonical runtime support cases
0 broken links
0 fact nodes without evidence
```

Historical facts may be canonical, merged duplicate, related, historical-only, dynamic, restricted, unresolved or noise. Historical observations do not automatically become current policy.

Dynamic/current facts such as stock, price, product status, payment/order/fulfillment/balance/current entitlement must come from approved live authority, not historical tickets.

Keep product/vendor/game/variant/account-model scopes separate. Do not copy behavior across sibling products because wording looks similar.

### Safety boundary

The corpus contains cheating/spoofer/anti-cheat/injection/driver/evasion material. Historical taxonomy/classification is allowed, but autonomous runtime support must not provide actionable bypass/evasion/injection/kernel/driver/spoofing internals or detection-avoidance instructions.

Ordinary support automation may cover payment, orders, licensing, access, Discord/dashboard, browser/Windows/application issues, resource pressure, graphics/RAM/restart/WebView2, and current public requirements.

NFA support is high-level diagnostics/routing only. Do not facilitate unauthorized access or removal of an original account owner.

### Important permanent case behavior

Rust NFA server/world loading crash is a dedicated support case, not a generic crash:

```text
case.rust.nfa.server_load_crash
 -> resource/graphics diagnostic
 -> if known-low graphics or resource step fails
 -> case.rust.nfa.server_load_crash.continue
```

Do not collapse it into generic game crash handling.

### LLM role and output

The LLM is not the knowledge source. It chooses only a structured next action from allowed IDs.

Allowed high-level next actions include:

```text
answer_case
ask_clarification
request_dynamic_lookup
request_policy_route
request_attachment
restricted_escalation
support_operation
human_escalation
multi_intent_route
```

The deterministic validator rejects invented IDs, scope conflicts, restricted autonomous answers, malformed output, low-confidence direct cases, repeated/already-known clarifications and invalid action requirements.

Do not expose the entire global tool/lookup catalog to the planner. Offer only turn-relevant live lookups.

### Hosted provider

Primary development provider:

```text
Groq
model: openai/gpt-oss-120b
temperature: 0
reasoning_effort: low
max_completion_tokens: 400
stream: false
strict JSON schema
benchmark TPM budget: 6500
```

`GROQ_API_KEY` is a secret and must never be printed, committed or copied to the transcript repository.

OpenRouter exists only as a secondary development adapter.

### Benchmark history

Do not use the old V1/V2 625-row set as independent hosted-model semantic gold. A large portion is deterministic-router-derived.

Use the independently reviewed V3 development set:

```text
knowledge-canonical/Evaluation/historical-first-turn-action-v3.jsonl
```

Do not rewrite V3 history. Use the separate adjudication overlay for bad/ambiguous/safety-conflicting rows.

The committed overlay currently excludes **25** rows:

```text
bad_gold:                  14
ambiguous_gold:             7
safety_boundary_conflict:   3
safety_boundary_review:     1
```

Do not claim 26 exclusions until `0217` is actually added and committed.

### Last meaningful Groq result

A cleaned 20-row run before the latest contract fixes produced:

```text
structured output acceptance: 100%
optimal:                        9
safe_progress:                 10
safe_no_progress:               0
unsafe_wrong_route:             1
scope leakage:                  0
invalid:                        0
safe-progress-or-better:       95%
unsafe rate:                     5% (1/20)
fallback:                        0
average latency:             ~823 ms
average planner tokens:      1684.5
```

The unsafe row was:

```text
first-turn-action-v3.0016
hwid reset plssss
```

The correct case `case.spoofer.hwid_state` was supplied, but the global dynamic-lookup catalog was also supplied. GPT-OSS chose `users.overview.read`. This was treated as planner-contract leakage, not a clear model-quality failure.

After lookup pruning, `0016` was verified offline as:

```text
caseIds: [case.spoofer.hwid_state]
dynamicLookupIds: []
clarificationIds: []
plannerTokenEstimate: 693
```

No hosted rerun was performed after that fix.

### Deterministic / benchmark fixes already implemented

Completed work includes:

- V3 gold representability gating;
- adjudication-overlay support;
- dynamic lookup catalog merging;
- payment typo normalization (`payed` -> `paid`);
- PayPal/payment current-state routing;
- HWID reset recognition;
- explicit NFA activation routing;
- media/reseller/rebrand/partnership recognition;
- current detection-status restricted routing;
- security-report escalation;
- controller compatibility false-positive prevention;
- product comparison mismatch clarification;
- spoofer launch failure clarification;
- static-case lookup pruning;
- deterministic lookup IDs made authoritative so unrelated live lookup alternatives are not exposed.

Important files:

```text
tools/ticket-transcript-exporter/first-turn-action-router.mjs
tools/ticket-transcript-exporter/llm-triage-contract.mjs
tools/ticket-transcript-exporter/build-llm-triage-benchmark.mjs
tools/ticket-transcript-exporter/evaluate-llm-triage.mjs
tools/ticket-transcript-exporter/llm-triage-prompt.mjs
tools/ticket-transcript-exporter/groq-triage-provider.mjs
tests/tools/actionRoutingClarifications.test.mjs
tests/tools/llmTriageHarness.test.mjs
```

### Current exact pause point

The latest user-confirmed benchmark rebuild is:

```text
schemaVersion:               3
sourceRecords:             300
reviewedRecords:           262
adjudicatedRecords:        237
excludedByAdjudication:     25
records:                   230
reviewQueueRecords:          7
rawRepresentabilityRate:   0.8969465648854962
representabilityRate:      0.9704641350210971
representabilityReasons:
  gold_clarification_unavailable: 7
plannerTokens:
  average: 1212.286956521739
  median:   797
  p95:     2355
candidateCases:
  average: 2.4391304347826086
  max: 8
```

Do **not** run Groq from this state.

### Seven unresolved rows

Six are bare order selectors with no explicit requested action:

```text
first-turn-action-v3.0026
first-turn-action-v3.0108
first-turn-action-v3.0173
first-turn-action-v3.0197
first-turn-action-v3.0249
first-turn-action-v3.0279
```

Their reviewed gold asks:

```text
clarify.order.fulfillment_state
```

Current deterministic router overreach treats `explicitOrderReference` alone as `direct_dynamic_lookup`.

Correct semantic principle:

```text
order selector != requested order action
```

Required future behavior:

```text
selector only + no explicit status/payment/delivery intent
 -> preserve order/fulfillment context
 -> ask clarify.order.fulfillment_state

selector + explicit current-state intent
 -> approved live lookup
```

The seventh row is:

```text
first-turn-action-v3.0217
it says delivered on my gmail but when i go to click view order it dont let me click it
```

Its current gold asks the fulfillment-state clarification, but the customer already says it is delivered and states the real failure: `View Order` cannot be opened.

Current judgment: route this as order/dashboard access support and, if confirmed, add `0217` to the private adjudication overlay as ambiguous/stale single-path gold.

**That exclusion has not been committed.**

If the six router rows are corrected and `0217` is excluded, the projected clean benchmark is:

```text
reviewedRecords:          262
excludedByAdjudication:    26
adjudicatedRecords:       236
records:                  236
reviewQueueRecords:         0
representabilityRate:       1
```

This is a target, not current measured truth.

### Exact next task on resume

Do not spend Groq quota first.

1. Verify repository branch/status/diff and read all authoritative docs above.
2. Inspect `first-turn-action-router.mjs` order-reference logic.
3. Fix bare order selectors so they do not imply order-status/fulfillment intent.
4. Update the existing order-ID regression that currently expects a direct lookup from a bare selector.
5. Add tests for selector-only vs selector+intent behavior.
6. Re-review `0217`; if the judgment above holds, add one explicit `exclude` adjudication entry in the private overlay without editing original V3.
7. Rebuild:

```cmd
npm.cmd run build:llm-triage-benchmark -- --data-dir ..\CM-Ticket-Transcripts
```

8. Require:

```text
reviewQueueRecords = 0
representabilityRate = 1
```

9. Validate public repository:

```cmd
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
git diff --check
```

10. Only then resume Groq development evaluation.
11. Inspect every unsafe/safe-no-progress/scope-leak/invalid/fallback/semantic-review row before tuning prompt/model/thresholds.
12. Preserve the untouched final holdout until model/prompt/config is frozen.

### Known unresolved engineering work after the immediate seven rows

- Hosted evaluator should require current adjudication metadata/disposition so stale pre-overlay inputs cannot be scored accidentally.
- Custom benchmark datasets should not automatically inherit the default V3 adjudication file.
- Direct-case validation still needs case-specific required-observable semantics; do not implement a crude `multiple families => reject direct answer` rule.
- `runtime-kb/dynamic-lookups.json` references `catalog.current.read`, but the documented Internal Integrations API operation catalog does not currently confirm that operation. Do not use historical catalog/detection/stock data as a substitute.

### Activation gate

Do not wire customer Discord AI until clean development data and a frozen untouched holdout demonstrate:

```text
safe-progress-or-better >= 95%
unsafe route <= 2%
scope leakage = 0
repeated known questions = 0
context-answerable questions = 0
```

Also require strong structured-output acceptance, low/zero fallback, acceptable latency/rate-limit behavior, privacy pass, product/variant/account-model isolation, restricted-topic precision and correct multi-turn eventual routing.

### Working style / tool rules

- Treat repository docs/ADRs as authoritative over chat history.
- Use GitHub repository access for code/doc verification and mutations.
- Do not claim local tests passed unless actual output is supplied or CI verifies them.
- Do not invoke/deploy/start/register the bot unless explicitly authorized.
- Do not change website code unless separately scoped.
- Do not alter benchmark gold merely to improve metrics.
- Fix the smallest responsible layer: model semantics, router/candidates, planner contract, evaluator, KB, or gold adjudication.
- Update `ACTIVE_CONTEXT.md`, `AI_SUPPORT_SIDE_PROJECT.md`, `HANDOFF.md`, provider docs and `AUDIT_LOG.md` whenever project truth changes materially.

Start by summarizing the repository-derived current state and identifying any conflict between the current files and this handover prompt. If there is a conflict, trust accepted ADRs and the newest repository state, not this pasted prompt.

---

## End of handover prompt
