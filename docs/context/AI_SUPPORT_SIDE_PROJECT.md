# AI Support Side Project

Updated: 2026-08-24

This document is the compact durable handoff for the Cheater's Market AI support project. It does not replace `AGENTS.md`, accepted ADRs, or the rest of `docs/context/`; it tells future agents where the project stands and which repository documents and private artifacts are authoritative.

## Goal

Build a customer-support assistant that can handle most Cheater's Market Discord tickets by combining:

- a complete historical support corpus;
- a canonical, compact, product-aware knowledge base;
- deterministic state, policy, scope and action controls;
- a constrained hosted LLM used only for semantic next-action selection;
- live website lookups only through approved Internal Integrations API operations;
- clarification questions whenever the customer's message is not specific enough to answer safely.

The bot does **not** need to answer in one turn. Correct clarification is preferred over guessing.

## Repositories and ownership

### Public bot repository

```text
Hermann-33/cm-discord-bot
branch: task/ai-support-integration
```

Owns:

- production Discord bot source;
- offline transcript/KB tooling;
- sanitized `support-runtime/` derivative;
- deterministic resolver/state/action layer;
- hosted-provider clients and validators;
- benchmark builders/evaluators;
- production integration work when the activation gate is eventually passed.

### Private transcript repository

```text
Hermann-33/CM-Ticket-Transcripts
branch: main
```

Owns:

- raw and structured ticket corpus;
- exhaustive deep-review artifacts;
- canonical knowledge/evidence;
- runtime-KB source data;
- benchmark/evaluation datasets;
- adjudication overlays;
- private provenance and audit material.

It is data/specification-only. Production must never read it directly.

## Mandatory reading order for this side project

Before changing code, benchmark logic, canonical knowledge or activation wiring, read:

1. `AGENTS.md`
2. `docs/README.md`
3. `docs/context/ACTIVE_CONTEXT.md`
4. this file: `docs/context/AI_SUPPORT_SIDE_PROJECT.md`
5. `docs/context/SIDE_PROJECTS.md`
6. `docs/context/ARCHITECTURE.md`
7. `docs/context/DATA_STATUS.md`
8. `docs/context/CODEBASE_MAP.md`
9. `docs/context/ROADMAP.md`
10. `docs/context/WORKFLOW.md`
11. `docs/context/HANDOFF.md`
12. `docs/GROQ_SUPPORT_TRIAGE.md`
13. `docs/decisions/ADR-0010-ticket-transcript-data-repository-boundary.md`
14. `docs/decisions/ADR-0012-bundled-support-runtime-and-openrouter-planner.md`
15. `docs/decisions/ADR-0013-groq-primary-support-triage-provider.md`

For benchmark/gold work also inspect the private repository artifacts listed below.

## Corpus and knowledge-engineering state

The historical corpus is complete:

```text
Tickets:                 1,578 / 1,578
Structured transcripts:  1,578 / 1,578
Extraction failures:     0
Deep-review fact nodes:   3,949
Canonical runtime cases:  55
```

The full ticket history was reviewed exhaustively in batches. The private repository preserves every ticket-level evidence note, contradictions, unresolved items, canonical facts, case coverage and Obsidian graph outputs.

The knowledge base is deliberately not a transcript dump. Historical observations are separated into canonical/current, historical-only, dynamic/current-state, restricted, unresolved and contradictory material. Similar wording alone is not treated as identity evidence. Product-specific facts remain scoped to the exact product/variant/account model when evidence supports that distinction.

Important private roots:

```text
knowledge-deep/
knowledge-canonical/
runtime-kb/
deep-review/
```

Important private audit/evaluation artifacts include:

```text
knowledge-canonical/Audit/canonicalization-summary.json
knowledge-canonical/Audit/semantic-quality-audit.json
knowledge-canonical/Audit/final-audit.json
knowledge-canonical/Evaluation/historical-first-turn-action-v3.jsonl
knowledge-canonical/Evaluation/historical-first-turn-action-v3-adjudication.json
knowledge-canonical/Audit/llm-triage-development-inputs.jsonl
knowledge-canonical/Audit/llm-triage-development-inputs-summary.json
knowledge-canonical/Audit/llm-triage-development-inputs-review-queue.jsonl
```

## Runtime architecture

The production design is:

