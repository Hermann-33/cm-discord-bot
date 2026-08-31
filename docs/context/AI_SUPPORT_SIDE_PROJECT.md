# AI Support Side Project

Updated: 2026-08-31
Status: `CONTROLLED VISIBLE TEST / RESPONSE KNOWLEDGE RECONSTRUCTION ACTIVE / BROAD RELEASE BLOCKED`

This is the compact durable overview for the Cheater's Market AI-support workstream. Current operational authority is `CURRENT_STATE_2026-08-31.md`, `ACTIVE_CONTEXT.md`, `HANDOFF.md`, and accepted ADRs through ADR-0015.

## Goal

Build a customer-support assistant that can handle most Cheater's Market Discord tickets by combining:

- the complete 1,578-ticket historical support corpus;
- a canonical, product-aware support knowledge base;
- transcript-grounded customer-response guidance;
- deterministic state, policy, scope, restricted-topic and action controls;
- Groq `openai/gpt-oss-120b` used only as a constrained semantic planner;
- approved read-only website lookups for dynamic/current state;
- targeted clarification when the current conversation does not contain enough information.

The assistant does not need to answer in one turn. It must ask only the smallest necessary question and must not repeat information already known from the session or an approved live read.

## Repositories and ownership

### Public bot/tooling repository

```text
Hermann-33/cm-discord-bot
default/deployed branch: master
active engineering branch: task/ai-support-response-reconstruction
```

Owns production bot source, offline corpus/KB tooling, sanitized `support-runtime/`, deterministic conversation/resolver/action code, hosted-provider clients, validators, evaluation tooling and release governance.

### Private corpus/specification repository

```text
Hermann-33/CM-Ticket-Transcripts
branch: main
reference SHA: c9e993f17583a607402f4173296f64aac52d2ebe
```

Owns raw/structured transcripts, deep review, canonical/evidence data, runtime-KB source data, benchmark gold, adjudication overlays, private provenance and knowledge-engineering specifications. It is data/specification-only. Production must never read it directly.

## Corpus state

```text
Tickets:                 1,578 / 1,578
Structured transcripts:  1,578 / 1,578
Messages:                39,090
Extraction failures:     0
Deep-review fact nodes:   3,949
Canonical runtime cases: 55
```

The corpus includes customer questions, staff replies, clarification questions, diagnostics, troubleshooting sequences, policy wording, resolution outcomes and escalation behavior. Historical content is evidence, not automatically current policy or live state.

## Runtime architecture

```text
private corpus / canonical knowledge / response evidence
        |
        | offline derivation + authority classification + sanitization
        v
public support-runtime/
        |
        v
deterministic entity/context/control-plane resolver
        |
        v
bounded conversation state
        |
        v
compact sanitized planner envelope
        |
        v
Groq openai/gpt-oss-120b
        |
        v
strict JSON next action
        |
        v
deterministic validator + action resolver
        |
        +--> customer guidance
        +--> targeted clarification
        +--> approved live read
        +--> authoritative policy route
        +--> explicit human/restricted escalation
```

The model is not a business-truth or authorization authority. It cannot execute tools, call Discord or the website directly, browse, access the database, mutate orders/balances/accounts, or invent canonical IDs/operations.

## Previous release evidence

The remediated pre-response-reconstruction candidate `2e8b763f699b4c1aaa138320f4e0420c736e82dc` passed consumed B0-v6 once:

```text
44 / 44 deterministic preflight
44 / 44 hosted structured acceptance
44 / 44 exact effective action
0 / 44 fallback
3 / 3 restricted safe
latency avg/median/p95: 1081.13 / 995.59 / 1602.98 ms
```

B0-v6 is synthetic evidence only and is consumed. The active response-reconstruction work materially changes routing/knowledge/rendering and therefore requires a fresh B0-v7-or-later fixture after the new candidate is frozen.

## Controlled visible test

ADR-0015 authorizes only:

