# Project History

Updated: 2026-09-08

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

ADR-0010 established `Hermann-33/CM-Ticket-Transcripts` as a private data/specification-only repository. Exporter/tooling code lives under `tools/ticket-transcript-exporter/` in the bot repository and remains outside production runtime. The production bot has no runtime dependency on transcript data.

## 2026-08-19 — Pending purchase lookup and fulfillment support implemented

Website-side order support exposed the read boundaries required for canonical order-first pending purchase lookup and optional masked fulfillment support. TASK-CM-ADMIN-007 / ADR-0011 implemented the bot side while retaining `purchase-intents.process`, manual fulfillment and direct DB as forbidden.

## 2026-08-19/20 — Tickety structured corpus completed

Initial transcript-page HTML/Chrome extraction proved to be a JavaScript shell rather than the actual ticket content. HAR inspection identified Tickety's Msgpack API:

```text
GET https://tickety.top/api/ticketTranscript?id=<transcriptId>
Content-Type: application/vnd.msgpack
```

The public tooling decoded this path and converted the complete strict `View Transcript` discovery set into structured data.

Final corpus:

```text
strict transcript records: 1,578
structured tickets:        1,578 / 1,578
messages:                  39,090
extraction failures:       0
```

## 2026-08-20/22 — Exhaustive deep review and canonical KB

The corpus was processed through exhaustive deep-review/evidence/Obsidian graph layers, followed by canonicalization and runtime-KB compilation.

Confirmed state:

```text
historical fact nodes:     3,949
fact dispositions:         3,949 / 3,949
canonical runtime cases:   55
broken links:              0
fact nodes without evidence: 0
```

The architecture deliberately separated historical evidence from current/runtime truth, preserving dynamic facts, restrictions, contradictions and unresolved items. Historical tickets were not treated as a flat answer database.

## 2026-08-22/23 — First-turn inferability pivot

Initial retrieval/case-ranking work showed that many customer first turns do not contain enough information to infer the exact eventual historical case. The project changed evaluation/runtime semantics from “always classify a final case immediately” to “choose the safest next support action”.

Normative classes became:

```text
exact_case
family_only
entity_only
control_plane_only
insufficient_context
multi_intent
```

Targeted clarification and stateful context carry-forward became first-class behavior. The assistant must ask follow-up questions rather than guess when necessary.

## 2026-08-23 — Hosted LLM planner scaffold

ADR-0012 added a sanitized public `support-runtime/` derivative, explicit conversation state, hosted-planner input/output contracts, privacy sanitization, canonical-ID/scope/restriction/repetition validation and fail-closed provider behavior. Customer-facing Discord AI remained unwired at that point.

OpenRouter was initially evaluated as a development adapter, but provider/account limits made it unsuitable as the preferred path.

## 2026-08-23/24 — Groq GPT-OSS selected as primary development provider

ADR-0013 selected Groq `openai/gpt-oss-120b` as the primary hosted triage candidate while preserving ADR-0012's deterministic and privacy boundaries.

Default planner configuration:

```text
temperature: 0
reasoning_effort: low
max_completion_tokens: 400
strict JSON schema
```

Groq authentication and strict structured outputs were successfully exercised. The provider remained a constrained semantic next-action planner, not a knowledge or execution authority.

## 2026-08-24 — V3 benchmark/gold representability remediation

Hosted smoke runs revealed that apparent model failures mixed genuine model choices with candidate construction defects and stale/ambiguous/safety-conflicting gold.

The older V1/V2 combined reviewed set was rejected as independent hosted-model semantic gold. The independently reviewed V3 set became consumed development gold, with original labels kept immutable and a separate adjudication overlay introduced.

The builder gained explicit gold representability checks so the LLM is not scored against actions it was never allowed to choose.

Targeted router/contract fixes included payment typo normalization, PayPal/payment-state routing, HWID reset, explicit NFA activation, setup/config recognition, media/reseller/partnership recognition, current detection-status restricted routing, security-report escalation, controller compatibility false-positive prevention, product-comparison clarification, spoofer launch-failure clarification and turn-scoped lookup exposure.

## 2026-08-24 — Groq lookup-leak diagnostic

A cleaned 20-row run reached 100% structured output and 95% safe-progress-or-better but had one unsafe route: `hwid reset plssss` received unrelated global lookup options and the planner chose `users.overview.read` instead of the correct static HWID case.

The defect was treated as action-envelope leakage, not model semantic failure. Lookup exposure was tightened so deterministic/static routes did not inherit the global lookup catalog.

## 2026-08-24 — Benchmark cleanup pause

A temporary V3 rebuild retained 230 representable rows and seven review-queue rows, mostly selector-only order turns plus one stale/ambiguous delivered-order UI row. The project paused rather than spending more Groq quota against a structurally inconsistent benchmark.

