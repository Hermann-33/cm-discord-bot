# Related Side Projects

Updated: 2026-08-24 10:49 +08:00

This document records adjacent Cheater's Market workstreams that are intentionally outside the standalone Discord bot runtime but are relevant enough that future agents must understand the boundary.

For the current AI-support implementation, benchmark history and exact handoff, read `docs/context/AI_SUPPORT_HANDOVER_PROMPT.md`, `docs/context/AI_SUPPORT_SIDE_PROJECT.md`, and `docs/context/HANDOFF.md`.

## CM Ticket Transcript Corpus

Repository:

```text
Hermann-33/CM-Ticket-Transcripts
```

Repository role:

- private;
- data/specification-only;
- no executable application or extraction code;
- not a runtime dependency of `cm-discord-bot`;
- developed in parallel with normal Discord bot work.

### Objective

Phase T1 made the historical Discord support-ticket corpus accessible for systematic analysis.

The completed source flow is:

```text
Discord ticket-log channel
  -> exact View Transcript link buttons
  -> source-logs.jsonl
  -> Tickety /api/ticketTranscript?id=<id>
  -> application/vnd.msgpack
  -> Msgpackr-compatible decode
  -> normalized messages/users/attachments/replies
  -> CM-Ticket-Transcripts
```

The strict discovery run found **1,578** unique `View Transcript` records. `View Ticket` and other ticket-log controls are not transcript sources and remain ignored.

The structured bulk run completed with:

```text
source transcript records: 1,578
structured records:        1,578
failed:                    0
```

Phase T2 turned that complete corpus into a source-grounded support knowledge graph and canonical runtime knowledge source. The graph remains directly browsable in Obsidian while the production bot consumes only a separately reviewed, sanitized runtime derivative.

### Proven Tickety data path

The initial HTML and Chrome-rendered transcript-page approach did not expose the conversation content. The returned page was a JavaScript application shell.

A captured HAR from one working transcript proved the browser instead requests:

```text
GET https://tickety.top/api/ticketTranscript?id=<transcriptId>
Content-Type: application/vnd.msgpack
```

That one Msgpack response was decoded successfully and contained the actual ticket corpus structure: users, messages, roles, channels, guild/channel IDs, timestamps, message content, attachments, embeds, reactions, components and reply/message references.

The Tickety browser bundle uses a Msgpackr-compatible decoder configured with:

```text
useRecords: true
mapsAsObjects: true
int64AsType: string
custom extension type 7: identity wrapper
```

The structured exporter mirrors that configuration.

### Allowed data-repository content

`CM-Ticket-Transcripts` may contain:

- `source-logs.jsonl` and discovery metadata;
- normalized JSON/JSONL ticket records;
- plain-text transcript projections;
- indexes/manifests;
- run/failure manifests;
- raw Msgpack transcript payloads;
- legacy raw HTML snapshots retained as historical acquisition evidence;
- attachment URLs and metadata;
- explicitly scoped derived datasets;
- data-only analysis inputs;
- Markdown/JSON knowledge-graph artifacts derived from the corpus;
- canonical runtime-KB source data, benchmark data, adjudication overlays and audit artifacts.

### Forbidden data-repository content

The data repository must not contain:

- executable extraction/scraping/analysis code;
- bot/runtime source code;
- package/application scaffolding introduced to run tooling;
- Discord bot tokens;
- Internal Integrations API credentials or HMAC material;
- Supabase/Postgres credentials;
- `.env` files or copied production configuration;
- generated dependency directories;
- unrelated Discord bot source or deployment files.

### Extraction and analysis tooling boundary

Approved tooling lives under:

```text
cm-discord-bot/tools/ticket-transcript-exporter/
```

It is tooling-only: not imported by `src/`, not emitted by the production TypeScript build, not called by bot startup, and not a production runtime dependency.

The tooling expanded beyond the original acquisition scripts and now also contains canonicalization, benchmark-building, routing, privacy validation and hosted-triage evaluation utilities. Executable tooling remains in the public bot repository; the private transcript repository stays data/specification-only.

### Structured extractor behavior

`export-ticket-payloads.mjs`:

- reads transcript IDs from the existing `CM-Ticket-Transcripts/source-logs.jsonl`;
- does **not** rescan Discord;
- does not need the Discord bot token;
- calls only the fixed Tickety endpoint `https://tickety.top/api/ticketTranscript?id=<id>`;
- requires `application/vnd.msgpack` responses;
- decodes Tickety's record-based Msgpack format;
- validates that decoded payloads contain `users[]` and `messages[]`;
- resolves each message's `userId` to a compact author identity;
- preserves message content, timestamps, attachments, embeds, reactions, components and message references;
- writes raw binary payloads to `raw-msgpack/`;
- replaces legacy shell-based `transcripts/<id>.json` and `text/<id>.txt` records with schema-v2 structured records;
- skips only already-valid `tickety-msgpack-api` records under `--resume`;
- runs sequentially with a default 1250 ms delay;
- handles `429` using `Retry-After` and retries transient server/network failures;
- records 401/403 private/restricted transcripts as failures instead of bypassing access controls;
- size-caps each binary response;
- records explicit run/failure manifests.

