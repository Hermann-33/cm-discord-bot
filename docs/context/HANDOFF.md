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

## Mainline baseline before TASK-CM-ADMIN-004 merge

```text
master
4b10d74aa80d3fa5c5e5a27b82e4ccf109a880a8
```

This is the verified/merged TASK-CM-ADMIN-003 result: `/cm order`, Aura adjustment and wallet adjustment are on mainline.

## Current task

```text
TASK-CM-ADMIN-004
task/cm-share-discord-audit-time
PR #2
status: verified for merge
```

Implemented scope:

- share current meaningful `/cm` panel into the channel for customer communication, with no customer controls;
- reduce Discord audit noise and make it visually consistent with User Operations;
- show Discord link state/user in User Operations;
- support `/cm user` lookup by Discord user as well as email;
- use Discord absolute + relative timestamps throughout `/cm` management views;
- preserve mutation, authorization, data-boundary and manual-fulfillment invariants.

## Implemented behavior

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

`src/commands/cmShare.ts` renders a separate customer-safe Components V2 view. It is never a copy of the private admin component tree. Public output contains no action components/custom IDs and omits email, CM user UUID, internal option IDs, backend audit/transaction/idempotency IDs, internal provider/failure details and admin refund/adjustment reasons. `safeAllowedMentions` disables notifications.

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

## Verification state

After the repository became public, GitHub Actions could execute on the standard hosted runner. A real run exposed a TypeScript narrowing defect in `cmShare.ts`; it was fixed by narrowing the discriminated result only after checking `adjustmentKind`.

Final executable evidence:

```text
run 32142352087
Node 22.23.2
npm ci: PASS, 0 vulnerabilities
npm test: PASS — 127/127
npm run typecheck: PASS
npm run build: PASS
git diff --check: PASS
```

Focused static/security review also remains clean for direct DB/Supabase, new API operations, purchase-processing/manual-fulfillment shortcuts, secrets/HMAC material, `legacy/` changes and public-control disclosure.

Verdict: `COMPLETE` for implementation/verification; PR #2 is authorized for direct merge without another Codex/local run.

## Exact next action

1. keep final PR/audit evidence aligned with the successful CI result;
2. direct-merge PR #2;
3. after merge, deployment/restart and `npm run register:commands` remain separate operational actions because `/cm user` registration changed;
4. do not perform live refund/Aura/wallet mutations as repository verification.
