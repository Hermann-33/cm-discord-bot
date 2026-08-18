# Audit Log

## 2026-05-29 — Initial bot / leaderboard evolution

Historical standalone bot and channel/presentation evolution. See `../legacy-parity.md`.

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

Current mainline incorporates this policy.

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

### Scope

- Share to Chat from meaningful `/cm` operational panels;
- customer copy is display-only/no admin powers;
- concise Components V2 Discord mutation audit;
- linked Discord identity in User Operations;
- `/cm user` lookup by email or selected Discord user;
- Discord absolute + relative timestamps throughout `/cm` management/share/audit views.

### External verification

Current website source was inspected read-only. Existing `users.overview.read` already accepts `external_identity` and returns linked external identity records. No website/API permission/DB change is required.

### Security design

ADR-0008 requires public copies to use a separate customer-safe renderer and the normal `/cm` authorization + operator-owned session gate. At the time of TASK-CM-ADMIN-004, ADR-0008 excluded full email as well as internal CM user UUID, internal option IDs, admin reasons, provider/failure details, backend audit/transaction/idempotency identifiers and credentials. `safeAllowedMentions` is retained. ADR-0009 later supersedes only the email exclusion.

Mutation flows and API surface remain unchanged; manual fulfillment remains blocked.

### Implementation/test state

Feature branch/PR:

```text
task/cm-share-discord-audit-time
PR #2
```

Focused tests cover email/Discord selector validation, customer-safe disclosure/control boundary, channel publishing, linked Discord UI, absolute+relative timestamps, concise audit presentation and share/session state.

### Executable verification

After repository visibility was changed to public, the standard GitHub-hosted Actions runner could execute. The first real run passed all tests but exposed a TypeScript narrowing error in the new adjustment-success share renderer. The implementation was corrected narrowly.

Final CI run `32142352087` passed:

```text
Node 22.23.2
npm ci: PASS, 0 vulnerabilities
npm test: PASS — 127/127
npm run typecheck: PASS
npm run build: PASS
git diff --check: PASS
```

Focused static/security review remained clean for direct DB/Supabase access, new API operations, purchase-processing/manual-fulfillment shortcuts, secret/HMAC material, `legacy/` changes, authorization regression and public interactive-control disclosure.

No live share/refund/Aura/wallet mutation, deployment, command registration, website write or database mutation occurred during repository verification.

Verdict: `COMPLETE` for implementation/verification and merged into `master` at `7a41dbeefae167044091b0aaed8372c3b58acdd0`.

---

## 2026-08-18 — TASK-CM-ADMIN-005 — Shared customer email

### Scope

The product owner explicitly requested that the customer account email visible in the private `/cm` panel also be visible when Share to Chat publishes the customer-facing summary.

### Policy

ADR-0009 supersedes ADR-0008 only for the previous full-email prohibition. The canonical customer account email is now an intentionally approved shared field. Public admin controls and other internal/operator-only fields remain prohibited.

### Implementation

`src/commands/cmShare.ts` uses the canonical `session.overview.identity.email`, Discord-escapes it, and includes it in the shared customer identity block across User, Orders, Order, Fulfillment, Refund and Aura/Wallet share views.

Tests require the escaped email while continuing to prove internal user UUID/provider/option identifiers/admin reasons and public custom IDs remain absent.

### Verification state

PR #3 / `task/cm-share-email` must pass the normal GitHub Actions Node 22 test/typecheck/build/diff gate before merge.

No API, website, database, mutation, authorization, environment, manual-fulfillment or slash-command registration change is part of this task.

Verdict: `PARTIAL` pending executable verification.
