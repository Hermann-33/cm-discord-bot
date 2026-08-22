# ADR-0012: Bundled Support Runtime Pack and Constrained OpenRouter Planner

## Status

Accepted

- Date: 2026-08-23
- Type: Architecture / Privacy / Runtime integration

## Context

ADR-0010 keeps the historical ticket corpus in a separate private, data-only repository and requires a separate architecture decision before production integration. The canonical-support tooling now produces compact runtime artifacts, and the bot has an optional OpenRouter client that can select a constrained next support action. Raw transcripts, evidence prose, provenance identifiers, customer PII, and a runtime filesystem dependency on the private repository remain unacceptable.

Customer-facing activation is also premature. The hosted planner must first pass a controlled consumed-development benchmark, and deterministic state, validation, lookup authorization, policy, and fallback behavior must remain authoritative.

## Decision

### Runtime knowledge boundary

- Production may read only a generated `support-runtime/` pack bundled with this public repository/deployment.
- Production startup must never read a sibling/private transcript repository or accept an environment path to it.
- An operator-controlled offline importer is the only supported path from a canonical private `runtime-kb/` directory into the public bundle.
- The importer uses an explicit filename and field allowlist. It removes provenance, transcript/fact identifiers, historical match-context prose, outcome-evidence counts, evaluation data, routing exemplars, and private manifests.
- The imported pack may contain sanitized canonical cases, clarifications, routing/action metadata, policies, procedures, dynamic lookup definitions, escalations, restricted-topic rules, aliases, catalog metadata, and product profiles.
- Import validation fails closed on unexpected source files/shape in selected artifacts, forbidden evidence/provenance keys, PII, credentials, transcript/fact identifiers, or unsupported canonical identifier forms.
- The generated public manifest records only bundle schema/version, artifact hashes, and record counts; it carries no private source path or evidence identifiers.

### Planner boundary

- OpenRouter is optional and disabled when `OPENROUTER_API_KEY` is absent.
- The initial model is `google/gemma-4-26b-a4b-it:free` with temperature 0, no streaming, 400 output tokens, strict JSON Schema, required-parameter routing, and explicit data-collection policy.
- Only compact sanitized planner state and an explicit allowlist of canonical IDs may leave the bot.
- The model selects a next action only. It does not author arbitrary customer replies, execute lookups, mutate state directly, call website APIs, or decide policy outside supplied canonical options.
- Deterministic validation rejects invented IDs/entities, scope conflicts, restricted autonomous answers, repeated or already-answered clarifications, malformed output, and low-confidence direct-case answers.
- Timeout, quota/rate limiting, provider unavailability, HTTP failures, and invalid output use a deterministic fallback: safe existing flow when allowed, otherwise an unanswered canonical clarification, otherwise human escalation.
- No aggressive hosted-provider retry is permitted.

### Conversation service boundary

- Production support state is explicit and bounded: resolved entities, candidate cases/families, known/unknown context, pending clarification, questions/answers, diagnostics, procedures/outcomes, dynamic lookup results, policy state, and multiple intents.
- A short answer is first interpreted against the pending clarification. It must not be treated as a fresh unrelated query.
- Dynamic lookups remain separately injected deterministic operations. An LLM-selected lookup ID is never direct authority to call an API.
- Customer-facing Discord message wiring remains disabled until the controlled benchmark and a separate activation review pass.

## Consequences

Benefits:

- the private corpus remains private and non-runtime;
- deployable support knowledge is small, reviewable, deterministic, and provenance-free;
- hosted-model compromise or hallucination cannot invent executable support actions;
- provider failures preserve safe support progress without exposing provider errors to customers.

Costs:

- canonical knowledge updates require an explicit import/review/commit cycle;
- runtime schemas and importer transformations must evolve together;
- customer activation requires a later benchmark-backed integration task.

## Explicitly forbidden

- runtime reads from the private transcript repository;
- raw transcripts, historical evidence excerpts, routing exemplars, transcript/fact IDs, or customer PII in the public bundle;
- OpenRouter calls containing raw transcripts or unsanitized planner state;
- arbitrary Discord `MessageCreate` wiring in this task;
- using the model response as direct API/mutation authority;
- live hosted benchmark execution without an explicitly supplied operator key.

## Rollback / supersession

Removing the hosted planner is safe because it is optional and the deterministic fallback remains. Any direct private-corpus runtime dependency, broader outbound data contract, autonomous customer reply generation, or customer-facing activation requires a superseding ADR and explicit privacy/security review.
