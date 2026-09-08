# Repository documentation index

This documentation system is the durable memory and governance layer for the Cheater's Market Discord bot.

## Current read order

1. `../AGENTS.md` — mandatory operating rules.
2. `context/CURRENT_STATE_2026-08-31.md` — authoritative current repository/deployment/AI-support state.
3. `context/DOCS_AUDIT_2026-08-31.md` — explains which older documents are preserved historical snapshots and what current files supersede their stale status assertions.
4. `context/ACTIVE_CONTEXT.md` — compact current working context.
5. `context/HANDOFF.md` — exact next engineering/resume sequence.
6. `decisions/ADR-0016-tickety-account-link-gate.md` — current Tickety account-link authorization/persistence/override model.
7. `decisions/ADR-0015-single-channel-visible-ai-test.md` — current narrow live-test authorization.
8. `context/ROADMAP.md — current project phases and release gates.
9. `context/ARCHITECTURE.md` — accepted architecture/invariants.
10. `context/DATA_STATUS.md` — backend/data dependency details; use current-state docs for deployment-status supersession.
11. `context/CODEBASE_MAP.md` — module ownership and fragile boundaries.
12. `context/COMMANDS.md` — command policy.
13. `context/WORKFLOW.md` — task/audit/Git lifecycle.
14. `context/AUDIT_LOG.md` and `context/PROJECT_HISTORY.md` — chronology.

## AI-support evidence/history

These files are preserved as point-in-time evidence. Their benchmark numbers remain authoritative for the run they describe, but their old deployment/activation statements do not override `CURRENT_STATE_2026-08-31.md`.

- `context/AI_SUPPORT_RELEASE_VALIDATION_2026-08-26.md` — B0-v3 failure, remediation, failed B0-v4/v5 preflights, passing consumed B0-v6 synthetic acceptance.
- `AI_SUPPORT_SHADOW_VALIDATION.md` — prospective cohort/no-reply/adjudication tooling and privacy model.
- `context/AI_SUPPORT_TRIAGE_VALIDATION_2026-08-25.md` — consumed 236-row development benchmark and Groq development results.
- `context/AI_SUPPORT_TRIAGE_PROGRESS_2026-08-25.md` — earlier hosted triage progress/failure analysis.
- `context/AI_SUPPORT_TRIAGE_SCHEMA_HARDENING_2026-08-25.md` — earlier strict-schema hardening.
- `context/AI_SUPPORT_RELEASE_HANDOVER_2026-08-25.md` — pre-release handoff history.
- `context/AI_SUPPORT_SIDE_PROJECT.md` — detailed 2026-08-26 workstream snapshot; use current-state docs for later deployment/reconstruction state.
- `context/AI_SUPPORT_HANDOVER_PROMPT.md` — historical handover prompt; current files supersede stale branch/deployment pointers inside it.
- `GROQ_SUPPORT_TRIAGE.md` — provider contract/reference; current-state docs own current rollout status.
- `OPENROUTER_SUPPORT_TRIAGE.md` — secondary provider reference.

## Current Tickety ticket-gate work

ADR-0016 is implemented on `feature/tickety-account-link-gate` / draft PR #15. It keeps durable ticket access on the website side and adds no local database or direct Supabase credential.

Core contract:

- initial Tickety category `1382569775988871330` plus uncategorized `support-<number>` overflow;
- conservative single non-bot member creator resolution;
- creator-only read-only gate while CM account-link state is verified;
- exact eight-hour verified lease;
- no periodic polling and no repeated check during an active lease;
- after expiry, only creator/customer activity or explicit **Check Again** renews verification;
- locked-state re-enforcement after Tickety permission rewrites;
- `/cm ticket-allow` as a ticket-scoped ADR-0006-authorized override;
- website operations only: `support.tickets.access.read`, `support.tickets.verify`, `support.tickets.override`.

Production rollout is separate from repository implementation and still requires website deployment, the bot client's exact operation allowlist, bot deployment, explicit slash-command registration, and live end-to-end smoke tests.
## Current AI test and remediation

The bot is currently authorized for a controlled visible AI test only in Discord channel `1542084649017286727`, with no category allowlist, under ADR-0015. This is not broad rollout.

A live message, `Im unable to download the nfa loader`, produced the generic staff-escalation fallback. The active branch `task/ai-support-response-reconstruction` exists to reconstruct safe transcript-grounded response knowledge, fix loader/NFA specificity, and give all 55 canonical cases an explicit response strategy.

Because this work materially changes routing/knowledge/rendering, consumed B0-v6 will not certify the next candidate. A fresh B0-v7-or-later set and later prospective validation are required before broad activation.

## Durable decisions

- ADR-0001 — standalone bot boundary
- ADR-0002 — Internal Integrations API data boundary
- ADR-0003 — historical slash-command policy, superseded by ADR-0005
- ADR-0004 — historical admin mutation model, partially superseded by ADR-0006/0007
- ADR-0005 — customer-message/admin-slash command split
- ADR-0006 — guild-wide `/cm` admin authorization
- ADR-0007 — Aura/wallet confirmation/idempotency model
- ADR-0008 — customer-safe sharing base policy
- ADR-0009 — canonical customer email in shared panels
- ADR-0010 — private ticket transcript repository boundary
- ADR-0011 — pending-purchase/fulfillment support view
- ADR-0012 — sanitized bundled runtime + constrained hosted planner
- ADR-0013 — Groq GPT-OSS primary provider
- ADR-0014 — default-off customer-facing activation / broad-release evidence gate
- ADR-0015 — controlled single-channel customer-visible AI test
- ADR-0016 — Tickety support-ticket account-link gate and ticket-scoped administrator override

## Historical audits

Files under `docs/audits/` are immutable point-in-time audits unless a later audit explicitly supersedes them. Do not rewrite old findings merely because current source has advanced.

## Authority rule

Later accepted ADRs and the current-state documentation layer supersede conflicting old status statements. Historical benchmark/audit documents retain their original results. Current source and verified external state override stale chat memory.

The production bot may consume only the sanitized bundled `support-runtime/` derivative. `CM-Ticket-Transcripts` remains a private data/specification repository and is never a production filesystem/runtime dependency.