```text
AI_SUPPORT_ENABLED=true
AI_SUPPORT_SHADOW_ENABLED=false
AI_SUPPORT_CHANNEL_IDS=1542084649017286727
AI_SUPPORT_CATEGORY_IDS=
```

The bot is deployed through Northflank from the CM Discord Bot repository. This is a narrow operator test, not broad customer-facing release.

Live test:

```text
customer: Im unable to download the nfa loader
bot:      A staff member needs to continue this support request.
```

That response exposed a real quality gap despite broad transcript coverage.

## Current root-cause direction

1. **Specificity:** broad NFA-family routing can outrank a more specific loader download/update failure when both are present.
2. **Knowledge compression:** the sanitized runtime carries strong classification metadata but loses too much approved customer-response knowledge from historical conversations.
3. **Rendering:** some supported triage actions and known cases can still collapse into a generic escalation rather than an explicit useful response.

## Active response-reconstruction work

Branch:

```text
task/ai-support-response-reconstruction
```

Required work:

- inspect all relevant structured conversations programmatically, not only sampled tickets;
- validate customer/staff/system role classification;
- derive safe per-case response guidance with private provenance;
- classify promoted knowledge by authority (`current_authoritative`, `operator_approved`, `historical_consistent`, `historical_disputed`, `historical_only`, `unsafe_restricted` or an equivalent reviewed schema);
- preserve private contradictions instead of inventing consensus;
- sanitize all promoted public guidance;
- fix explicit loader-stage precedence over generic NFA routing where applicable;
- explicitly render every supported triage action;
- give all 55 canonical cases an explicit strategy: direct guidance, targeted clarification, live lookup, policy route, human escalation, or restricted escalation;
- keep generic staff escalation as an invariant/failure fallback rather than normal ordinary-case behavior;
- add privacy-safe canonical diagnostics;
- bump the runtime knowledge version.

## Safety boundary

The corpus includes cheating/spoofer/anti-cheat/injection/driver/evasion material. Historical classification is allowed, but autonomous runtime support must not expose actionable bypass/evasion/injection/kernel/driver/spoofing/detection-avoidance instructions.

The existing narrow Rust NFA ordinary resource-lowering exception remains unchanged. Do not generalize it.

Ordinary loader/download/setup/browser/WebView/restart/resource support may be answered when safely grounded.

## Live-state / policy boundary

Historical transcripts must not be used as current authority for order/payment/fulfillment/account/wallet/Aura/refund/catalog/detection state. Use approved current reads/current policies or escalate/clarify.

`catalog.current.read` remains unavailable until the website exposes a reviewed real operation.

No autonomous mutation operation is authorized.

## Planner privacy boundary

The hosted planner receives only the bounded sanitized current-turn envelope. Never send raw transcripts, private provenance/evidence, customer email/Discord ID, raw selectors, credentials, fulfillment secrets, provider error bodies or the global historical corpus.

## Prospective shadow status

Shadow/no-reply collection tooling is implemented. No real fresh cohort has started and no prospective fresh-ticket evidence exists yet. The 200-adjudicated-turn / 14-day target is a proposed operating recommendation, not an ADR-0014 hard requirement.

## Broad activation gate

Broad customer-facing rollout remains blocked. After response reconstruction:

1. full deterministic/unit/privacy/architecture/coverage pass;
2. fresh B0-v7-or-later synthetic release acceptance for the frozen new candidate;
3. prospective newly arriving ticket validation for that exact candidate;
4. operational rollback/kill-switch review;
5. separate explicit broad activation/deployment decision.

Minimum ADR-0014 quality gates remain:

```text
safe-progress-or-better >= 95%
unsafe route            <= 2%
scope leakage             0
repeated known questions  0
context-answerable questions 0
```

## Resume rule

Read `CURRENT_STATE_2026-08-31.md`, `HANDOFF.md`, `AI_SUPPORT_HANDOVER_PROMPT.md`, ADR-0015 and the release/shadow evidence before changing this workstream. Do not use consumed B0-v6 as unseen evidence for the reconstructed candidate and do not broaden the one-channel test surface without explicit authorization.
