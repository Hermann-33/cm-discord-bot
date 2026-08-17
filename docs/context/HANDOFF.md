# Latest Handoff

Updated: 2026-08-17

## Authoritative command policy

ADR-0005 remains authoritative over ADR-0003 where they conflict:

- `cm aura` stays a customer message command;
- staff/admin operations use configured-guild slash commands;
- high-impact mutations additionally require ADR-0004-style authorization/confirmation safety.

No direct Supabase/Postgres access is permitted.

## Production vs feature branch

Production `master` is unchanged by `TASK-CM-ADMIN-001` and remains the read-only Aura bot plus `/refresh-leaderboard`.

Feature branch:

```text
task/cm-admin-console
```

contains a candidate private admin console. It has not been merged, registered, deployed or used for a live API mutation.

## Implemented candidate

### `/cm user email:<email>`

- ephemeral/private Components V2 response;
- exact guild + admin channel + explicit Discord user-ID whitelist on every command/button/modal interaction;
- short-lived operator-bound sessions with random IDs only in component custom IDs;
- `users.overview.read` user panel;
- latest 10 recent orders paginated five per page;
- `orders.details.read` order panel;
- `orders.fulfillment.read` diagnostics;
- navigation from orders back to User Operations.

### Refund

Only implemented mutation:

```text
reason modal
-> orders.refund.preview
-> explicit private confirmation
-> fresh identical re-preview
-> orders.refund.execute
-> backend audit + sanitized Discord audit
```

The idempotency key and exact execute body remain stable across logical retries; transport signing material is fresh per HTTP attempt.

`BOT_AUDIT_LOG_CHANNEL_ID` is required before execution.

### Deliberately blocked

- Aura adjustment;
- wallet adjustment;
- manual fulfillment.

Aura/wallet are blocked by ADR-0004 confirmation requirements even though website source now confirms their request schemas accept `userLookupSelectorSchema`. Manual fulfillment is blocked because no dedicated Internal Integrations mutation operation exists.

## Backend/API dependencies

Candidate bot credential needs least-privilege permission for:

```text
users.overview.read
orders.details.read
orders.fulfillment.read
orders.refund.preview
orders.refund.execute
```

The task did not change the website/client allowlist or credentials. Until those operations are provisioned, the correct bot behavior is an operation-forbidden error.

Website source was inspected read-only at commit `20f6cb52344bade858099febcec2d1c59312f2e5` for exact user/order/refund DTOs and selectors.

## Verification state

Repository CI workflow now exists, but GitHub Actions run for the feature commit was rejected before runner startup because the account reported failed payments or insufficient spending limit. Zero job steps executed.

Therefore these are still missing as real current-head evidence:

- `npm test`;
- `npm run typecheck`;
- `npm run build`;
- CI `git diff --check`.

Local static/syntax scans found no secret values, no direct DB paths, no Aura/wallet/purchase-process execute path and no TypeScript syntax diagnostics in the drafted changed files. These do not replace dependency-aware CI.

## Exact next action

1. restore GitHub Actions billing/spending capacity or another Node 22 runner;
2. run `npm ci`, tests, typecheck, build and diff check on feature head;
3. fix every code/type failure before merge;
4. review final diff/security behavior;
5. only with explicit authorization, provision required backend operation scope and admin config;
6. register `/cm` and deploy only after those gates;
7. validate reads first;
8. use a controlled explicitly authorized order for the first refund test.

## Do-not-touch

- do not merge/deploy merely because static review passed;
- no direct DB client/RPC;
- no `cm aura` migration;
- no role-only admin authorization;
- no Aura/wallet execute path until ADR-0004 is satisfied;
- no manual fulfillment without a website-owned operation;
- no real secrets in repo/docs/logs;
- no live refund without explicit controlled-test authorization.
