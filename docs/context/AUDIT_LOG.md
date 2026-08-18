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

### Verification

Initial CI run `32155910678` passed existing product/security tests but failed two newly added presentation assertions due to incorrect JSON-string escaping expectations. No production behavior defect was found. The tests were corrected to inspect rendered component content directly.

GitHub Actions run `32156144669` then passed on Node `22.23.2`:

```text
npm ci: PASS, 0 vulnerabilities
npm test: PASS — 131/131
npm run typecheck: PASS
npm run build: PASS
git diff --check: PASS
```

No API/signing, authorization, mutation, environment, slash-command, website/Supabase, leaderboard or `legacy/` change is in scope.

Verdict: `COMPLETE` for implementation-head behavior; final documentation-head CI remains required before PR #4 merge.
