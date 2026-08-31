# Related Side Projects

Updated: 2026-08-31

This file records adjacent Cheater's Market workstreams intentionally outside the standalone Discord bot runtime.

## CM Ticket Transcript / AI Support Knowledge Base

Repository:

```text
Hermann-33/CM-Ticket-Transcripts
```

Boundary:

- private;
- data/specification-only;
- no production bot/runtime code;
- no credentials or `.env` files;
- no direct production filesystem dependency;
- executable acquisition/analysis/evaluation tooling stays in `cm-discord-bot/tools/ticket-transcript-exporter/`.

ADR-0010 governs this boundary.

## Acquisition history

The strict Discord ticket-log scan found 1,578 unique **View Transcript** records. Other controls such as View Ticket were intentionally ignored.

The initial transcript HTML page was only a JavaScript shell. HAR inspection identified the actual Tickety endpoint:

```text
GET https://tickety.top/api/ticketTranscript?id=<transcriptId>
Content-Type: application/vnd.msgpack
```

A Msgpackr-compatible decoder produced the complete structured corpus.

Current corpus:

```text
structured tickets:      1,578 / 1,578
messages:                39,090
extraction failures:          0
historical fact nodes:    3,949
canonical runtime cases:     55
```

## Knowledge architecture

Private layers include:

```text
analysis-input/
deep-review/
knowledge-deep/
knowledge-canonical/
runtime-kb/
knowledge-engineering/
```

They preserve evidence, historical-only observations, current/dynamic facts, contradictions, unresolved questions, restricted material, product/game/vendor/account scope and evaluation labels.

The private repository remains directly useful for deep review/Obsidian exploration, but production receives only separately reviewed sanitized derivatives.

## Production derivative

ADR-0012 permits an operator-controlled offline importer to create public `support-runtime/` artifacts. The public bundle excludes private manifests/evaluation data, provenance/evidence, transcript/fact IDs, customer PII and secret material. Production validates runtime artifact hashes before use.

Production never reads `CM-Ticket-Transcripts` directly.

## Hosted planner

Primary hosted planner:

```text
Groq openai/gpt-oss-120b
```

It receives only a compact sanitized current-turn action envelope. It has no browser/tools/API/database/Discord/mutation authority and cannot invent canonical IDs or current policy/state.

## Evaluation history

Consumed development V3 ended at 236/236 adjudicated rows, review queue 0 and representability 1. B0-v3 failed and was consumed; B0-v4/B0-v5 failed deterministic preflight without hosted runs; B0-v6 passed once:

```text
deterministic: 44 / 44
hosted accepted: 44 / 44
exact action: 44 / 44
fallback: 0
restricted safe: 3 / 3
```

All historical tickets influenced the pipeline, so no legitimate untouched historical holdout remains. Synthetic acceptance is not historical-generalization evidence.

## Prospective shadow tooling

No-reply cohort tooling is implemented with frozen candidate/config/start time, privacy-safe local records, pseudonyms, human adjudication and deterministic metrics. No real prospective cohort has started and no fresh prospective ticket evidence has been collected.

The 200-adjudicated-turn / 14-day target is a proposed governance recommendation, not an ADR-0014 hard requirement.

## Controlled visible test

ADR-0015 currently allows visible AI only in channel `1542084649017286727` with no category allowlist.

A live ordinary support message:

```text
Im unable to download the nfa loader
```

returned the generic staff-escalation fallback. The private corpus contains relevant response material, so this is a runtime knowledge/routing/rendering defect rather than a data-availability problem.

## Response-knowledge reconstruction

Active public branch:

```text
task/ai-support-response-reconstruction
```

The current goal is to programmatically recover safe staff-response/clarification/troubleshooting/resolution patterns from the full structured corpus, keep private provenance/contradictions private, and promote only reviewed sanitized response guidance into `support-runtime/`.

Required result includes:

- loader-stage specificity over broad NFA routing when appropriate;
- all 55 canonical cases mapped to an explicit response strategy;
- explicit rendering for every triage action;
- current-state/policy boundaries preserved;
- restricted technical guidance kept non-autonomous;
- generic staff escalation retained only as a true fallback;
- runtime knowledge-version bump;
- fresh B0-v7-or-later release acceptance after the new candidate is frozen;
- later prospective validation before broad rollout.

## Data sensitivity

Raw transcripts may contain customer identities, emails, Discord identities, order/support details, attachments and other sensitive support data. Do not copy raw corpus material into public repos, logs, hosted planner prompts or general documentation vaults. Documentation mirrors should contain specifications/summaries only, not the raw customer evidence.