### Analysis and canonicalization behavior

The complete corpus was reviewed exhaustively rather than sampled. The private repository now contains:

```text
analysis-input/
deep-review/
knowledge-deep/
knowledge-canonical/
runtime-kb/
knowledge-engineering/
```

The deep-review/canonicalization layers preserve source evidence, duplicate relationships, historical-only observations, current-state/dynamic facts, restricted technical material, unresolved questions and contradictions.

The corpus-level coverage currently accounts for:

```text
structured tickets:      1,578 / 1,578
messages:                39,090
historical fact nodes:    3,949
canonical runtime cases:  55
```

Historical customer PII must not be copied into the canonical chatbot runtime layer. Raw transcripts remain private source evidence.

Historical conversations are evidence, not automatically policy. A repeated staff answer may still be wrong, obsolete or contradictory. Canonicalization preserves contradictions/unknowns instead of silently converting every historical message into a bot instruction.

### Obsidian knowledge graph

The private graph is intended to remain directly usable as an Obsidian vault. Nodes use Markdown frontmatter plus `[[wikilinks]]` so Obsidian Graph view can display relationships without requiring a plugin.

The graph/canonical layer distinguishes:

- recognition signals;
- diagnostic questions;
- resolution/support actions;
- constraints and forbidden assumptions;
- escalation criteria;
- product/game/vendor/account-model scope;
- supporting evidence;
- contradictions and uncertainty;
- confidence/status.

### Local decoder dependency

The production bot dependency graph remains unchanged. The structured exporter expects a local, no-save Msgpackr install:

```powershell
npm.cmd install --no-save --package-lock=false --omit=optional msgpackr@2.0.4
```

This is a local tooling dependency only and is intentionally not persisted in `package.json` or `package-lock.json`.

### Structured source output

The completed v2 record set uses:

```text
CM-Ticket-Transcripts/
├── source-logs.jsonl
├── index.jsonl
├── manifest.json
├── transcripts/<transcriptId>.json
├── text/<transcriptId>.txt
├── raw-msgpack/<transcriptId>.msgpack
├── runs/msgpack-<runId>.json
└── failures/msgpack-<runId>.jsonl
```

Legacy `raw/<transcriptId>.html` shell files may remain until cleanup is explicitly scoped; they are not treated as complete transcript evidence.

### Data sensitivity

Ticket transcripts can contain customer identifiers, emails, Discord identities, order/support details, attachments and other support data. Treat the corpus as sensitive operational data.

The transcript repository is private. Do not add credentials to the corpus, and do not publish or broaden access to transcript data as a convenience for analysis.

### Independence from production

Normal Discord bot engineering continues independently. ADR-0012 permits one narrow derivative only: an operator-controlled importer may select sanitized canonical runtime fields into this public repository's bundled `support-runtime/` directory.

Production still cannot read the private repository, raw transcripts, evidence/provenance, transcript/fact IDs, routing exemplars, evaluation/holdout data, adjudication metadata or customer PII.

The private repository remains data/specification-only and is never written by bot startup. Canonical updates require an explicit offline import/review/commit cycle in the public bot repository.

## Current status

```text
Side project:                 CM Ticket Transcript / AI Support Knowledge Base
Phase T1 extraction:          COMPLETE
Strict links found:           1,578
Structured corpus:            1,578 / 1,578
Extraction failures:          0
Exhaustive deep review:       COMPLETE
Historical facts accounted:  3,949
Canonical runtime cases:      55
Data repo:                    private, data/specification-only
Public runtime derivative:    sanitized support-runtime/ only
Hosted planner candidate:     Groq openai/gpt-oss-120b
Customer-facing AI:           disabled / unwired
Workstream state:             development validation complete; final holdout untouched
```

### Current V3 benchmark checkpoint

The original independently reviewed V3 source remains immutable. The separate committed adjudication overlay excludes **26** rows:

```text
bad_gold:                  14
ambiguous_gold:             8
safety_boundary_conflict:   3
safety_boundary_review:     1
```

The latest user-confirmed generated planner benchmark is:

```text
reviewedRecords:           262
adjudicatedRecords:        236
records:                   236
reviewQueueRecords:          0
representabilityRate:        1
```

The post-fix Groq 40-row consumed-development prefix produced 36 optimal and 4 safe-progress rows with zero unsafe, fallback, invalid, scope-leakage, or semantic-review rows. The final holdout remains untouched and customer-facing AI remains disabled/unwired. See `AI_SUPPORT_TRIAGE_VALIDATION_2026-08-25.md` for the exact repair and validation evidence.
