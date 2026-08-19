# Related Side Projects

Updated: 2026-08-19

This document records adjacent Cheater's Market workstreams that remain outside the standalone Discord bot runtime but are relevant enough that future agents must understand the boundary.

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

Phase T1 exists to make the historical Discord support-ticket corpus accessible for systematic analysis.

The now-proven source flow is:

```text
Discord ticket-log channel
  -> exact View Transcript buttons only
  -> source-logs.jsonl with transcript IDs/URLs + close-log metadata
  -> GET https://tickety.top/api/ticketTranscript?id=<transcriptId>
  -> application/vnd.msgpack payload
  -> msgpackr-compatible decode
  -> canonical schema-v2 transcript JSON + readable text + raw payload
  -> CM-Ticket-Transcripts
```

The ticket-log channel also contains other controls such as `View Ticket`; those are intentionally ignored.

### Allowed repository content

`CM-Ticket-Transcripts` may contain data artifacts such as:

- normalized JSON or JSONL transcript records;
- indexes/manifests describing exported tickets;
- extraction status/failure manifests;
- raw transcript payload snapshots needed to preserve source evidence and permit parser repair;
- plain-text transcript projections for search/analysis;
- attachment URLs and attachment metadata;
- derived data products produced from the corpus when explicitly scoped.

### Forbidden repository content

The data repository must not contain:

- executable extraction/scraping code;
- bot/runtime source code;
- package-manager or application scaffolding introduced only to run an exporter;
- Discord bot tokens;
- Internal Integrations API credentials or HMAC material;
- Supabase/Postgres credentials;
- `.env` files or copied production configuration;
- generated dependency directories;
- unrelated Discord bot source or deployment files.

### Tooling boundary

Approved non-runtime tooling lives under:

```text
cm-discord-bot/tools/ticket-transcript-exporter/
```

It is not imported by `src/`, not emitted by the production TypeScript build, not called from bot startup and adds no production runtime dependency.

Stage 1 discovery command:

```text
npm run export:ticket-transcripts
```

Stage 2 exact transcript-payload command:

```text
npm run extract:ticket-transcripts
```

Generated output is written to a separately checked-out `CM-Ticket-Transcripts` directory. No generated transcript data belongs in `cm-discord-bot`.

### Stage 1 — Discord discovery

The supported Stage-1 command routes Discord history through the strict `run-ticket-transcript-export.mjs` filter before the core discovery module.

A candidate is eligible only when Discord returns a link button satisfying:

```text
type  = 2
style = 5
label = View Transcript   (case/whitespace normalized)
url   = https://tickety.top/transcripts/<id>
```

Therefore:

- `View Transcript` is accepted;
- `View Ticket` and other controls are ignored;
- transcript-like URLs in ordinary message content are ignored;
- transcript-like URLs in unrelated embeds are ignored.

Stage 1 writes the durable source manifest:

```text
CM-Ticket-Transcripts/source-logs.jsonl
```

The current real channel discovery produced 1,578 valid transcript IDs/URLs.

### Stage 2 — exact Tickety payload

The original HTML experiment proved insufficient: direct transcript-page HTTP and Chrome DOM dumps can return only the same Next.js/application shell with no actual ticket messages.

A user-captured HAR established the real transcript data contract:

```text
GET https://tickety.top/api/ticketTranscript?id=<transcriptId>
Content-Type: application/vnd.msgpack
```

A one-ticket proof decoded the response successfully and recovered seven top-level fields:

```text
users
messages
roles
channels
channelId
guildId
exportedAt
```

The captured proof contained 74 real Discord messages and preserved actual content, timestamps, user IDs, attachments, embeds, reactions, message types/flags and message references where supplied.

The Stage-2 extractor:

- reads IDs only from the previously validated `source-logs.jsonl` corpus;
- calls only the fixed Tickety `/api/ticketTranscript?id=<id>` endpoint;
- accepts the expected MessagePack/octet-stream response types;
- size-caps binary payloads before decoding;
- decodes the msgpackr record/bundled-string shapes proven by the real HAR;
- validates users/messages/roles/channels plus required per-message fields before accepting a record;
- writes canonical schema-v2 JSON under `transcripts/<id>.json`;
- writes a readable projection under `text/<id>.txt`;
- retains the exact binary source under `payloads/<id>.msgpack` with SHA-256 acquisition metadata;
- rebuilds a schema-v2 `index.jsonl` and `manifest.json`;
- records explicit run/failure manifests;
- uses sequential requests with a default 650 ms delay;
- retries HTTP 429 and transient server failures conservatively;
- treats only complete schema-v2 `tickety-msgpack-api-v1` records as resumable completion.

Earlier schema-v1 HTML-shell records are intentionally not considered complete and are replaced automatically by Stage 2.

### Canonical corpus layout

```text
CM-Ticket-Transcripts/
├── manifest.json
├── index.jsonl
├── source-logs.jsonl
├── transcripts/<transcriptId>.json
├── text/<transcriptId>.txt
├── payloads/<transcriptId>.msgpack
├── runs/<runId>-payloads.json
├── failures/<runId>-payloads.jsonl
└── raw/<transcriptId>.html   # legacy/non-canonical HTML-shell experiment may remain
```

### Data sensitivity

Ticket transcripts can contain customer identifiers, emails, Discord identities, order/support details, attachments and other support data. Treat the corpus as sensitive operational data.

The transcript repository remains private. Do not add credentials to the corpus, and do not publish or broaden access to transcript data as a convenience for analysis.

### Independence from the production bot

Normal Discord bot engineering continues independently. Stage 2 does not start the bot, register commands, use the Internal Integrations API, access the website, or access Supabase/Postgres.

A future feature that makes the production bot runtime read from or write to the transcript corpus requires separate architecture review and, if it changes a durable runtime/data boundary, a new ADR.

## Current status

```text
Side project: CM Ticket Transcript Corpus
Phase:        T1 — corpus acquisition
Discovery:    1,578 valid View Transcript records found
Payload proof: one real Tickety msgpack transcript decoded successfully (74 messages)
Stage-2 tool: implemented on TASK-TRANSCRIPTS-002 / PR #8
Next gate:    merge PR #8, run one local Stage-2 payload test, then run --all --resume for the 1,578 corpus
Data repo:    private, data-only
```
