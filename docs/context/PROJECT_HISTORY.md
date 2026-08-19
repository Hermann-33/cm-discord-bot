# Project History

Updated: 2026-08-19

This file preserves important chronology without making historical architecture authoritative over current source/ADRs.

## 2026-05-29 — Initial standalone bot

The standalone Discord bot began with leaderboard, `cm aura` and `/refresh-leaderboard`, initially using narrow Supabase RPC access.

## 2026-05-29/30 — Presentation/hosting evolution

Leaderboard moved toward Components V2; `cm aura` became configured-guild-wide except one blocked channel. A root `index.js` host shim was added for hosts that execute the package entry directly. Repository published as `Hermann-33/cm-discord-bot`.

## 2026-08-10/11 — Internal API rebuild and legacy freeze

Commit `6dfe75f` froze old implementation under `legacy/`. Commit `d7a7f4e` rebuilt active production code around the signed website Internal Integrations API:

```text
old active model: bot -> Supabase RPC
current model: bot -> HMAC Internal Integrations API -> website-owned data/business layer
```

Active bot no longer carries Supabase/Postgres credentials.

## 2026-08-17 — Governance/security direction

Repository-resident context/workflow/audits/ADRs were installed. ADR-0005 clarified that `cm aura` intentionally remains a customer message command while staff/admin operations use slash/components/modals.

## 2026-08-17 — Private admin console and guild-wide `/cm`

TASK-CM-ADMIN-001 implemented `/cm user`, private Components V2 navigation and canonical refund. ADR-0006/TASK-CM-ADMIN-002 removed the shared `/cm` command-channel restriction while retaining exact configured guild + explicit `BOT_ADMIN_USER_IDS` + per-interaction authorization/session ownership.

## 2026-08-18 — Direct order + balance controls merged

TASK-CM-ADMIN-003 added `/cm order`, confirmed Aura/wallet adjustment and ADR-0007 fresh-state-bound confirmation while retaining canonical refund and blocked manual fulfillment. PR #1 merged at `4b10d74aa80d3fa5c5e5a27b82e4ccf109a880a8` after 113/113 tests plus typecheck/build/security gates.

## 2026-08-18 — Share to Chat / Discord UX merged

TASK-CM-ADMIN-004 added `/cm user` by email or selected Discord user, linked Discord identity presentation, separate customer-safe Share to Chat rendering, Discord timestamps, concise mutation audits and ADR-0008. PR #2 merged at `7a41dbeefae167044091b0aaed8372c3b58acdd0` after 127/127 tests plus typecheck/build/diff.

## 2026-08-18 — Customer email intentionally added to shared panels

TASK-CM-ADMIN-005 / ADR-0009 changed one disclosure decision: canonical customer account email is intentionally included in Share to Chat customer identity sections. All other no-control/internal-field exclusions remain. PR #3 merged at `9466d6f23a6c2027b0e88c32eb4e78ddeeeb61fd` after 128/128 tests and full verification.

## 2026-08-18 — Admin UI declutter merged

TASK-CM-ADMIN-006 compacted User Operations, recent orders, Order Operations, Delivery Details, mutation result/preview panels and customer shares without changing API/auth/mutation behavior. PR #4 merged at `6cef7695a09c8761d395f5d530bc79b7532c9b9f` after 131/131 tests, typecheck, build and diff check.

## 2026-08-19 — Ticket transcript corpus side project established

ADR-0010 established `Hermann-33/CM-Ticket-Transcripts` as a private data-only repository. Exporter code lives outside the corpus repo under `tools/ticket-transcript-exporter/` in the bot repository and remains a non-production utility. The production bot has no runtime dependency on transcript data.

Phase T1 tooling enumerates the real Discord ticket-log history, accepts only exact `View Transcript` link buttons, restricts Tickety URLs, writes raw/text/normalized records plus manifests and requires a real five-ticket validation sample before bulk export.

## 2026-08-19 — Pending purchase lookup and fulfillment support implemented

Website-side order support evolved in two relevant ways:

1. `orders.fulfillment.read` gained an optional privileged support object with human-readable type/duration, bounded masked fulfillment material and manual-required state;
2. existing `purchase-intents.lookup.read` provides the correct read boundary for checkout references that have not yet produced a canonical order.

TASK-CM-ADMIN-007 / ADR-0011 completed the bot side on PR #5.

### Pending-order fix

Previous behavior:

```text
/cm order -> orders.details.read -> NOT_FOUND
```

for a legitimate pending checkout.

New behavior:

```text
/cm order
 -> orders.details.read
 -> only on stable NOT_FOUND: purchase-intents.lookup.read
 -> exact owner overview equality
 -> Pending Purchase panel
 -> Refresh Purchase
 -> canonical Order panel once order exists
```

Other backend errors never trigger fallback. Pending state remains read-only and has no Refund/Delivery Details/purchase-processing/manual-fulfillment controls.

### Fulfillment support

Private canonical order/delivery views can display optional human-readable type, finite duration, useful provider context, masked license/account material and canonical manual-required state. Raw/decrypted material is outside the bot schema. Optional support failure does not block a valid canonical order and absence of support is not interpreted as manual fulfillment.

Share to Chat gained a customer-safe pending-purchase renderer but explicitly excludes purchase-intent/internal option IDs, provider/provider status and masked fulfillment support material.

### Verification

Feature implementation head `8e1c1ff839fdf171403219f0b881c82395d17007` passed GitHub Actions run `32254272306` as a PR merge-ref against concurrent mainline `087e2d431ff3ddb74e034b9d736c64f1b914abc9`:

```text
Node 22.23.2
npm ci: PASS — 0 vulnerabilities
npm test: PASS — 153/153
npm run typecheck: PASS
npm run build: PASS
git diff --check: PASS
```

The operation allowlist adds only `purchase-intents.lookup.read`. `purchase-intents.process`, manual fulfillment and direct DB remain forbidden. Slash-command JSON is unchanged, so command registration does not need to be rerun for this feature.

At documentation time PR #5 remains unmerged/undeployed; website runtime client permission for `purchase-intents.lookup.read` is a separate rollout requirement.
