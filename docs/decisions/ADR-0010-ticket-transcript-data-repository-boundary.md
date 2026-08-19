# ADR-0010: Ticket Transcript Corpus Is a Separate Data-Only Repository

## Status

Accepted

- Date: 2026-08-19
- Type: Architecture / Data ownership / Project boundary

## Context

Cheater's Market has more than one thousand historical support-ticket logs in Discord. Each log points to a Tickety transcript page containing the underlying ticket conversation.

A separate repository, `Hermann-33/CM-Ticket-Transcripts`, has been created so the historical corpus can be collected, normalized and made available for later analysis without mixing support data into the production Discord bot repository.

The main Discord bot will continue to be developed in parallel. This side project must not blur the existing standalone-bot, website/backend or credential boundaries.

## Decision

`Hermann-33/CM-Ticket-Transcripts` is a separate private **data-only** repository.

It may contain durable transcript data, manifests, normalized JSON/JSONL records, raw transcript snapshots when justified, attachment metadata and explicitly scoped derived datasets.

It must not contain executable extraction code, bot source code, package/application scaffolding added to run an exporter, production `.env` files, Discord bot tokens, HMAC/Internal Integrations API credentials, Supabase/Postgres credentials or generated dependency trees.

Extraction/scraping tooling must execute outside the data repository. It may use authorized Discord access and fetch Tickety transcript pages from an authorized environment, but that tooling is not part of the production `cm-discord-bot` runtime.

The production bot has no runtime dependency on `CM-Ticket-Transcripts`, and the transcript side project does not alter the bot's Internal Integrations API or database boundary.

## Phase 1 acquisition model

The initial workstream is:

```text
Discord ticket-log channel
  -> extract historical ticket metadata and transcript URLs
  -> fetch Tickety transcript pages
  -> normalize complete ticket conversations
  -> validate completeness/failures
  -> persist data in CM-Ticket-Transcripts
```

Before bulk processing, the exporter must be validated against a small representative sample. Scaling to the full corpus is allowed only after the sample demonstrates that required metadata and complete transcript messages are being captured correctly.

## Data sensitivity

Support transcripts may contain customer PII, Discord identities, emails, order/support details, attachments or other operational information.

The repository remains private. Corpus accessibility for analysis must not be achieved by publishing the data or embedding credentials into the repository.

## Consequences

Benefits:

- production bot code stays small and auditable;
- historical support data gains a durable dedicated home;
- extraction/parser changes do not contaminate runtime code;
- raw/normalized evidence can be preserved for reprocessing;
- main bot development and corpus acquisition can proceed independently.

Costs:

- extraction tooling needs a separate execution location;
- data-schema/version discipline must be maintained in the corpus;
- future runtime integration, if desired, requires a separately scoped architecture decision rather than being assumed from the existence of the data.

## Explicitly forbidden

- committing scraper/exporter code to `CM-Ticket-Transcripts`;
- moving production bot source into the data repository;
- making `cm-discord-bot` import/read the corpus without a separate task;
- copying production credentials into transcript data;
- making the data repository public merely to simplify automated access;
- treating historical transcript data as a new source of truth for current website account/order state.

## Rollback / supersession

Changing `CM-Ticket-Transcripts` from data-only into an executable service/tool repository, or introducing a production runtime dependency between the bot and the corpus, requires a superseding ADR and explicit security/data review.
