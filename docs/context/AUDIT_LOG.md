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

### Pause-point benchmark

The user-confirmed rebuild at that point was:

```text
sourceRecords:             300
reviewedRecords:           262
adjudicatedRecords:        237
excludedByAdjudication:     25
records:                   230
reviewQueueRecords:          7
representabilityRate:      0.9704641350210971
```

The seven-row queue was later resolved rather than treated as final release evidence.

Verdict at that checkpoint: `PARTIAL / PAUSED`.

---

## 2026-08-25 — AI support triage development validation complete

Explicit deterministic static-case/lookup/clarification provenance was aligned across candidate construction, Groq schema, validator and fallback. Selector-only routing, entity-only expansion, scoped generic lookup leakage, operation-backed clarification replacement scoring, loader-link/account-token/technical-signal cases, and Groq strict-schema compatibility were repaired at their narrowest layers.

Final consumed-development benchmark: 236/236 adjudicated rows, review queue 0, representability 1. Final post-fix Groq 40-row prefix: structured acceptance 1, exact action 0.975, 36 optimal, 4 safe-progress, and zero unsafe, fallback, invalid, scope-leakage, or semantic-review rows. Local validation passed 308/308 tests, typecheck, build, and diff hygiene.

Verdict: `DEVELOPMENT VALIDATION COMPLETE`; production release still required separate evidence.

---

## 2026-08-26 — Release acceptance and prospective shadow tooling

The first frozen synthetic release set B0-v3 exposed two structural defects: ungrounded planner observation entities and loss of deterministic control-plane actions before Groq. Candidate `4d8790fc90b351d261f8699c7b3cd989c3787fe9` failed B0-v3 at 25/30 structured acceptance, 24/30 exact effective action, 5/30 fallback and 2/3 restricted-safe. B0-v3 was consumed and never rerun as unseen evidence.

The response schema, validator, fallback and deterministic resolver were hardened. B0-v4 and B0-v5 then exposed deterministic-preflight defects and were consumed without hosted calls. The remediated candidate `2e8b763f699b4c1aaa138320f4e0420c736e82dc` passed B0-v6 once:

```text
deterministic preflight: 44 / 44
hosted structured acceptance: 44 / 44
exact effective action: 44 / 44
fallback: 0 / 44
restricted safety: 3 / 3
latency avg/median/p95: 1081.13 / 995.59 / 1602.98 ms
```

B0-v6 is synthetic release acceptance, not historical-generalization evidence.

Prospective no-reply shadow tooling was then implemented with independent default-off configuration, exact existing eligibility, frozen cutoff cohorts, privacy-safe pseudonymous evidence, human adjudication, deterministic metrics and close/report tooling. Validation passed 388/388 tests plus typecheck/build/diff/audit with zero vulnerabilities. No real cohort was started and no fresh shadow tickets were collected.

Verdict: `IMPLEMENTATION + SYNTHETIC ACCEPTANCE PASS / PROSPECTIVE EVIDENCE PENDING`.

---

## 2026-08-31 — Controlled single-channel visible AI test and response-reconstruction finding

The validated AI/shadow implementation was fast-forwarded into `master`, and the Northflank-hosted bot was explicitly configured for a narrow manual customer-visible test only in Discord channel `1542084649017286727`, with the category allowlist empty. ADR-0015 records the exception without authorizing broad rollout.

Effective intended test boundary:

```text
AI_SUPPORT_ENABLED=true
AI_SUPPORT_SHADOW_ENABLED=false
AI_SUPPORT_CHANNEL_IDS=1542084649017286727
AI_SUPPORT_CATEGORY_IDS=
```

A live ordinary support message:

```text
Im unable to download the nfa loader
```

received:

```text
A staff member needs to continue this support request.
```

The historical corpus already contains relevant customer questions, staff responses and troubleshooting context. The finding therefore identified a response-knowledge/routing/rendering defect rather than missing data: broad NFA-family routing can outrank a more specific loader stage, the sanitized runtime compresses away too much customer-response guidance, and some known actions/cases can collapse into the generic escalation renderer.

