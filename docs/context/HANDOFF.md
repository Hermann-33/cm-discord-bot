# Latest Handoff

Updated: 2026-08-19

## Authority

- ADR-0005 — `cm aura` customer message command; admin/staff slash/components/modals.
- ADR-0006 — `/cm` exact configured guild + non-empty explicit `BOT_ADMIN_USER_IDS`; no `/cm` channel restriction.
- ADR-0007 — Aura/wallet five-minute fresh-state-bound confirmation + stable idempotency/audit.
- ADR-0008 — separate customer-facing Share to Chat renderer, no public admin controls, Discord identity/time/audit presentation policy.
- ADR-0009 — canonical CM account email is intentionally shared; all other ADR-0008 field/control exclusions remain.
- ADR-0010 — `CM-Ticket-Transcripts` is a separate private data-only repository with no executable extraction/runtime code and no production-bot dependency.
- `BOT_AUDIT_LOG_CHANNEL_ID` required before refund/Aura/wallet execute.
- no direct Supabase/Postgres.
- manual fulfillment blocked until website owns a dedicated mutation.

## Current mainline baseline

```text
master
087e2d431ff3ddb74e034b9d736c64f1b914abc9
```

TASK-TRANSCRIPTS-001 is merged. Production bot runtime behavior remains unchanged by transcript tooling.

## Current production bot state

The current bot includes customer `cm aura`, `/refresh-leaderboard`, `/cm user`, `/cm order`, compact operational panels, canonical refund, confirmed Aura/wallet adjustment, Share to Chat, Discord timestamps and concise mutation audits.

No direct database path exists. The bot remains HMAC Internal Integrations API bounded.

## Parallel workstream — Ticket Transcript Corpus

Repository:

```text
Hermann-33/CM-Ticket-Transcripts
```

Boundary:

```text
private
data-only
not a production-bot runtime dependency
```

### Stage 1 — discovery

Supported command:

```text
npm run export:ticket-transcripts
```

The strict Discord wrapper accepts only link buttons labelled `View Transcript` whose URL matches `https://tickety.top/transcripts/<id>`. `View Ticket`, other controls, message-content fallbacks and unrelated embed links are ignored.

The real ticket-log scan reached the end of accessible history and produced:

```text
1,578 valid transcript IDs/URLs
```

Those IDs and close-log metadata live in the data repository's `source-logs.jsonl`.

### HTML experiment conclusion

The original HTTP/Chrome transcript-page acquisition is not canonical. Real runs produced repeated HTML application shells with no message text (`plainTextChars=0`, message count 0). Those schema-v1 records must not be treated as completed transcript extraction.

### Stage 2 — exact transcript payload

A user-captured Chrome HAR proved that Tickety loads actual conversation data through:

```text
GET https://tickety.top/api/ticketTranscript?id=<transcriptId>
Content-Type: application/vnd.msgpack
```

The one-ticket proof successfully decoded the msgpackr response into:

```text
users
messages
roles
channels
channelId
guildId
exportedAt
```

The proof contained 74 actual messages with content/timestamps and preserved attachments, embeds, reactions, types/flags and message references where supplied.

TASK-TRANSCRIPTS-002 / PR #8 implements Stage 2 under:

```text
tools/ticket-transcript-exporter/
├── tickety-msgpackr-decoder.mjs
└── extract-ticket-transcript-payloads.mjs
```

New command:

```text
npm run extract:ticket-transcripts
```

The Stage-2 tool:

- requires only the existing `CM-Ticket-Transcripts/source-logs.jsonl` data file;
- does not need the Discord bot token once discovery is complete;
- calls only the fixed Tickety `/api/ticketTranscript?id=<id>` endpoint;
- validates response type/size and decoded transcript shape;
- writes canonical schema-v2 `transcripts/<id>.json`;
- writes readable `text/<id>.txt`;
- retains exact binary `payloads/<id>.msgpack` plus SHA-256 acquisition metadata;
- rebuilds canonical v2 index/manifest;
- treats old schema-v1 HTML records as incomplete so they are automatically replaced;
- skips only already-complete schema-v2 API records with `--resume`;
- defaults to one transcript, while full corpus requires explicit `--all`;
- defaults to 650 ms sequential pacing and retries 429/5xx responses conservatively;
- does not use Internal Integrations API/HMAC, website, Supabase/Postgres or any bot mutation/runtime path.

## Transcript T1 exact next action

Once PR #8 is merged, pull `master` locally and first prove one Stage-2 record:

```powershell
npm.cmd run extract:ticket-transcripts -- --input-dir ..\CM-Ticket-Transcripts --limit 1 --no-resume
```

Confirm the resulting `transcripts/<id>.json` contains a populated `transcript.messages` array.

Then run the full 1,578-ID corpus:

```powershell
npm.cmd run extract:ticket-transcripts -- --input-dir ..\CM-Ticket-Transcripts --all --resume
```

If interrupted, run the same command again; complete schema-v2 payload records are skipped.

## Main-bot next engineering track

The main bot roadmap may proceed independently with production-hardening work such as branch protection/status checks, registration-specific config loading, stronger generic redaction and deployment/rollback/credential-rotation runbooks.

Manual fulfillment remains blocked on a dedicated website-owned operation.
