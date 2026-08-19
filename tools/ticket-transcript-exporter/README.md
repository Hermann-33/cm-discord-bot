# CM Ticket Transcript Exporter

Non-production Node.js 22+ tooling for the Cheater's Market Tickety transcript side project.

This tooling lives under `tools/` only. It is not imported by `src/`, not emitted into `dist/`, and not part of bot startup/runtime. `CM-Ticket-Transcripts` remains a separate private **data-only** repository.

## Current architecture

Phase T1 now has two distinct stages:

```text
Discord ticket-log channel
  -> strict View Transcript discovery
  -> source-logs.jsonl
  -> Tickety /api/ticketTranscript?id=<id>
  -> application/vnd.msgpack
  -> Msgpackr decode
  -> structured messages/users/attachments/replies
  -> CM-Ticket-Transcripts
```

The earlier HTML/Chrome approach is retained only as historical acquisition evidence. Real Tickety message content is delivered through the structured transcript API, not the initial transcript-page HTML shell.

## Stage 1 — discover transcript IDs

The Discord discovery command targets only link buttons whose normalized label is exactly `View Transcript`. `View Ticket` and all other ticket-log controls are ignored.

```powershell
npm.cmd run export:ticket-transcripts -- --env-file .\.env --channel-id YOUR_TICKET_LOG_CHANNEL_ID --output-dir ..\CM-Ticket-Transcripts --all --dry-run
```

This creates/updates `source-logs.jsonl`. It uses the existing bot token only for authorized read-only Discord history access.

## Stage 2 — extract actual transcript content

The HAR validation proved that Tickety's page requests:

```text
GET https://tickety.top/api/ticketTranscript?id=<transcriptId>
Content-Type: application/vnd.msgpack
```

Tickety's browser decoder uses Msgpackr-compatible records with:

```text
useRecords: true
mapsAsObjects: true
int64AsType: string
custom extension type 7: identity wrapper
```

The structured exporter mirrors that decoder configuration.

### Install the local decoder

`msgpackr` is intentionally not added to the production bot dependency graph. Install it locally without changing `package.json` or `package-lock.json`:

```powershell
npm.cmd install --no-save --package-lock=false --omit=optional msgpackr@2.0.4
```

This is a local tooling dependency only. A later `npm ci` may remove it; reinstall it before structured extraction if necessary.

### Five-ticket structured test

```powershell
npm.cmd run export:ticket-transcript-payloads -- --output-dir ..\CM-Ticket-Transcripts --limit 5 --no-resume
```

Expected progress resembles:

```text
[transcripts] 1/5 <id>: fetching structured payload...
[transcripts] <id>: saved 74 messages (14828 bytes).
```

A successful record must contain a real `transcript.messages` array, not `plainTextChars: 0` HTML-shell output.

### Full corpus

Once the structured test succeeds:

```powershell
npm.cmd run export:ticket-transcript-payloads -- --output-dir ..\CM-Ticket-Transcripts --all --resume
```

The command reads all IDs from the existing `source-logs.jsonl`; it does **not** rescan Discord.

Default pacing is one request every 1250 ms. The HAR showed an API rate-limit value of 8, so the exporter runs sequentially, handles `429` with `Retry-After`, retries transient server/network errors, and records any remaining failures explicitly.

## Structured output

For each successful transcript:

```text
CM-Ticket-Transcripts/
├── source-logs.jsonl
├── index.jsonl
├── manifest.json
├── transcripts/
│   └── <transcriptId>.json
├── text/
│   └── <transcriptId>.txt
├── raw-msgpack/
│   └── <transcriptId>.msgpack
├── runs/
│   └── msgpack-<runId>.json
└── failures/
    └── msgpack-<runId>.jsonl
```

The normalized JSON preserves:

- ticket/log metadata from Discord discovery;
- decoded Tickety users;
- every decoded message;
- resolved author identity per message;
- timestamps and edited timestamps;
- message content;
- attachments and Discord CDN URLs;
- embeds;
- reactions;
- components;
- reply/message references;
- roles/channels/guild/channel IDs;
- raw Msgpack acquisition checksum and byte count.

The text projection includes author, timestamp, content, embed text, attachment URLs, and reply references for search/analysis.

## Resume behavior

`--resume` skips only records already proven to be schema-v2 `tickety-msgpack-api` records.

The old HTML-shell JSON files are **not** treated as complete and will be replaced automatically as their structured payloads are fetched.

This allows an interrupted 1,578-ticket run to be restarted safely without re-fetching successful structured records.

## Private/restricted transcripts

The validated sample was public and required no cookie or authorization header. Some other transcripts may be private. `401` and `403` responses are recorded as failures; the exporter does not bypass Tickety access controls.

## Safety boundaries

- no production bot startup;
- no Discord write/mutation;
- no Internal Integrations API call;
- no HMAC/Supabase/Postgres credential;
- no direct database access;
- no arbitrary URL fetching;
- transcript IDs come only from the existing data corpus;
- endpoint is fixed to `https://tickety.top/api/ticketTranscript`;
- bounded payload size;
- sequential, rate-limited requests;
- explicit failure records;
- raw binary retained for decoder/parser repair.
