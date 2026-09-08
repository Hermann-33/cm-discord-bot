# Current Architecture

Updated: 2026-09-08

## System boundary

```text
Discord
  -> standalone CM Discord bot
  -> HMAC-authenticated HTTPS
  -> Cheater's Market website Internal Integrations API
  -> website business/data layer
  -> Supabase/Postgres and other backend dependencies
```

The bot has no direct database client, service-role key, RPC/table fallback or DB mutation path. `legacy/` remains frozen/excluded.

## Discord surfaces

Current source contains:

- customer message command `cm aura`;
- operational `/refresh-leaderboard`;
- private `/cm user` by email or linked Discord user;
- private `/cm order` by public ref or order/purchase UUID;
- private `/cm` navigation/refund/Aura/wallet controls;
- deterministic Tickety support-ticket account-link gate and ticket-scoped `/cm ticket-allow` override;
- authorized Share to Chat buttons that publish separate customer-facing read-only summaries;
- AI support `messageCreate` handling behind exact guild + explicit channel/category allowlists and feature flags.

ADR-0005 through ADR-0011 govern the existing customer/admin surfaces. ADR-0012/0013 define the sanitized runtime + constrained Groq planner. ADR-0014 defines broad activation governance. ADR-0015 authorizes the current controlled one-channel visible test only.

## Interaction routing

`src/index.ts` constructs the admin controller and support-AI controller. `/cm` slash/button/modal interactions remain operator-authorized and independent from customer AI. `cm aura` retains its reserved deterministic message-command path.

Manual slash registration still publishes:

```text
/refresh-leaderboard
/cm
```

AI support is message-based and does not add slash commands.

`/cm` now contains `user`, `order`, and `ticket-allow`; the new subcommand requires explicit command re-registration during rollout. Ticket recheck buttons and `/cm ticket-allow` are routed through `TicketLinkGateController` before the ordinary `/cm` controller.

## `/cm` authorization/session boundary

Every `/cm` slash/button/modal interaction requires exact configured guild + non-empty explicit `BOT_ADMIN_USER_IDS` + invoking user in the allowlist. Components/modals additionally require the short-lived session to belong to the same operator.

There is no `/cm` command-channel restriction. `/refresh-leaderboard` retains its separate command-channel/permission checks.

`CmSessionStore` holds bounded in-memory UI state with operator ownership and a 15-minute inactivity TTL. Component custom IDs contain routing/session/index tokens only; no email, balances, reasons, target UUIDs or credentials.

## `/cm order` resolution architecture — ADR-0011

```text
input
 -> authorize
 -> normalize order/public selector
 -> orders.details.read
      -> success: canonical order path
      -> stable NOT_FOUND only:
           purchase-intents.lookup.read
             -> if orderId resolves: canonical order path
             -> otherwise: pending purchase path
```

Both canonical and pending paths resolve the website-returned owner through `users.overview.read(user_id)` and require exact equality before opening the operator session.

The pending fallback is never used for authentication, authorization, validation, rate-limit, dependency or other service errors.

## Fulfillment support architecture

`orders.fulfillment.read` remains read-only. Optional support metadata is bounded/masked. Raw decrypted license/account secrets are outside strict DTOs. Missing optional support never implies manual-required, and best-effort enrichment failure never blocks a valid canonical order panel.

## Customer-safe sharing

Private admin panels and channel-visible customer summaries remain separate renderers. Shared output has no action custom IDs, uses safe mentions and excludes private provider/internal IDs, masked fulfillment support, reasons/audit/idempotency data and credentials.

## Admin mutation boundary

Refund/Aura/wallet mutations remain explicit private admin operations under ADR-0007/0011. They retain preview/confirmation/fresh-state/idempotency/audit requirements. Customer AI has no mutation authority and cannot invoke these operations.

## Tickety support-ticket authorization boundary

```text
Tickety text channel
 -> TicketLinkGateController
 -> support.tickets.access.read / verify / override
 -> website durable ticket-access state
 -> current website Discord link authority
```

Initial recognition is limited to category `1382569775988871330` or uncategorized `support-<number>` overflow channels. New-ticket creator resolution requires exactly one non-bot member overwrite; ambiguity is never guessed.

The creator is locked before the initial freshness check to close the channel-creation race. The gate changes only creator participation permissions and never support/staff role overwrites.

Verified access is an exact eight-hour website lease. The bot does not poll open tickets every eight hours and does not verify on every message. After expiry, only ticket-creator/customer activity or explicit **Check Again** causes a fresh verification. Staff/admin/bot messages do not.

Known locked state is re-enforced on Discord `ChannelUpdate` so Tickety claim/move/permission rewrites cannot silently reopen customer participation. Startup reconciliation is paced one-time recovery, not recurring monitoring.

Website state is authorization persistence. Discord gate-message custom IDs carry only non-secret permission snapshot metadata needed to restore the exact pre-gate state after restart. No local SQLite, Northflank volume, Supabase client, or service-role credential is introduced.

`/cm ticket-allow` uses ADR-0006 human authorization and the closed `support.tickets.override` operation. It is ticket-scoped, requires the configured Discord audit channel, and does not exempt future tickets.

The ticket gate executes before `cm aura` and customer AI handling, so blocked creator traffic cannot continue into those surfaces.
## Internal Integrations API boundary

The bot uses concrete reviewed website operations only. Existing relevant read operations include:

