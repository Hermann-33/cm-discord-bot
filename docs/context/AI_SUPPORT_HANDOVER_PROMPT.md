# AI Support Handover Prompt

Updated: 2026-08-26

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
4. `docs/context/AI_SUPPORT_RELEASE_VALIDATION_2026-08-26.md`
5. `docs/AI_SUPPORT_SHADOW_VALIDATION.md`
6. `docs/context/HANDOFF.md`
7. `docs/context/AI_SUPPORT_RELEASE_HANDOVER_2026-08-25.md` for historical context
8. `docs/context/AI_SUPPORT_SIDE_PROJECT.md`
9. `docs/context/PROJECT_BRIEF.md`
10. `docs/context/SIDE_PROJECTS.md`
11. `docs/context/ARCHITECTURE.md`
12. `docs/context/DATA_STATUS.md`
13. `docs/context/CODEBASE_MAP.md`
14. `docs/context/COMMANDS.md`
15. `docs/context/ROADMAP.md`
16. `docs/context/WORKFLOW.md`
17. `docs/context/AUDIT_LOG.md`
18. `docs/context/PROJECT_HISTORY.md`
19. `docs/GROQ_SUPPORT_TRIAGE.md`
20. `docs/OPENROUTER_SUPPORT_TRIAGE.md`
21. `docs/decisions/ADR-0010-ticket-transcript-data-repository-boundary.md`
22. `docs/decisions/ADR-0011-pending-purchase-and-fulfillment-support-view.md`
23. `docs/decisions/ADR-0012-bundled-support-runtime-and-openrouter-planner.md`
24. `docs/decisions/ADR-0013-groq-primary-support-triage-provider.md`
25. `docs/decisions/ADR-0014-customer-facing-ai-support-activation-boundary.md`

The 2026-08-26 release validation is authoritative for the current implementation, synthetic acceptance, and remaining activation gate.

### Current exact state

```text
failed B0-v3 candidate: 4d8790fc90b351d261f8699c7b3cd989c3787fe9
current candidate:      2e8b763f699b4c1aaa138320f4e0420c736e82dc
private main HEAD:      c9e993f17583a607402f4173296f64aac52d2ebe
```

Candidate `2e8b763` passed 375/375 tests, typecheck, build, diff check, and npm audit with zero vulnerabilities. Fresh synthetic B0-v6 passed 44/44 deterministic preflight and 44/44 on its single hosted run, with zero fallback and 3/3 restricted safety.

Prospective shadow tooling is implemented on isolated branch `task/ai-support-shadow-validation`: independent default-off no-reply mode, frozen cutoff cohorts, privacy-safe local evidence, human adjudication, deterministic ADR metrics, and close/report tooling. No real fresh tickets were collected, no bot was started, and no deployment or activation occurred.

Shadow implementation commit: `fe644f33be2341d71bc9c0860d339046fcdf0c37`; validation was 388/388 tests plus typecheck/build/diff/audit pass with zero vulnerabilities.

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

Never add direct Supabase/Postgres access, DB/service-role credentials, a database fallback, or a production filesystem dependency on the private corpus. Never invent a website/API operation. `catalog.current.read` remains unconfirmed and unavailable.

Customer-facing AI support is **wired default-off, disabled, and not deployed** under ADR-0014. No bot startup, command registration, deployment, website mutation, or AI activation occurred.

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
 -> grounded deterministic action resolver
 -> canonical case / targeted clarification / approved live read / policy / escalation
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

### Last fully validated benchmark state

Use only the independently reviewed V3 development set for consumed development evaluation. Original V3 is immutable; exclusions live only in its adjudication overlay.

```text
sourceRecords:             300
reviewedRecords:           262
excludedByAdjudication:     26
adjudicatedRecords:        236
records:                   236
reviewQueueRecords:          0
representabilityRate:        1
plannerTokens avg/med/p95: 1122.5042 / 844 / 1858
```

Overlay categories: 14 bad gold, 8 ambiguous gold, 3 safety-boundary conflicts, and 1 safety-boundary review.

Validated Groq consumed-development prefix at `803a50b`:

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

Validated gates at that checkpoint:

```text
focused tests:      77 / 77 pass
full npm test:     308 / 308 pass
typecheck:         pass
build:             pass
git diff --check:  pass
benchmark:         236 / 236, review queue 0
```

### Current implementation

