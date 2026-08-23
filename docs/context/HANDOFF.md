# Latest Handoff

Updated: 2026-08-24

## Authority

- ADR-0005 — customer `cm aura` remains message-based; admin/staff controls remain slash/components/modals.
- ADR-0006 — `/cm` requires exact configured guild + explicit `BOT_ADMIN_USER_IDS`; no admin-command channel restriction.
- ADR-0007 — Aura/wallet mutations require fresh-state-bound confirmation, idempotency, and audit.
- ADR-0008 + ADR-0009 — Share to Chat uses a separate customer-safe renderer; canonical CM account email may be shared while internal/admin/credential data remains excluded.
- ADR-0010 — `CM-Ticket-Transcripts` is a private data-only side project with no production runtime dependency.
- ADR-0011 — `/cm order` is canonical-order-first with `NOT_FOUND`-only pending-purchase fallback; masked fulfillment support is private staff data.
- ADR-0012 — production AI support may use only the bundled sanitized `support-runtime/` derivative, deterministic state/validation, and benchmark-before-activation gate.
- ADR-0013 — Groq `openai/gpt-oss-120b` is now the primary hosted support-triage candidate. OpenRouter remains a secondary development adapter.
- No direct Supabase/Postgres path, no manual fulfillment, and no `purchase-intents.process` permission.

## Current feature branch

```text
task/ai-support-integration
```

Customer-facing AI support is still **disabled**. Discord entrypoints are not wired to the support planner yet.

The branch now contains:

- bundled sanitized `support-runtime/` importer/loader boundary;
- stateful support conversation service and pending-question answer handling;
- deterministic support action validation/fallback;
- privacy sanitization for hosted planner payloads;
- Groq production triage client;
- Groq hosted benchmark adapter;
- OpenRouter secondary adapter;
- consumed-development benchmark guard;
- rate-safe Groq benchmark pacing and stop-on-429 behavior.

## Primary hosted provider

```text
Provider: Groq
Model: openai/gpt-oss-120b
Endpoint: https://api.groq.com/openai/v1/chat/completions
```

Default planner request controls:

```text
temperature = 0
reasoning_effort = low
max_completion_tokens = 400
stream = false
response_format = strict JSON schema
```

No model tools, browser search, code execution, MCP, direct website access, or executable support operations are exposed to the model.

The deterministic validator remains authoritative for canonical IDs, scope, restricted topics, confidence-sensitive direct cases, repeated/already-known clarifications, and fallbacks.

## Environment

The operator must add the Groq key manually to local `.env` or the deployment secret store:

```text
GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-120b
GROQ_REASONING_EFFORT=low
```

Do not commit `.env` or print/log the key.

The existing OpenRouter variables remain optional and secondary.

## Exact next action

After pulling the latest branch and adding `GROQ_API_KEY`, first run repository validation:

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
git diff --check
```

Then run only a 3-record hosted smoke benchmark:

```powershell
npm.cmd run evaluate:groq-triage -- --data-dir ..\CM-Ticket-Transcripts --limit 3
```

The Groq evaluator automatically paces requests using a conservative estimated token-per-minute budget and stops after the first provider HTTP 429.

If the 3-record run has real accepted model outputs (`structuredOutputAcceptanceRate > 0` and `fallbackRate < 1`), continue with:

```powershell
npm.cmd run evaluate:groq-triage -- --data-dir ..\CM-Ticket-Transcripts --limit 20
```

Do not run a new untouched final holdout while provider/model configuration is still being selected.

## Activation gate

Do not wire customer Discord support until the chosen hosted configuration demonstrates:

```text
safe-progress-or-better >= 95%
unsafe route <= 2%
scope leakage = 0
```

Also review structured-output acceptance, fallback rate, latency, clarification relevance, privacy, rate-limit behavior, and multi-turn eventual routing.

## Runtime data boundary

Production must never read `CM-Ticket-Transcripts` directly. Only the explicit allowlisted, provenance-free `support-runtime/` bundle may be used by `src/`.

Raw transcripts, source transcript IDs, evidence prose, fact provenance, private evaluation artifacts, customer PII, and credentials remain outside production runtime.

## Current production behavior remains unchanged

The feature branch does not change deployed command behavior. Existing production surfaces remain:

- `cm aura`;
- `/refresh-leaderboard`;
- private `/cm user`;
- private `/cm order`;
- refund/Aura/wallet mutation controls;
- customer-safe Share to Chat.

No bot startup, command registration, deployment, or customer-facing AI activation is part of the provider setup/benchmark stage.