```text
private corpus / canonical KB
        |
        | offline reviewed import only
        v
sanitized public support-runtime bundle
        |
        v
deterministic entity/candidate resolver
        |
        v
stateful support conversation state
        |
        v
sanitized compact planner payload
        |
        v
Groq / openai-gpt-oss-120b
        |
        v
strict structured JSON next action
        |
        v
deterministic validator
        |
        +--> answer canonical case
        +--> ask targeted clarification
        +--> approved dynamic lookup
        +--> policy route
        +--> restricted/human escalation
```

The LLM is **not** the source of truth. It cannot browse, execute code, access the database, call Discord actions, call the website directly, mutate accounts/orders/balances, or invent new support IDs.

## Stateful conversation behavior

The service preserves:

- resolved entities;
- candidate cases/families;
- product/vendor/game/account-model scope;
- known and missing facts;
- pending clarification;
- clarification answers;
- diagnostics/procedures already attempted;
- success/failure/no-confirmation outcomes;
- live lookup results;
- policy state;
- multiple intents.

Short replies are interpreted relative to the pending question. Known diagnostics and already-failed procedures must not be repeated.

A vague first turn such as `this shit doesnt work` must not force a guessed case. The assistant may ask what product/account/surface is affected and continue until the support path is inferable.

## Primary hosted provider

Current development provider/model:

```text
Provider: Groq
Model: openai/gpt-oss-120b
Endpoint: https://api.groq.com/openai/v1/chat/completions
```

Current request defaults:

```text
temperature: 0
reasoning_effort: low
max_completion_tokens: 400
stream: false
strict JSON schema: enabled
```

Environment:

```text
GROQ_API_KEY=<secret, local/deployment only>
GROQ_MODEL=openai/gpt-oss-120b
GROQ_REASONING_EFFORT=low
```

Never commit or print the API key.

OpenRouter remains a secondary development adapter only. The previous OpenRouter free-model attempt was blocked by provider/model availability and shared free-tier limits; it is not the preferred path.

## Privacy and action boundary

Before a hosted call, planner input is sanitized. Historical transcripts, raw evidence, credentials, emails, Discord IDs, raw order references, URLs and unnecessary identifiers are not sent.

The model is offered only canonical IDs and planner choices allowed for that turn. Recent fixes explicitly prevent unrelated global lookup tools from leaking into a static case.

Every returned decision is rejected if it contains:

- unknown case/clarification/lookup/policy/entity IDs;
- scope-conflicting cases;
- restricted autonomous behavior;
- repeated or already-answered clarification;
- confidence-sensitive direct answers below threshold;
- malformed/schema-invalid output.

Provider failures fail closed. No automatic provider retry is used.

## Benchmark history and lessons

### Early first-turn routing benchmarks

Literal first-turn retrieval initially looked poor because many customer messages are not exact-case-inferable from one turn. This drove the architecture away from 'always answer immediately' toward progressive clarification and stateful routing.

### V3 inferability benchmark

V3 separated first turns into exact case, family-only, entity-only, control-plane-only, insufficient-context and multi-intent categories. Stateful continuation tests already demonstrated 100% transition/context carry-forward on the reviewed replay suites, with zero repeated known diagnostics and zero repeated failed procedures.

### Gold/candidate contamination discovered

Initial hosted Groq runs exposed two separate problems:

1. some reviewed V3 labels were semantically wrong, ambiguous, or conflicted with current safety boundaries;
2. some correct gold actions were impossible for the model because the deterministic candidate builder had not supplied the needed case/family/clarification/lookup.

Examples that were explicitly investigated include:

- `hwid reset plssss`;
- `where is the config file?`;
- `my rust nfa account doesnt work`;
- reseller/partnership offers mislabeled as technical failures;
- detection-status questions that should remain restricted;
- plain order selectors incorrectly treated as an order-status request;
- a mere controller-use statement incorrectly treated as a compatibility question.

The project therefore stopped treating the old headline LLM metrics as model-quality evidence and repaired the benchmark/candidate layer first.

## V3 adjudication state

The original V3 review file remains immutable evidence. A separate adjudication overlay excludes unreliable rows without rewriting history.

Current retained development-gold state:

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

The raw pre-adjudication representability remains lower by design and is an audit metric, not a reason to distort the runtime toward known-bad labels.

## Important deterministic fixes completed during hosted-model debugging

The branch now includes targeted fixes for:

