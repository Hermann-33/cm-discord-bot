# Project Roadmap

Updated: 2026-09-08

## Completion rule

A phase is complete only when its source behavior, API/data correctness, authorization/security, tests/typecheck/build/diff/audit, documentation, and any explicit Git/deployment gate pass.

## Core bot phases

### Phase 0 — Read-only foundation — COMPLETE

Customer `cm aura`, leaderboard, HMAC Internal Integrations API client, legacy isolation, and removal of active direct-DB access.

### Phase 1 — Repository governance — COMPLETE

Repository workflow, ADRs, context, audit history and handoff system.

### Phase 2 — Private admin console — COMPLETE

`/cm user`, private operator sessions, order navigation, fulfillment diagnostics and canonical refund.

### Phase 3 — Guild-wide `/cm` authorization — COMPLETE

Exact guild + explicit admin allowlist + per-interaction authorization.

### Phase 4 — Order/Aura/wallet controls — COMPLETE

Direct order lookup, confirmed Aura/wallet adjustment and canonical refund with audit/idempotency controls.

### Phase 5 — Customer-safe sharing / Discord admin UX — COMPLETE

Discord-user lookup, linked identity, Share to Chat, customer email policy, decluttered admin UI, pending-purchase fallback and masked fulfillment support.

### Phase 6 — Manual fulfillment — BLOCKED ON BACKEND CONTRACT

No approved execute operation exists. `purchase-intents.process` and direct database access are not substitutes.

### Phase 7 — Production operations hardening — PARTIAL / ONGOING

Remaining operational items include branch protection/status checks, runbooks, credential rotation, controlled smoke tests and production observability.

### Phase 8 — Tickety account-link gate — IMPLEMENTED / PRODUCTION ROLLOUT PENDING

ADR-0016 source implementation is on `feature/tickety-account-link-gate`: deterministic ticket recognition, conservative creator resolution, creator-only permission gate, website-persisted eight-hour link lease, activity-triggered renewal, Check Again UI, Tickety rewrite re-enforcement, paced startup recovery, and `/cm ticket-allow`.

Remaining completion gates:

1. repository CI must remain fully green for the final branch head;
2. website support-ticket HTTP routes must be production-deployed;
3. the dedicated CM Discord bot Internal API client must receive exactly `support.tickets.access.read`, `support.tickets.verify`, and `support.tickets.override`;
4. deploy the bot revision;
5. explicitly run `npm run register:commands` once;
6. perform live linked/unlinked/recheck/expired-lease/restart/Tickety-rewrite/admin-override smoke verification.

No local DB, Northflank persistence volume, or direct Supabase access is part of this phase.

## AI support / transcript workstream

### T1 — Corpus acquisition — COMPLETE

```text
structured tickets: 1,578 / 1,578
messages: 39,090
extraction failures: 0
```

### T2 — Deep review / knowledge graph — COMPLETE

All tickets processed into private evidence/knowledge layers; contradictions and provenance preserved.

### T3 — Canonical/runtime KB — COMPLETE FOR ROUTING BASELINE

55 canonical support cases plus aliases, policies, procedures, clarifications, lookups, escalations, product profiles and routing artifacts exist. The public runtime is a sanitized derivative and never reads the private corpus at runtime.

### T4 — Conversational routing / inferability — IMPLEMENTED

Exact-case, family-only, entity-only, control-plane, insufficient-context and multi-intent behavior exists with bounded state and targeted clarifications.

### T5 — Hosted Groq triage — IMPLEMENTED

Groq `openai/gpt-oss-120b` is the primary constrained semantic planner. Deterministic code remains authoritative.

### T6 — Synthetic release acceptance — PASSED FOR PRE-RECONSTRUCTION CANDIDATE

B0-v3 failed and was consumed. B0-v4/B0-v5 failed deterministic preflight with no hosted call. B0-v6 passed 44/44 deterministic and 44/44 hosted exact/accepted with zero fallback and 3/3 restricted safety.

B0-v6 is consumed and does not certify material later changes.

### T7 — Prospective shadow tooling — IMPLEMENTED / COLLECTION NOT STARTED

No-reply cohort creation, privacy-safe evidence, pseudonyms, human adjudication, metrics, close/report tooling and cutoff enforcement are implemented. No real prospective cohort has been started.

### T8 — Controlled single-channel visible test — ACTIVE / LIMITED

ADR-0015 permits manual visible AI testing only in channel `1542084649017286727` with no category allowlist. This is not broad activation.

The first live test exposed an ordinary NFA-loader download request collapsing to generic staff escalation.

### T9 — Response knowledge reconstruction — NEXT / IN PROGRESS BRANCH

Branch:

```text
task/ai-support-response-reconstruction
```

Required outcomes:

- analyze all relevant transcript conversations programmatically;
- recover safe staff response/clarification/troubleshooting/resolution patterns;
- build private response guidance with authority/provenance classification;
- sanitize into production without raw transcript/provenance/PII/secrets;
- fix stage specificity, especially loader-vs-NFA routing;
- explicitly render every triage action;
- cover 55/55 canonical cases with a response strategy;
- eliminate generic staff escalation as the normal behavior for known ordinary support cases;
- add response-quality and privacy regression tests;
- bump runtime knowledge version.

### T10 — Fresh synthetic acceptance for reconstructed candidate — REQUIRED

After T9 is frozen, create B0-v7 or later. Do not reuse B0-v6 as unseen evidence. Require deterministic preflight 100% before a single hosted release run.

### T11 — Prospective fresh-ticket validation for reconstructed candidate — REQUIRED

A passing synthetic set is not historical generalization evidence. Start a new cohort only after candidate/runtime/model are frozen. Do not combine evidence across materially different candidates.

ADR-0014 defines quality thresholds but no minimum sample. The current 200-adjudicated-turn / 14-day recommendation remains proposed governance, not a hardcoded release rule.

### T12 — Broad customer-facing rollout — BLOCKED

Requires:

```text
safe-progress-or-better >= 95%
unsafe route <= 2%
scope leakage = 0
repeated known questions = 0
context-answerable questions = 0
```

Also require privacy, restricted-topic precision, structured provider compatibility, lookup authorization, multi-turn behavior, acceptable latency/rate-limit behavior, operational rollback review, and a separate explicit broad-release decision.

## Permanent invariants

- HMAC Internal Integrations API is the website/data boundary;
- no direct DB/Supabase/service-role access;
- no autonomous AI mutations; deterministic admin mutations remain limited to separately reviewed `/cm` operations, including ADR-0016's ticket-scoped override;
- private transcript repo remains data/spec-only;
- model cannot invent IDs/policy/live state or execute tools;
- historical evidence is not current policy/state;
- restricted bypass/evasion/injection/kernel/driver/spoofing/detection-avoidance remains outside autonomous support;
- kill switch for visible AI remains `AI_SUPPORT_ENABLED=false`.
