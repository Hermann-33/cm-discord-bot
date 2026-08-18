# TASK-CM-ADMIN-005 Audit — Customer Email in Shared Panels

Date: 2026-08-18

Repository: `Hermann-33/cm-discord-bot`

Base at task start:

```text
master
7a41dbeefae167044091b0aaed8372c3b58acdd0
```

Feature branch:

```text
task/cm-share-email
```

PR:

```text
#3 — TASK-CM-ADMIN-005: include customer email in shared panels
```

## Verdict

`PARTIAL` pending final executable CI verification.

## Product request

The private order/user panels already show the customer account email. The product owner explicitly requested that Share to Chat include the same customer email so the channel-visible read-only summary can identify the account without staff manually retyping it.

## Governance conflict and resolution

ADR-0008 previously prohibited the full account email in customer-safe shared output. The current request therefore changes an accepted disclosure policy rather than correcting an implementation defect.

ADR-0009 was added before the source change. It supersedes ADR-0008 only for that full-email prohibition. The rest of ADR-0008 remains authoritative.

## Implemented behavior

`src/commands/cmShare.ts` now builds one customer identity block from the canonical authorized session:

```text
Email: <session.overview.identity.email>
Discord: <linked user or Not linked>
```

The email is passed through `escapeDiscordText(..., 320)` before rendering.

The same identity block is used consistently in shareable:

- User Operations/account summary;
- recent Order History;
- direct Order details;
- Fulfillment diagnostics;
- Refund preview/success;
- Aura adjustment preview/success;
- Wallet adjustment preview/success.

## Security boundary retained

The customer account email is now an intentional public-share field. The following remain excluded from channel-visible copies:

- internal CM user UUID;
- internal purchase option IDs;
- backend audit IDs;
- transaction IDs;
- idempotency keys;
- internal provider/failure codes;
- admin refund/adjustment reasons;
- HMAC/API/credential material;
- private session/navigation identifiers.

Shared payloads remain separately rendered Components V2 output with no customer-operable buttons/selects/modals/custom IDs. The Share action still requires exact guild, explicit `BOT_ADMIN_USER_IDS` membership and original operator-owned session. `safeAllowedMentions` remains applied.

No API, website, Supabase/Postgres, mutation, refund, Aura/wallet business logic, manual-fulfillment or slash-command registration behavior changes in this task.

## Tests

`tests/commands/cmShare.test.ts` was updated so customer email is now a required field rather than a prohibited field. Tests additionally require:

- Discord-escaped email rendering;
- raw unescaped email not directly interpolated;
- internal user UUID still absent;
- provider and option IDs still absent from order share;
- admin refund reason still absent;
- no public `custom_id` controls;
- Share to Chat still uses `safeAllowedMentions`.

A recent-orders share test was added to cover the shared identity block outside the direct order panel.

## Required final gate

Before merge, GitHub Actions must pass:

```text
npm ci
npm test
npm run typecheck
npm run build
git diff --check
```

Final review must also confirm no unrelated API/auth/mutation/legacy/config changes.