The remediation branch `task/ai-support-response-reconstruction` was opened. It must reconstruct a reviewed/sanitized response-guidance layer from the full structured corpus, give all 55 canonical cases an explicit response strategy, preserve current-policy/live-state/restricted boundaries, add explicit action renderers, add privacy-safe diagnostics and bump the runtime knowledge version.

Because that work is material, consumed B0-v6 will not certify its eventual candidate. A fresh B0-v7-or-later synthetic set and later prospective fresh-ticket validation remain required before broad activation.

The documentation system was re-baselined on 2026-08-31 with `CURRENT_STATE_2026-08-31.md`, `DOCS_AUDIT_2026-08-31.md`, refreshed architecture/data/brief/codebase/command/side-project/handoff/roadmap files, and ADR-0015.

Verdict: `CONTROLLED TEST ACTIVE / RESPONSE RECONSTRUCTION PENDING / BROAD RELEASE BLOCKED`.

---

## 2026-09-08 — TASK-CM-TICKETS-001 — Tickety account-link gate

### Scope

Implemented the bot side of the website-persisted CM support-ticket account-link gate on `feature/tickety-account-link-gate` / draft PR #15.

### Architecture / security review

- preserved the standalone `Discord -> HMAC Internal Integrations API -> website -> database` boundary;
- added no Supabase/Postgres client, service-role/database credential, SQLite database, Northflank persistence-volume dependency or direct database fallback;
- consumed only the reviewed website operations `support.tickets.access.read`, `support.tickets.verify`, and `support.tickets.override`;
- mirrored the website support-ticket DTOs strictly and added deterministic `TICKET_CREATOR_MISMATCH` handling;
- reused ADR-0006 exact-guild + explicit `BOT_ADMIN_USER_IDS` authorization for `/cm ticket-allow`; no role-only or website-side human authorization path was added;
- kept the hosted AI planner unable to call the ticket override mutation;
- retained `legacy/` isolation and did not change HMAC canonicalization/signing.

### Discord behavior

- initial ticket recognition: category `1382569775988871330` or uncategorized `support-<number>` overflow channel;
- creator resolution accepts exactly one non-bot member-specific overwrite and never guesses ambiguous ownership;
- creator-only participation gate preserves visibility/read access and never edits staff/support role overwrites;
- lock happens before initial verification to close the channel-creation race;
- unlinked customers receive CM Settings + **Check Again**;
- verification/service failure fails closed with distinct wording and is not misreported as unlinked;
- exact permission snapshot metadata is carried only in the bot's gate component custom ID for restart restoration; it contains no website ID, email, reason, token or credential;
- `ChannelUpdate` re-enforces locked creator denies after Tickety rewrites;
- startup performs paced one-time durable-state reconciliation rather than recurring polling.

### Eight-hour lease behavior

- successful website verification establishes the exact eight-hour lease returned by the API;
- no creator verification call occurs while that lease is active;
- no global eight-hour timer/poll exists;
- expired inactive tickets generate no verification work;
- staff/admin/bot activity never renews customer verification;
- only ticket-creator/customer activity or explicit **Check Again** performs the next fresh check;
- if an expired creator message finds the account unlinked or verification unavailable, that triggering message is deleted before access remains locked;
- per-channel serialization prevents redundant concurrent verification at the expiry boundary.

### Administrator override

`/cm ticket-allow` is ticket-scoped only. It requires the normal `/cm` administrator allowlist and configured `BOT_AUDIT_LOG_CHANNEL_ID`, calls `support.tickets.override` with UUID idempotency, restores only the creator permissions affected by the CM gate, and emits a sanitized Discord audit. It does not exempt the Discord user from future tickets.

### Test / CI evidence

During implementation, CI first caught three incorrect test expectations and then a `discord.js` permission-overwrite option typing error; both were corrected rather than bypassed.

Intermediate implementation head `e1e4830dcc8ea28ee093dd2c3c3f51a67eba9a65` passed GitHub Actions CI run `34171504351`:

```text
npm ci: PASS
npm test: PASS
npm run typecheck: PASS
npm run build: PASS
git diff --check: PASS
```