## 2026-08-25 — Deterministic triage repair and clean development prefixes

The seven-row pause was resolved through selector-aware routing and a committed 26-row adjudication overlay while preserving original V3 source. Subsequent hosted failures drove explicit deterministic clarification/static-case provenance, input-aware strict schema constraints, scoped clarification lookup isolation, declared operation-backed clarification replacement scoring and narrow router recognition improvements.

The final benchmark retained 236/236 adjudicated development rows with review queue 0 and representability 1. A post-fix Groq 40-row prefix measured 36 optimal and 4 safe-progress rows with zero unsafe, fallback, invalid, scope-leakage or semantic-review rows. Full validation passed 308 tests, typecheck, build and diff hygiene.

## 2026-08-25/26 — Grounded runtime/action/Discord integration completed

The production AI path was completed behind default-off controls: deterministic action resolution, approved read-only lookup adapter, bounded per-ticket conversation state, customer-safe rendering, Groq strict schema/validation/fallback, exact guild/channel/category eligibility and `messageCreate` integration. ADR-0014 formalized the default-off customer-facing activation boundary and broad-release evidence requirements.

The AI remained planner-only. No direct database path, service-role secret, private-corpus runtime dependency or model-selected mutation authority was introduced.

## 2026-08-26 — B0-v3 failure and deterministic control-plane remediation

Frozen candidate `4d8790fc90b351d261f8699c7b3cd989c3787fe9` was evaluated once on fresh synthetic B0-v3 and failed:

```text
structured accepted: 25 / 30
exact effective action: 24 / 30
fallback: 5 / 30
restricted safe: 2 / 3
```

B0-v3 was never rerun as unseen evidence. The failure exposed ungrounded observation strings and missing deterministic action locking for policy, attachment, security and restricted control-plane routes.

The response schema, validator, resolver and fallback were hardened so deterministic next action and policy IDs survive end-to-end and all canonical ID fields are input-constrained.

## 2026-08-26 — B0-v4/v5 preflight failures, B0-v6 release pass

B0-v4 and B0-v5 failed deterministic preflight and received no hosted Groq calls. Their real defects were converted into regressions before new candidates/fixtures were created.

Candidate `2e8b763f699b4c1aaa138320f4e0420c736e82dc` then passed B0-v6:

```text
deterministic preflight: 44 / 44
hosted accepted:         44 / 44
exact effective action:  44 / 44
fallback:                 0 / 44
restricted safe:          3 / 3
avg/median/p95 latency:   1081.13 / 995.59 / 1602.98 ms
```

B0-v6 is consumed fresh synthetic release acceptance, not historical-generalization evidence.

## 2026-08-26 — Prospective shadow tooling

A separate no-reply shadow mode was implemented with the exact production eligibility boundary, frozen cohort start time/candidate/runtime/model configuration, pseudonymous privacy-safe records, human adjudication, deterministic ADR-0014 metrics and close/report tooling.

Validation passed 388/388 tests plus typecheck/build/diff/audit with zero vulnerabilities. No real prospective cohort was started and no fresh tickets were collected.

The documented 200-turn / 14-day sample target remained a proposed governance recommendation because ADR-0014 itself defines no minimum sample.

## 2026-08-31 — AI/shadow implementation merged to `master`

The validated AI/shadow branch history was fast-forwarded into `master`, making the production repository itself the Northflank deployment source for the complete bounded AI-support implementation.

## 2026-08-31 — Controlled one-channel visible AI test

Before starting prospective shadow collection, the operator explicitly authorized a narrow manual visible test under ADR-0015:

```text
AI_SUPPORT_ENABLED=true
AI_SUPPORT_SHADOW_ENABLED=false
AI_SUPPORT_CHANNEL_IDS=1542084649017286727
AI_SUPPORT_CATEGORY_IDS=
```

No category-wide or guild-wide customer AI activation was authorized.

A live customer-style message:

```text
Im unable to download the nfa loader
```

received the generic fallback:

```text
A staff member needs to continue this support request.
```

## 2026-08-31 — Response-knowledge reconstruction opened

The live failure confirmed that the transcript corpus itself was not the missing resource: the private repository already contains customer questions, staff answers, clarification sequences, troubleshooting and outcomes across 1,578 tickets / 39,090 messages. The problem is that the production derivative compressed too much of that information into routing/classification metadata, while broad NFA routing could outrank the more specific loader stage and some final actions still fell through to generic escalation.

Branch:

```text
task/ai-support-response-reconstruction
```

The new workstream must programmatically recover safe customer-response guidance from the full corpus, preserve private provenance/contradictions, sanitize only approved guidance into `support-runtime/`, cover all 55 canonical cases with explicit response strategies, fix loader/NFA specificity, explicitly render all triage actions, add privacy-safe diagnostics and bump the runtime knowledge version.

