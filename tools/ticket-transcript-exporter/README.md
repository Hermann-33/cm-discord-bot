# CM Ticket Transcript Exporter

Standalone, non-runtime Node.js 22+ tooling for the Cheater's Market Tickety transcript side project.

This tooling lives under `tools/`. It is not imported by `src/`, not emitted into `dist/`, and is not part of bot startup/runtime.

The data repository remains separate:

- `cm-discord-bot` owns the non-runtime extraction tooling;
- `CM-Ticket-Transcripts` remains private **data only** and receives generated corpus artifacts only.

## Two-stage extraction model

Phase T1 now uses two distinct stages.

### Stage 1 — Discord discovery

`npm run export:ticket-transcripts` reads the authorized ticket-log channel and records only Discord link buttons whose normalized label is exactly **View Transcript** and whose URL matches `https://tickety.top/transcripts/<id>`.

`View Ticket` and every other ticket-log control are ignored.

The durable discovery result is:

```text
CM-Ticket-Transcripts/source-logs.jsonl
```

This file contains the transcript IDs/URLs plus Discord close-log metadata.

### Stage 2 — exact Tickety transcript payload

A real HAR inspection proved that the transcript page HTML is only an application shell. The conversation itself is loaded from:

```text
GET https://tickety.top/api/ticketTranscript?id=<transcriptId>
Content-Type: application/vnd.msgpack
```

The response is a msgpackr-encoded binary payload containing the actual transcript structure, including users, messages, roles, channels, timestamps, message content, attachments, embeds, reactions and message references where present.

`npm run extract:ticket-transcripts` reads IDs from `source-logs.jsonl`, calls this API directly, decodes the msgpackr payload, validates the message structure and writes the canonical corpus.

No Discord bot token is required for Stage 2 once `source-logs.jsonl` exists.

## Canonical Stage-2 output

```text
CM-Ticket-Transcripts/
├── manifest.json
├── index.jsonl
├── source-logs.jsonl
├── transcripts/
│   └── <transcriptId>.json
├── text/
│   └── <transcriptId>.txt
├── payloads/
│   └── <transcriptId>.msgpack
├── runs/
│   └── <runId>-payloads.json
├── failures/
│   └── <runId>-payloads.jsonl
└── raw/
    └── <transcriptId>.html   # legacy/non-canonical HTML-shell experiment may remain
```

Each canonical `transcripts/<id>.json` uses schema version 2 and preserves:

- close-log/ticket metadata from Discord discovery;
- Tickety API acquisition metadata and payload SHA-256;
- `guildId`, `channelId`, `exportedAt`;
- transcript `users`, `roles`, and `channels`;
- the exact decoded `messages` array, including content, timestamps, attachments, embeds, reactions, types, flags and message references when supplied by Tickety.

The `text/<id>.txt` file is a readable projection that resolves message user IDs to names/usernames while retaining attachment URLs and embed text. The `.msgpack` file is retained as the raw source payload so decoding can be audited or repaired later without another network request.

## Requirements

- Node.js 22+
- Stage 1 only: existing CM Discord bot token, `DISCORD_GUILD_ID`, View Channel + Read Message History permissions, and Message Content intent
- Stage 2: an existing `CM-Ticket-Transcripts/source-logs.jsonl` produced by Stage 1

No HMAC/Internal Integrations API credential, website credential, Supabase/Postgres credential, or database access is used.

## Tests

```powershell
npm.cmd test
```

Focused payload tests cover the verified msgpackr record extension, Tickety extension wrapper, CLI bulk safety, source-log validation/deduplication, transcript structure validation, readable text projection and schema-v2 resume behavior.

## Stage 1 — discovery only

Example:

```powershell
npm.cmd run export:ticket-transcripts -- --env-file .\.env --channel-id YOUR_TICKET_LOG_CHANNEL_ID --output-dir ..\CM-Ticket-Transcripts --limit 4000 --dry-run
```

The scanner walks Discord history until it finds the requested number of valid `View Transcript` buttons or reaches the end of accessible channel history.

## Stage 2 — prove one real payload first

```powershell
npm.cmd run extract:ticket-transcripts -- --input-dir ..\CM-Ticket-Transcripts --limit 1 --no-resume
```

Expected success resembles:

```text
[transcripts] payload extraction selected 1/1578 discovered transcript IDs.
[transcripts] 1/1 <id>: fetching msgpack payload...
[transcripts] <id>: saved 74 messages (<bytes> bytes).
[transcripts] complete: fetched=1 skipped=0 failed=0 complete=1/1578
```

Inspect the resulting `transcripts/<id>.json` and confirm that `transcript.messages` contains the actual conversation before bulk mode.

## Stage 2 — full corpus

After the one-record payload test succeeds:

```powershell
npm.cmd run extract:ticket-transcripts -- --input-dir ..\CM-Ticket-Transcripts --all --resume
```

For the currently discovered corpus, this processes all 1,578 source IDs.

`--resume` skips only complete schema-v2 records acquired through `tickety-msgpack-api-v1`. Earlier schema-v1 HTML-shell records are intentionally **not** treated as complete and will be replaced automatically.

The extractor is sequential and defaults to a 650 ms inter-request delay. It also retries HTTP 429 and transient server errors with backoff. Do not remove throttling merely to make the run faster.

If the process is interrupted, run the same command again. Completed schema-v2 records are skipped and extraction resumes over the remaining IDs.

## Payload safety properties

- Transcript IDs come from the previously validated `source-logs.jsonl` discovery corpus.
- Only the fixed Tickety endpoint `https://tickety.top/api/ticketTranscript?id=<id>` is requested.
- No arbitrary URL from ticket content is fetched.
- Responses must be successful and use the expected MessagePack/octet-stream content type.
- Binary responses are size-capped before decoding.
- Decoded payloads must contain valid users/messages/roles/channels arrays and required message fields before they are accepted.
- Raw binary payloads are SHA-256 recorded and retained.
- Existing schema-v2 records are resumable; incomplete schema-v1 HTML records are regenerated.
- Failures are explicit and run-scoped rather than silently omitted.
- No production bot mutation, command registration, Internal Integrations API call, website call, or database access exists in Stage 2.

## Legacy HTML experiment

The original exporter attempted direct transcript-page HTML and optional Chrome `--dump-dom`. Real data showed that those responses could contain the same Next.js/application shell with zero transcript messages. Those HTML files are now non-canonical historical artifacts only.

Do not use `plainTextChars`, `estimatedMessageCount`, or the old 14,956-byte HTML-shell records as proof that a ticket transcript was extracted. Canonical completion is a validated schema-v2 msgpack API record with a decoded `messages` array.