```text
aura.leaderboards.read
aura.lookup.read
users.overview.read
support.tickets.access.read
support.tickets.verify
support.tickets.override
orders.details.read
orders.fulfillment.read
purchase-intents.lookup.read
```

Existing admin-only mutations include:

```text
orders.refund.preview
orders.refund.execute
users.aura.adjust
users.wallet.adjust
```

Website per-client `allowedOperations` is separate runtime authorization. No abstract KB operation may be converted into an invented endpoint. `catalog.current.read` remains unavailable until separately implemented/reviewed upstream.

## Private transcript / public runtime boundary

ADR-0010 remains unchanged: transcript exporter/knowledge tooling is non-production and `CM-Ticket-Transcripts` is a private data/spec repository.

Production reads only the sanitized bundled `support-runtime/` derivative. No environment variable or startup path can point production at the private repository. Private provenance/evidence, raw transcripts, PII, raw selectors and secrets do not enter the public runtime or hosted planner.

## AI support runtime

Current architecture:

```text
eligible customer message
  -> deterministic first-turn/context/control-plane resolver
  -> bounded conversation state
  -> sanitized compact planner payload
  -> Groq openai/gpt-oss-120b strict JSON action
  -> deterministic validation/fallback
  -> deterministic case/clarification/read/policy/escalation renderer
  -> grounded customer reply or explicit escalation
```

The hosted model chooses only within supplied canonical IDs/actions. It has no tools, API execution, browser, database, Discord action or mutation access.

Deterministic constraints take precedence over planner preference. Restricted input is fail-closed to restricted escalation. Provider/schema failure cannot expand authority.

### Conversation state

State retains resolved entities, candidate cases/families, known/unknown context, pending clarification, questions/answers, diagnostics, procedures/outcomes, lookup results, policy state and multiple intents. Pending short answers are consumed relative to the prior question and already-known questions must not be repeated.

### Bundled support runtime

The public runtime currently derives from private canonical knowledge through an explicit sanitizer/importer with manifest SHA-256 integrity checks. The existing runtime was designed primarily for safe classification/routing and canonical procedures/policies.

The active `task/ai-support-response-reconstruction` workstream is expected to add a sanitized response-guidance layer derived offline from transcript conversations. Private evidence/provenance remains private. This material change requires a runtime knowledge-version bump and fresh release evaluation.

## Current controlled visible test — ADR-0015

The bot is deployed through Northflank. Customer-visible AI is currently authorized only when effective configuration is exactly scoped to:

```text
AI_SUPPORT_ENABLED=true
AI_SUPPORT_SHADOW_ENABLED=false
AI_SUPPORT_CHANNEL_IDS=1542084649017286727
AI_SUPPORT_CATEGORY_IDS=
```

The source does not hard-code the test channel. Every other channel/category and DMs remain outside visible AI support.

Visible mode takes precedence over shadow mode if both flags are true, preventing duplicate processing.

Rollback/kill switch:

```text
AI_SUPPORT_ENABLED=false
```

This is not broad release authorization.

## Live response-quality finding

The controlled test message:

```text
Im unable to download the nfa loader
```

produced:

```text
A staff member needs to continue this support request.
```

The transcript corpus contains relevant customer/staff evidence. The active remediation therefore targets stage specificity, response-knowledge preservation and explicit action rendering rather than giving production direct transcript access.

## Prospective shadow boundary

The separate default-off shadow flag reuses the exact production eligibility and same deterministic/planner/read-only pipeline. With visible AI disabled, eligible post-cutoff messages can produce privacy-safe no-reply cohort records.

Each cohort freezes candidate/runtime/model/config/start time. Evidence uses cohort-scoped keyed pseudonyms and sanitization; raw Discord IDs, emails, selectors, secrets, provider bodies and fulfillment material are excluded. Shadow files are not planner input.

Shadow/adjudication failure cannot block normal bot operation or create a response/mutation path. No real prospective cohort has started yet.

## Release/evaluation boundary

The previous candidate passed consumed synthetic B0-v6, but the active response-reconstruction work materially changes routing/knowledge/rendering. B0-v6 therefore cannot certify the next candidate.

After reconstruction: freeze a new candidate/runtime, create a fresh B0-v7-or-later fixture, require deterministic preflight 100% before any hosted run, then collect prospective fresh-ticket evidence for that exact candidate before broad release.

## Fragile boundaries

- HMAC canonicalization/exact-body retries;
- strict DTO mirrors and backend `allowedOperations`;
- authorization before sensitive access;
- exact guild/channel/category eligibility for customer AI;
- deterministic action constraints before planner preference;
- restricted fail-closed handling;
- no private-corpus runtime dependency;
- public runtime sanitizer/integrity manifest;
- `NOT_FOUND`-only purchase-intent fallback;
- exact owner equality for canonical/pending targets;
- operator-bound session ownership;
- optional fulfillment support never blocking canonical order controls;
- masked support material never entering customer output;
- customer-share renderer never inheriting private admin controls;
- refund/Aura/wallet fresh-state + idempotency/audit rules;
- no direct DB/purchase-processing/manual-fulfillment shortcuts;
- no model-selected mutation authority;
- kill switch remains effective and documented;
- ticket creator resolution is conservative and never guesses;
- ticket verification expiry remains activity-triggered rather than timer-driven;
- locked creator permission rewrites are re-enforced without altering staff roles.
