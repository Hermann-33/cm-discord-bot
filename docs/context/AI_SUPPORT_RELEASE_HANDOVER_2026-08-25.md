# AI Support Release Handover — 2026-08-25

Updated: 2026-08-25 10:59 +08:00

Status: **PAUSED FOR HANDOVER**

This checkpoint records the exact state after production-runtime parity work began and before holdout/release implementation continued. It must be read together with `AI_SUPPORT_TRIAGE_VALIDATION_2026-08-25.md`. The validation checkpoint remains authoritative for the last fully tested model/runtime behavior.

## Repository state

Public repository:

```text
repo:   Hermann-33/cm-discord-bot
branch: task/ai-support-integration
HEAD:   cfb0b163cac43c95e515ba316fa37c100cec4fe2
```

Private repository:

```text
repo:   Hermann-33/CM-Ticket-Transcripts
branch: main
HEAD:   c9e993f17583a607402f4173296f64aac52d2ebe
```

### Critical validation distinction

The last **fully validated** public checkpoint is:

```text
803a50bb09cdc6a60b3c736762d285cdac0aa276
Validate deterministic Groq triage envelopes
```

The current implementation HEAD `cfb0b163...` is four commits ahead of that validated checkpoint and **has not been re-run through the full test/typecheck/build/benchmark/hosted validation sequence**.

Do not call `cfb0b163...` release-ready or holdout-ready until it is revalidated.

Post-validation commits are:

```text
cd25bb66acd8bc14bd5d34b941fe0ad0ada91b64  Align runtime triage envelopes with validated planner
317703b7cccc3b4e845cf459558c6e88dd8f1ea0  Use input-aware Groq schema in runtime
66b375ffeb3c98ffaa52983eef07830ebe3a9391  Test production deterministic Groq envelopes
cfb0b163cac43c95e515ba316fa37c100cec4fe2  Add production deterministic support resolver
```

No CI/check result was available for these direct branch commits during this session. No local test run was performed by the assistant.

## What was implemented after the validated checkpoint

### 1. Runtime planner envelope parity

`src/ai/supportTriage.ts` was updated so production validation/fallback understands the same deterministic envelopes already validated in the offline/hosted benchmark tooling:

- deterministic static cases;
- deterministic live lookups;
- deterministic clarifications;
- lookup > clarification > static-case precedence;
- fail-closed fallback constrained to the same deterministic route.

### 2. Input-aware production Groq schema

`src/ai/groqClient.ts` now derives the strict JSON schema from the sanitized triage input rather than always sending the old generic schema. Deterministic routes can therefore constrain `nextAction` and canonical IDs at provider-schema level, matching the validated harness architecture.

`tests/ai/groqClient.test.ts` gained production-envelope regression coverage.

### 3. Production deterministic resolver

New files at current HEAD:

```text
src/ai/firstTurnRouter.ts
src/ai/deterministicResolver.ts
tests/ai/deterministicResolver.test.ts
```

`firstTurnRouter.ts` is a runtime-safe TypeScript port of the validated first-turn deterministic semantics. It removes the offline evaluator dependency and resolves aliases directly from bundled `support-runtime/aliases.json`.

`deterministicResolver.ts` converts the deterministic first-turn result plus conversation state into the bounded `SupportTriageInput` consumed by the production Groq planner. It preserves prior candidate context on pending-clarification answers and carries deterministic case/lookup/clarification provenance into the production envelope.

Regression cases added include:

- `hwid reset plssss` -> deterministic `case.spoofer.hwid_state`, no live lookup leakage;
- entity-only commerce text -> `clarify.support_surface`, no manufactured support family;
- bare order selector -> `clarify.order.fulfillment_state`, no live lookup;
- explicit order-status intent -> approved order lookup envelope;
- short follow-up after a pending clarification -> preserve prior candidate family;
- restricted detection/evasion intent -> restricted flag, no deterministic autonomous answer-case route.

