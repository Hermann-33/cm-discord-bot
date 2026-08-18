# Latest Handoff

Updated: 2026-08-18

## Authority

- ADR-0005 — `cm aura` customer message command; admin/staff slash/components/modals.
- ADR-0006 — `/cm` exact configured guild + non-empty explicit `BOT_ADMIN_USER_IDS`; no `/cm` channel restriction.
- ADR-0007 — Aura/wallet five-minute fresh-state-bound confirmation + stable idempotency/audit.
- ADR-0008 — customer-safe Share to Chat rendering and current Discord identity/time/audit presentation policy.
- `BOT_AUDIT_LOG_CHANNEL_ID` required before refund/Aura/wallet execute.
- no direct Supabase/Postgres.
- manual fulfillment blocked until website owns a dedicated mutation.

## Mainline baseline

```text
master
4b10d74aa80d3fa5c5e5a27b82e4ccf109a880a8
```

This is the verified/merged TASK-CM-ADMIN-003 result: `/cm order`, Aura adjustment and wallet adjustment are on mainline.

## Current task

```text
TASK-CM-ADMIN-004
task/cm-share-discord-audit-time
PR #2 — draft
```

Requested scope:

- share current meaningful `/cm` panel into the channel for customer communication, with no customer controls;
- reduce Discord audit noise and make it visually consistent with User Operations;
- show Discord link state/user in User Operations;
- support `/cm user` lookup by Discord user as well as email;
- use Discord absolute + relative timestamps throughout `/cm` management views;
- thorough bug/security audit;
- direct merge only if technical verification is clean, while skipping a separate Codex/local test run.

## Implemented feature-branch behavior

### `/cm user`

Exactly one input:

```text
email:<exact account email>
```

or:

```text
discord_user:<selected Discord user>
```

Both/neither fail before backend access. Discord selection maps to existing `users.overview.read` `external_identity/provider=discord`; website source already supports it.

User Operations shows Linked/Not linked plus linked Discord user/username/display name/link time when returned.

### Share to Chat

Normal User/Orders/Order/Fulfillment/Refund/Adjustment panels include `cm:share:current:<session>`.

Button handling still performs shared `/cm` authorization and operator-bound session lookup before the share path runs.

`src/commands/cmShare.ts` renders a separate customer-safe Components V2 view. It is never a copy of the private admin component tree. Public output contains no action components/custom IDs and omits email, CM user UUID, backend audit/transaction/idempotency IDs, internal provider/failure details and admin refund/adjustment reasons. `safeAllowedMentions` disables notifications.

System/error notices without a defined safe view intentionally do not expose a share control.

### Time presentation

`src/discord/presentation.ts` renders:

```text
<t:unix:f> · <t:unix:R>
```

across `/cm`, linked Discord state, shared summaries and audit completion times.

### Audit

Refund/Aura/wallet audit channel output is now a concise Components V2 panel containing useful customer identity, result/change, reason, operator and completion time. A replay note appears only on actual idempotent replay. Backend immutable audit remains authoritative.

### Mutation/security invariants

No change to refund re-preview equality, Aura/wallet fresh-balance confirmation, stable idempotency, audit-channel prerequisite, backend API authorization or no-direct-DB boundary. Manual fulfillment remains blocked.

## Source added/changed

New:

```text
src/discord/presentation.ts
src/commands/cmShare.ts
tests/commands/cmShare.test.ts
tests/commands/cmUi.test.ts
tests/discord/adminAudit.test.ts
docs/decisions/ADR-0008-admin-panel-customer-safe-sharing.md
docs/audits/2026-08-18-cm-admin-sharing-discord-audit.md
```

Key modified:

```text
src/commands/cm.ts
src/commands/cmSessions.ts
src/commands/cmUi.ts
src/commands/cmUserActions.ts
src/commands/cmRefund.ts
src/commands/cmAdjustments.ts
src/discord/adminAudit.ts
package.json
```

Tests/docs are updated alongside the feature.

## Verification state

The PR exists specifically to obtain the executable gate without another Codex/local run.

Current PR CI run:

```text
run 32138604602
job verify: failure
steps: null
logs: null
```

The job failed before executing source checkout/tests, matching the previously documented GitHub Actions account/billing/spending-limit problem. This is not a test failure and not a pass.

Per AGENTS/WORKFLOW, do not merge or claim COMPLETE until an executable Node 22+ environment actually passes:

```text
npm ci
npm test
npm run typecheck
npm run build
git diff --check
git status --short --untracked-files=all
```

## Exact next action

1. complete final static PR diff/security/secret/control-disclosure review;
2. obtain an executable verification pass without changing scope;
3. if it passes, update PR evidence, mark ready and direct-merge PR #2;
4. after merge, deploy/restart and run `npm run register:commands` only as a separately authorized operational action because `/cm user` registration changed;
5. do not perform live refund/Aura/wallet mutations as repository verification.
