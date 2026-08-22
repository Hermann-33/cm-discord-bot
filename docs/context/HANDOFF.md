# Latest Handoff

Updated: 2026-08-20

## Authority

- ADR-0005 — `cm aura` customer message command; admin/staff slash/components/modals.
- ADR-0006 — `/cm` exact configured guild + non-empty explicit `BOT_ADMIN_USER_IDS`; no `/cm` channel restriction.
- ADR-0007 — Aura/wallet five-minute fresh-state-bound confirmation + stable idempotency/audit.
- ADR-0008 — separate customer-facing Share to Chat renderer, no public admin controls, Discord identity/time/audit policy.
- ADR-0009 — canonical CM account email is intentionally shared; all other ADR-0008 exclusions remain.
- ADR-0010 — `CM-Ticket-Transcripts` is a separate private data-only side project with no production-bot dependency.
- ADR-0011 — `/cm order` is canonical-order-first with `NOT_FOUND`-only pending purchase fallback; masked fulfillment support remains private staff data.
- `BOT_AUDIT_LOG_CHANNEL_ID` is required before refund/Aura/wallet execute.
- no direct Supabase/Postgres.
- manual fulfillment blocked until website owns a dedicated mutation.

## Current mainline

```text
master
405a71fa2fe2eca467e7f4b7f8b5437e067895ef
```

TASK-CM-ADMIN-007 is merged on mainline. Current production-source behavior includes canonical-order-first `/cm order`, `NOT_FOUND`-only pending purchase fallback, optional fulfillment support enrichment, pending purchase refresh/transition, and customer-safe pending sharing.

The bot operation set now includes:

```text
purchase-intents.lookup.read
```

The website integration client used by the bot must include that operation in `allowedOperations` for pending lookup to work in production. No new bot environment variable or slash-command registration change was introduced by TASK-CM-ADMIN-007.

## Parallel workstream — Ticket Transcript Corpus

Repository:

```text
Hermann-33/CM-Ticket-Transcripts
```

Boundary remains:

```text
private
data-only
no executable extraction code
no production-bot runtime dependency
```

The strict Discord discovery stage has already identified 1,578 unique `View Transcript` records and stored the durable discovery set in:

```text
CM-Ticket-Transcripts/source-logs.jsonl
```

A real Chrome HAR from a working Tickety transcript proved that the actual conversation is loaded from:

```text
GET https://tickety.top/api/ticketTranscript?id=<transcriptId>
Content-Type: application/vnd.msgpack
```

The captured Msgpack payload was successfully decoded and contained real `users[]` and `messages[]` data, including timestamps, content, attachments, embeds, reactions, components and message references. The earlier repeated 14,956-byte HTTP files are only HTML application shells and are not complete transcript records.

## Structured transcript extractor

The structured extractor lives only under non-production tooling:

```text
tools/ticket-transcript-exporter/export-ticket-payloads.mjs
```

Supported npm command:

```text
npm run export:ticket-transcript-payloads
```

Behavior:

```text
CM-Ticket-Transcripts/source-logs.jsonl
  -> transcript IDs
  -> https://tickety.top/api/ticketTranscript?id=<id>
  -> application/vnd.msgpack
  -> Msgpackr decode
  -> users/messages validation
  -> author resolution
  -> schema-v2 transcript JSON
  -> plain-text projection
  -> raw Msgpack evidence
```

The structured stage does not rescan Discord and does not use the Discord bot token. It uses a local no-save `msgpackr` installation so production dependencies remain unchanged:

```powershell
npm.cmd install --no-save --package-lock=false --omit=optional msgpackr@2.0.4
```

The exporter defaults to five transcripts, requires explicit `--all` for full-corpus processing, uses conservative sequential pacing, honors `Retry-After`, retries transient failures, records failures explicitly, and does not bypass private/restricted 401/403 transcripts.

`--resume` skips only already-valid schema-v2 `tickety-msgpack-api` records. Old HTML-shell records are therefore replaced rather than incorrectly treated as complete.

## Structured extraction workflow

First validate five real structured transcripts:

```powershell
npm.cmd run export:ticket-transcript-payloads -- --output-dir ..\CM-Ticket-Transcripts --limit 5 --no-resume
```

Acceptance gate:

1. output reports real message counts rather than HTML byte-only success;
2. generated `transcripts/<id>.json` contains populated `users` and `messages`;
3. `text/<id>.txt` contains the actual support conversation;
4. attachments/replies/embeds are preserved when present;
5. failures are explicit and no credentials are written to the data repository.

After that sample is accepted, bulk extraction is:

```powershell
npm.cmd run export:ticket-transcript-payloads -- --output-dir ..\CM-Ticket-Transcripts --all --resume
```

If interrupted, rerun the same command; valid schema-v2 records are skipped.

## Production separation

No transcript tooling is imported by `src/`, emitted by the production TypeScript build, started with the bot, or connected to the Internal Integrations API/database. Generated transcript artifacts belong only in the private `CM-Ticket-Transcripts` repository.

Normal Discord bot work can continue independently from the transcript corpus acquisition workstream.

## Canonical support KB handoff

Use `npm.cmd run build:canonical-support-kb -- --data-dir <private-data-repo>`, followed by the two canonical validators and the retrieval evaluator. These commands operate only on the supplied private data repository. They are not imported by `src/`, do not call live APIs, and do not authorize production integration.

For remediation evaluation, run the evaluator separately with `--dataset historical-holdout --method lexical`, `--dataset historical-holdout --method hybrid`, and `--dataset adversarial-behavior --method hybrid`. Do not combine historical and synthetic metrics. Current status is partial because historical directional retrieval targets are not yet met.