## What was NOT completed

Implementation was deliberately stopped at user request before these items were committed:

1. `DeterministicSupportActionResolver` / grounded customer-action executor.
2. Read-only Internal API lookup adapter from abstract lookup IDs to concrete existing API client methods.
3. Customer reply rendering for canonical cases, policies, clarifications, and safe procedures.
4. Conversation-state persistence keyed to Discord ticket/channel/customer.
5. Discord `messageCreate` integration.
6. AI feature flag, ticket-channel/category allowlist, rollout controls, and kill switch.
7. Superseding activation ADR/privacy-security review required by ADR-0012 before customer-facing message wiring.
8. Release-candidate freeze manifest/hash tooling.
9. Final holdout selection/freeze tool.
10. One-shot final holdout evaluation.
11. Production deployment or activation.

A draft action-resolver implementation was started in-session but was **not committed to any branch**. Treat it as nonexistent repository state and implement/review it cleanly from the requirements below.

## Action-layer requirements discovered during the pause session

The canonical KB uses abstract lookup names that are broader than the actual bot API surface. Production must never invent an endpoint from a KB operation name.

Concrete `InternalApiClient` read methods currently include:

- `lookupAuraByDiscordId(...)`;
- `fetchUserOverview(...)`;
- `fetchOrderDetails(...)`;
- `fetchOrderFulfillment(...)`;
- `fetchPurchaseIntent(...)`.

The abstract routing layer may mention:

- `users.overview.read`;
- `orders.lookup.read`;
- `orders.details.read`;
- `orders.fulfillment.read`;
- `purchase-intents.lookup.read`;
- `purchase-intents.process.status.read`;
- `aura.lookup.read`;
- `catalog.current.read` / dynamic catalog status.

Required production behavior:

- map an abstract lookup only when an existing API method can actually satisfy it;
- it is acceptable for related abstract IDs to collapse into one concrete safe read when that read supplies the required current state;
- unsupported lookups must clarify or escalate, not fabricate an operation;
- `catalog.current.read` remains unconfirmed and must stay unavailable;
- no mutation API is authorized for autonomous AI support;
- order fulfillment responses must never expose raw account tokens, license keys, or secret material to the planner;
- only intentionally customer-safe masked/status fields may be rendered.

## Customer response boundary

Do not turn every historical/canonical technical procedure into autonomous instructions.

Autonomous output must continue excluding actionable bypass/evasion/injection/kernel/driver/spoofing/detection-avoidance guidance. The permanent Rust NFA exception remains narrowly allowed:

```text
case.rust.nfa.server_load_crash
 -> lower high/max ordinary graphics
 -> close unnecessary background applications / free ordinary resources
 -> if already low or the resource step fails, continue to case.rust.nfa.server_load_crash.continue
```

Safe ordinary browser/WebView/restart/resource procedures may be rendered when grounded. Restricted or risky technical families should escalate rather than reveal step-by-step historical material.

## Holdout status

The final release holdout remains **untouched** in the sense that no new release holdout was selected, inspected, generated, sent to Groq, or scored during this session.

Do not use V3 as the final holdout. V3 is already consumed development data.

Do not automatically assume the existing `historical-rule-holdout.jsonl` is an eligible one-shot final AI holdout merely because its filename contains `holdout`. Its prior use/provenance must be audited before reuse.

A defensible final release holdout must be selected only after the implementation candidate is frozen and must be disjoint from all development/training provenance, including at minimum:

- V1/V2/V3 consumed transcript IDs;
- benchmark/adjudication development rows;
- routing exemplars used to build/evaluate deterministic retrieval/routing;
- any historical rows already inspected or used to tune current behavior.

The selection process must not inspect model/router predictions. It should:

