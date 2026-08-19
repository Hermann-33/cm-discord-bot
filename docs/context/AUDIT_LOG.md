# Audit Log

## 2026-05-29 — Initial bot / leaderboard evolution

Historical standalone bot and channel/presentation evolution. See `../legacy-parity.md`.

Verdict: `COMPLETE` historical record.

---

## 2026-08-11 — Internal API rebuild

Direct active bot/database coupling removed. Production source moved to HMAC Internal Integrations API; legacy frozen.

Verdict: `COMPLETE`.

---

## 2026-08-17 — TASK-WF-001 — Repository governance

Installed repository-resident context/workflow/ADRs/audit/history/handoff/security docs.

Verdict: `COMPLETE`.

---

## 2026-08-17 — TASK-AUDIT-001 — Full re-baseline

Audited active source/tests/config/GitHub/dependency state. Confirmed HMAC/DTO/timeout/retry/mention controls and no active direct DB. Identified CI, registration-config and generic redaction hardening gaps. Its slash-only `cm aura` conclusion was later superseded by ADR-0005.

Verdict: `COMPLETE` for audit; historical execution gap documented.

---

## 2026-08-17 — TASK-POLICY-001 — Customer/admin command split

ADR-0005 retained customer `cm aura` as a message command and reserved slash/components/modals for staff/admin surfaces.

Verdict: `COMPLETE`.

---

## 2026-08-17 — TASK-API-DOC-001 — Internal API contract re-baseline

Recorded full website operation catalog, HMAC retry/idempotency rules and Aura/wallet execute contracts. Endpoint existence remained separate from client authorization.

Verdict: `COMPLETE` for documentation.

---

## 2026-08-17 — TASK-CM-ADMIN-001 — Private admin console

Implemented `/cm user`, operator-bound Components V2 session, recent orders/order details/fulfillment diagnostics and canonical refund preview/confirm/re-preview/execute. Local verification passed 104/104 tests, typecheck, build and diff check before merge.

Verdict: `COMPLETE` for repository implementation/merge.

---

## 2026-08-17 — TASK-CM-ADMIN-002 — Guild-wide `/cm`

ADR-0006 removed shared `/cm` command-channel restriction while retaining exact guild + mandatory explicit `BOT_ADMIN_USER_IDS` + per-interaction authorization. `BOT_ADMIN_COMMAND_CHANNEL_ID` removed; audit channel remains separate.

Verdict: `COMPLETE` on mainline.

---

## 2026-08-18 — TASK-CM-ADMIN-003 — Direct order + Aura/wallet controls

Implemented `/cm order`, confirmed Aura adjustment and confirmed wallet adjustment while leaving manual fulfillment blocked. Added ADR-0007 for fresh-state-bound Aura/wallet confirmation.

Local Node `v24.11.1` verification passed:

```text
npm ci
npm test — 113/113
npm run typecheck
npm run build
git diff --check
clean status / focused security scans
```

PR #1 was squash-merged into `master` at:

```text
4b10d74aa80d3fa5c5e5a27b82e4ccf109a880a8
```

No live production mutation occurred during repository verification/merge.

Verdict: `COMPLETE`.

---

## 2026-08-18 — TASK-CM-ADMIN-004 — Customer-safe sharing / Discord UX

Implemented Share to Chat, Discord-user lookup/link presentation, Discord absolute+relative timestamps and concise Components V2 mutation audits under ADR-0008.

Final CI run `32142352087` passed on Node `22.23.2`:

```text
npm ci: PASS, 0 vulnerabilities
npm test: PASS — 127/127
npm run typecheck: PASS
npm run build: PASS
git diff --check: PASS
```

Focused static/security review remained clean for direct DB/Supabase access, new API operations, purchase-processing/manual-fulfillment shortcuts, secret/HMAC material, `legacy/` changes, authorization regression and public interactive-control disclosure.

No live share/refund/Aura/wallet mutation, deployment, command registration, website write or database mutation occurred during repository verification.

Merged into `master` at:

```text
7a41dbeefae167044091b0aaed8372c3b58acdd0
```

Verdict: `COMPLETE`.

---

## 2026-08-18 — TASK-CM-ADMIN-005 — Shared customer email

The product owner explicitly requested that Share to Chat include the canonical customer account email. ADR-0009 superseded ADR-0008 only for the previous full-email prohibition.

`src/commands/cmShare.ts` renders the escaped `session.overview.identity.email` across the customer identity block while preserving no-control/internal-field exclusions.

Implementation-head CI run `32145501289` passed 128/128 tests, typecheck, build and diff check. Final documentation-head run `32146028530` also passed every workflow step.

No API, website, database, mutation, authorization, environment, manual-fulfillment or slash-command registration change was part of the task.

PR #3 was squash-merged into `master` at:

```text
9466d6f23a6c2027b0e88c32eb4e78ddeeeb61fd
```

Verdict: `COMPLETE`.

---

## 2026-08-18 — TASK-CM-ADMIN-006 — Admin UI declutter

### Scope

Reduce menu/order/statistical bloat across private `/cm` panels and Share to Chat without changing operational capability, API contracts, authorization or mutation safety.

### Presentation changes

