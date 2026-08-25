# AI Support Handover Prompt

Updated: 2026-08-25 10:59 +08:00

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
4. `docs/context/AI_SUPPORT_RELEASE_HANDOVER_2026-08-25.md`
5. `docs/context/AI_SUPPORT_TRIAGE_VALIDATION_2026-08-25.md`
6. `docs/context/HANDOFF.md`
7. `docs/context/AI_SUPPORT_SIDE_PROJECT.md`
8. `docs/context/PROJECT_BRIEF.md`
9. `docs/context/SIDE_PROJECTS.md`
10. `docs/context/ARCHITECTURE.md`
11. `docs/context/DATA_STATUS.md`
12. `docs/context/CODEBASE_MAP.md`
13. `docs/context/COMMANDS.md`
14. `docs/context/ROADMAP.md`
15. `docs/context/WORKFLOW.md`
16. `docs/context/AUDIT_LOG.md`
17. `docs/context/PROJECT_HISTORY.md`
18. `docs/GROQ_SUPPORT_TRIAGE.md`
19. `docs/OPENROUTER_SUPPORT_TRIAGE.md`
20. `docs/decisions/ADR-0010-ticket-transcript-data-repository-boundary.md`
21. `docs/decisions/ADR-0011-pending-purchase-and-fulfillment-support-view.md`
22. `docs/decisions/ADR-0012-bundled-support-runtime-and-openrouter-planner.md`
23. `docs/decisions/ADR-0013-groq-primary-support-triage-provider.md`

The release handover is authoritative for the current paused implementation state. The validation checkpoint remains authoritative for the last fully validated tests/benchmark/hosted result.

### Current exact state

Before handover-document commits, the executable implementation checkpoint was:

```text
public implementation HEAD: cfb0b163cac43c95e515ba316fa37c100cec4fe2
last fully validated HEAD:   803a50bb09cdc6a60b3c736762d285cdac0aa276
private main HEAD:           c9e993f17583a607402f4173296f64aac52d2ebe
```

The public branch now also contains documentation-only handover commits after `cfb0b163`. Do not confuse the documentation HEAD with a newly validated executable release candidate.

The four executable commits after the validated checkpoint are:

```text
cd25bb66acd8bc14bd5d34b941fe0ad0ada91b64  Align runtime triage envelopes with validated planner
317703b7cccc3b4e845cf459558c6e88dd8f1ea0  Use input-aware Groq schema in runtime
66b375ffeb3c98ffaa52983eef07830ebe3a9391  Test production deterministic Groq envelopes
cfb0b163cac43c95e515ba316fa37c100cec4fe2  Add production deterministic support resolver
```

These post-validation executable commits have **not** yet been fully revalidated. No CI status was available for them during the handover session, and the assistant did not run local tests.

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

Customer-facing AI support is **disabled and unwired**. No bot startup, command registration, deployment, production merge, website mutation, or AI activation occurred in the paused session.

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

### Post-validation implementation added before pause

Production runtime parity was started and committed:

- `src/ai/supportTriage.ts`: deterministic static-case / lookup / clarification validation and fallback parity;
- `src/ai/groqClient.ts`: input-aware strict Groq schema matching deterministic envelopes;
- `src/ai/firstTurnRouter.ts`: runtime-safe TypeScript port of validated first-turn deterministic semantics;
- `src/ai/deterministicResolver.ts`: converts bundled runtime + conversation state into the bounded production planner envelope;
- regression tests for provider envelopes and production resolver behavior.

Known regression classes covered include HWID reset leakage, entity-only speculative family expansion, bare order selectors, explicit order status, pending-clarification follow-ups, and restricted detection/evasion intent.

This production-parity layer is **not yet fully revalidated**.

### Implementation intentionally left incomplete

Do not assume these exist:

1. grounded `DeterministicSupportActionResolver`;
2. abstract-lookup -> concrete `InternalApiClient` read adapter;
3. customer-safe rendering of case/policy/procedure/live state;
4. Discord ticket/channel conversation-state persistence;
5. `messageCreate` integration;
6. default-off AI feature flag, channel/category allowlist, rollout controls, kill switch;
7. superseding activation ADR/privacy-security review required before customer-facing message wiring;
8. release-candidate freeze manifest/hash tool;
9. final holdout selection/freeze tool;
10. one-shot final holdout evaluation;
11. production deployment/activation.

A draft action resolver was started in chat but not committed. Treat it as nonexistent repository state.

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

### Holdout rule

The final release holdout has **not been selected, inspected, generated, sent to Groq, or scored**.

Do not use consumed V3 as final holdout. Do not assume the existing `historical-rule-holdout.jsonl` is eligible merely because of its filename; audit prior use/provenance first.

A valid final holdout must be selected after the executable implementation is revalidated/frozen and must subtract all consumed development/training provenance, including V1/V2/V3 transcript IDs and routing exemplars already used to tune/evaluate current behavior.

Selection must be prediction-blind and deterministic, with a fingerprint/manifest and independent gold review. Then run it exactly once. If insufficient genuinely unused historical rows remain, document historical-corpus exhaustion rather than fabricate a contaminated release metric.

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

1. Verify public/private HEADs and read the dated release handover.
2. Run focused production AI tests, full `npm test`, typecheck, build, and `git diff --check` against the current executable implementation.
3. Compare production resolver outputs to validated tooling on known regression rows and a representative consumed-development sample.
4. Fix only true production-parity defects before any holdout work.
5. Implement the grounded action resolver and explicit abstract-to-concrete read adapter; add fail-closed tests.
6. Implement bounded conversation-state storage and Discord message integration behind default-off rollout controls.
7. Add the superseding activation ADR/privacy-security review.
8. Run full offline/runtime validation again and freeze implementation SHA + runtime hashes + Groq config.
9. Build/fingerprint the truly independent final holdout using provenance subtraction only.
10. Run the final holdout once.
11. If every release gate passes, perform a controlled rollout. Otherwise leave AI support disabled and record the failure without tuning on the holdout.

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

Start by summarizing repository-derived current state and explicitly distinguishing the last validated checkpoint from the current unvalidated executable implementation.

---

## End of handover prompt
