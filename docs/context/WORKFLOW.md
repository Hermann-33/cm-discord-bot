# Repository Workflow

Updated: 2026-08-17

This workflow adapts the repository-resident governance model supplied for this project. The repository, not chat history, is the long-lived source of truth.

## Authority order

1. accepted ADRs, with later superseding ADRs taking precedence;
2. `ACTIVE_CONTEXT.md`;
3. `ARCHITECTURE.md`;
4. verified `DATA_STATUS.md`;
5. `PROJECT_BRIEF.md`;
6. `CODEBASE_MAP.md` and `COMMANDS.md`;
7. `ROADMAP.md`;
8. current task instruction;
9. chat/old handover memory.

Conflicts must be surfaced before edits.

## Task lifecycle

### 1. Read context

Read `AGENTS.md`, mandatory context, relevant ADRs, and relevant specialist docs.

### 2. Inspect current Git/source state

At minimum:

```powershell
git status --short --untracked-files=all
git diff --stat
git diff --check
```

Inspect the actual source involved. Do not rely on stale transcripts.

### 3. Detect conflicts and define scope

State:

- task ID/objective;
- current architecture that constrains it;
- allowed files;
- protected/non-goal files;
- user-facing acceptance criteria;
- security/data expectations;
- required checks;
- required documentation updates.

### 4. Implement the smallest coherent change

Do not mix unrelated cleanup, dependency upgrades, archived-code changes, or cross-repo work into a focused task.

### 5. Verify

Run focused tests first, then applicable baseline checks:

```powershell
npm test
npm run typecheck
npm run build
git diff --check
```

Run static boundary scans when the task touches auth, API transport, secrets, commands, mutation logic, or archived code.

Do not call production, register Discord commands, run a live bot, or mutate external state unless the task explicitly authorizes it.

### 6. Audit

Compare implementation against:

- task acceptance criteria;
- current ADRs;
- API/data boundary;
- guild/user authorization ordering and any command-specific location checks;
- secret/logging policy;
- tests and failure behavior;
- protected areas.

Use verdicts:

- `COMPLETE` — all applicable gates passed and documentation/Git obligations are satisfied.
- `PARTIAL` — valid work exists but at least one required gate remains.
- `FAIL` — architecture/security violation, required check failure, or unsafe/unreconcilable change.

### 7. Update repository context

Update the canonical owner of any fact that changed. Do not duplicate competing truths.

Typical update matrix:

| Event | Documents |
| --- | --- |
| small material behavior change | `ACTIVE_CONTEXT`, `HANDOFF` |
| material audit/security finding | `AUDIT_LOG`, `ACTIVE_CONTEXT`, `HANDOFF` |
| command contract change | `COMMANDS`, architecture/ADR if durable |
| module/file ownership change | `CODEBASE_MAP` |
| API/data boundary change | `DATA_STATUS`, `ARCHITECTURE`, ADR |
| product scope change | `PROJECT_BRIEF`, `ROADMAP`, ADR |
| phase complete | `ROADMAP`, `ACTIVE_CONTEXT`, `HANDOFF`, material audit entry |
| workflow/authority change | `AGENTS.md`, `WORKFLOW.md`, ADR if durable |

### 8. Git sync

When the task authorizes commit/push:

1. inspect status and diff;
2. stage only relevant files;
3. ensure `.env`, generated output, logs, ZIPs, and unrelated files are excluded;
4. commit with a task-scoped message;
5. push the intended branch;
6. record the commit/PR in handoff when known.

## ADR triggers

Create a new ADR before durable changes to:

- system architecture or data ownership;
- Internal Integrations API trust/auth boundary;
- authentication/authorization;
- command exposure model;
- database/mutation strategy;
- secret/credential model;
- deployment/runtime model;
- workflow/authority hierarchy.

Do not rewrite an accepted ADR to conceal history. Create a superseding ADR.

## Mutation-specific gate

ADR-0006 supersedes ADR-0004's mandatory admin-command-channel requirement. No Aura/wallet admin command may execute a mutation until:

- slash-only/guild-only admin command policy is implemented;
- explicit `BOT_ADMIN_USER_IDS` whitelist exists and is checked on every relevant interaction;
- DMs/wrong guilds fail closed;
- dedicated audit channel exists for sanitized Discord mutation records;
- dedicated mutation backend operation exists;
- accepted preview/confirm or equivalent confirmation-state contract exists;
- idempotency and caps exist;
- immutable backend audit exists;
- tests cover unauthorized/stale/duplicate/failure cases.

A shared `/cm` admin command may be invoked from any channel in the configured guild by a whitelisted operator. Command-specific operational surfaces such as `/refresh-leaderboard` may still retain their own configured channel checks.

See ADR-0004, ADR-0006 and `../security/ADMIN_MUTATION_MODEL.md`.

## Completion report format

Every substantial implementation report should include:

- verdict;
- files changed;
- behavior before/after;
- security/data-boundary impact;
- tests/checks and exact failures if any;
- unrelated dirty files left untouched;
- documentation/ADR updates;
- exact next action.