- User Operations reduced to account status, compact Discord identity, current wallet/Aura, order count, latest order and core controls.
- Recent Orders removed technical API-limit prose and suppresses quantity when it is one.
- Order Operations removed internal user/option IDs, provider and redundant fulfillment counts; duplicate Order History navigation removed.
- `Fulfillment Diagnostics` renamed `Delivery Details`; provider/record timestamps/linked-license top stats removed and exception fields render only when meaningful.
- visible nonfunctional Manual Fulfillment button removed; capability remains unsupported.
- refund/Aura/wallet previews and success panels remove routine backend transaction/audit/idempotency bookkeeping while keeping decision/result information and exceptional warnings.
- Share to Chat summaries were independently compacted while retaining ADR-0009 customer email and ADR-0008 no-control/internal-field boundaries.

### Verification / merge

Initial CI run `32155910678` passed existing product/security tests but failed two newly added presentation assertions due to incorrect JSON-string escaping expectations. No production behavior defect was found. The assertions were corrected to inspect rendered component content directly.

Implementation-head GitHub Actions run `32156144669` passed 131/131 tests, typecheck, build and diff check.

After documentation updates, run `32156801285` also passed the same complete gate. The final current-head verification recorded in the merge commit passed 131/131 tests, typecheck, build and `git diff --check`.

PR #4 was squash-merged into `master` at:

```text
6cef7695a09c8761d395f5d530bc79b7532c9b9f
```

No API/signing, authorization, mutation, environment, slash-command, website/Supabase, leaderboard or `legacy/` change was in scope.

Verdict: `COMPLETE` on mainline.

---

## 2026-08-19 — TASK-TRANSCRIPTS-CTX-001 — Parallel ticket transcript corpus boundary

### Scope

Record the new parallel support-data workstream without changing the production bot runtime.

Repository established externally:

```text
Hermann-33/CM-Ticket-Transcripts
```

Verified repository metadata at task start: private, default branch `main`, empty/data repository baseline.

### Decision

ADR-0010 establishes `CM-Ticket-Transcripts` as a private data-only repository.

Allowed: normalized transcript data, manifests/indexes, failure records, raw transcript snapshots when required, attachment metadata and explicitly scoped derived datasets.

Forbidden: executable exporter/scraper code, production bot code, package/application scaffolding added to run the exporter, bot/HMAC/database credentials, `.env` content and generated dependency trees.

Extraction tooling executes outside the data repository. The production bot does not gain a runtime dependency on the corpus. Normal bot development and transcript acquisition may proceed in parallel.

### Transcript Phase T1

Initial acquisition flow:

```text
Discord ticket-log history
  -> ticket metadata + Tickety transcript URLs
  -> small representative extraction/parsing validation
  -> normalized complete transcripts
  -> bulk export with explicit failure accounting
  -> CM-Ticket-Transcripts
```

The small-sample validation gate is mandatory before scaling to the full 1,000+ historical ticket set.

### Security/data impact

Ticket transcripts may contain customer PII, Discord identities, emails, order/support details and attachments. The corpus remains private and must not contain credentials. Historical transcript data is not a replacement source of truth for current website account/order state.

No production source, API operation, authorization rule, environment value, website/Supabase behavior, deployment or command registration changed.

Verdict: `COMPLETE` for context/architecture decision; extraction implementation remains the next side-project task.

---

## 2026-08-19 — TASK-TRANSCRIPTS-001 — Phase T1 standalone exporter

Implemented non-runtime, dependency-free Node.js 22 tooling under `tools/ticket-transcript-exporter/`.

Behavior:

- exact-guild verification before Discord history access;
- REST pagination at 100 messages/page;
- supported execution through `npm run export:ticket-transcripts`;
- strict Discord discovery filter accepts only link buttons with `type=2`, `style=5`, normalized label `View Transcript`, and a canonical Tickety transcript URL;
- `View Ticket` and all other button labels are ignored;
- transcript-like URLs in ordinary message content or unrelated embeds are not eligible discovery sources;
- strict canonical Tickety URL allowlist and redirect validation;
- direct HTTP acquisition with bounded retries and optional Chrome headless fallback;
- sequential transcript fetches with default delay;
- raw HTML + plain text + normalized JSON output into an external `CM-Ticket-Transcripts` checkout;
- run/failure manifests and resumable records;
- five-ticket default sample; bulk export requires explicit `--all`;
- no HMAC/Internal Integrations API, website, Supabase/Postgres or mutation usage.

The strict targeting requirement was added after review of the real ticket-log workflow, where `View Ticket` can appear alongside `View Transcript`. The supported npm command now routes through `run-ticket-transcript-export.mjs`, which preserves message-history pagination while neutralizing non-target messages before the core parser sees them.

Initial repository CI before the strict-target follow-up passed 137/137 tests, typecheck, build and diff check on Node `22.23.2`. The strict-target follow-up adds focused tests proving `View Ticket` is rejected, `View Transcript` is selected when both controls exist, and fallback transcript URLs outside the target button cannot cause discovery. A fresh CI run on the updated head is required before merge.

No live Discord/Tickety export was performed by the agent because production credentials/channel ID are not available in the execution environment. The mandatory real five-ticket sample remains the next gate before `--all`.

Verdict: `PARTIAL` — implementation is complete, but updated-head CI and real-source five-ticket validation must pass before Phase T1 acquisition can be considered validated.
