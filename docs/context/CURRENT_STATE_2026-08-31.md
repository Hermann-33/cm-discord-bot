# Current State — 2026-09-08

This document is the authoritative current-status snapshot for the Cheater's Market Discord bot. It supersedes deployment/status assertions in older dated AI-support handoffs, audits, release reports, and roadmap snapshots, while preserving those documents as historical evidence.

## Repository state

```text
repository: Hermann-33/cm-discord-bot
default / deployed branch: master
master baseline before this documentation refresh: f8988037994146f5d51455878fb8fa9d8a987928
active response-reconstruction branch: task/ai-support-response-reconstruction
active ticket-gate implementation branch: feature/tickety-account-link-gate
private corpus/spec repo: Hermann-33/CM-Ticket-Transcripts
private corpus branch: main
private corpus reference SHA: c9e993f17583a607402f4173296f64aac52d2ebe
```

`master` contains the validated AI-support implementation plus prospective shadow tooling. Northflank is linked to this repository and deploys the bot from the production branch.

## Current live AI test boundary

The operator explicitly authorized a narrow customer-visible test before prospective shadow collection.

Effective intended environment for that test:

```text
AI_SUPPORT_ENABLED=true
AI_SUPPORT_SHADOW_ENABLED=false
AI_SUPPORT_CHANNEL_IDS=1542084649017286727
AI_SUPPORT_CATEGORY_IDS=
```

The allowlist must contain exactly the single channel above and no category IDs. This is a controlled test surface, not a general production release. DMs, bots, wrong-guild messages, and every other channel/category remain outside visible AI support.

Rollback / kill switch remains:

```text
AI_SUPPORT_ENABLED=false
```

No new mutation authority, direct database access, Supabase service-role access, or private-corpus runtime dependency was introduced for this test.

## Release evidence inherited by the live test baseline

The routing/planner candidate `2e8b763f699b4c1aaa138320f4e0420c736e82dc` passed the consumed B0-v6 synthetic acceptance set:

```text
deterministic preflight: 44 / 44
hosted structured acceptance: 44 / 44
exact effective action: 44 / 44
fallback: 0 / 44
restricted safety: 3 / 3
avg latency: 1081.13 ms
median latency: 995.59 ms
p95 latency: 1602.98 ms
```

B0-v6 is consumed synthetic evidence only. It is not historical-generalization evidence and must not be rerun as an unseen release set.

## Live test finding

A real visible test in the authorized channel used the customer message:

```text
Im unable to download the nfa loader
```

The bot replied:

```text
A staff member needs to continue this support request.
```

This exposed a real product-quality gap despite correct corpus coverage:

1. the first-turn router can let a broad NFA-family signal outrank the more specific loader download/update stage;
2. the public runtime is optimized heavily for classification/routing and does not yet carry enough approved customer-response guidance derived from the historical corpus;
3. some supported triage action types still collapse into a generic final escalation renderer instead of an explicit customer-facing response.

This is not evidence that the transcript corpus lacks the answer. The private corpus contains 1,578 structured tickets and 39,090 messages, including customer questions, staff replies, clarification sequences, troubleshooting, resolution patterns, and escalation behavior. The problem is loss of useful response knowledge during canonicalization/sanitization and runtime rendering.

## Active remediation workstream

Working branch:

```text
task/ai-support-response-reconstruction
```

Goal: reconstruct a safe customer-response knowledge layer from the private corpus without making production depend on that repository at runtime.

The workstream is expected to:

- programmatically analyze the complete structured corpus rather than a few sampled tickets;
- recover staff first responses, clarification questions, troubleshooting/resolution sequences and escalation conditions;
- preserve current-policy/live-state/restricted-topic boundaries;
- add a sanitized public response-guidance artifact to `support-runtime/`;
- make loader-stage specificity outrank broad NFA-family signals when the customer explicitly reports a loader failure;
- explicitly render every supported triage action type;
- require all 55 canonical cases to have an explicit response strategy;
- prevent known ordinary support cases from silently falling into the generic staff-escalation fallback;
- add privacy-safe canonical diagnostic logging;
- bump the runtime knowledge version because this is a material knowledge change.

