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

Phase 1 exists to make the historical Discord support-ticket corpus accessible for systematic analysis.

The source flow is:

```text
Discord ticket-log channel
  -> historical Tickety close-log messages
  -> exact View Transcript link buttons
  -> Tickety transcript pages
  -> normalized durable transcript corpus
  -> CM-Ticket-Transcripts
```

The channel contains more than one thousand ticket logs and may also contain other controls such as `View Ticket`. Those other controls are not transcript sources and must be ignored.

The first engineering milestone is not bulk ingestion. It is to validate extraction against a small representative sample, prove that ticket metadata and complete transcript content can be recovered correctly, and only then scale to the full channel history.

### Allowed repository content

`CM-Ticket-Transcripts` may contain data artifacts such as:

- normalized JSON or JSONL ticket records;
- indexes/manifests describing exported tickets;
- extraction status/failure manifests;
- raw transcript snapshots when needed to preserve source evidence and permit parser repair;
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

### Extraction tooling boundary

The approved Phase T1 exporter lives under:

```text
cm-discord-bot/tools/ticket-transcript-exporter/
```

This location is tooling-only. It is not imported by `src/`, is not emitted by the production TypeScript build, is not called from bot startup, and adds no production runtime dependency.

The supported command is:

```text
npm run export:ticket-transcripts
```

That command runs `run-ticket-transcript-export.mjs`, which applies the strict Discord button-target filter before delegating to the core acquisition/parser module.

The exporter is dependency-free Node.js 22 code and uses only:

- the existing Discord bot token for authorized Discord REST reads;
- the configured `DISCORD_GUILD_ID` for an exact-guild check;
- the operator-supplied ticket-log channel ID;
- Tickety transcript HTTPS pages;
- optional local Chrome/Chromium headless DOM capture when direct HTTP is insufficient.

It does **not** use the CM Internal Integrations API, HMAC credentials, website credentials, Supabase/Postgres credentials, or any mutation path.

Generated output is written to a separately checked-out `CM-Ticket-Transcripts` directory. No generated transcript data belongs in `cm-discord-bot`.

### Phase T1 exporter behavior

Current exporter implementation:

```text
tools/ticket-transcript-exporter/
├── run-ticket-transcript-export.mjs
└── export-ticket-transcripts.mjs
```

Strict discovery rule:

A candidate is eligible only when Discord returns a **link button** satisfying all of these conditions:

```text
type  = 2
style = 5
label = View Transcript   (case/whitespace normalized)
url   = https://tickety.top/transcripts/<id>
```

This means:

- `View Transcript` is accepted;
- `View Ticket` is ignored;
- other button labels are ignored;
- transcript-like links merely present in message content are ignored;
- transcript-like links merely present in unrelated embeds are ignored.

The strict wrapper preserves Discord message pagination metadata while neutralizing non-target messages before the core parser processes a page.

Safety/quality behavior:

- default run is capped to five transcripts;
- full-channel export requires explicit `--all`;
- Discord channel is verified against `DISCORD_GUILD_ID` before history access;
- Discord history is paginated 100 messages at a time;
- only strict `View Transcript` button targets are eligible;
- only canonical `https://tickety.top/transcripts/<id>` URLs may be fetched;
- redirects outside the allowed Tickety transcript path are rejected;
- Discord 429s and transient server errors are retried conservatively;
- transcript fetches are sequential with a default delay;
- per-transcript HTML is size bounded;
- `--resume` is the default;
- raw HTML, plain text and normalized source/ticket metadata are retained;
- failures are explicit and run-scoped rather than silently skipped;
- direct HTTP acquisition can fall back to local Chrome headless DOM capture.

The initial parser intentionally does **not** claim message-level Tickety DOM understanding before a real sample is inspected. It preserves raw HTML plus conservative visible text so the real Tickety structure can be learned from evidence and then upgraded without re-downloading the sample.

### Data sensitivity

Ticket transcripts can contain customer identifiers, emails, Discord identities, order/support details, attachments and other support data. Treat the corpus as sensitive operational data.

The transcript repository is private. Do not add credentials to the corpus, and do not publish or broaden access to transcript data as a convenience for analysis.

### Independence from the production bot

Normal Discord bot engineering continues independently. The transcript corpus may later inform support tooling, analytics or product decisions, but no such integration is implied by collecting the data.

A future feature that makes the production bot runtime read from or write to the transcript corpus requires separate architecture review and, if it changes a durable runtime/data boundary, a new ADR.

## Current status

```text
Side project: CM Ticket Transcript Corpus
Phase:        T1 — corpus acquisition
Status:       exporter implemented; strict View Transcript targeting added; real five-ticket validation pending
Data repo:    created, private, data-only
Tool:         tools/ticket-transcript-exporter/
Next gate:    run a five-ticket sample against the real log channel and inspect raw/text output before bulk export
```
