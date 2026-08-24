# Groq support-triage setup

Groq is the primary hosted candidate for the constrained support-triage planner. The selected development model is:

```text
openai/gpt-oss-120b
```

The model is used only to choose the next support action. Canonical support truth, live account/order/payment state, policy, scope, restricted-topic boundaries, state transitions, and all executable operations remain deterministic.

Customer-facing Discord support is still disabled until the hosted model passes the benchmark gate.

For the broader workstream context, read `docs/context/AI_SUPPORT_SIDE_PROJECT.md`.

## Environment

Add the following to the local `.env` or deployment secret store:

```text
GROQ_API_KEY=<your Groq API key>
GROQ_MODEL=openai/gpt-oss-120b
GROQ_REASONING_EFFORT=low
```

Only `GROQ_API_KEY` must be supplied. The model and reasoning-effort settings already have defaults.

The key must never be committed, printed, placed in benchmark artifacts, copied into the transcript repository, or logged.

## API boundary

The production client calls only:

```text
POST https://api.groq.com/openai/v1/chat/completions
```

Every request uses:

- `openai/gpt-oss-120b` by default;
- `temperature: 0`;
- `max_completion_tokens: 400`;
- `reasoning_effort: low` by default;
- `stream: false`;
- strict JSON-schema structured output;
- no model tools, browser search, code execution, MCP, or external actions.

The deterministic CM validator validates returned JSON independently and remains the final authority.

## Outbound privacy boundary

Before the hosted model sees a planner payload, the bot removes common sensitive material including:

- customer email addresses;
- Discord IDs and mentions;
- internal user/order/purchase IDs;
- UUIDs and public order references;
- account tokens and credentials;
- passwords and API keys;
- URLs and private links;
- sensitive live-context fields.

Canonical IDs such as `case.*`, `game.*`, `product.*`, `variant.*`, and `account_model.*` remain intact because they are required for constrained planning.

The Groq request never contains raw historical transcripts, evidence prose, the full fact corpus, fulfillment credentials, database credentials, or direct website access.

## Deterministic validation and fallback

A model decision is rejected if it contains or attempts:

- an unknown case, clarification, lookup, policy, or entity ID;
- a scope-conflicting case;
- a restricted autonomous answer;
- a direct case below the configured confidence threshold;
- a repeated clarification;
- a clarification whose answer is already present in known/live context;
- malformed or schema-invalid output.

Transport failures, HTTP failures, timeouts, and invalid outputs fail closed to the existing canonical fallback. The client does not retry automatically, including on HTTP 429.

Planner input construction prefers specific applicable clarifications over generic support-surface fallback and avoids offering irrelevant clarifications.

Dynamic lookup exposure is now turn-scoped. The LLM is not handed the global lookup catalog. Lookup IDs are included only when justified by the deterministic route, the candidate case, or a relevant clarification. When a deterministic live-lookup route is already selected, those lookup IDs are authoritative for that turn and unrelated alternatives are suppressed.

This change was required after a real Groq run showed `hwid reset plssss` incorrectly choosing `users.overview.read` solely because unrelated global lookup tools had been exposed.

## Development benchmark source

Hosted model selection uses the already-consumed, independently reviewed V3 first-turn set:

```text
knowledge-canonical/Evaluation/historical-first-turn-action-v3.jsonl
```

The original V3 labels are preserved. A separate adjudication overlay records rows that are known-bad, ambiguous, or conflict with current safety boundaries:

```text
knowledge-canonical/Evaluation/historical-first-turn-action-v3-adjudication.json
```

The older V1/V2 reviewed file is not valid semantic gold for hosted model selection because a substantial portion of its labels were reproducible from the deterministic router rather than independently adjudicated.

Regenerate the compact hosted planner inputs after pulling benchmark changes:

```powershell
npm.cmd run build:llm-triage-benchmark -- --data-dir ..\CM-Ticket-Transcripts
```

