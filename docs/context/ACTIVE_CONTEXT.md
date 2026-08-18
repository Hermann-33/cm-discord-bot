# Active Context

Updated: 2026-08-18

## Mainline lineage

TASK-CM-ADMIN-004 was verified and merged into `master` at:

```text
7a41dbeefae167044091b0aaed8372c3b58acdd0
```

That release contains:

- customer `cm aura`;
- `/refresh-leaderboard`;
- private `/cm user` by exact email or linked Discord user;
- direct `/cm order`;
- order/fulfillment navigation;
- canonical refund;
- confirmed Aura adjustment;
- confirmed wallet adjustment;
- customer-safe Share to Chat;
- Discord absolute + relative timestamps;
- concise Components V2 mutation audit;
- ADR-0006 guild-wide `/cm` authorization;
- ADR-0007 balance-adjustment confirmation model;
- ADR-0008 separate customer-safe sharing model.

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

The Share to Chat button passes through this same authorization/session gate. Ephemeral output is confidentiality, not authorization.

`/refresh-leaderboard` remains separate and retains its configured command-channel + Discord permission checks.

## Customer-safe sharing boundary

The public message is rendered by `src/commands/cmShare.ts`; it is never a clone of the private admin component tree.

The shared message may show:

- canonical customer account email;
- linked Discord identity;
- customer-relevant account/wallet/Aura state;
- public order/refund/fulfillment information;
- Discord-formatted timestamps.

It must continue to omit:

- internal CM user UUID;
- internal purchase option IDs;
- backend audit/transaction/idempotency identifiers;
- internal provider/failure codes;
- admin refund/adjustment reasons;
- session/custom IDs or interactive controls;
- HMAC/API/credential material.

It contains display components only and `safeAllowedMentions`. Sharing itself performs no API mutation or database operation.

## Time presentation

User/menu/share/audit timestamps use:

```text
<t:unix:f> · <t:unix:R>
```

so Discord renders a locale-aware absolute date/time plus relative age.

## Mutation invariants retained

Aura/wallet retain ADR-0007:

```text
fresh overview
  -> private current/change/projected confirmation
  -> Confirm <= 5 minutes
  -> fresh relevant-balance equality
  -> website execute operation
  -> backend audit + Discord audit
```

Refund retains:

```text
orders.refund.preview
  -> explicit confirmation
  -> fresh exact re-preview
  -> orders.refund.execute
```

Manual fulfillment remains blocked/informational because the API still exposes diagnostics only.

## Bot API surface

TASK-CM-ADMIN-005 adds no API operation:

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

## Verification and rollout

TASK-CM-ADMIN-005 must pass the normal GitHub Actions Node 22 gate before merge. Final evidence belongs in `docs/audits/2026-08-18-cm-share-email.md` and PR #3.

This change does **not** alter the slash-command definition, so once merged/deployed it does not require `npm run register:commands` solely for the email-sharing change.
