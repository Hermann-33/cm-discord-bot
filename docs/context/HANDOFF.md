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
6cef7695a09c8761d395f5d530bc79b7532c9b9f
```

TASK-CM-ADMIN-006 / PR #4 is merged.

## Current production bot state

The current bot includes customer `cm aura`, `/refresh-leaderboard`, `/cm user`, `/cm order`, compact operational panels, canonical refund, confirmed Aura/wallet adjustment, Share to Chat, Discord timestamps and concise mutation audits.

No direct database path exists. The bot remains HMAC Internal Integrations API bounded.

## Parallel workstream — Ticket Transcript Corpus

Repository:

```text
Hermann-33/CM-Ticket-Transcripts
```

Status:

```text
private
data-only
Phase T1 corpus acquisition
exporter implemented
real five-ticket validation pending
```

The exporter is intentionally non-runtime tooling under:

```text
tools/ticket-transcript-exporter/
```

Supported execution goes through:

```text
npm run export:ticket-transcripts
  -> run-ticket-transcript-export.mjs
  -> strict Discord message/button filter
  -> export-ticket-transcripts.mjs core acquisition/parser
```

The strict filter is required because the ticket-log channel can contain multiple controls such as `View Ticket` and `View Transcript`.

A transcript candidate is accepted only when Discord returns a link button with:

```text
type  = 2
style = 5
label = View Transcript   (case/whitespace normalized)
url   = https://tickety.top/transcripts/<id>
```

`View Ticket`, other button labels, transcript-like URLs in ordinary message content, and transcript-like URLs in unrelated embeds are not eligible discovery sources through the supported npm command.

The tool:

- validates the supplied channel belongs to `DISCORD_GUILD_ID`;
- paginates Discord history 100 messages at a time through the REST API;
- preserves pagination while neutralizing non-`View Transcript` messages before the core parser sees them;
- extracts the Tickety transcript URL and ticket metadata only from eligible log messages;
- restricts fetches to canonical `https://tickety.top/transcripts/<id>` URLs;
- saves raw HTML, conservative visible text and normalized JSON into a separately checked-out `CM-Ticket-Transcripts` directory;
- records run/failure manifests;
- defaults to five transcripts and requires explicit `--all` for bulk export;
- supports direct HTTPS plus optional local Chrome headless fallback;
- uses no Internal Integrations API, HMAC, Supabase/Postgres or mutation path.

Focused exporter tests now cover URL restrictions, screenshot-shaped ticket metadata parsing, strict `View Transcript` versus `View Ticket` targeting, suppression of transcript-like fallback URLs outside the target button, HTML text conversion, attachment candidates, message-count heuristics and sample/bulk CLI safety.

## Transcript T1 exact next action

Run the exporter against the **real ticket-log channel with a five-ticket sample only**:

```powershell
npm run export:ticket-transcripts -- `
  --env-file .\.env `
  --channel-id <REAL_TICKET_LOG_CHANNEL_ID> `
  --output-dir ..\CM-Ticket-Transcripts `
  --limit 5
```

Do not start the production bot merely to perform the export. The exporter is a separate one-shot CLI process that reuses the existing bot token for authorized read-only Discord REST access.

Then inspect the generated `raw/`, `text/` and `transcripts/` records.

The sample gate must prove:

1. real Discord ticket-log messages are discovered only through `View Transcript` buttons and ignore `View Ticket`/other controls;
2. source ticket metadata matches the Discord close-log embed;
3. Tickety pages are fetchable from the authorized execution environment;
4. raw HTML actually contains the complete ticket conversation;
5. visible-text output retains authors, timestamps, message content and attachment references well enough for analysis;
6. any Tickety DOM structure needed for message-level JSON is learned from the real HTML rather than guessed;
7. failures are explicit and no credentials are written to the data repository.

Do **not** run `--all` until this sample is inspected and parser completeness is accepted.

## Main-bot next engineering track

The main bot roadmap may proceed independently with production-hardening work such as branch protection/status checks, registration-specific config loading, stronger generic redaction and deployment/rollback/credential-rotation runbooks.

Manual fulfillment remains blocked on a dedicated website-owned operation.
