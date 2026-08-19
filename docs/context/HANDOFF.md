# Latest Handoff

Updated: 2026-08-19

## Authority

- ADR-0005 — `cm aura` customer message command; admin/staff slash/components/modals.
- ADR-0006 — `/cm` exact configured guild + non-empty explicit `BOT_ADMIN_USER_IDS`; no `/cm` channel restriction.
- ADR-0007 — Aura/wallet five-minute fresh-state-bound confirmation + stable idempotency/audit.
- ADR-0008 — separate customer-facing Share to Chat renderer, no public admin controls, Discord identity/time/audit presentation policy.
- ADR-0009 — canonical CM account email is intentionally shared; all other ADR-0008 field/control exclusions remain.
- ADR-0010 — `CM-Ticket-Transcripts` is a separate private data-only repository with no executable extraction/runtime code and no production-bot dependency.
- no direct Supabase/Postgres.
- manual fulfillment remains blocked until website owns a dedicated mutation.

## Current mainline baseline

```text
master
087e2d431ff3ddb74e034b9d736c64f1b914abc9
```

TASK-TRANSCRIPTS-001 is merged on mainline. The production bot remains unchanged by transcript tooling.

## Current production bot state

The bot includes customer `cm aura`, `/refresh-leaderboard`, `/cm user`, `/cm order`, compact operational panels, canonical refund, confirmed Aura/wallet adjustment, Share to Chat, Discord timestamps and concise mutation audits.

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
no executable exporter code
no credentials
not a production-bot runtime dependency
```

### Discovery status

The strict Discord discovery path is complete enough for the current corpus:

```text
Discord ticket-log channel
  -> exact View Transcript buttons only
  -> 1,578 unique transcript records
  -> CM-Ticket-Transcripts/source-logs.jsonl
```

`View Ticket`, other buttons and transcript-like fallback URLs outside the exact `View Transcript` button are ignored.

### Proven transcript-content path

The original Tickety transcript page returns only a JavaScript application shell; HTML/Chrome DOM capture did not contain the conversation.

A real HAR from a working transcript proved the browser calls:

```text
GET https://tickety.top/api/ticketTranscript?id=<transcriptId>
Content-Type: application/vnd.msgpack
```

The one-ticket HAR payload was decoded successfully and contained real users/messages plus timestamps, content, attachments, embeds, reactions, components and reply references.

Tickety's browser bundle decodes the payload with Msgpackr semantics:

```text
useRecords: true
mapsAsObjects: true
int64AsType: string
custom extension type 7: identity wrapper
```

### TASK-TRANSCRIPTS-002 implementation

Feature branch:

```text
task/ticket-transcript-msgpack-bulk
```

New tooling:

```text
tools/ticket-transcript-exporter/export-ticket-payloads.mjs
```

The structured exporter:

- reads IDs from `source-logs.jsonl`; it does not rescan Discord;
- uses no Discord bot token;
- calls only the fixed Tickety transcript API endpoint;
- requires `application/vnd.msgpack`;
- decodes the real structured payload;
- resolves message authors from the decoded user table;
- preserves messages, attachments, embeds, reactions, components and message references;
- writes raw binary payloads to `raw-msgpack/`;
- overwrites old shell-derived `transcripts/<id>.json` and `text/<id>.txt` as each structured record succeeds;
- treats only schema-v2 `tickety-msgpack-api` records as resumable successes;
- defaults to five records; full corpus requires explicit `--all`;
- runs sequentially with 1250 ms pacing and handles 429/transient failures;
- records private/restricted 401/403 transcripts as failures rather than bypassing controls.

The production package dependency graph remains unchanged. Before a local structured run, install Msgpackr without saving it:

```powershell
npm.cmd install --no-save --package-lock=false --omit=optional msgpackr@2.0.4
```

### Exact next local gate

After TASK-TRANSCRIPTS-002 is merged and pulled locally, from the root of `cm-discord-bot`:

```powershell
npm.cmd install --no-save --package-lock=false --omit=optional msgpackr@2.0.4
npm.cmd run export:ticket-transcript-payloads -- --output-dir ..\CM-Ticket-Transcripts --limit 5 --no-resume
```

A successful run should print a real message count for each ticket, for example:

```text
<id>: saved 74 messages (... bytes).
```

Inspect at least one generated `transcripts/<id>.json` and verify `transcript.messages` contains the actual conversation.

Then process the full discovered corpus:

```powershell
npm.cmd run export:ticket-transcript-payloads -- --output-dir ..\CM-Ticket-Transcripts --all --resume
```

`--resume` is safe because old HTML-shell records do not qualify as schema-v2 structured successes and will therefore be replaced. If the bulk run is interrupted, rerunning the same command skips successful structured records.

Do not delete `source-logs.jsonl`; it is the durable 1,578-ID discovery manifest required by the structured stage.

## Main-bot next engineering track

The main bot roadmap proceeds independently. Manual fulfillment remains blocked on a dedicated website-owned operation.
