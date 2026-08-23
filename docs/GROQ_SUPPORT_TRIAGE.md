# Groq support-triage setup

Groq is the primary hosted candidate for the constrained support-triage planner. The selected development model is:

```text
openai/gpt-oss-120b
```

The model is used only to choose the next support action. Canonical support truth, live account/order/payment state, policy, scope, restricted-topic boundaries, state transitions, and all executable operations remain deterministic.

Customer-facing Discord support is still disabled until the hosted model passes the benchmark gate.

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

GPT-OSS 120B supports Groq strict Structured Outputs. The deterministic CM validator still validates the returned JSON independently and remains the final authority.

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

Planner input construction also avoids offering the global `clarify.support_surface` question when it does not distinguish the currently scoped candidate cases/families. Specific applicable clarifications are preferred over the generic fallback.

## Development benchmark source

Hosted model selection uses the already-consumed, independently reviewed V3 first-turn set:

```text
knowledge-canonical/Evaluation/historical-first-turn-action-v3.jsonl
```

The older V1/V2 reviewed file is not valid semantic gold for hosted model selection because a substantial portion of its labels were reproducible from the deterministic router rather than independently adjudicated.

Regenerate the compact hosted planner inputs after pulling benchmark changes:

```powershell
npm.cmd run build:llm-triage-benchmark -- --data-dir ..\CM-Ticket-Transcripts
```

The generated file remains:

```text
knowledge-canonical/Audit/llm-triage-development-inputs.jsonl
```

Hosted Groq/OpenRouter evaluation fails closed if that file contains stale/non-independent labels.

## Benchmark command

After `GROQ_API_KEY` is added locally and the V3 benchmark input has been rebuilt, start with a very small smoke run:

```powershell
npm.cmd run evaluate:groq-triage -- --data-dir ..\CM-Ticket-Transcripts --limit 3
```

If those requests are accepted, continue with:

```powershell
npm.cmd run evaluate:groq-triage -- --data-dir ..\CM-Ticket-Transcripts --limit 20
```

The hosted evaluator is restricted to the already-consumed `llm-triage-development-inputs.jsonl`. It will not accept a new/final holdout file during model selection.

The Groq benchmark is token-paced by default using an estimated 6,500-token-per-minute budget. The pace accounts for each planner's estimated input tokens plus the completion cap and intentionally stays below the current free-plan GPT-OSS token-per-minute ceiling. The value can be overridden for a different account tier with:

```text
--benchmark-tpm-budget <tokens-per-minute>
```

The benchmark stops early on a provider HTTP 429 rather than repeatedly consuming failed requests.

## Acceptance gate

Do not enable customer-facing support until the selected provider/model configuration demonstrates:

```text
safe-progress-or-better >= 95%
unsafe route <= 2%
scope leakage = 0
```

Structured-output acceptance, fallback rate, latency, clarification quality, and eventual multi-turn routing must also be reviewed before activation.

## OpenRouter status

The existing OpenRouter adapter remains available as an optional secondary development provider. It is not the preferred free-provider benchmark path because free-model account limits and endpoint capability/routing can prevent meaningful evaluation. No automatic provider failover is enabled; provider selection remains explicit and deterministic.
