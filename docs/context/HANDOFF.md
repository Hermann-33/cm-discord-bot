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

TASK-CM-ADMIN-006 / PR #4 is merged. Older handoff/context text that says PR #4 is still waiting for merge is obsolete.

## Current production bot state

The current bot includes:

- customer `cm aura`;
- `/refresh-leaderboard`;
- `/cm user` by email or Discord user;
- `/cm order`;
- compact User/Orders/Order/Delivery Details panels;
- canonical refund;
- confirmed Aura/wallet adjustment;
- Share to Chat;
- Discord timestamps;
- concise mutation audits.

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
Phase T1 corpus acquisition starting
```

Purpose: collect and normalize the historical Discord ticket logs and linked Tickety transcripts so the corpus can be queried/analyzed later.

Boundary:

- main bot development continues independently;
- no scraper/exporter/runtime code belongs in `CM-Ticket-Transcripts`;
- no tokens, HMAC secrets, database credentials or `.env` content belong there;
- extraction code runs elsewhere;
- the production bot is not modified merely to perform the export;
- any future bot/runtime dependency on the corpus requires separate architecture review.

## Transcript T1 exact next action

Build and validate the extraction process outside the data repository against a small representative sample before bulk processing.

The sample gate must prove:

1. Discord ticket-log messages can be enumerated and their ticket metadata recovered;
2. `View Transcript` URLs can be extracted without clicking buttons manually;
3. Tickety transcript pages can be fetched from the authorized execution environment;
4. complete message content, authors, timestamps and attachment metadata can be normalized reliably;
5. failed or malformed tickets are explicitly recorded rather than silently skipped;
6. only resulting data artifacts are written to `CM-Ticket-Transcripts`.

After the sample passes, scale the same validated pipeline to the full 1,000+ ticket history.

## Main-bot next engineering track

The main bot roadmap may proceed independently with production-hardening work such as branch protection/status checks, registration-specific config loading, stronger generic redaction and deployment/rollback/credential-rotation runbooks.

Manual fulfillment remains blocked on a dedicated website-owned operation.
