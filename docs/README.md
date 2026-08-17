# Repository documentation index

This documentation system is the durable memory and governance layer for the Cheater's Market Discord bot.

## Read first

- `../AGENTS.md` — mandatory operating rules
- `context/ACTIVE_CONTEXT.md` — concise present state
- `context/PROJECT_BRIEF.md` — stable product purpose and scope
- `context/ARCHITECTURE.md` — accepted current architecture
- `context/DATA_STATUS.md` — verified backend/data dependency posture
- `context/CODEBASE_MAP.md` — module ownership and fragile boundaries
- `context/COMMANDS.md` — current and accepted future command policy
- `context/ROADMAP.md` — roadmap and completion gates
- `context/WORKFLOW.md` — task/audit/Git lifecycle
- `context/HANDOFF.md` — latest handoff and exact next action
- `context/AUDIT_LOG.md` — chronological material findings and verdicts
- `context/PROJECT_HISTORY.md` — durable project chronology

## Full audit reports

- `audits/2026-08-17-full-codebase-audit.md` — exhaustive active-code/test/config/GitHub/dependency re-baseline (`TASK-AUDIT-001`)

## Durable decisions

- `decisions/ADR-0001-standalone-bot-boundary.md`
- `decisions/ADR-0002-internal-api-data-boundary.md`
- `decisions/ADR-0003-guild-only-slash-command-policy.md`
- `decisions/ADR-0004-admin-mutation-security-model.md`

## Specialist references

- `security/ADMIN_MUTATION_MODEL.md` — Aura/wallet admin-command security model and verified upstream mutation foundation
- `legacy-parity.md` — frozen behavioral/history audit for the pre-rebuild bot

## Rule

Current source code and verified external state override stale chat memory. Historical documents describe what happened; ADRs and current context describe what is authorized now. External backend facts documented here are dependency context, never permission for this bot to bypass the website Internal Integrations API.