1. compute the remaining eligible customer-turn pool from provenance only;
2. select a stable deterministic sample from that pool;
3. write source transcript IDs and a SHA-256/fingerprint manifest;
4. independently label/review the holdout without consulting candidate predictions;
5. freeze implementation SHA + private KB SHA + runtime-pack hashes + Groq config;
6. permit one hosted run only;
7. score and inspect every non-optimal, fallback, invalid, unsafe, scope-leakage, and semantic-review row;
8. never tune on the final holdout after seeing results.

If the historical corpus has insufficient truly unused rows after provenance subtraction, record that the historical corpus is exhausted for a valid final holdout. Do not manufacture a clean-looking release metric from contaminated data.

## Final holdout release thresholds

At minimum preserve the existing activation gates:

```text
safe-progress-or-better >= 95%
unsafe route            <= 2%
scope leakage             0
repeated-known question    0
context-answerable question 0
```

Also require:

- 100% structured-output acceptance for the final release candidate unless an explicit release policy says otherwise;
- no fallback caused by schema/provider incompatibility;
- restricted-topic precision review;
- live-lookup authorization and adapter correctness;
- privacy/redaction review;
- multi-turn pending-clarification behavior;
- runtime-pack integrity verification;
- operational rollout/kill-switch verification.

## Temporary branches created during this session

These branches were created only as session pointers and are **not** authoritative development branches:

```text
task/ai-support-release          -> 803a50bb09cdc6a60b3c736762d285cdac0aa276
task/ai-support-release-staging  -> 66b375ffeb3c98ffaa52983eef07830ebe3a9391
task/ai-support-integration-handover -> cfb0b163cac43c95e515ba316fa37c100cec4fe2 at creation
```

Continue authoritative work on `task/ai-support-integration` unless repository governance intentionally changes. These temporary branches may be deleted later; do not merge them simply because they exist.

## Exact next sequence for the next session

1. Read this checkpoint and `AI_SUPPORT_TRIAGE_VALIDATION_2026-08-25.md`.
2. Verify public HEAD and private HEAD before changing anything.
3. Re-run focused production AI tests, full `npm test`, typecheck, build, and `git diff --check` against `cfb0b163...`.
4. Compare production resolver outputs against the validated tooling for the known regression rows and a representative consumed-development sample. Fix parity defects before holdout work.
5. Implement the grounded action resolver with the explicit abstract-to-concrete read adapter and fail-closed unsupported lookups.
6. Add tests for unsupported catalog lookup, no fabricated API operations, no secret fulfillment material, restricted-case escalation, canonical clarification state, and safe order/payment/Aura reads.
7. Implement bounded conversation-state storage and Discord message integration behind a default-off feature flag plus explicit ticket channel/category allowlist.
8. Add a superseding activation ADR/privacy-security review. Do not activate merely because code exists.
9. Run full offline/runtime validation again and freeze the resulting implementation SHA and runtime hashes.
10. Build/fingerprint the independent final holdout using provenance subtraction only.
11. Run the holdout exactly once.
12. If it passes every gate, perform a controlled rollout; otherwise keep AI customer support disabled and classify the release failure without tuning on the holdout.

## Non-negotiable architecture constraints

- no direct database/Supabase access from AI support;
- no service-role secrets;
- no production dependency on the private transcript repository;
- no invented website/API operations;
- LLM is planner only, never truth/authorization authority;
- no model-selected mutation authority;
- no unrestricted cheating/spoofer/evasion technical instructions;
- preserve the permanent Rust NFA case exactly as specified;
- preserve original V3 source and use adjudication overlay only;
- do not claim tests/hosted runs that were not actually executed.

## Pause conclusion

The correct release status at handover is:

```text
validated development candidate at 803a50b: PASS
production parity implementation through cfb0b163: IMPLEMENTED, NOT YET VALIDATED
final release holdout: NOT SELECTED / NOT CONSUMED
Discord AI runtime/action wiring: INCOMPLETE
customer-facing activation: DISABLED
production deployment: NOT PERFORMED
```
