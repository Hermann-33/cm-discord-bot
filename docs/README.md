# Repository documentation index

This documentation system is the durable memory and governance layer for the Cheater's Market Discord bot.

## Read first

- `../AGENTS.md` — mandatory operating rules
- `context/ACTIVE_CONTEXT.md` — concise present state
- `context/PROJECT_BRIEF.md` — stable product purpose and scope
- `context/ARCHITECTURE.md` — accepted current architecture
- `context/DATA_STATUS.md` — verified backend/data dependency posture
- `context/CODEBASE_MAP.md` — module ownership and fragile boundaries
- `context/COMMANDS.md` — current and accepted command policy
- `context/ROADMAP.md` — roadmap and completion gates
- `context/WORKFLOW.md` — task/audit/Git lifecycle
- `context/HANDOFF.md` — latest handoff and exact next action
- `context/AUDIT_LOG.md` — chronological material findings and verdicts
- `context/PROJECT_HISTORY.md` — durable project chronology

## Full audit reports

- `audits/2026-08-17-full-codebase-audit.md` — exhaustive active-code/test/config/GitHub/dependency re-baseline (`TASK-AUDIT-001`). Its slash-only recommendation for `cm aura` was superseded by ADR-0005 after explicit product clarification.
- `audits/2026-08-18-cm-admin-controls-order.md` — `TASK-CM-ADMIN-003` direct order/Aura/wallet implementation audit and current executable-CI blocker.

## Durable decisions

- `decisions/ADR-0001-standalone-bot-boundary.md`
- `decisions/ADR-0002-internal-api-data-boundary.md`
- `decisions/ADR-0003-guild-only-slash-command-policy.md` — historical decision, superseded by ADR-0005
- `decisions/ADR-0004-admin-mutation-security-model.md` — historical high-impact mutation model; its admin-command-channel requirement is superseded by ADR-0006 and its dedicated balance-preview requirement is superseded for Aura/wallet by ADR-0007
- `decisions/ADR-0005-customer-message-admin-slash-command-policy.md` — current customer/admin command-surface split; its inherited admin-channel requirement is superseded by ADR-0006
- `decisions/ADR-0006-admin-console-guild-wide-channel-policy.md` — current `/cm` guild-wide channel/explicit-user authorization policy
- `decisions/ADR-0007-admin-balance-adjustment-confirmation-model.md` — current Aura/wallet confirmation, fresh-state binding, idempotency and audit model

## Specialist references

- `security/ADMIN_MUTATION_MODEL.md` — Aura/wallet admin-command security model and verified upstream mutation foundation
- `security/CM_ADMIN_CONSOLE_SECURITY.md` — current `/cm` user/order/refund/balance-control security model
- `legacy-parity.md` — frozen behavioral/history audit for the pre-rebuild bot

## Rule

Current source code and verified external state override stale chat memory. Later accepted ADRs supersede conflicting earlier ADRs. Historical audits describe the conclusion at the time and may be superseded by later product decisions. External backend facts documented here are dependency context, never permission for this bot to bypass the website Internal Integrations API.
