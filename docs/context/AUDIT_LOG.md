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

Audited active source/tests/config/GitHub/dependency state. Confirmed HMAC/DTO/timeout/retry/mention controls and no active direct DB. Its slash-only `cm aura` conclusion was later superseded by ADR-0005.

Verdict: `COMPLETE` for audit.

---

## 2026-08-17 — TASK-POLICY-001 — Customer/admin command split

ADR-0005 retained customer `cm aura` as a message command and reserved slash/components/modals for staff/admin surfaces.

Verdict: `COMPLETE`.

---

## 2026-08-17 — TASK-API-DOC-001 — Internal API contract re-baseline

Recorded website operation catalog, HMAC retry/idempotency rules and mutation contracts. Endpoint existence remained separate from client authorization.

Verdict: `COMPLETE` for documentation.

---

## 2026-08-17 — TASK-CM-ADMIN-001 — Private admin console

Implemented `/cm user`, operator-bound Components V2 session, recent orders/order details/fulfillment diagnostics and canonical refund. Local verification passed 104/104 tests, typecheck, build and diff check before merge.

Verdict: `COMPLETE`.

---

## 2026-08-17 — TASK-CM-ADMIN-002 — Guild-wide `/cm`

ADR-0006 removed shared `/cm` command-channel restriction while retaining exact guild + mandatory explicit `BOT_ADMIN_USER_IDS` + per-interaction authorization. Audit channel remains separate.

Verdict: `COMPLETE` on mainline.

---

## 2026-08-18 — TASK-CM-ADMIN-003 — Direct order + Aura/wallet controls

Implemented `/cm order`, confirmed Aura adjustment and confirmed wallet adjustment while leaving manual fulfillment blocked. ADR-0007 established fresh-state-bound Aura/wallet confirmation. Verification passed 113/113 tests, typecheck, build/diff/security gates. PR #1 merged at `4b10d74aa80d3fa5c5e5a27b82e4ccf109a880a8`.

Verdict: `COMPLETE`.

---

## 2026-08-18 — TASK-CM-ADMIN-004 — Customer-safe sharing / Discord UX

Implemented Share to Chat, Discord-user lookup/link presentation, Discord timestamps and concise Components V2 mutation audits under ADR-0008. Final CI passed 127/127 tests, typecheck, build and diff check. Merged at `7a41dbeefae167044091b0aaed8372c3b58acdd0`.

Verdict: `COMPLETE`.

---

## 2026-08-18 — TASK-CM-ADMIN-005 — Shared customer email

ADR-0009 superseded ADR-0008 only for the previous full-email prohibition. Shared customer identity now includes escaped canonical account email. Verification passed 128/128 tests plus typecheck/build/diff. PR #3 merged at `9466d6f23a6c2027b0e88c32eb4e78ddeeeb61fd`.

Verdict: `COMPLETE`.

---

## 2026-08-18 — TASK-CM-ADMIN-006 — Admin UI declutter

Reduced private/share presentation noise without changing API/auth/mutation behavior. Final verification passed 131/131 tests, typecheck, build and diff check. PR #4 merged at `6cef7695a09c8761d395f5d530bc79b7532c9b9f`.

Verdict: `COMPLETE` on mainline.

---

## 2026-08-19 — TASK-TRANSCRIPTS-CTX-001 — Parallel ticket transcript corpus boundary

ADR-0010 established `Hermann-33/CM-Ticket-Transcripts` as private/data-only with no production-bot dependency or credentials/executable exporter code in the data repository.

Verdict: `COMPLETE` for context/architecture decision.

---

## 2026-08-19 — TASK-TRANSCRIPTS-001 — Phase T1 standalone exporter

Implemented non-runtime Node.js 22 tooling under `tools/ticket-transcript-exporter/` with exact-guild history access, strict `View Transcript` targeting, Tickety URL allowlisting, bounded fetching, raw/text/normalized output, explicit manifests and a five-ticket default sample. It remains independent from `src/` and the Internal Integrations API. Real five-ticket validation remains the next acquisition gate.

