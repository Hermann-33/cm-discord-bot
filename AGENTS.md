# Cheater's Market Discord Bot — Agent Rules

This repository is authoritative for the standalone Cheater's Market Discord bot. Chat history is temporary context; accepted decisions, current state, risks, evidence, and handoffs must live in this repository.

## Mandatory pre-work

Before implementation, audit, refactor, cleanup, deployment work, or workflow decisions, read:

1. `docs/README.md`
2. `docs/context/ACTIVE_CONTEXT.md`
3. `docs/context/PROJECT_BRIEF.md`
4. `docs/context/ARCHITECTURE.md`
5. `docs/context/DATA_STATUS.md`
6. `docs/context/CODEBASE_MAP.md`
7. `docs/context/COMMANDS.md`
8. `docs/context/ROADMAP.md`
9. `docs/context/WORKFLOW.md`
10. `docs/context/HANDOFF.md`
11. relevant `docs/decisions/ADR-*.md`
12. relevant specialist documents such as `docs/security/ADMIN_MUTATION_MODEL.md`

If repository context conflicts with the requested task, stop and report the conflict before changing files.

## Authority order

When sources conflict, use this order:

1. Accepted ADRs
2. `ACTIVE_CONTEXT.md`
3. `ARCHITECTURE.md`
4. verified `DATA_STATUS.md`
5. `PROJECT_BRIEF.md`
6. `CODEBASE_MAP.md` and `COMMANDS.md`
7. `ROADMAP.md`
8. current task instruction
9. chat history or old handovers

Do not silently reconcile contradictions.

## Required pre-change summary

Before modifying files, summarize:

1. current project state;
2. relevant workflow rules;
3. relevant ADRs;
4. the exact task;
5. protected and do-not-touch boundaries;
6. current Git status and unrelated dirty/untracked files.

## Hard architecture boundaries

- This repository owns only the standalone Discord bot.
- The Cheater's Market website repository is a separate system and must not be edited unless explicitly scoped in a separate task.
- Production code lives under `src/`. `legacy/` is a frozen archive and must never be imported into production code.
- The bot does not directly access Supabase or Postgres and must not gain database credentials or a direct database fallback.
- Website-owned business/data access goes through the HMAC-authenticated Internal Integrations API.
- Current production API permissions are read-only Aura operations. Mutation work requires an explicitly approved backend contract first.
- All future bot commands are governed by ADR-0003: guild-only slash commands. The current `cm aura` message command is a migration target, not the desired end state.
- Major admin/mutation commands require the whitelist and confirmation model in ADR-0004. Discord roles alone are insufficient.
- Never expose, log, commit, echo, or document real secret values.

## Protected areas

Do not casually modify:

- API signing/canonicalization in `src/api/signing.ts`;
- API client validation, response bounds, retry semantics, or credential handling;
- command authorization or mention-safety helpers;
- leaderboard bootstrap/edit semantics;
- scheduler overlap/shutdown behavior;
- `legacy/` or `docs/legacy-parity.md` history;
- root `index.js` hosting shim;
- environment validation or `.env.example` without an explicit config change.

## Completion gate

A task is `COMPLETE` only when all applicable tracks pass:

1. Discord/user-facing behavior;
2. API/service contract behavior;
3. data/persistence correctness when applicable;
4. security/authorization/secret handling;
5. tests, typecheck, build, and focused scans;
6. documentation and ADR updates;
7. Git status/diff/commit/push requirements requested by the task.

Use `PARTIAL` when implementation is valid but a required gate remains. Use `FAIL` when the task violates architecture/security, fails required checks, or cannot be reconciled safely.

## Validation baseline

Run the applicable checks before completion:

```powershell
npm test
npm run typecheck
npm run build
git diff --check
git status --short --untracked-files=all
git diff --stat
```

Do not run the bot, register Discord commands, or perform live production calls unless the task explicitly authorizes them.

## Git discipline

- Inspect status and diff before editing and before completion.
- Never stage `.env`, `dist/`, `node_modules/`, logs, ZIP archives, or unrelated local artifacts.
- Stage only task-relevant files.
- Use a task-scoped commit message when committing, for example `TASK-WF-001: ...`.
- Update context/handoff/audit documents in the same task that changes the truth they describe.
- Do not rewrite ADR history. Supersede old decisions with new ADRs.

See `docs/context/WORKFLOW.md` for the full lifecycle.