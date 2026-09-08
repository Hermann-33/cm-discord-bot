# Project Brief

Updated: 2026-09-08

## Product purpose

The Cheater's Market Discord bot is the Discord-facing companion to Cheater's Market. It publishes customer Aura information, gives a small explicitly trusted staff set private operational/admin controls, and now contains a constrained customer-support AI pipeline under narrow release governance. Discord never becomes the owner of account, wallet, order, payment or fulfillment state.

## Target users

- community members needing read-only Aura/self-service information;
- customers receiving staff-shared read-only support summaries;
- trusted staff needing private user/order/pending-purchase/fulfillment diagnostics;
- explicitly allowlisted administrators performing audited Aura, wallet and canonical-order refund operations through website-owned Internal Integrations API contracts;
- customers using the explicitly authorized AI-support test surface while the broader AI release remains gated.

## Current product surfaces

- persistent Components V2 Aura leaderboard;
- customer `cm aura` message command;
- `/refresh-leaderboard`;
- private `/cm user` and `/cm order` admin console;
- linked Discord lookup/presentation;
- order/pending-purchase/fulfillment diagnostics;
- optional private masked fulfillment support metadata;
- canonical order refund;
- confirmed Aura and wallet adjustment;
- Share to Chat customer-safe summaries;
- structured Discord audit summaries;
- bounded stateful AI support on explicitly allowlisted message surfaces;
- deterministic Tickety support-ticket account-link gating with ticket-scoped admin override.

## Data/business boundary

```text
Discord
  -> standalone bot
  -> HMAC Internal Integrations API
  -> website-owned business/data layer
```

The bot is never a direct Supabase/Postgres client, has no service-role/database credential and has no table/RPC fallback. Website per-client `allowedOperations` remains an independent runtime authorization boundary.

Ticket authorization uses the same boundary: `support.tickets.access.read`, `support.tickets.verify`, and `support.tickets.override`. Durable access state lives upstream; no local SQLite/Northflank volume is required.

## Admin mutation model

Refund/Aura/wallet remain private admin operations under the accepted confirmation/fresh-state/idempotency/audit model. Pending purchase state is read-only until a canonical order exists. Manual fulfillment remains blocked because no dedicated website-owned execute operation exists.

Customer AI support has **no mutation authority**.

ADR-0016 adds one separate deterministic mutation: `/cm ticket-allow`. It is not available to AI, is scoped to the current support ticket, reuses the explicit `/cm` administrator allowlist, and records website + Discord audit attribution.

## Support-ticket access model

Tickety tickets are gated on the creator's active CM ↔ Discord account link. Initial tickets are recognized in category `1382569775988871330` or as uncategorized `support-<number>` overflow channels.

The creator is made read-only while the website performs a freshness-sensitive verification. A successful link check creates an exact eight-hour lease. During the lease there are no repeated verification calls. After expiry, only creator/customer activity or explicit **Check Again** triggers renewal; staff/admin/bot messages and inactive tickets cause no verification work.

Unlinked creators receive the existing CM Settings / **Connect Discord** flow. Service failure is fail-closed but is never presented as proof that the account is unlinked. Tickety permission rewrites are re-enforced only against the locked creator; staff/support roles are untouched.
## AI support model

ADR-0012/0013 establish:

```text
private transcript/canonical evidence
 -> offline sanitization
 -> bundled support-runtime/
 -> deterministic resolver + bounded conversation state
 -> compact sanitized Groq planner envelope
 -> strict JSON next action
 -> deterministic validator/action resolver
 -> grounded reply / clarification / approved read / policy / escalation
```

The model is a semantic planner only. It cannot call APIs or Discord, browse, execute tools/code, access the database, mutate state, invent canonical IDs or invent website operations.

The private `CM-Ticket-Transcripts` repository is never a production runtime dependency.

## Current controlled AI test

ADR-0015 permits a narrow visible test only with:

```text
AI_SUPPORT_ENABLED=true
AI_SUPPORT_SHADOW_ENABLED=false
AI_SUPPORT_CHANNEL_IDS=1542084649017286727
AI_SUPPORT_CATEGORY_IDS=
```

Northflank runs the bot from the CM Discord Bot repository. This one-channel test is not broad production activation.

The first recorded quality defect was:

```text
customer: Im unable to download the nfa loader
bot:      A staff member needs to continue this support request.
```

The transcript corpus contains relevant customer/staff conversations. The active `task/ai-support-response-reconstruction` branch exists to preserve more safe response knowledge in the public runtime, fix stage specificity and make all canonical cases render an explicit useful strategy.

## Corpus / response knowledge

Private corpus status:

```text
structured tickets:      1,578
messages:                39,090
historical fact nodes:    3,949
canonical runtime cases:  55
```

Historical support content is evidence, not automatically current policy or live state. Current order/payment/fulfillment/account/wallet/Aura/refund/catalog/detection state must come from approved current reads/policies or fail closed.

Raw transcripts, private provenance/evidence, customer PII, selectors, credentials and fulfillment secrets are excluded from production planner input.

## Safety boundary

Autonomous support must not provide actionable bypass/evasion/injection/kernel/driver/spoofing/detection-avoidance instructions. The existing narrow Rust NFA ordinary resource-lowering exception remains unchanged.

Ordinary safe loader/download/setup/browser/WebView/restart/resource support may be automated when grounded.

## Release evidence and next gates

The pre-response-reconstruction candidate passed consumed B0-v6 at 44/44 deterministic and 44/44 hosted accepted/exact, with zero fallback and 3/3 restricted safety. B0-v6 is synthetic and consumed.

Response reconstruction is a material routing/knowledge/rendering change, so the next candidate requires a fresh B0-v7-or-later fixture after the implementation is frozen. A passing synthetic run still requires prospective newly arriving ticket validation and a separate broad-release decision under ADR-0014.

No real prospective shadow cohort has started yet.

## Explicit non-goals

The bot must not become:

- a direct database admin client;
- a generic website admin backend;
- the source of truth for current account/wallet/order/payment/license/delivery state;
- an autonomous purchase/refund/balance mutation agent;
- a manual-fulfillment engine without a website-owned operation;
- a runtime transcript-search service over the private corpus;
- a raw-secret-bearing diagnostic console;
- an autonomous provider of restricted bypass/evasion technical instructions.

## Success criteria

The bot should remain small/auditable, exact-guild scoped, explicitly allowlisted for sensitive surfaces, API-bounded, deterministic at security/authority boundaries, privacy-preserving, idempotent for admin mutations, fail-closed on unsupported state, useful on ordinary known customer support cases, and operationally reversible through documented feature flags.
