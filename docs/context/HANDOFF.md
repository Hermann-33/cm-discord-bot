# Latest Handoff

Updated: 2026-09-08
Status: `TICKET GATE IMPLEMENTED / PRODUCTION ROLLOUT PENDING / AI RESPONSE RECONSTRUCTION SEPARATE`

## Read order

1. `CURRENT_STATE_2026-08-31.md`
2. `DOCS_AUDIT_2026-08-31.md`
3. `ACTIVE_CONTEXT.md`
4. `../decisions/ADR-0016-tickety-account-link-gate.md`
5. `../decisions/ADR-0015-single-channel-visible-ai-test.md`
6. `AI_SUPPORT_RELEASE_VALIDATION_2026-08-26.md`
7. `../AI_SUPPORT_SHADOW_VALIDATION.md`
8. `AI_SUPPORT_HANDOVER_PROMPT.md` and accepted ADRs

## Current baseline

```text
master/base for ticket-gate branch: c6b5f5d1d3f125069ecfc0467cda3b9b85693c77
Northflank source: cm-discord-bot production/default branch
private corpus: Hermann-33/CM-Ticket-Transcripts @ c9e993f17583a607402f4173296f64aac52d2ebe
AI engineering branch: task/ai-support-response-reconstruction
ticket-gate source: ADR-0016 implementation complete
```

The validated implementation/shadow branch was fast-forwarded into `master`. The previous routing/planner candidate passed consumed B0-v6 synthetic acceptance at 44/44 exact/accepted, zero fallback and 3/3 restricted safety.

## Tickety account-link gate

ADR-0016 is implemented in the current source. It is a deterministic Discord/API authorization feature and is not part of the AI response-reconstruction branch.

Implemented behavior:

- recognize initial Tickety tickets in category `1382569775988871330` or uncategorized `support-<number>` overflow channels;
- resolve exactly one non-bot member overwrite as creator; never guess ambiguity;
- lock only creator participation while the website verifies the active CM Discord link;
- persist ticket state only through `support.tickets.access.read`, `support.tickets.verify`, and `support.tickets.override` behind HMAC;
- exact eight-hour verified lease;
- no periodic lease polling and no repeated verification during an active lease;
- after expiry, only creator/customer activity or explicit **Check Again** triggers re-verification;
- staff/admin/bot messages do not renew the customer lease;
- unlinked/verification-failure creator messages at the expiry boundary are deleted before the ticket remains locked;
- distinct user copy for unlinked vs verification/service failure;
- locked permission re-enforcement after Tickety rewrites;
- paced one-time startup fresh-verification sweep for all existing non-overridden support tickets;
- `/cm ticket-allow` reuses ADR-0006 exact-guild + explicit-user authorization, requires `BOT_AUDIT_LOG_CHANNEL_ID`, persists a ticket-scoped override, restores participation, and emits sanitized Discord audit.

Customer link destination:

```text
https://cheaters.market/dashboard?tab=settings
```

### Ticket-gate rollout gates

Do not call the feature production-complete until all of the following are done:

1. website support-ticket HTTP routes are deployed;
2. the dedicated bot Internal API client receives exactly:
   - `support.tickets.access.read`
   - `support.tickets.verify`
   - `support.tickets.override`
3. the final bot branch head passes CI;
4. bot revision is deployed;
5. `npm run register:commands` is run once because `/cm ticket-allow` changes command JSON;
6. live linked/unlinked/recheck/expiry/restart/Tickety-rewrite/admin-override smoke tests pass.

No local SQLite database, Northflank persistent volume, Supabase client or service-role credential is required.

## Controlled live test

The operator explicitly authorized customer-visible AI testing only in Discord channel:

```text
1542084649017286727
```

Expected effective configuration:

```text
AI_SUPPORT_ENABLED=true
AI_SUPPORT_SHADOW_ENABLED=false
AI_SUPPORT_CHANNEL_IDS=1542084649017286727
AI_SUPPORT_CATEGORY_IDS=
```

This is a narrow test exception recorded in ADR-0015, not a general production activation decision.

## Live defect discovered

Message:

```text
Im unable to download the nfa loader
```

Observed bot reply:

```text
A staff member needs to continue this support request.
```

Root-cause direction already established:

1. loader download/update specificity must beat broad NFA-family routing when both tokens are present;
2. the private corpus contains the needed customer/staff conversations, but the sanitized public runtime currently loses too much response content;
3. the final deterministic renderer needs explicit handling for all supported action types and useful case guidance rather than generic escalation.

## AI next engineering task

The AI workstream remains separate. Work on `task/ai-support-response-reconstruction`.

Use the full 1,578-ticket / 39,090-message structured corpus as the primary historical evidence source. Build deterministic extraction/coverage tooling; do not copy raw transcript text directly into production.

Required outcome:

- derive a private response-guidance layer with provenance/authority classification;
- sanitize/promote only safe approved guidance into the public runtime;
- cover all 55 canonical cases with an explicit response strategy;
- retain current-state/policy/live-lookup boundaries;
- retain restricted-topic safeguards;
- make ordinary known cases answer/clarify usefully instead of defaulting to generic escalation;
- add the exact NFA-loader regression;
- add explicit `support_operation`, `human_escalation`, and `multi_intent_route` rendering;
- add safe canonical diagnostics;
- bump runtime knowledge version;
- run full tests/typecheck/build/diff/audit/privacy/architecture coverage.

## Evaluation after remediation

Do not rerun B0-v6 as unseen evidence. Create fresh B0-v7 or later only after implementation is frozen. If deterministic preflight fails, consume that fixture as development evidence and create another fresh fixture after fixing the defect. Only run hosted Groq after deterministic preflight reaches 100%.

A passing synthetic result still does not replace prospective fresh-ticket shadow validation.

## Broad rollout blockers

- complete response reconstruction;
- pass full validation;
- pass a fresh synthetic release fixture for the new candidate;
- freeze candidate/runtime/provider configuration;
- run prospective newly arriving ticket validation;
- review operational rollback/kill switch;
- make a separate explicit broad activation decision.

## Kill switch / safety

Set `AI_SUPPORT_ENABLED=false` and restart/redeploy the service to stop visible AI. AI retains no mutation/direct-DB/private-corpus-runtime authority. ADR-0016's deterministic `/cm ticket-allow` is a separate explicitly authorized admin mutation and must never be exposed to the hosted planner.
