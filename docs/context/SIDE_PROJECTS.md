# Related Side Projects

Updated: 2026-08-19

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

Phase T1 exists to make the historical Discord support-ticket corpus accessible for systematic analysis.

The current source flow is:

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

The operator's full discovery run found **1,578** unique strict `View Transcript` records. `View Ticket` and other ticket-log controls are not transcript sources and remain ignored.

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
- explicitly scoped derived datasets.

### Forbidden data-repository content

The data repository must not contain:

- executable extraction/scraping code;
- bot/runtime source code;
- package/application scaffolding introduced to run an exporter;
- Discord bot tokens;
- Internal Integrations API credentials or HMAC material;
- Supabase/Postgres credentials;
- `.env` files or copied production configuration;
- generated dependency directories;
- unrelated Discord bot source or deployment files.

### Extraction tooling boundary

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
└── export-ticket-payloads.mjs
```

Roles:

- `run-ticket-transcript-export.mjs` — strict Discord `View Transcript` discovery wrapper;
- `export-ticket-transcripts.mjs` — original discovery/HTML acquisition support;
- `export-ticket-payloads.mjs` — current structured Msgpack transcript extractor.

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

The validated HAR exposed `x-ratelimit-limit: 8`; the sequential pacing is intentionally conservative and the exporter remains resumable.

### Local decoder dependency

The production bot dependency graph remains unchanged. The structured exporter expects a local, no-save Msgpackr install:

```powershell
npm.cmd install --no-save --package-lock=false --omit=optional msgpackr@2.0.4
```

This is a local tooling dependency only and is intentionally not persisted in `package.json` or `package-lock.json`.

### Structured output

A successful v2 record set uses:

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

Normal Discord bot engineering continues independently. The transcript corpus may later inform support tooling, analytics or product decisions, but no such integration is implied by collecting the data.

Any future production-bot runtime read/write integration with the transcript corpus requires separate architecture review and, if it changes a durable runtime/data boundary, a new ADR.

## Current status

```text
Side project:       CM Ticket Transcript Corpus
Phase:              T1 — corpus acquisition
Strict links found: 1,578
One-ticket proof:   COMPLETE — real Msgpack transcript decoded
Bulk exporter:      IMPLEMENTED on TASK-TRANSCRIPTS-002 branch
Data repo:          private, data-only
Next gate:          five-record local structured run, then --all --resume
```
