# Latest Handoff

Updated: 2026-08-19

## Authority

- ADR-0005 — `cm aura` customer message command; admin/staff slash/components/modals.
- ADR-0006 — `/cm` exact configured guild + non-empty explicit `BOT_ADMIN_USER_IDS`; no `/cm` channel restriction.
- ADR-0007 — Aura/wallet five-minute fresh-state-bound confirmation + stable idempotency/audit.
- ADR-0008 — separate customer-facing Share to Chat renderer, no public admin controls, Discord identity/time/audit policy.
- ADR-0009 — canonical CM account email is intentionally shared; all other ADR-0008 exclusions remain.
- ADR-0010 — `CM-Ticket-Transcripts` is a separate private data-only side project with no production-bot dependency.
- ADR-0011 — `/cm order` is canonical-order-first with `NOT_FOUND`-only pending purchase fallback; masked fulfillment support remains private staff data.
- `BOT_AUDIT_LOG_CHANNEL_ID` is required before refund/Aura/wallet execute.
- no direct Supabase/Postgres.
- manual fulfillment blocked until website owns a dedicated mutation.

## Current remote mainline observed during TASK-CM-ADMIN-007

```text
master
087e2d431ff3ddb74e034b9d736c64f1b914abc9
```

This includes TASK-CM-ADMIN-006 plus the parallel ticket transcript exporter/context changes.

## Current main-bot feature branch

```text
PR #5
task/cm-order-support-details
source implementation head: 8e1c1ff839fdf171403219f0b881c82395d17007
```

TASK-CM-ADMIN-007 is implemented and executable source verification is green. It is **not merged or deployed** yet.

## TASK-CM-ADMIN-007 behavior

### Pending order lookup fixed

```text
/cm order reference:<CM ref or UUID>
 -> orders.details.read first
 -> only on stable NOT_FOUND: purchase-intents.lookup.read
 -> exact users.overview.read(user_id) owner equality
 -> Pending Purchase panel if no canonical order yet
 -> Refresh Purchase
 -> automatic transition to Order panel when canonical order appears
```

Do not broaden fallback to authorization/service/rate errors.

Pending purchase state is read-only. Before a canonical order exists there is no Refund, Delivery Details, purchase-processing or manual-fulfillment control.

### Fulfillment support completed

Canonical order UI now consumes the website's optional `orders.fulfillment.read.support` fields:

- human-readable type;
- finite duration;
- bounded masked license/account material;
- canonical manual-required state.

The private Order Operations panel may show provider support context. `Delivery Details` remains read-only.

Support enrichment is optional/best-effort. If it fails, the canonical order still opens and existing refund/navigation controls remain usable. Missing support/masked values never imply manual fulfillment.

### Share boundary

A new Pending Purchase customer-safe renderer exists. It omits internal purchase/user IDs, internal option IDs, provider/provider status and controls.

Masked fulfillment support material and provider internals are explicitly excluded from Share to Chat.

## API permission required for rollout

The bot's exact operation set adds:

```text
purchase-intents.lookup.read
```

The website integration client used by this bot must include it in `allowedOperations` before pending lookup works in production. Endpoint existence does not grant permission.

No new bot environment variable was added.

## Command registration

TASK-CM-ADMIN-007 does not change slash-command JSON. `/cm user` and `/cm order` remain the same registered subcommands, so `npm run register:commands` is **not required** for this rollout.

## Verification evidence

GitHub Actions run:

```text
32254272306
```

checked PR #5 merge-ref against concurrent `master` `087e2d431ff3ddb74e034b9d736c64f1b914abc9` on Node `22.23.2`:

```text
npm ci: PASS — 0 vulnerabilities
npm test: PASS — 153/153
npm run typecheck: PASS
npm run build: PASS
git diff --check: PASS
```

Focused coverage proves pending lookup, NOT_FOUND-only fallback, owner equality, pending-to-order transition, optional support failure behavior, strict masked DTO/no-raw-material acceptance, no false manual inference, no pending mutation controls, no masked support/provider public leakage, unchanged command registration and no direct DB/purchase-processing/manual-fulfillment shortcut.

## Exact next main-bot action

1. verify PR #5 after the documentation/ADR/audit commit;
2. inspect current remote `master` again for concurrent changes and confirm PR mergeability;
3. update PR #5 description with final verification/rollout requirements;
4. wait for explicit user authorization before merge;
5. after merge, ensure website `cm-discord-bot` client has `purchase-intents.lookup.read`, then deploy/restart bot normally;
6. do not run real refund/Aura/wallet mutation without explicit controlled-target authorization.

## Parallel workstream — Ticket Transcript Corpus

`Hermann-33/CM-Ticket-Transcripts` remains private/data-only and independent. Its current T1 next gate remains a real five-ticket sample through the supported exporter before any `--all` run. Do not conflate that side-project rollout with PR #5 or the production bot deployment.
