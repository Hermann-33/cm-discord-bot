# Latest Handoff

Updated: 2026-08-18

## Current authority

- ADR-0005: customer `cm aura` remains a message command; admin/staff surfaces are slash/components/modals.
- ADR-0006: shared `/cm` authorization is exact configured guild + non-empty explicit `BOT_ADMIN_USER_IDS`; no `/cm` command-channel restriction.
- ADR-0007: Aura/wallet use explicit five-minute, fresh-state-bound confirmation around the website-owned idempotent adjustment operations.
- `BOT_AUDIT_LOG_CHANNEL_ID` is required before refund or balance-adjustment execution.
- direct Supabase/Postgres access remains prohibited.
- manual fulfillment remains blocked because the website has no manual-fulfillment mutation operation.

`/refresh-leaderboard` remains independent and keeps its configured command-channel and Discord permission checks.

## Mainline baseline

`master`:

```text
5baa260bb1f804c6c0e9878f2cb5be003564a915
```

This includes `TASK-CM-ADMIN-002` / ADR-0006 guild-wide `/cm` authorization.

## Current task

```text
TASK-CM-ADMIN-003
task/cm-admin-controls-order
Draft PR #1
```

Requested scope:

- enable Aura adjustment;
- enable wallet/balance adjustment;
- add `/cm order` direct order lookup;
- leave manual fulfillment unimplemented.

## Implemented feature-branch behavior

### `/cm order reference:<CM-ref-or-UUID>`

- reuses shared `/cm` authorization;
- normalizes UUID -> `order_id`, other valid CM-style input -> uppercase `public_ref`;
- fetches `orders.details.read`;
- fetches owner with `users.overview.read(user_id)`;
- requires exact user target match;
- creates an operator-bound session and opens the standard order panel;
- retains Refund, Fulfillment diagnostics, Refresh Order, User Operations and recent Order History.

### Aura adjustment

- `Adjust Aura` button is active;
- modal accepts signed whole-number delta + reason;
- backend-bound max ±1,000,000,000 Aura;
- fresh overview is fetched before preview;
- projected negative available Aura is rejected;
- proposal freezes user/delta/reason/current balance/projected balance/operator/idempotency/expiry;
- Confirm re-fetches current overview and requires exact available-Aura equality;
- executes `users.aura.adjust` only after the equality check;
- validates returned target/delta;
- requires audit channel and posts sanitized Discord audit after backend success;
- refreshes user overview best-effort.

### Wallet adjustment

- `Adjust Wallet` button is active;
- modal accepts signed decimal major-currency input with max two decimal places;
- converted exactly to integer cents;
- backend-bound max ±100,000,000 cents;
- fresh overview/current/projected/final equality checks mirror Aura;
- absent wallet preview uses 0/USD, matching verified website row preparation;
- executes `users.wallet.adjust`;
- backend owns ledger/funding-state correctness;
- result/audit/refresh handling mirrors Aura.

### Retry/idempotency

`src/api/client.ts` serializes validated mutation requests before its transport retry loop, preserving one exact logical body/idempotency key while generating fresh HMAC timestamp/nonce/signature for each attempt.

### Manual fulfillment

Still blocked/informational. Only `orders.fulfillment.read` exists. No purchase-processing or DB workaround is introduced.

## Source touched

Core additions/changes include:

```text
src/api/client.ts
src/api/schemas.ts
src/commands/cm.ts
src/commands/cmAdjustments.ts
src/commands/cmSessions.ts
src/commands/cmSupport.ts
src/commands/cmUi.ts
src/discord/adminAudit.ts
```

Tests updated/added:

```text
tests/api/admin-client.test.ts
tests/commands/cm.test.ts
tests/commands/cmAdjustments.test.ts
tests/architecture.test.ts
tests/discord/registerCommands.test.ts
```

`package.json` includes the new adjustment test in the root test command.

## Website contract evidence

Current website source was inspected read-only. Verified:

- Aura adjustment request/response schema;
- wallet adjustment request/response schema;
- `INVALID_ADJUSTMENT` and `INSUFFICIENT_BALANCE` status mapping;
- order `public_ref`/`order_id` selector support;
- wallet missing-row preparation as zero/USD;
- transactional wallet/Aura ledger + audit primitives;
- no manual-fulfillment mutation operation.

No website source, environment variable or secret was modified by this repository task.

## Verification state

Repository verification for `TASK-CM-ADMIN-003` is complete on the feature branch.

Local Node `v24.11.1` evidence:

```text
npm ci                                      passed; 0 vulnerabilities reported
npm test                                    passed; 113/113
npm run typecheck                           passed
npm run build                               passed
git diff --check                            passed
git status --short --untracked-files=all    passed; no unrelated or untracked files
```

Focused scans passed:

- no `@supabase/supabase-js` / `SUPABASE_` in active source;
- no direct integration DB primitive use;
- no `purchase-intents.process` path;
- no invented manual-fulfillment mutation;
- no secret/HMAC material in diff;
- no `legacy/` modification/import;
- no authorization or mention-safety regression.

The draft PR's historical GitHub Actions runs remain blocked before steps by account billing/spending-limit state. That infrastructure issue is not a test pass, but the required clean local executable gate has now passed.

## Exact next action

1. finalize/review the draft PR with the recorded local verification evidence;
2. merge to `master` only with explicit product-owner authorization;
3. after merge, redeploy/restart the bot and re-run `npm run register:commands` only as a separately authorized operational step because `/cm` registration changed;
4. conduct any live Aura/wallet/refund mutation test only with an explicitly chosen controlled target/action.

## Do not touch

- no direct DB/RPC/table access;
- no customer `cm aura` behavior change;
- no `/refresh-leaderboard` channel-policy change;
- no role-only `/cm` authorization;
- no manual fulfillment without a website operation;
- no production purchase processing from this bot;
- no real secrets in source/docs/logs;
- no live production mutation during repository verification.
