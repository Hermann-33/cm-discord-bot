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
  -> historical Tickety log messages
  -> View Transcript URLs
  -> Tickety transcript pages
  -> normalized durable transcript corpus
  -> CM-Ticket-Transcripts
```

The channel contains more than one thousand ticket logs. The first engineering milestone is not bulk ingestion. It is to validate extraction against a small representative sample, prove that ticket metadata and complete transcript messages can be recovered correctly, and only then scale to the full channel history.

### Allowed repository content

`CM-Ticket-Transcripts` may contain data artifacts such as:

- normalized JSON or JSONL ticket records;
- indexes/manifests describing exported tickets;
- extraction status/failure manifests;
- raw transcript snapshots when needed to preserve source evidence and permit parser repair;
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

Code used to collect the corpus must live outside `CM-Ticket-Transcripts`, for example in a temporary/local extraction workspace or another separately scoped tooling location.

The extractor may read the authorized Discord ticket-log channel and fetch the referenced Tickety transcript pages from an authorized environment. That does not make the exporter part of the production bot runtime.

Do not modify `cm-discord-bot` merely to make transcript extraction convenient. Any production-bot change for transcript ingestion requires a separate explicit task and must satisfy the normal bot architecture/security workflow.

### Data sensitivity

Ticket transcripts can contain customer identifiers, emails, Discord identities, order/support details, attachments and other support data. Treat the corpus as sensitive operational data.

The transcript repository is private. Do not add credentials to the corpus, and do not publish or broaden access to transcript data as a convenience for analysis.

### Independence from the production bot

Normal Discord bot engineering continues independently. The transcript corpus may later inform support tooling, analytics or product decisions, but no such integration is implied by collecting the data.

A future feature that makes the production bot read from or write to the transcript corpus requires separate architecture review and, if it changes a durable runtime/data boundary, a new ADR.

## Current status

```text
Side project: CM Ticket Transcript Corpus
Phase:        1 — corpus acquisition
Status:       implementation starting
Data repo:    created, private, data-only
Next gate:    validate a small sample end-to-end before bulk export
```