After the final source hardening (including conservative permission fallback, expired half-transition recovery, explicit Discord-access failure handling, and backend-success/Discord-restore distinction), source head `dbc3b27675647fe4586b9f151273ce3d54ef25e1` passed GitHub Actions CI run `34172585466`:

```text
npm ci: PASS
npm test: PASS — 413/413
npm run typecheck: PASS
npm run build: PASS
git diff --check: PASS
```

The remaining commits after that validation are documentation-only reconciliation. The merge head must retain a green CI status.

### Deployment boundary

No Discord bot login, slash-command registration, production API smoke call, website edit, database migration or merge was performed from this task. Production rollout additionally requires the website support routes to be deployed, the bot integration client to receive exactly the three support-ticket operations, the bot revision to deploy, `npm run register:commands` to run once, and end-to-end linked/unlinked/recheck/expiry/restart/Tickety-rewrite/admin-override smoke verification.

Verdict: `REPOSITORY IMPLEMENTATION COMPLETE / PRODUCTION ROLLOUT GATES PENDING`.


---

## 2026-09-08 — TASK-CM-TICKETS-002 — startup fresh ticket verification

### Reason

The first production-style ticket was opened before the `cm-discord-bot` website client had the three support-ticket operations in `allowedOperations`. The bot correctly failed closed and posted **CM account verification unavailable**. After the website permissions were added, the desired recovery behavior was to restart the bot and freshly check all existing support tickets rather than waiting for each customer to become active.

### Change

Startup reconciliation is now a one-time **fresh verification sweep**:

- fetch every text channel still in Tickety category `1382569775988871330` plus `support-<number>` recovery candidates;
- read durable ticket state first;
- preserve/skip `admin_override` tickets;
- fresh-verify every other persisted ticket exactly once;
- for tickets with no durable row, perform normal initial verification;
- if a previous pre-permission/API failure left a CM gate notice but no durable row, recover the original permission snapshot from that notice before verifying so a newly linked/authorized creator can be restored correctly;
- replace stale gate notices rather than duplicating them;
- keep the existing ~2.1 second pacing so support-ticket verification remains below the website 30/minute client-operation limit.

This is explicitly **not** recurring polling. Once startup finishes, normal runtime remains activity-driven: active leases cause no checks, and after expiry only creator activity or **Check Again** re-verifies.

### Safety

- no new environment variable;
- no new database/local persistence;
- no direct Supabase access;
- no change to `admin_override` semantics;
- no staff-role overwrite changes;
- no change to HMAC signing or client authorization;
- API failure during the startup sweep remains fail-closed.

### Deployment effect

Because Northflank deploys this repository's production/default `master` branch, merging the validated change to `master` is the repository-side deployment trigger. Live Northflank rollout status still requires host-side observation; repository tooling cannot inspect the Northflank service directly.


---

## 2026-09-08 — TASK-CM-TICKETS-003 — support-2094 Discord permission diagnostics

### Trigger

Ticket `support-2094` / channel `1546354201368596612` passed CM account-link verification but failed while restoring the creator's Discord channel permission overwrite, producing **CM ticket access unavailable**.

This proves website link verification succeeded; the failure is in the Discord permission-restoration step, not in customer purchase status.

### Change

- added structured Discord REST error extraction for permission-overwrite mutations;
- logs now capture safe fields only:
  - `errorName`
  - `errorMessage`
  - Discord REST `code`
  - HTTP `status`
  - HTTP `method`
  - Discord API `url`
  - ticket channel ID
  - creator Discord ID
  - operation (`lock` or `restore`);
- no token, authorization header, request body, website account ID, email or secret is logged;
- returned normal startup to durable-state recovery instead of globally fresh-verifying every persisted ticket;
- added a temporary targeted startup fresh recheck only for `support-2094` / `1546354201368596612`;
- `admin_override` still bypasses link verification;
- all other persisted tickets are recovered without a fresh link check.

The targeted startup recheck is temporary operational diagnostics and should be removed after the Discord error is identified/fixed.
