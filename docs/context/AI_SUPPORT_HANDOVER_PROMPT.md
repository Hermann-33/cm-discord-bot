# AI Support Handover Prompt

Updated: 2026-08-31
Status: `CONTROLLED LIVE TEST / RESPONSE RECONSTRUCTION ACTIVE / BROAD RELEASE BLOCKED`

Use this as the current copy-paste handover prompt for a new ChatGPT/Codex/agent session. Repository documentation and accepted ADRs are authoritative over chat history.

---

## Copy-paste prompt

You are taking over the **Cheater's Market Discord Bot AI-support / ticket-knowledge workstream**.

### Repositories

```text
public:  https://github.com/Hermann-33/cm-discord-bot
default/deployed branch: master
active engineering branch: task/ai-support-response-reconstruction

private: https://github.com/Hermann-33/CM-Ticket-Transcripts
branch:  main
reference SHA: c9e993f17583a607402f4173296f64aac52d2ebe
```

The public repository owns production bot/tooling code and governance. The private repository is data/specification-only under ADR-0010. Production must never depend on the private repository directly.

### Mandatory reading — current authority

Read in this order before planning or changing anything:

1. `AGENTS.md`
2. `docs/README.md`
3. `docs/context/CURRENT_STATE_2026-08-31.md`
4. `docs/context/DOCS_AUDIT_2026-08-31.md`
5. `docs/context/ACTIVE_CONTEXT.md`
6. `docs/context/HANDOFF.md`
7. `docs/context/ROADMAP.md`
8. `docs/context/ARCHITECTURE.md`
9. `docs/context/DATA_STATUS.md`
10. `docs/decisions/ADR-0012-bundled-support-runtime-and-openrouter-planner.md`
11. `docs/decisions/ADR-0013-groq-primary-support-triage-provider.md`
12. `docs/decisions/ADR-0014-customer-facing-ai-support-activation-boundary.md`
13. `docs/decisions/ADR-0015-single-channel-visible-ai-test.md`
14. `docs/context/AI_SUPPORT_RELEASE_VALIDATION_2026-08-26.md`
15. `docs/AI_SUPPORT_SHADOW_VALIDATION.md`
16. `docs/GROQ_SUPPORT_TRIAGE.md`

Dated release/triage/audit documents are historical evidence for the run they describe. Their old branch/deployment statements do not override the current-state layer.

### Current exact state

The validated AI/shadow implementation was merged to `master`. Before the 2026-08-31 documentation reconciliation, `master` was:

```text
f8988037994146f5d51455878fb8fa9d8a987928
```

The previous routing/planner candidate was:

```text
2e8b763f699b4c1aaa138320f4e0420c736e82dc
```

It passed consumed synthetic B0-v6 once:

```text
deterministic preflight: 44 / 44
hosted accepted:         44 / 44
exact effective action:  44 / 44
fallback:                 0 / 44
restricted safe:          3 / 3
avg/median/p95 latency:   1081.13 / 995.59 / 1602.98 ms
```

B0-v6 is consumed synthetic evidence, not historical-generalization evidence.

### Current deployment/test boundary

The bot is deployed through Northflank from the CM Discord Bot repository. The operator explicitly authorized a narrow customer-visible test only in one Discord channel:

```text
AI_SUPPORT_ENABLED=true
AI_SUPPORT_SHADOW_ENABLED=false
AI_SUPPORT_CHANNEL_IDS=1542084649017286727
AI_SUPPORT_CATEGORY_IDS=
```

The allowlist must contain exactly that one channel and no category IDs. This is a controlled test under ADR-0015, not broad production release.

Rollback / kill switch:

```text
AI_SUPPORT_ENABLED=false
```

Do not broaden the visible channel/category boundary without a new explicit operator decision.

### Live defect that triggered the active work

Customer test message:

```text
Im unable to download the nfa loader
```

Observed reply:

```text
A staff member needs to continue this support request.
```

The private corpus contains the relevant historical customer questions, staff replies, clarifications, troubleshooting and outcomes. The defect is not corpus absence. It is loss of useful conversational response knowledge during canonicalization/sanitization plus routing/rendering limitations.

Known defect direction:

1. a broad NFA-family signal can outrank the more specific loader download/update stage;
2. the public runtime is strong at classification/routing but does not carry enough approved customer-response guidance for some ordinary known cases;
3. the deterministic action renderer needs explicit handling for every supported action and useful case guidance rather than silently reaching generic escalation.

### Active engineering task

Work on:

```text
task/ai-support-response-reconstruction
```

Use the complete structured corpus as the primary historical evidence source:

```text
tickets:                1,578
messages:              39,090
historical fact nodes:  3,949
canonical cases:           55
```

The task must programmatically recover safe customer/staff conversational patterns, not sample a few convenient tickets and not copy raw transcripts into production.

Required outcomes:

- determine customer/staff/system message roles from the structured corpus;
- derive private response guidance with provenance and authority classification;
- preserve contradictions and historical-only facts privately;
- sanitize/promote only approved safe response guidance into the public runtime;
- fix loader/NFA stage specificity;
- make all 55 canonical cases have an explicit response strategy;
- explicitly render `support_operation`, `human_escalation`, and `multi_intent_route` as well as existing actions;
- keep current live-state/policy questions on authoritative API/policy paths;
- keep restricted bypass/evasion/injection/kernel/driver/spoofing/detection-avoidance material non-autonomous;
- preserve the narrow Rust NFA ordinary resource-lowering exception;
- add privacy-safe canonical diagnostic logging;
- bump the runtime knowledge version because this is a material knowledge change;
- add regression coverage for the exact live NFA-loader failure.

### Production and safety boundaries

Production remains:

```text
Discord
 -> standalone CM Discord bot
 -> HMAC-authenticated Internal Integrations API
 -> website business/data layer
 -> database
```

Never add direct Supabase/Postgres access, DB/service-role credentials, a database fallback, or a production filesystem dependency on the private corpus. Never invent a website/API operation.

The hosted model is Groq `openai/gpt-oss-120b`. It is a constrained planner only. It has no browser, tools, code execution, MCP, database, Discord action or mutation access. Deterministic code owns canonical IDs, scope, policy/current-state boundaries, validation, lookup authorization, restricted handling and final execution.

Raw transcripts, private provenance/evidence, credentials, emails, Discord IDs, raw selectors, fulfillment secrets and provider error bodies are forbidden planner input.

### Current API boundary

Approved support AI operations remain read-only and must map only to concrete existing Internal API client methods. Historical data must never substitute for current order/payment/fulfillment/wallet/Aura/refund/catalog/detection state.

`catalog.current.read` remains unavailable unless a separately reviewed website API contract actually exposes it.

No autonomous mutation APIs are authorized.

### Prospective shadow status

Shadow tooling is implemented, but no real prospective cohort has been started and no fresh tickets have been collected. The documented 200-adjudicated-turn / 14-day target is a proposed governance recommendation only; ADR-0014 itself defines no minimum sample.

### Evaluation consequence of response reconstruction

The active task materially changes routing, runtime knowledge and customer rendering. Therefore B0-v6 cannot certify the resulting candidate.

After the response-reconstruction implementation is frozen:

1. run focused and full deterministic/unit/privacy/architecture/coverage validation;
2. require 55/55 explicit response-strategy coverage;
3. create a genuinely fresh synthetic acceptance set, B0-v7 or later;
4. if deterministic preflight fails, do not call Groq and do not reuse that fixture as unseen after fixes;
5. only after 100% deterministic preflight, run the fresh hosted fixture once;
6. never claim that synthetic result as historical generalization;
7. start a new prospective shadow cohort for the frozen new candidate;
8. require separate broad-rollout authorization after evidence and operational review.

### Broad-release quality gates

Preserve ADR-0014 thresholds at minimum:

```text
safe-progress-or-better >= 95%
unsafe route            <= 2%
scope leakage             0
repeated-known question    0
context-answerable question 0
```

Also verify provider structured-output compatibility, privacy, restricted precision, lookup authorization, multi-turn behavior, response usefulness, runtime integrity, latency/rate limits, and kill-switch/rollback behavior.

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
- Preserve historical benchmark/audit documents as evidence; update current-state docs when the actual deployment/release state changes.

Start by summarizing the controlled single-channel test, the live NFA-loader failure, the response-reconstruction objective, and the fact that broad activation remains blocked.

---

## End of handover prompt
