# TASK-CM-ADMIN-004 Implementation Audit — 2026-08-18

Repository: `Hermann-33/cm-discord-bot`

Base before merge:

```text
master
4b10d74aa80d3fa5c5e5a27b82e4ccf109a880a8
```

Feature branch:

```text
task/cm-share-discord-audit-time
```

PR:

```text
#2 — TASK-CM-ADMIN-004: customer-safe sharing and Discord UX
```

## Verdict

`COMPLETE`

The requested implementation, focused tests, static security review and executable GitHub Actions gate all passed on the feature branch. The repository can be merged under the product owner's existing authorization without a separate Codex/local verification run.

## Authorized scope

- add a Share to Chat action across meaningful `/cm` operational panels;
- public copy must be customer-safe and contain no control surface;
- reduce Discord audit noise and use a polished Components V2 layout;
- show Discord link state/identity in User Operations;
- allow `/cm user` lookup by exact email or selected Discord user;
- render `/cm` times as Discord absolute + relative timestamps;
- preserve existing mutation/authorization/manual-fulfillment boundaries.

## External contract verification

Cheater's Market website source was inspected read-only before implementation.

Verified current website schema facts:

- `userLookupSelectorSchema` accepts `user_id`, `email`, and `external_identity`;
- `external_identity` carries provider + external user ID;
- `users.overview.read` uses that selector;
- user overview already returns `identity.externalIdentities` with provider, external user ID, username, display name, and linked timestamp.

Therefore this feature requires no website route, permission, environment, Supabase or database change. It reuses the already-approved `users.overview.read` operation.

## Customer-safe sharing model

ADR-0008 records the disclosure boundary.

Private `/cm` panels may include a Share to Chat button. Share execution still passes through:

```text
exact configured guild
+ non-empty BOT_ADMIN_USER_IDS
+ invoking user allowlist membership
+ operator-bound session ownership
```

The public message is rebuilt by `src/commands/cmShare.ts`; it is never a clone of the private admin payload.

Public rendering intentionally omits:

- full account email;
- internal CM user UUID;
- internal license/variant identifiers;
- backend audit/transaction IDs;
- idempotency keys;
- private session/custom IDs;
- internal provider/failure codes;
- admin refund/adjustment reasons;
- API/HMAC material.

Public rendering contains no action rows/buttons/selects/modals/custom IDs. `safeAllowedMentions` prevents displayed Discord identities from pinging users.

## Discord identity lookup/presentation

`/cm user` now defines two optional inputs:

```text
email
discord_user
```

Runtime requires exactly one. Discord lookup maps to:

```json
{
  "kind": "external_identity",
  "provider": "discord",
  "externalUserId": "<selected Discord user ID>"
}
```

User Operations now shows Linked/Not linked; linked accounts display the Discord user plus available username/display-name metadata and linked time.

## Timestamp model

`src/discord/presentation.ts` centralizes timestamp rendering:

```text
<t:unix:f> · <t:unix:R>
```

This is used for `/cm` account/order/wallet/Aura/fulfillment/refund/adjustment times, linked-Discord time, customer-safe shared output and Discord audit completion time.

## Audit redesign

`src/discord/adminAudit.ts` now sends Components V2 audit panels rather than noisy flat text.

Visible audit information is limited to useful operator context:

- operation type/order public reference where applicable;
- customer account/Discord identity when available;
- applied/result amount;
- reason;
- operator Discord identity;
- completion timestamp;
- replay note only when an idempotent replay actually occurred.

Backend transaction/audit identifiers are not repeated in the Discord presentation; website-owned immutable backend audit remains authoritative.

## Mutation/security regression review

No intended changes to:

- ADR-0006 `/cm` authorization;
- per-interaction reauthorization;
- session ownership/expiry;
- ADR-0007 Aura/wallet preview-confirm-fresh-state-idempotency model;
- refund canonical preview/re-preview/execute flow;
- `BOT_AUDIT_LOG_CHANNEL_ID` mutation prerequisite;
- HMAC signing/retry protocol;
- manual fulfillment (still blocked);
- website-owned accounting/business logic.

No new Internal Integrations API path was added.

## Focused test changes

Coverage added/updated for:

- `/cm user` email or Discord-user registration/runtime selection;
- both/neither lookup rejection before backend access;
- Discord link presentation;
- absolute + relative Discord timestamps;
- customer-safe share omission of email/internal UUID/provider/admin reason/internal option IDs;
- public share absence of interactive custom IDs;
- public Components V2 channel send + ephemeral admin acknowledgement;
- concise Components V2 refund/adjustment audit output;
- mention suppression;
- adjustment audit input/share-success state;
- session default share state.

## Executable verification evidence

Making the repository public allowed the standard GitHub-hosted runner to execute. The first real run exposed a TypeScript narrowing defect in `src/commands/cmShare.ts` after all 127 tests passed. The defect was corrected by narrowing `view.data` only after discriminating `view.adjustmentKind`.

Final PR-triggered CI run:

```text
run 32142352087
job verify: success
Node 22.23.2
npm ci: success, 0 vulnerabilities
npm test: 127/127 passed
npm run typecheck: success
npm run build: success
git diff --check: success
```

The successful run is the authoritative executable gate for this task.

## Final focused security review

Confirmed:

- no direct DB/Supabase client or credential added;
- no new API operation path;
- no manual-fulfillment or purchase-processing shortcut;
- no secret/HMAC material added;
- no `legacy/` modification/import;
- customer-safe output has no interactive control and omits private/internal fields defined by ADR-0008;
- authorization/mutation/audit prerequisites remain intact;
- Discord mentions remain disabled on public-share and audit output.

## Operational exclusions

Repository implementation/verification did not perform:

- bot deployment/restart;
- Discord command registration;
- live customer-safe share in production;
- production refund/Aura/wallet mutation;
- website source/environment mutation;
- production credential mutation;
- Supabase/Postgres mutation.