The production candidate includes the grounded deterministic action resolver, explicit read-only lookup adapter, customer-safe rendering, bounded in-memory conversation state, default-off Discord `messageCreate` integration, exact channel/category allowlists, kill switch, privacy controls, and ADR-0014 activation governance.

The B0-v3 remediation transports deterministic control-plane actions and policy IDs end-to-end. The input-aware schema constrains all canonical ID fields, the validator independently enforces the same invariants, and fallback preserves the deterministic route. Restricted turns can only produce canonical restricted escalation.

Production deployment and activation remain intentionally incomplete and unauthorized.

### Concrete API boundary for the action layer

Existing safe read methods include:

- `lookupAuraByDiscordId(...)`;
- `fetchUserOverview(...)`;
- `fetchOrderDetails(...)`;
- `fetchOrderFulfillment(...)`;
- `fetchPurchaseIntent(...)`.

The KB may refer to broader abstract operations such as `orders.lookup.read`, `purchase-intents.process.status.read`, or `catalog.current.read`. Never derive an endpoint name from these strings.

Required adapter behavior:

- map only to an existing concrete approved read when it actually supplies the requested current state;
- related abstract IDs may collapse into one concrete read when justified;
- unsupported lookups clarify/escalate;
- no autonomous mutation APIs;
- no raw account tokens/license keys/secret fulfillment material in planner or customer output;
- `catalog.current.read` remains unavailable until the website exposes and documents a real operation.

### Release evidence and remaining gate

B0-v3 is consumed failed evidence and was never rerun. B0-v4 and B0-v5 failed deterministic preflight and received no hosted call. B0-v6 is consumed passing fresh synthetic evidence: 44/44 deterministic preflight, 44/44 hosted structured acceptance, 44/44 exact action, zero fallback, and 3/3 restricted safe.

All 1,578 historical tickets influenced the pipeline, so no legitimate untouched historical holdout remains. Do not claim synthetic B0-v6 as historical generalization evidence. The remaining ADR-0014 evidence gate is prospective shadow evaluation on newly arriving tickets, followed by a separate activation decision.

Required thresholds remain at least:

```text
safe-progress-or-better >= 95%
unsafe route            <= 2%
scope leakage             0
repeated-known question    0
context-answerable question 0
```

Also verify structured-output/provider compatibility, privacy, restricted-topic precision, lookup authorization/adapter correctness, multi-turn behavior, runtime integrity, and rollout controls.

### Permanent Rust NFA exception

Preserve exactly:

```text
case.rust.nfa.server_load_crash
 -> lower high/max ordinary graphics
 -> close unnecessary background applications / free ordinary resources
 -> if already low or resource step fails -> case.rust.nfa.server_load_crash.continue
```

Do not generalize this into broader spoofing/evasion technical assistance.

### Temporary branches created during the paused session

These are non-authoritative session pointers:

```text
task/ai-support-release
task/ai-support-release-staging
task/ai-support-integration-handover
```

Continue authoritative implementation on `task/ai-support-integration` unless governance intentionally changes. Do not merge those pointers merely because they exist.

### Exact next sequence

1. Verify candidate `2e8b763`, runtime `1.0.0`, and private corpus SHA `c9e993f` remain the documented pins.
2. Keep `AI_SUPPORT_ENABLED=false` in production.
3. Approve a minimum prospective sample/review duration; ADR-0014 defines no minimum and the documented 200-turn/14-day recommendation is proposed only.
4. Initialize a cohort and separately authorize the bot to run with `AI_SUPPORT_ENABLED=false` and shadow enabled.
5. Score privacy, restricted safety, action correctness, fallback, lookup authority, and multi-turn behavior on newly arriving tickets.
6. Review every imperfect row and operational kill-switch/rollback evidence.
7. Require a separate explicit release decision before any production enablement or deployment.

### Working rules

- Do not claim tests or hosted results without actual output.
- Do not change clean source gold merely to improve metrics.
- Fix the smallest responsible layer.
- Do not expose global live tools merely because they exist.
- No direct DB/Supabase path or service-role secrets.
- No runtime dependency on private transcripts.
- No invented website/API operations.
- No model-selected mutation authority.
- Preserve restricted-topic safety boundaries.

Start by summarizing the frozen candidate, passing synthetic evidence, and pending prospective-shadow activation gate.

---

## End of handover prompt