This material change invalidates B0-v6 as certification for the next candidate. A fresh B0-v7-or-later fixture and later prospective validation are required before broad rollout.

## 2026-08-31 — Documentation re-baseline

The current documentation layer was reconciled with actual deployment state. `CURRENT_STATE_2026-08-31.md`, `DOCS_AUDIT_2026-08-31.md`, current architecture/data/brief/codebase/commands/side-project/handoff/roadmap files and ADR-0015 now own current status; dated release/benchmark documents remain immutable point-in-time evidence for their original runs.

## 2026-09-08 — Tickety support-ticket account-link gate

After the website/Supabase side added durable support-ticket access state behind the Internal Integrations API, the bot implemented ADR-0016 on `feature/tickety-account-link-gate` / draft PR #15.

The design deliberately rejected a bot-local SQLite/Northflank-volume persistence model. Durable authorization state remains website-owned:

```text
Discord ticket
 -> CM Discord Bot
 -> HMAC Internal Integrations API
 -> support ticket access service
 -> Supabase/Postgres
```

The bot added only:

```text
support.tickets.access.read
support.tickets.verify
support.tickets.override
```

Initial Tickety tickets are recognized in category `1382569775988871330`, with uncategorized `support-<number>` as the documented overflow form. The creator is resolved only when exactly one non-bot member-specific permission overwrite exists.

The creator is made read-only before the initial website verification. A successful account-link verification produces an exact eight-hour lease. During that lease the bot makes no repeated verification calls. After expiry there is no timer or global poll; only the ticket creator/customer's next message or explicit **Check Again** requests fresh verification. Staff/admin/bot messages never renew the customer lease, and an inactive expired ticket produces no verification traffic.

If the fresh check reports unlinked, the triggering creator message is deleted and the creator is locked. Service failure also fails closed but uses distinct verification-unavailable wording rather than falsely describing the account as unlinked. Tickety permission rewrites are re-enforced through `ChannelUpdate`, and startup recovery is paced and one-time.

The customer linking panel points to `https://cheaters.market/dashboard?tab=settings` and reuses the website's existing **Connect Discord** OAuth flow.

`/cm ticket-allow` was added as a ticket-scoped administrator bypass. It reuses ADR-0006 exact-guild + explicit `BOT_ADMIN_USER_IDS` authorization, requires the configured Discord audit channel, persists `admin_override` through the website operation, restores only CM-gated creator permissions, and writes a sanitized Discord audit. It does not create a global user bypass.

The implementation does not add direct database access, local authorization persistence, a website runtime dependency on the bot, or hosted-AI mutation authority. Because `/cm` command JSON changed, production rollout requires explicit `npm run register:commands` after deployment prerequisites are satisfied.


## 2026-09-08 — Startup fresh ticket verification sweep

After the support-ticket website permissions were added to the `cm-discord-bot` client, restart recovery was strengthened so a bot restart can immediately revisit every existing non-overridden support ticket.

The original ADR-0016 runtime model remains activity-driven, but process startup is now an explicit one-time exception:

```text
bot starts
 -> paced candidate scan
 -> read durable ticket state
 -> skip admin_override
 -> fresh support.tickets.verify once
 -> restore/lock based on current link state
 -> return to activity-driven runtime behavior
```

This also fixed the specific pre-permission recovery case: if an earlier verification failure had locked a creator and posted the CM gate notice without creating durable website state, startup now recovers the original pre-gate permission snapshot from that notice before re-verifying. A linked user can therefore be unlocked correctly after the website client permissions become available.

The sweep remains paced below the website verification limit and is not recurring polling.


## 2026-09-08 — support-2094 targeted Discord permission diagnostics

A linked creator in `support-2094` (`1546354201368596612`) reached the Discord access-restoration stage but the permission overwrite edit failed.

The bot was updated to log the sanitized Discord REST failure code/status/method/URL at the exact permission mutation boundary. The earlier all-ticket startup freshness sweep was reduced back to normal durable-state recovery, with one temporary targeted startup fresh verification only for `support-2094` so the problem can be reproduced without rechecking unrelated persisted tickets.

This is an operational diagnostic exception, not a permanent expansion of the ADR-0016 polling model.


## 2026-09-08 — Discord permission target resolution fix

The support-2094 diagnostics identified a discord.js client-side `InvalidType` failure: the ticket gate was passing a creator snowflake directly to `permissionOverwrites.edit`, and discord.js could not resolve it to a User/Role in that runtime state.

The gate now fetches the concrete `GuildMember` first and uses that member object for creator lock/restore permission updates. No account-link, lease, persistence, HMAC, or administrator-authorization semantics changed.

The targeted support-2094 startup recheck was retained for one deployment to validate the corrected path against the real ticket.