Verdict: exporter implementation merged to current mainline; corpus acquisition validation remains operational work.

---

## 2026-08-19 — TASK-CM-ADMIN-007 — Pending order lookup + fulfillment support

### Root cause

`/cm order` used only `orders.details.read`. Pending checkout references can exist in `purchase_intents` before a canonical order row, so valid pending references returned `NOT_FOUND`.

### Decision

ADR-0011 defines:

```text
orders.details.read
  -> success: canonical order
  -> stable NOT_FOUND only: purchase-intents.lookup.read
```

Pending owner identity must resolve exactly through `users.overview.read(user_id)`. A pending refresh can transition to the canonical order when `orderId` becomes available/resolvable. Other order errors do not trigger fallback.

### Implementation

- strict purchase-intent lookup schemas/client path;
- exact pending owner validation;
- operator-bound Pending Purchase panel;
- Refresh Purchase -> canonical order transition;
- no pending Refund/Delivery Details/purchase-processing/manual-fulfillment controls;
- optional/fail-safe fulfillment support type/duration/masked-material/manual state for private canonical order views;
- optional support failure cannot block canonical order controls;
- missing support/masked values are not misclassified as manual fulfillment;
- strict raw-material field rejection;
- Pending Purchase Share to Chat uses separately approved customer-safe fields;
- masked fulfillment support/provider internals remain private and are excluded from public share;
- architecture allowlist adds only `purchase-intents.lookup.read`; `purchase-intents.process` remains forbidden.

### Verification

Source implementation head:

```text
8e1c1ff839fdf171403219f0b881c82395d17007
```

GitHub Actions run `32254272306` checked the PR #5 merge-ref against concurrent master `087e2d431ff3ddb74e034b9d736c64f1b914abc9` on Node `22.23.2`:

```text
npm ci: PASS — 0 vulnerabilities
npm test: PASS — 153/153
npm run typecheck: PASS
npm run build: PASS
git diff --check: PASS
```

No website/database write, live mutation, deployment or command registration was performed. The slash-command definition is unchanged. Production pending lookup additionally requires the website bot client's `allowedOperations` to include `purchase-intents.lookup.read`.

Verdict: `COMPLETE` for repository implementation/source verification; merge/deployment remain separate authorized gates.

---

## 2026-08-22 — Canonical support knowledge tooling

Added an offline compiler, canonical/reference/privacy validators, a sanitized evaluation validator, and a deterministic exact-alias + scope-aware BM25-style evaluator. The private corpus produced 3,949/3,949 unique fact dispositions, zero missing/duplicate source fact IDs, zero broken canonical relationship targets/wikilinks, zero remediable privacy findings, and 300 queries across all ten required behavior families. The corrected lexical baseline is recorded in the private evaluation artifacts. No production `src/`, command registration, deployment, bot execution, login, private customer API, or external embedding service was used.

### 2026-08-22 remediation addendum

Independent review correctly found the first 13-case runtime layer and templated benchmark semantically incomplete. The remediation compiler now consumes all 1,578 reviewed ticket ledgers, emits only corpus-matched cases, writes exact ticket and fact-usage ledgers, withholds 341 distinct source-grounded transcript queries from recognition, and keeps 50 synthetic behavioral records separate. Structural, reference, and privacy gates pass. Historical hybrid retrieval improves materially but remains below directional acceptance targets, so the result is explicitly `PARTIAL` and not production-ready.

---

## 2026-08-23 — AI support integration preparation

ADR-0012 establishes a sanitized bundled support-runtime boundary and constrained optional OpenRouter next-action planner. The feature adds strict environment defaults, outbound PII/credential/reference masking, JSON-schema requests, deterministic canonical-ID/scope/restriction/repetition/known-answer validation, safe no-retry provider fallback, explicit stateful support-service interfaces, pending short-answer consumption, and an operator-controlled runtime-pack importer/loader.

The generated public pack excludes private manifests, routing exemplars, provenance, transcript/fact IDs, historical case-context snippets, procedure outcome evidence and customer PII. Production source contains no private repository path and no customer-facing Discord AI wiring.

