# Active Context

Updated: 2026-08-18

## Mainline lineage

TASK-CM-ADMIN-004 was verified and merged into `master` at:

```text
7a41dbeefae167044091b0aaed8372c3b58acdd0
```

That release contains customer `cm aura`, `/refresh-leaderboard`, private `/cm user` by email/Discord user, direct `/cm order`, order/fulfillment navigation, canonical refund, confirmed Aura/wallet adjustment, Share to Chat, Discord timestamps and concise Components V2 mutation audit.

The bot remains a standalone Node.js/TypeScript process with no direct Supabase/Postgres client, credential, RPC fallback or database mutation path.

## Current disclosure policy — ADR-0009

TASK-CM-ADMIN-005 changes one field in the Share to Chat disclosure policy: the canonical customer account email is now intentionally included in customer-visible shared panels.

ADR-0009 supersedes ADR-0008 **only** where ADR-0008 prohibited the full account email. The rest of ADR-0008 remains authoritative.

Shareable User/Orders/Order/Fulfillment/Refund/Aura/Wallet views use the same customer identity block:

```text
Email: <canonical CM account email>
Discord: <linked Discord user or Not linked>
```

The email comes from `session.overview.identity.email` and is rendered through Discord-safe text escaping.

## Shared `/cm` authorization

ADR-0006 remains authoritative:

1. guild interaction;
2. exact `DISCORD_GUILD_ID`;
3. non-empty `BOT_ADMIN_USER_IDS`;
4. invoking Discord user explicitly allowlisted;
5. every slash/button/modal reauthorizes;
6. operator-bound session required for components/modals;
7. no `/cm` command-channel restriction.

The Share to Chat button passes through this same authorization/session gate. `/refresh-leaderboard` remains separate and retains its configured command-channel + Discord permission checks.

## Customer-share boundary

The public message is rendered by `src/commands/cmShare.ts`; it is never a clone of the private admin component tree.

The shared message may show canonical customer account email, linked Discord identity, customer-relevant account/wallet/Aura state, public order/refund/fulfillment information and Discord-formatted timestamps.

It must continue to omit internal CM user UUID, internal purchase option IDs, backend audit/transaction/idempotency identifiers, internal provider/failure codes, admin refund/adjustment reasons, session/custom IDs, interactive controls and HMAC/API/credential material.

It contains display components only and `safeAllowedMentions`. Sharing performs no API mutation or database operation.

## Mutation/API invariants

Aura/wallet retain ADR-0007 fresh-overview -> private confirmation -> fresh balance equality -> website execute -> audit. Refund retains canonical preview -> confirmation -> fresh exact re-preview -> execute. Manual fulfillment remains blocked.

TASK-CM-ADMIN-005 adds no API operation. Current bot API surface remains:

```text
aura.leaderboards.read
aura.lookup.read
users.overview.read
orders.details.read
orders.fulfillment.read
orders.refund.preview
orders.refund.execute
users.aura.adjust
users.wallet.adjust
```

## TASK-CM-ADMIN-005 verification

GitHub Actions run `32145501289` passed on Node `22.23.2`:

```text
npm ci: PASS, 0 vulnerabilities
npm test: PASS — 128/128
npm run typecheck: PASS
npm run build: PASS
git diff --check: PASS
```

Static review confirms the task changes only the customer-share renderer, focused tests, ADR-0009 and aligned documentation. No API/auth/mutation/config/registration/legacy source changes are present.

PR #3 is authorized for direct merge after the final documentation head revalidates successfully in GitHub Actions.

This change does **not** alter the slash-command definition, so once merged/deployed it does not require `npm run register:commands` solely for the email-sharing change.
