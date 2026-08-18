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
- customer copy must be display-only/no admin powers;
- concise Components V2 Discord mutation audit;
- linked Discord identity in User Operations;
- `/cm user` lookup by email or selected Discord user;
- Discord absolute + relative timestamps throughout `/cm` management/share/audit views.

### External verification

Current website source was inspected read-only. Existing `users.overview.read` already accepts `external_identity` and returns linked external identity records. No website/API permission/DB change is required.

### Security design

ADR-0008 requires public copies to use a separate customer-safe renderer and the normal `/cm` authorization + operator-owned session gate. Public copies contain no buttons/selects/modals/custom IDs and omit email, internal CM user UUID, admin reasons, provider/failure details, backend audit/transaction/idempotency identifiers and credentials. `safeAllowedMentions` is retained.

Mutation flows and API surface remain unchanged; manual fulfillment remains blocked.

### Implementation/test state

Feature branch/PR:

```text
task/cm-share-discord-audit-time
PR #2
```

Focused tests were added for email/Discord selector validation, customer-safe disclosure/control boundary, channel publishing, linked Discord UI, absolute+relative timestamps, concise audit presentation and share/session state.

### Executable gate blocker

PR-triggered GitHub Actions run `32138604602` created `verify` but failed before workflow steps were created:

```text
steps: null
logs_url: null
```

This matches the existing Actions runner/account billing/spending-limit infrastructure problem. It is neither a source-test failure nor a pass.

The product owner explicitly requested no separate Codex/local run, but AGENTS/WORKFLOW still require an actual executable pass before merge. Therefore PR #2 must remain unmerged until `npm ci`, tests, typecheck, build and diff/status gates actually run and pass.

Verdict: `PARTIAL` pending executable verification.