No implementation commit for this reconstruction existed at the time this current-state document was written; the branch was created from the validated `master` baseline and is awaiting the reconstruction implementation.

## Evaluation consequence

The response-reconstruction work is a material routing/knowledge/rendering change. Therefore B0-v6 cannot certify the resulting candidate.

After the remediation is complete:

1. run deterministic/unit/privacy/architecture/coverage validation;
2. create a genuinely fresh synthetic release fixture (B0-v7 or later);
3. require deterministic preflight 100% before any hosted call;
4. run the fresh hosted acceptance fixture at most once as unseen release evidence;
5. keep it clearly classified as synthetic, not historical generalization;
6. resume prospective fresh-ticket shadow validation for the new frozen candidate before any broad customer-facing rollout.

## Tickety account-link gate implementation

ADR-0016 is implemented on `feature/tickety-account-link-gate` and is deliberately separate from the AI response-reconstruction workstream.

Current branch behavior:

- recognizes initial Tickety text tickets in category `1382569775988871330` plus uncategorized `support-<number>` overflow channels;
- resolves the creator only from an unambiguous non-bot member-specific permission overwrite;
- locks only the creator's participation permissions before initial verification;
- uses only `support.tickets.access.read`, `support.tickets.verify`, and `support.tickets.override` through the existing HMAC Internal Integrations API;
- persists authorization state on the website/Supabase side rather than in a local bot database;
- honors the exact eight-hour verified lease without periodic polling;
- after expiry, re-verifies only on ticket-creator/customer activity or explicit **Check Again**; staff/admin/bot messages never renew the lease;
- deletes the triggering creator message if the fresh check is unlinked or unavailable, preventing a free post at the renewal boundary;
- distinguishes unlinked from verification/service failure;
- re-enforces locked creator permissions after Tickety channel permission rewrites;
- performs paced one-time startup reconciliation;
- adds `/cm ticket-allow`, reusing ADR-0006 exact-guild + explicit-user authorization and sanitized audit logging.

Customer linking uses `https://cheaters.market/dashboard?tab=settings` and the existing website **Connect Discord** OAuth flow.

Production rollout is still gated on website HTTP deployment, adding exactly the three support-ticket operations to the dedicated bot integration client's `allowedOperations`, deploying this bot revision, running `npm run register:commands`, and performing end-to-end Discord verification. No live command registration or production API smoke call is performed by repository validation.
## Architecture and safety invariants

Production remains:

```text
Discord
  -> CM Discord Bot
  -> HMAC-authenticated Internal Integrations API
  -> website business/data layer
  -> database
```

The bot has no direct database/Supabase access. The ticket gate does not add SQLite, a Northflank persistence volume, a service-role credential, or a direct database fallback. The model remains a constrained semantic planner with no tools or mutation authority. Deterministic code owns canonical IDs, action authority, policy/current-state boundaries, safe procedures, restricted-topic handling, and final execution.

Restricted bypass/evasion/injection/kernel/driver/spoofing/detection-avoidance content remains outside autonomous support. The existing narrow Rust NFA ordinary resource-lowering exception remains unchanged.

## Prospective shadow status

Shadow tooling is implemented but no real prospective cohort has been started and no fresh shadow tickets have been collected. The proposed operating target remains 200 fully adjudicated eligible turns over at least 14 calendar days, but ADR-0014 does not make that number authoritative; explicit governance approval is still required.

## Read order

For current AI-support work:

1. `CURRENT_STATE_2026-08-31.md`
2. `DOCS_AUDIT_2026-08-31.md`
3. `HANDOFF.md`
4. `../README.md`
5. `../decisions/ADR-0015-single-channel-visible-ai-test.md`
6. `AI_SUPPORT_RELEASE_VALIDATION_2026-08-26.md` for consumed synthetic release history
7. `../AI_SUPPORT_SHADOW_VALIDATION.md` for prospective cohort tooling
8. `AI_SUPPORT_TRIAGE_VALIDATION_2026-08-25.md` for consumed development history
9. accepted ADRs 0010 through 0015
