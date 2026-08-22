# OpenRouter support-triage setup

The bot now has a production-safe OpenRouter client for the constrained support-triage planner. It is not wired to a customer-facing Discord support flow yet; customer-facing activation remains gated on benchmark quality.

## Model

Default:

```text
google/gemma-4-26b-a4b-it:free
```

The model is used only to choose a support **next action**. Canonical cases, clarifications, live lookup IDs, policy IDs, state transitions, and safety boundaries remain deterministic.

## Environment

Copy `.env.example` and set:

```text
OPENROUTER_API_KEY=<your OpenRouter API key>
OPENROUTER_MODEL=google/gemma-4-26b-a4b-it:free
OPENROUTER_DATA_COLLECTION=allow
```

Only `OPENROUTER_API_KEY` must be supplied. The model and data-collection settings already have defaults.

`OPENROUTER_DATA_COLLECTION=allow` is the compatibility default for the selected free endpoint. The production triage client minimizes outbound data before sending it. If you change this to `deny`, OpenRouter may reject the request when no free provider satisfies the stricter data policy; the bot must then use its deterministic fallback rather than silently relax the policy.

## Request controls

Every request uses:

- `POST https://openrouter.ai/api/v1/chat/completions`;
- `temperature: 0`;
- `max_tokens: 400`;
- strict JSON-schema structured output;
- `provider.require_parameters: true`;
- the configured `provider.data_collection` policy;
- a 20-second production timeout;
- no streaming.

The API key is sent only in the Authorization header and is never included in planner payloads, returned result objects, audit files, or logs.

## Outbound privacy boundary

Before the hosted model sees a planner payload, the production client removes common sensitive material from customer text and known/live context, including:

- email addresses;
- Discord mentions and snowflake-like IDs;
- UUIDs;
- URLs;
- OpenRouter-key-like secrets;
- sensitive known-context fields such as order IDs/selectors, tokens, credentials, passwords, secrets, API keys, references and URLs.

Canonical IDs such as `case.*`, `game.*`, `product.*`, and `account_model.*` remain intact.

The model never needs raw ticket history, raw evidence prose, credentials, fulfillment material, database access, or direct website access.

## Deterministic validation and fallback

The client rejects model output that contains:

- unknown case/clarification/lookup/policy IDs;
- ungrounded entity IDs;
- product/vendor/variant/account-model scope conflicts;
- a restricted autonomous answer;
- a direct case below the configured confidence threshold;
- a repeated clarification;
- malformed or schema-invalid JSON.

HTTP failures, timeouts and invalid outputs fail closed to the canonical fallback:

1. continue an already-established active case when safe;
2. otherwise ask an available canonical clarification;
3. otherwise escalate to a human.

## Benchmark after adding the key

The benchmark inputs are compact sanitized planner payloads stored in the private transcript repository. They contain no raw transcript evidence in the model input.

A small smoke test can be run with:

```powershell
npm.cmd run evaluate:openrouter-triage -- `
  --data-dir ..\CM-Ticket-Transcripts `
  --limit 20
```

The command reads `OPENROUTER_API_KEY` from the environment. It writes only benchmark results under the private audit directory and never prints the API key.

The selected free model has OpenRouter free-tier request limits, so do not run hundreds of cases blindly. Start with 20, inspect structured-output acceptance/safety, and scale only within the account's current free-model allowance.

## Activation gate

Do not enable the model for real Discord support traffic until the consumed development benchmark demonstrates acceptable conversational safety. Current target:

```text
safe-progress-or-better >= 95%
unsafe route <= 2%
scope leakage = 0
```

A customer-facing support flow should then use the existing state machine so the model may ask multiple clarifying questions rather than guessing missing facts.
