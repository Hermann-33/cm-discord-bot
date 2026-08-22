# Active Context

Updated: 2026-08-23

## Mainline baseline

Current remote `master` observed while starting the AI support integration:

```text
c8847611edbd4b8a43a6f8011bae9f069377b0d8
```

TASK-CM-ADMIN-007 is merged. Canonical support KB and planner benchmark tooling continue on feature branches; customer-facing AI support is not enabled.

## AI support integration feature state

Branch `task/ai-support-integration` prepares the ADR-0012 boundary:

- optional OpenRouter planner, disabled without `OPENROUTER_API_KEY`;
- pinned default `google/gemma-4-26b-a4b-it:free`;
- compact planner payload privacy sanitization and deterministic output validation;
- safe no-retry fallback for timeout, quota/rate limit, 5xx, provider and malformed-output failure;
- stateful support-service interfaces with pending-question answer consumption;
- an operator-controlled allowlist importer from private `runtime-kb/` to public bundled `support-runtime/`;
- no raw transcripts, evidence/provenance fields, transcript/fact IDs, customer PII, routing exemplars, or private manifests in the public pack;
- no runtime path/dependency on the private transcript repository;
- no Discord `MessageCreate` support wiring.

The next gate is a controlled 20-record OpenRouter smoke benchmark using the already-consumed development input set after the operator manually supplies the API key. No hosted request is part of repository setup/verification.

Local Node `v24.11.1` repository verification passed on 2026-08-23: `npm.cmd ci` reported 0 vulnerabilities, all 261 tests passed, typecheck/build passed, and `git diff --check` passed.

## Current mainline production behavior

- customer `cm aura` message command;
- `/refresh-leaderboard`;
- private `/cm user` by exact email or linked Discord user;
- direct `/cm order` by public reference or order UUID;
- compact user/order/delivery navigation;
- canonical refund preview/confirm/re-preview/execute;
- confirmed Aura adjustment;
- confirmed wallet adjustment;
- Share to Chat customer-safe copies;
- Discord timestamps;
- concise Components V2 mutation audit.

The bot remains a standalone Node.js/TypeScript process with no direct Supabase/Postgres client, credential, RPC fallback or database mutation path.

## TASK-CM-ADMIN-007 feature state

ADR-0011 defines the pending-purchase and fulfillment-support boundary.

### Pending `/cm order` lookup

The feature branch fixes valid pending checkout references by using:

```text
/cm order
  -> orders.details.read
  -> only on stable NOT_FOUND: purchase-intents.lookup.read
  -> exact users.overview.read(user_id) owner equality
  -> private Pending Purchase panel
  -> Refresh Purchase
  -> canonical Order panel once orderId/order becomes available
```

The fallback is intentionally **NOT_FOUND-only**. Authentication, operation-permission, validation, rate-limit and service errors are not hidden behind a second lookup.

Pending purchase state is read-only. Before a canonical order exists it exposes no Refund, Delivery Details, purchase-processing or manual-fulfillment control.

### Canonical order support details

The feature branch consumes the website's optional `orders.fulfillment.read.support` extension:

- human-readable product/account type;
- finite duration when known;
- at most 10 stored masked license/account materials;
- canonical manual-required state.

Private Order Operations may also show useful fulfillment provider context. Raw/decrypted fulfillment secrets are not accepted by the strict DTO.

Support enrichment is best-effort for the order panel. If support cannot be fetched, the canonical order remains usable. Missing support/masked material is not interpreted as manual fulfillment.

### Share to Chat

ADR-0008 + ADR-0009 remain authoritative, extended by ADR-0011.

The new Pending Purchase public copy is separately rendered and buttonless. It can include canonical customer email, linked Discord identity, public purchase reference, safe item/variant/game, amount, payment method, status and dates.

It omits:

- purchase-intent UUID;
- CM user UUID;
- internal option IDs;
- payment provider/provider status;
- admin/operator internals;
- credentials;
- interactive controls.

Masked fulfillment support material and provider internals remain **private staff data** and are never copied by Share to Chat.

## Authorization / mutation invariants

ADR-0006 remains authoritative for `/cm`: exact configured guild, non-empty explicit `BOT_ADMIN_USER_IDS`, invoking user allowlisted, per-interaction reauthorization and operator-owned sessions. `/refresh-leaderboard` retains its separate channel/permission policy.

Aura/wallet retain ADR-0007 fresh-overview -> private confirmation -> fresh relevant-balance equality -> website execute -> audit. Refund retains canonical preview -> confirmation -> fresh exact re-preview -> execute.

No manual fulfillment exists. `purchase-intents.process` is forbidden to the bot. No website, Supabase, environment or command-registration boundary is changed by TASK-CM-ADMIN-007.

## Bot API surface on TASK-CM-ADMIN-007

```text
aura.leaderboards.read
aura.lookup.read
users.overview.read
orders.details.read
orders.fulfillment.read
purchase-intents.lookup.read
orders.refund.preview
orders.refund.execute
users.aura.adjust
users.wallet.adjust
```

Deployment must explicitly add `purchase-intents.lookup.read` to the bot website integration client's `allowedOperations`; endpoint existence is not permission.

## Parallel side project — CM Ticket Transcript Corpus

ADR-0010 and `SIDE_PROJECTS.md` remain unchanged by TASK-CM-ADMIN-007.

```text
Hermann-33/CM-Ticket-Transcripts
```

The repository is private/data-only; exporter code stays under this bot repo's `tools/ticket-transcript-exporter/`; no production bot dependency exists. Main bot engineering and transcript acquisition remain independent.

## Verification evidence

TASK-CM-ADMIN-007 source implementation head:

```text
8e1c1ff839fdf171403219f0b881c82395d17007
```

GitHub Actions run `32254272306` verified the PR merge-ref against concurrent master `087e2d431ff3ddb74e034b9d736c64f1b914abc9` on Node `22.23.2`:

```text
npm ci: PASS — 0 vulnerabilities
npm test: PASS — 153/153
npm run typecheck: PASS
npm run build: PASS
git diff --check: PASS
```

No slash-command JSON changed, so TASK-CM-ADMIN-007 does not require Discord command re-registration after merge. Normal deployment/restart and the website client permission update remain operational rollout requirements.