The builder separates **planner-quality evaluation** from **candidate-generation/gold failures**. A row is eligible for hosted planner scoring only when the planner input can actually express the retained adjudicated gold action.

Eligible rows are written to:

```text
knowledge-canonical/Audit/llm-triage-development-inputs.jsonl
```

Unrepresentable rows are preserved for deterministic/router or gold-label review in:

```text
knowledge-canonical/Audit/llm-triage-development-inputs-review-queue.jsonl
```

Adjudication-excluded rows are also preserved separately for audit. Nothing is silently discarded or rewritten to inflate model metrics.

## Current clean benchmark preflight

Latest confirmed V3 development state:

```text
source V3 records:          300
independently reviewed:     262
excluded by adjudication:    26
  bad_gold:                  14
  ambiguous_gold:             8
  safety_boundary_conflict:   3
  safety_boundary_review:     1
retained adjudicated gold:  236
planner-representable:      236
review queue:                 0
representability rate:      100%
```

Current planner token estimate after lookup/candidate pruning:

```text
average: 1,250.99
median:    799
p95:     2,355
```

This preflight is the authoritative consumed-development input state until a later documented rebuild changes it.

## Important debugging lessons already incorporated

Do not treat every historical reviewed row as correct current gold. Specific reviewed examples were found to be semantically wrong or stale, including NFA failure messages labeled as catalog-status lookups and reseller offers labeled as technical failure-stage questions.

Do not penalize the LLM when the correct action was not offered in its allowed action space. Representability is checked before hosted scoring.

Do not expose every lookup merely because the website supports it. Turn-scoped lookup exposure is part of the planner safety contract.

Do not infer support intent from an identifier alone. A bare order selector now asks what the customer needs; an order selector plus explicit status/payment/delivery intent may route to the relevant live lookup.

Do not infer compatibility from ordinary feature statements. `I play on controller` is not automatically a controller-compatibility question.

Do not tune the LLM to reproduce gold rows already adjudicated as unreliable.

## Benchmark command

The hosted evaluator is restricted to the already-consumed development planner input. It must not be pointed at a new/final holdout during model selection.

Normal development smoke:

```powershell
npm.cmd run evaluate:groq-triage -- --data-dir ..\CM-Ticket-Transcripts --limit 20
```

The Groq benchmark is token-paced by default using an estimated 6,500-token-per-minute budget. The pace accounts for each planner's estimated input tokens plus the completion cap and intentionally stays below the expected free-tier GPT-OSS token-per-minute ceiling. The value can be overridden for a different account tier with:

```text
--benchmark-tpm-budget <tokens-per-minute>
```

The benchmark stops early on a provider HTTP 429 rather than repeatedly consuming failed requests.

## Current hosted-run state

Groq authentication and strict structured output are working. Previous runs established that valid structured decisions can be accepted with zero fallback and sub-second/about-one-second model latency.

Older 20-record semantic summaries are retained only as debugging history because they were contaminated by bad gold, unrepresentable actions or planner-contract leakage.

A new 20-record Groq triage run is currently in progress against the repaired 236-row benchmark and tighter lookup contract. Do not record a final planner-quality result until that actual output is available and its problem rows are reviewed offline.

## Acceptance gate

Do not enable customer-facing support until both layers pass:

1. deterministic candidate/gold representability remains clean;
2. on representable independently reviewed/adjudicated rows, the selected provider/model demonstrates:

```text
safe-progress-or-better >= 95%
unsafe route <= 2%
scope leakage = 0
```

Structured-output acceptance, fallback rate, latency, clarification quality, privacy, rate-limit behavior, product/variant/account-model isolation, dynamic lookup correctness and eventual multi-turn routing must also be reviewed before activation.

## OpenRouter status

The existing OpenRouter adapter remains available as an optional secondary development provider. It is not the preferred free-provider benchmark path because free-model account limits and endpoint capability/routing can prevent meaningful evaluation. No automatic provider failover is enabled; provider selection remains explicit and deterministic.
