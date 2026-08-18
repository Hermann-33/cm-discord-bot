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

`COMPLETE` for implementation and executable verification. Merge is permitted once the final documentation head revalidates successfully in GitHub Actions.

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

## Executable verification

GitHub Actions run `32145501289` executed on Node `22.23.2` and passed the implementation head:

```text
npm ci: PASS — 31 packages installed, 32 audited, 0 vulnerabilities
npm test: PASS — 128/128, 0 failed, 0 skipped, 0 cancelled
npm run typecheck: PASS
npm run build: PASS
git diff --check: PASS
```

Relevant new disclosure tests passed for user, recent-orders, direct-order and refund-preview shares. Existing Share authorization/session ownership, architecture/no-direct-DB, API-surface, mutation, registration and legacy-isolation tests also remained green.

## Final static review

PR scope is limited to:

- `src/commands/cmShare.ts`;
- `tests/commands/cmShare.test.ts`;
- ADR-0009 and task/context/security documentation.

No API client/signing, authorization, mutation, configuration, registration or `legacy/` source file changes are present. The source diff changes only customer identity rendering to add the explicitly authorized escaped email.

The final documentation-only head must still pass the same GitHub Actions workflow before merge; no additional source behavior is being introduced by those finalization commits.
