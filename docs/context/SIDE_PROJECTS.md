# Related Side Projects

Updated: 2026-08-20

This document records adjacent Cheater's Market workstreams that are intentionally outside the standalone Discord bot runtime but are relevant enough that future agents must understand the boundary.

## CM Ticket Transcript Corpus

Repository:

```text
Hermann-33/CM-Ticket-Transcripts
```

Repository role:

- private;
- data-only;
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

Phase T2 now turns that complete corpus into a source-grounded support knowledge graph that can be browsed as an Obsidian graph and later exported into a compact context pack for a support chatbot.

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
- Markdown/JSON knowledge-graph artifacts derived from the corpus.

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

Current modules:

```text
tools/ticket-transcript-exporter/
├── run-ticket-transcript-export.mjs
├── export-ticket-transcripts.mjs
├── export-ticket-payloads.mjs
└── prepare-knowledge-analysis.mjs
```

Roles:

- `run-ticket-transcript-export.mjs` — strict Discord `View Transcript` discovery wrapper;
- `export-ticket-transcripts.mjs` — original discovery/HTML acquisition support;
- `export-ticket-payloads.mjs` — structured Msgpack transcript extractor;
- `prepare-knowledge-analysis.mjs` — offline deterministic packer for exhaustive T2 corpus review.

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

### T2 analysis-input behavior

`prepare-knowledge-analysis.mjs` is an offline read of the already-complete local data repository. It makes no Discord, Tickety, LLM, website/API or database call.

It produces data-only files under the private transcript repository:

```text
CM-Ticket-Transcripts/
└── analysis-input/
    ├── corpus.ndjson
    ├── review.ndjson
    ├── stats.json
    ├── manifest.json
    └── README.md
```

`corpus.ndjson` preserves every full plain-text ticket as one line-addressable record so T2 can review all 1,578 tickets without losing source fidelity.

`review.ndjson` is only a deterministic triage view containing bounded opening/customer, other-human-response and closing excerpts. It is **not** an LLM summary and cannot be promoted into a canonical support rule without checking source evidence where needed.

### T2 knowledge graph target

The final graph is intended to be directly usable as an Obsidian vault. Nodes use Markdown frontmatter plus `[[wikilinks]]` so Obsidian's Graph view can display relationships without requiring a plugin.

Target data-only layout:

```text
knowledge/
├── 00 - Support Knowledge Graph.md
├── Categories/
├── Intents/
├── Symptoms/
├── Procedures/
├── Policies/
├── Escalations/
├── Products/
├── Entities/
├── Examples/
└── Evidence/
```

Each canonical node should distinguish:

- observed recognition signals;
- diagnostic questions;
- resolution path or support action;
- constraints/forbidden assumptions;
- escalation criteria;
- linked product/category/intent nodes;
- supporting ticket evidence/counts;
- contradictions or uncertainty;
- confidence/status.

Historical customer PII must not be copied into the canonical chatbot knowledge layer. Raw transcripts remain private source evidence.

Historical conversations are evidence, not automatically policy. A repeated staff answer may still be wrong, obsolete or contradictory. T2 must preserve contradictions/unknowns rather than silently converting every historical message into a bot instruction.

### Local decoder dependency

The production bot dependency graph remains unchanged. The structured exporter expects a local, no-save Msgpackr install:

```powershell
npm.cmd install --no-save --package-lock=false --omit=optional msgpackr@2.0.4
```

This is a local tooling dependency only and is intentionally not persisted in `package.json` or `package-lock.json`.

### Structured output

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

### Independence from the production bot

Normal Discord bot engineering continues independently. The transcript corpus and knowledge graph may later inform support tooling, analytics or a separate chatbot, but the current production bot has no runtime dependency on either.

Any future production-bot runtime read/write integration with the transcript corpus or generated knowledge graph requires separate architecture review and, if it changes a durable runtime/data boundary, a new ADR.

## Current status

```text
Side project:          CM Ticket Transcript Corpus
Phase T1:              COMPLETE
Strict links found:    1,578
Structured corpus:     1,578 / 1,578
Extraction failures:   0
Data repo:             private, data-only
Phase T2:              Support Knowledge Graph
T2 first gate:         generate analysis-input pack from complete local corpus
T2 final view:         Obsidian Markdown graph with wikilinks
Later runtime target:  compact chatbot context derived from canonical graph
```

Canonicalization is now implemented as an offline, data-repository-targeted phase. The public tools build, validate, privacy-scan, and evaluate `knowledge-canonical/` plus `runtime-kb/`; the production bot does not read either output.
