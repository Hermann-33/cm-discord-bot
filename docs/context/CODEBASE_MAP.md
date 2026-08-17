# Codebase Map

Updated: 2026-08-17

This map distinguishes production `master` from the `TASK-CM-ADMIN-001` candidate on `task/cm-admin-console`. The candidate is not registered/deployed.

## Existing production areas preserved

- `src/commands/aura.ts` — intentional customer `cm aura` message command under ADR-0005; unchanged by TASK-CM-ADMIN-001.
- `src/commands/refreshLeaderboard.ts` — existing `/refresh-leaderboard`; behavior preserved.
- `src/discord/client.ts` — existing `Guilds`, `GuildMessages`, `MessageContent` intents remain because `cm aura` still exists.
- leaderboard/scheduler/shutdown modules — no functional change in this task.
- `legacy/` — frozen and untouched.

## Candidate files changed/added by TASK-CM-ADMIN-001

### `src/index.ts`

Composition root now constructs `CmAdminController`. Admin controller handles `/cm` and its buttons/modals before existing refresh dispatch. Customer message routing remains unchanged.

### `src/api/client.ts`

Extends the signed transport with typed user/order/refund methods while preserving the existing HMAC boundary, timeout, response-size cap, status validation and one transport/503 retry.

Critical mutation invariant: validated raw JSON is serialized once outside the retry loop so the exact refund execute body/idempotency key remain stable while timestamp/nonce/signature are regenerated for each HTTP attempt.

Candidate endpoint list is restricted to seven approved paths: the two existing Aura reads plus user overview, order details, fulfillment diagnostics, refund preview and refund execute.

### `src/api/schemas.ts`

Contains strict mirrored request/response DTOs for candidate user/order/refund operations. Schemas were verified against website source commit `20f6cb52344bade858099febcec2d1c59312f2e5`.

### `src/config/env.ts`

Adds optional parsing for:

- `BOT_ADMIN_USER_IDS` — comma-separated strict Snowflakes, no duplicates, max 100;
- `BOT_ADMIN_COMMAND_CHANNEL_ID`;
- `BOT_AUDIT_LOG_CHANNEL_ID`.

Admin console itself fails closed if required admin values are absent.

### `src/discord/adminAuthorization.ts`

Reusable `/cm` guard: guild -> exact guild -> admin config -> exact admin channel -> explicit user-ID whitelist.

### `src/discord/adminAudit.ts`

Posts sanitized refund audit output with mentions disabled. Does not include email, HMAC material, raw authenticated request body or fulfillment secrets.

### `src/discord/registerCommands.ts`

Guild registration definition now contains `/refresh-leaderboard` and `/cm`. Registration was not run in TASK-CM-ADMIN-001.

### `src/commands/cm.ts`

Defines `/cm user email:<email>` and central routing for chat-input/button/modal interactions. Re-authorizes every interaction and delegates user/order/refund work to focused modules.

Aura/wallet/manual-fulfillment buttons are intentionally blocked and make no corresponding execute request.

### `src/commands/cmSessions.ts`

Operator-bound in-memory navigation sessions with random IDs, 15-minute inactivity TTL and bounded session count. Refund proposal freezes canonical preview, reason, stable Discord operator ID context, idempotency key and expiry.

### `src/commands/cmSupport.ts`

Safe error presentation, session helper, preview fingerprint and bounded component-index parsing.

### `src/commands/cmUserActions.ts`

User refresh, order open/refresh and fulfillment diagnostic actions. Checks user/order target consistency before presenting returned data.

### `src/commands/cmRefund.ts`

Refund modal/preview/confirmation/execute state machine. Requires a canonical fresh re-preview before execute and uses a stable logical mutation body/idempotency key across retry.

### `src/commands/cmUi.ts`

Builds Components V2 panels for:

- user operations;
- recent orders (five/page, max ten from API);
- order detail;
- fulfillment diagnostics;
- refund preview/success;
- blocked/unavailable and error notices.

Output sanitizes markdown/mentions and uses existing safe allowed-mention policy.

## Candidate tests

Added:

- `tests/api/admin-client.test.ts` — exact paths/body plus refund retry body/idempotency stability;
- `tests/config/admin-env.test.ts` — admin config parsing/fail-closed input validation;
- `tests/discord/adminAuthorization.test.ts` — DM/guild/channel/whitelist/config failures;
- `tests/commands/cmSessions.test.ts` — operator binding/expiry;
- `tests/commands/cm.test.ts` — `/cm` shape, unauthorized zero-backend-call, ephemeral Components V2 behavior.

Updated:

- `tests/architecture.test.ts` — only approved paths; no direct DB; no Aura/wallet/purchase-process execute path; explicit admin whitelist requirement;
- `tests/discord/registerCommands.test.ts` — legacy refresh fixture preserved and `/cm` definition present.

`package.json` test script includes all candidate tests.

## CI candidate

`.github/workflows/ci.yml` was added to execute Node 22 install/test/typecheck/build/diff-check. First run was blocked before runner startup by GitHub account billing/spending status, not by a code test result.

## External ownership / blocked gaps

This repository still does not own:

- website route implementation or operation allowlists;
- Supabase migrations/RLS/grants;
- older-user-order pagination beyond the current max-10 overview DTO;
- a manual-fulfillment mutation API;
- an ADR-0004-compatible Aura/wallet confirmation contract.

Do not add direct DB or ad-hoc business logic in the bot to compensate for those gaps.
