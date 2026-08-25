# ADR-0014: Customer-facing AI support activation boundary

## Status

Accepted

- Date: 2026-08-25
- Type: Architecture / Privacy / Runtime activation
- Supersedes: ADR-0012 only for permission to add customer-facing `MessageCreate` wiring behind the controls below. ADR-0012 remains authoritative for the bundled runtime, deterministic state/action boundary, privacy model, validator, and benchmark-before-activation requirements. ADR-0013 remains authoritative for the preferred Groq planner.

## Context

ADR-0012 deliberately prohibited customer-facing Discord message wiring until the support planner, deterministic runtime, privacy boundary, grounded action resolver, lookup authorization, and release gates were mature enough for a separate activation review.

The production support path now has a deterministic first-turn resolver, input-aware Groq schema, deterministic validation/fallback, a grounded action resolver, and an explicit read-only Internal Integrations API adapter. Customer-facing wiring still requires strict surface authorization, bounded state, failure isolation, rollout governance, and an untouched final holdout before enablement.

## Decision

### Discord entrypoint

Production code may register an AI-support `MessageCreate` handler only when all of the following are true:

- the message is in the exact configured `DISCORD_GUILD_ID`;
- the author is not a bot;
- the message is in an explicitly configured support channel or a channel/thread whose category is explicitly configured;
- `AI_SUPPORT_ENABLED=true`;
- the configured Groq planner is available;
- the bundled `support-runtime/` passes its manifest/hash integrity checks at initialization.

Message content alone never authorizes AI support. DMs, other guilds, unallowlisted surfaces, bot messages, and reserved message commands are ignored.

### Configuration and kill switch

The customer-facing AI feature is default-off.

Approved configuration surface:

```text
AI_SUPPORT_ENABLED=false
AI_SUPPORT_CHANNEL_IDS=
AI_SUPPORT_CATEGORY_IDS=
```

`AI_SUPPORT_ENABLED=false` is the immediate kill switch. Enabling AI without a Groq key or without at least one explicit support channel/category allowlist is invalid configuration and must fail closed.

### Conversation state

Initial rollout uses bounded in-memory state only.

- key: exact guild + Discord channel/thread + customer user ID;
- inactivity TTL: 30 minutes;
- maximum live conversations: 500;
- oldest inactive state is evicted when capacity is reached;
- state contains only the bounded canonical support state required by ADR-0012;
- raw transcript history is never retained;
- process restart intentionally clears all AI-support state;
- no new database table or direct database access is authorized for conversation state.

Pending clarification answers and procedure outcomes are interpreted against existing state before first-turn routing. Known questions and exhausted safe procedures must not be repeated merely because the customer's reply is short.

### Planner and action authority

Groq remains a constrained semantic next-action planner only. It cannot:

- author arbitrary customer replies;
- call Discord or website APIs;
- execute tools;
- mutate website/customer state;
- invent canonical IDs or backend operations;
- override deterministic restricted-topic handling.

Every hosted output is validated deterministically. The deterministic action resolver is the only component allowed to turn a validated decision into customer-facing canonical material or an approved live read.

### Internal API authority

Autonomous AI support is read-only.

Only concrete operations already exposed by the existing `InternalApiClient` may be used. Abstract runtime lookup IDs must pass through the explicit adapter. Unsupported abstractions such as an unimplemented `catalog.current.read` fail closed into clarification or escalation.

No refund, balance adjustment, fulfillment mutation, purchase processing, manual-delivery mutation, or other write operation is authorized by this ADR.

### Privacy

Hosted planner input remains the compact sanitized ADR-0012 envelope. The customer-facing path must not send raw transcripts, historical evidence, email addresses, Discord IDs, internal UUIDs, public order references, secrets, account tokens, license keys, credentials, private URLs, or provider/internal error bodies to Groq.

Live lookup DTOs are reduced to explicitly customer-safe support fields before they are stored in planner-visible state or rendered. Raw fulfillment material, even when masked for staff UI purposes, is excluded from autonomous AI responses.

### Restricted topics

The existing restricted bypass/evasion/injection/kernel/driver/spoofing/detection-avoidance boundary remains unchanged. Restricted requests escalate without autonomous operational instructions.

The permanent Rust NFA exception remains narrow: ordinary high/max graphics may be lowered and unnecessary background applications/resources may be reduced; if those ordinary resource steps are already exhausted or fail, the flow advances to the canonical continuation/escalation path rather than expanding into evasion guidance.

### Failure behavior

- Groq timeout, quota, HTTP, schema, or validation failure uses the existing deterministic fallback.
- Internal API read failure or unsupported lookup produces canonical clarification/escalation, never fabricated state.
- Runtime integrity failure prevents AI-support initialization while unrelated bot functions remain available.
- Unexpected support-handler failures produce only a generic customer-safe unavailable/escalation response and sanitized internal logging.
- Provider/internal exception bodies are never echoed to customers.

### Rollout and activation gate

Committing this wiring does **not** authorize production enablement.

Required progression:

```text
disabled
 -> internal/test allowlist
 -> small explicit ticket/support allowlist
 -> monitored rollout
 -> broader rollout only after evidence supports it
```

Before `AI_SUPPORT_ENABLED=true` may be used in a production deployment, the release candidate must be frozen and an independently prepared, provenance-disjoint final holdout must be run exactly once.

Minimum release thresholds remain:

```text
safe-progress-or-better >= 95%
unsafe route            <= 2%
scope leakage             0
repeated-known question    0
context-answerable question 0
```

The release also requires structured-output/provider compatibility, privacy, restricted-topic precision, lookup correctness, multi-turn behavior, runtime integrity, operational kill-switch verification, and documented rollback.

If the final holdout exposes a material defect requiring code changes, that candidate fails. The same holdout must not be used for tuning and rerun as if untouched.

### Rollback

Rollback requires no data migration:

1. set `AI_SUPPORT_ENABLED=false` or remove the AI support allowlist;
2. restart/redeploy the bot if configuration is not hot-reloaded;
3. in-memory conversations disappear on restart;
4. existing Aura/admin/leaderboard behavior remains independent.

## Explicitly forbidden

- global content-triggered AI activation;
- AI support in DMs or unallowlisted guild surfaces;
- direct database/Supabase access or service-role credentials;
- runtime dependency on the private transcript repository;
- model-selected mutations;
- direct execution of arbitrary runtime operation names;
- exposing raw provider/API errors, internal IDs, customer credentials, account tokens, or license keys;
- enabling customer-facing AI before the final holdout and release gates pass.
