# Repository documentation index

This documentation system is the durable memory and governance layer for the Cheater's Market Discord bot.

## Read first

- `../AGENTS.md` — mandatory operating rules
- `context/ACTIVE_CONTEXT.md` — concise present state
- `context/PROJECT_BRIEF.md` — stable product purpose and scope
- `context/SIDE_PROJECTS.md` — adjacent/non-runtime workstreams, including the ticket transcript corpus
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

- `audits/2026-08-17-full-codebase-audit.md` — exhaustive active-code/test/config/GitHub/dependency re-baseline (`TASK-AUDIT-001`); its slash-only `cm aura` conclusion was superseded by ADR-0005.
- `audits/2026-08-18-cm-admin-controls-order.md` — `TASK-CM-ADMIN-003` direct order/Aura/wallet implementation and verification audit.
- `audits/2026-08-18-cm-admin-sharing-discord-audit.md` — `TASK-CM-ADMIN-004` customer-safe share/Discord identity/timestamp/audit implementation audit.
- `audits/2026-08-18-cm-share-email.md` — `TASK-CM-ADMIN-005` customer-email disclosure follow-up and verification audit.
- `audits/2026-08-18-cm-admin-ui-declutter.md` — `TASK-CM-ADMIN-006` compact User/Order/Delivery/refund/adjustment/share presentation audit.

## Durable decisions

- `decisions/ADR-0001-standalone-bot-boundary.md`
- `decisions/ADR-0002-internal-api-data-boundary.md`
- `decisions/ADR-0003-guild-only-slash-command-policy.md` — historical, superseded by ADR-0005
- `decisions/ADR-0004-admin-mutation-security-model.md` — historical high-impact model; channel requirement superseded by ADR-0006 and dedicated Aura/wallet preview-endpoint requirement superseded by ADR-0007
- `decisions/ADR-0005-customer-message-admin-slash-command-policy.md` — current customer/admin command-surface split
- `decisions/ADR-0006-admin-console-guild-wide-channel-policy.md` — current `/cm` exact-guild/explicit-user authorization policy
- `decisions/ADR-0007-admin-balance-adjustment-confirmation-model.md` — current Aura/wallet confirmation, fresh-state binding, idempotency and audit model
- `decisions/ADR-0008-admin-panel-customer-safe-sharing.md` — base customer-safe public-copy/control boundary and Discord lookup/time/audit presentation policy
- `decisions/ADR-0009-customer-email-in-shared-panels.md` — supersedes ADR-0008 only for the previous full-email prohibition; shared customer identity now includes the canonical account email
- `decisions/ADR-0010-ticket-transcript-data-repository-boundary.md` — keeps the parallel `CM-Ticket-Transcripts` repository private, data-only and independent from the production bot runtime

## Specialist references

- `security/ADMIN_MUTATION_MODEL.md` — Aura/wallet/refund mutation security model
- `security/CM_ADMIN_CONSOLE_SECURITY.md` — current `/cm` authorization/session/share/user/order/refund/balance-control security model
- `legacy-parity.md` — frozen behavioral/history audit for the pre-rebuild bot

## Rule

Current source code and verified external state override stale chat memory. Later accepted ADRs supersede conflicting earlier ADRs. Historical audits describe their point-in-time conclusion and may be superseded. External backend facts are dependency context, never permission for the bot to bypass the website Internal Integrations API.

Adjacent side projects remain outside the production bot runtime unless an explicit later architecture decision says otherwise. In particular, `CM-Ticket-Transcripts` is a private data corpus, not an executable bot/tool repository.