Hosted OpenRouter execution remained non-authoritative. Provider selection later moved to Groq under ADR-0013 while keeping ADR-0012 boundaries.

Local Node `v24.11.1` verification passed at that implementation point: `npm.cmd ci` (0 vulnerabilities), `npm.cmd test` (261/261), typecheck, production build, diff check, runtime-pack privacy scan, secret/environment scan, legacy isolation, and confirmation that Discord startup/registration wiring was unchanged.

---

## 2026-08-24 — Groq GPT-OSS planner / benchmark remediation

ADR-0013 established Groq `openai/gpt-oss-120b` as the primary hosted development planner. Strict structured output, privacy sanitization, deterministic validation, rate-safe benchmark pacing and stop-on-429 behavior were implemented while OpenRouter remained secondary.

The project then discovered that early hosted headline scores mixed three different failure classes:

1. genuine model choices;
2. deterministic candidate/contract failures that made correct gold impossible or exposed unrelated actions;
3. stale, ambiguous or safety-conflicting V3 labels.

The older V1/V2 625-row set was confirmed unsuitable as independent semantic gold. V3 remained the consumed development benchmark, with original labels immutable and unreliable rows moved to a separate adjudication overlay.

Targeted deterministic repairs included payment typo normalization (`payed` -> `paid`), PayPal/payment-state routing, explicit NFA activation, HWID reset, media/reseller/partnership recognition, current detection-status restriction, controller compatibility false-positive prevention, product-comparison clarification and broader first-turn inferability handling.

The benchmark builder gained gold representability checks and an adjudication-aware review queue. Lookup definitions from action routing and runtime dynamic lookups were merged. The planner contract was hardened so static cases no longer receive the global live-lookup catalog and deterministic lookup routes can constrain allowed lookups for the turn.

A cleaned 20-row Groq run before the final lookup hardening produced:

```text
structured output acceptance: 100%
optimal:                        9
safe_progress:                 10
safe_no_progress:               0
unsafe_wrong_route:             1
scope leakage:                  0
invalid:                        0
safe-progress-or-better:       95%
unsafe rate:                     5% (1/20)
fallback:                        0
avg latency:                  ~823 ms
avg planner tokens:           1684.5
```

The single unsafe row was `first-turn-action-v3.0016` (`hwid reset plssss`). The planner had been offered the correct static HWID case but also unrelated global lookup tools, and chose `users.overview.read`. After lookup pruning, the same planner input was verified offline with only `case.spoofer.hwid_state`, zero dynamic lookups, zero clarifications and a 693-token estimate. No hosted rerun was performed after that fix.

### Current pause-point benchmark

The latest user-confirmed rebuild after authoritative deterministic-lookup handling is:

```text
sourceRecords:             300
reviewedRecords:           262
adjudicatedRecords:        237
excludedByAdjudication:     25
records:                   230
reviewQueueRecords:          7
representabilityRate:      0.9704641350210971
representabilityReasons:
  gold_clarification_unavailable: 7
planner token average:     1212.286956521739
median:                     797
p95:                       2355
```

Six review-queue rows are bare order selectors (`0026`, `0108`, `0173`, `0197`, `0249`, `0279`) that the deterministic router over-interprets as a direct order lookup. The intended correction is `selector only -> clarify requested order action`; selector plus explicit status/payment/delivery intent may use live lookup.

The seventh row, `0217`, says the order is delivered but `View Order` cannot be clicked/opened. Existing V3 gold asks the fulfillment-state clarification even though delivery state is already supplied. Current handoff judgment is that this row is stale/ambiguous single-path gold and should be re-adjudicated toward order/dashboard-access support if confirmed on resume.

The private adjudication overlay still excludes **25** rows. The proposed `0217` exclusion has not been committed; therefore a future 236/236 benchmark is only a projection.

Verdict: `PARTIAL / PAUSED`. Do not spend additional Groq quota until the six selector-only router rows and `0217` adjudication decision are resolved, the benchmark is rebuilt to review queue 0 / representability 1, and repository validation passes. Customer-facing AI remains disabled and unwired.