- `payed` -> `paid` payment normalization;
- PayPal/Venmo/gift-card purchase/payment intent;
- explicit NFA activation vs broad delivery heuristics;
- HWID reset recognition;
- controller compatibility only when compatibility semantics are actually present;
- media/creator proposals;
- reseller/rebrand/partnership proposals;
- security/phishing/token-report escalation;
- spoofer launch failure clarification;
- product comparison mismatch clarification;
- current detection-status restricted routing;
- order selector vs order intent separation;
- delivered email + inaccessible `View Order` routed as dashboard/order-access support;
- dynamic lookup options scoped to deterministic/case/clarification relevance instead of exposing the entire lookup catalog;
- authoritative deterministic lookup routing so unrelated lookup alternatives are not offered to the LLM.

These fixes materially reduced planner payload size while preserving benchmark coverage.

Current clean development-planner token estimate:

```text
average: 1,250.99
median:    799
p95:     2,355
```

## Groq technical validation already established

The Groq path has already proven:

- authentication works after the local key issue was corrected;
- `openai/gpt-oss-120b` is reachable;
- strict structured output is accepted;
- accepted model outputs can reach 100% structured-output acceptance with zero fallback;
- latency observed in the smoke/development runs is roughly sub-second to about one second per request;
- benchmark pacing prevents avoidable free-tier TPM overruns and stops on the first provider 429.

An earlier clean-ish 20-row run reached 95% safe-progress-or-better but had one unsafe route. Investigation showed that failure came from an unrelated dynamic lookup being exposed to the HWID-reset case, so the planner contract was subsequently tightened.

## Current status at this handoff

A new 20-record Groq triage run is currently being executed against the repaired/adjudicated benchmark and tighter planner contract.

**Do not record a result until the actual command output is available.**

At this point the latest confirmed benchmark preflight is:

```text
adjudicated records:      236
representable records:    236
review queue:               0
representability:         100%
```

Customer-facing Discord AI support is still disabled and unwired.

## What to do when the current 20-record result arrives

1. Record the exact output before changing prompt/model/thresholds.
2. Inspect every `unsafe_wrong_route`, `unsafe_scope_leakage`, `safe_no_progress`, `invalid`, fallback or semantic-review row offline.
3. Determine whether each failure belongs to:
   - model semantic reasoning;
   - deterministic candidate construction;
   - planner-contract leakage;
   - stale/bad gold;
   - missing KB/support surface;
   - evaluator/classifier logic.
4. Fix the smallest responsible layer. Do not tune GPT-OSS to reproduce bad gold.
5. Rerun a small consumed-development slice before a larger benchmark.
6. Do not touch the untouched/final holdout during development tuning.

## Activation gate

Do not wire the planner into customer Discord entrypoints until the selected configuration demonstrates, on clean representable reviewed data:

```text
safe-progress-or-better >= 95%
unsafe route <= 2%
scope leakage = 0
```

Also require:

- high structured-output acceptance;
- low/zero fallback under normal operation;
- acceptable latency and rate-limit behavior;
- privacy-scan pass;
- no product/variant/account-model scope leakage;
- stateful clarification/replay behavior remains correct;
- dynamic/current-state questions use approved live lookups instead of historical claims;
- restricted topics remain non-autonomous;
- no direct DB path or credential expansion;
- production `src/` integration is explicitly reviewed and tested before deployment.

## Validation commands

Public bot repository:

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
git diff --check
```

Rebuild the consumed-development planner inputs:

```powershell
npm.cmd run build:llm-triage-benchmark -- --data-dir ..\CM-Ticket-Transcripts
```

Hosted development benchmark:

```powershell
npm.cmd run evaluate:groq-triage -- --data-dir ..\CM-Ticket-Transcripts --limit 20
```

Do not run the bot, register commands, deploy, or make live customer-facing support calls unless a later task explicitly authorizes it.

## Rules for future agents

- Repository docs and accepted ADRs are more authoritative than chat history.
- Never assume the 1,578 historical tickets define current policy automatically.
- Never merge sibling products/variants/account models because their wording is similar.
- Ask clarification when the message lacks enough information.
- Never let the LLM invent live state; use approved lookups or escalate.
- Never expose all tools/lookups merely because they exist globally.
- Preserve source evidence and adjudication history; do not rewrite benchmark gold to inflate metrics.
- Keep the private corpus private and the production runtime provenance-free.
- Update this file, `ACTIVE_CONTEXT.md`, `HANDOFF.md`, and relevant specialist docs whenever the project truth materially changes.
