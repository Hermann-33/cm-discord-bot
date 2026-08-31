# Documentation Accuracy Audit — 2026-08-31

## Purpose

This audit reconciles the repository documentation with the actual repository/deployment state after the AI-support implementation was merged to `master`, a narrow customer-visible Northflank test was authorized, and the response-reconstruction workstream was opened.

## Result

`PASS WITH HISTORICAL SNAPSHOTS PRESERVED`

The documentation set contains many intentionally dated reports. Those files are not rewritten because their point-in-time benchmark numbers and decisions are evidence. Current status is now centralized in `CURRENT_STATE_2026-08-31.md`, `ACTIVE_CONTEXT.md`, `HANDOFF.md`, the current roadmap, the docs index, and ADR-0015.

## Material stale statements corrected by the current authority layer

Older documents may state one or more of the following:

- authoritative production work was only on `task/ai-support-integration`;
- no production merge occurred;
- the bot had never been started/deployed with customer-visible AI;
- customer-facing AI remained fully disabled;
- prospective shadow collection was necessarily the immediate next runtime step.

Those statements were correct when written but are no longer current.

As of 2026-08-31:

- `master` contains the validated AI/shadow implementation;
- the bot is deployed through Northflank from the CM Discord Bot repository;
- the operator authorized a narrow visible test in exactly channel `1542084649017286727` with category allowlisting empty;
- the visible test exposed a response-quality/routing gap for an NFA-loader download question;
- `task/ai-support-response-reconstruction` is the active remediation branch;
- broad rollout remains unauthorized and prospective fresh-ticket validation remains required for the remediated candidate.

## Current-authority documents

The following files own current status:

- `docs/context/CURRENT_STATE_2026-08-31.md`
- `docs/context/ACTIVE_CONTEXT.md`
- `docs/context/HANDOFF.md`
- `docs/context/ROADMAP.md`
- `docs/README.md`
- `docs/decisions/ADR-0015-single-channel-visible-ai-test.md`

When a deployment/status statement in an older document conflicts with these files, the current-authority files win.

## Historical evidence retained unchanged

The following categories remain point-in-time evidence and should not be silently rewritten:

- dated audit reports under `docs/audits/`;
- `AI_SUPPORT_RELEASE_HANDOVER_2026-08-25.md`;
- `AI_SUPPORT_RELEASE_VALIDATION_2026-08-26.md`;
- `AI_SUPPORT_TRIAGE_PROGRESS_2026-08-25.md`;
- `AI_SUPPORT_TRIAGE_SCHEMA_HARDENING_2026-08-25.md`;
- `AI_SUPPORT_TRIAGE_VALIDATION_2026-08-25.md`;
- accepted ADRs 0001–0014 describing the decision state at acceptance time;
- benchmark counts/latency/results recorded in those documents.

ADR-0015 records the later controlled-test exception without rewriting ADR-0014's broad-release gate.

## Technical documents

Architecture, command, security, data-boundary, codebase-map and workflow documents remain generally valid. Where they contain old activation wording, `CURRENT_STATE_2026-08-31.md` supersedes only the deployment/status statement; the technical invariant remains unchanged unless a later accepted ADR explicitly changes it.

Key unchanged invariants:

- no direct DB/Supabase access;
- HMAC Internal Integrations API boundary;
- explicit admin authorization;
- model has no mutation/tool authority;
- raw private transcripts are not a production dependency;
- hosted planner input remains sanitized;
- current state/policy cannot be invented from historical evidence;
- restricted technical content remains escalation-only outside narrow approved ordinary-support exceptions.

## Response-knowledge gap

The audit confirms an important documentation/implementation distinction that must remain explicit:

- the transcript corpus is rich enough to contain historical customer questions and staff responses;
- the production `support-runtime/` is a sanitized derivative, not the raw corpus;
- the present derivative over-compresses conversational response knowledge for some ordinary cases;
- the active reconstruction task must recover that knowledge safely rather than giving production direct access to the private repository.

## Future maintenance rule

Whenever a deployment mode, active branch, frozen candidate, runtime knowledge version, evaluation fixture, or rollout gate changes:

1. update `CURRENT_STATE_YYYY-MM-DD.md`;
2. update `ACTIVE_CONTEXT.md` and `HANDOFF.md`;
3. update `ROADMAP.md` if the next gate changes;
4. add/supersede an ADR if governance behavior changed;
5. preserve historical benchmark/audit documents rather than rewriting their old results.
