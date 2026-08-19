# CM Ticket Transcript Exporter

Standalone, dependency-free Node.js 22+ extraction utility for the Cheater's Market Tickety transcript side project.

This tool is non-production tooling under `tools/`. It is not imported by `src/`, not emitted into `dist/`, and not part of the bot startup/runtime path.

The data repository remains separate:

- `cm-discord-bot` owns production bot code plus this explicitly scoped offline/support extraction tool;
- `CM-Ticket-Transcripts` remains private **data only** and receives only generated corpus artifacts.

The exporter reads the authorized Discord ticket-log channel through Discord's REST API, targets only Tickety **View Transcript** link buttons, extracts the corresponding transcript URL and ticket metadata, fetches each transcript page, and writes durable raw HTML + visible text + normalized JSON into a local checkout of `CM-Ticket-Transcripts`.

Other ticket-log controls such as **View Ticket** are intentionally ignored. A candidate must be a Discord link button (`type=2`, `style=5`) whose normalized label is exactly `View Transcript` and whose URL matches `https://tickety.top/transcripts/<id>`.

## Requirements

- Node.js 22+
- Existing Cheater's Market Discord bot token
- `DISCORD_GUILD_ID`
- Bot permissions in the ticket-log channel:
  - View Channel
  - Read Message History
- Discord Message Content privileged intent enabled for the bot application so message embeds/components are returned

No HMAC/Internal Integrations API key, Supabase credential, database credential, or website credential is used.

## 1. Run focused tests

```powershell
node --test .\tests\tools\ticketTranscriptExporter.test.mjs
```

## 2. Validate a five-ticket sample first

From the `cm-discord-bot` repository, with the private data repository checked out beside it:

```powershell
npm run export:ticket-transcripts -- `
  --env-file .\.env `
  --channel-id YOUR_TICKET_LOG_CHANNEL_ID `
  --output-dir ..\CM-Ticket-Transcripts `
  --limit 5
```

Use the npm script above rather than invoking the core exporter module directly. The npm script runs the strict Discord-message filter that permits only `View Transcript` link buttons before the core parser sees the channel history.

The exporter reads only `DISCORD_BOT_TOKEN` and `DISCORD_GUILD_ID` from the specified `.env` file. It never copies the `.env` or prints the token.

The default is already `--limit 5`; the explicit limit above makes the Phase T1 sample gate obvious.

## 3. Inspect the sample

Expected data-only output:

```text
CM-Ticket-Transcripts/
├── manifest.json
├── index.jsonl
├── source-logs.jsonl
├── transcripts/
│   └── <transcriptId>.json
├── text/
│   └── <transcriptId>.txt
├── raw/
│   └── <transcriptId>.html
├── runs/
│   └── <runId>.json
└── failures/
    └── <runId>.jsonl
```

For Phase T1, inspect several `text/*.txt` and `raw/*.html` files and confirm that usernames, timestamps, message content and attachment references are actually present before bulk export.

## 4. Bulk export only after the sample is verified

```powershell
npm run export:ticket-transcripts -- `
  --env-file .\.env `
  --channel-id YOUR_TICKET_LOG_CHANNEL_ID `
  --output-dir ..\CM-Ticket-Transcripts `
  --all `
  --resume
```

`--all` is required explicitly. The tool will not accidentally treat an omitted limit as permission to crawl the entire channel.

## Fetch modes

Default:

```text
--fetch-mode auto
```

`auto` tries normal HTTPS first. If that fails, it attempts Chrome/Chromium headless DOM capture.

Force HTTP:

```powershell
--fetch-mode http
```

Force Chrome:

```powershell
--fetch-mode chrome --chrome-path "C:\Program Files\Google\Chrome\Application\chrome.exe"
```

The browser fallback uses Chrome's `--headless=new --dump-dom` mode and does not require Playwright or Puppeteer.

## Discovery-only test

To verify Discord access and strict `View Transcript` extraction without requesting Tickety pages:

```powershell
npm run export:ticket-transcripts -- `
  --env-file .\.env `
  --channel-id YOUR_TICKET_LOG_CHANNEL_ID `
  --output-dir ..\CM-Ticket-Transcripts `
  --limit 5 `
  --dry-run
```

This writes only source discovery/run data.

## Safety properties

- Exact configured guild is checked before scanning messages.
- Only Discord link buttons labelled `View Transcript` are eligible for discovery.
- `View Ticket` and other channel buttons are ignored even if they contain URLs.
- Only `https://tickety.top/transcripts/<id>` URLs are fetchable.
- Redirects outside that origin/path are rejected.
- Discord API rate limits are respected.
- Transcript requests are sequential by default with a delay.
- Per-transcript HTML is size-capped.
- Existing records are skipped by default (`--resume`).
- Failures are explicit and run-scoped.
- Raw HTML is retained so parsing can be repaired without re-downloading the corpus.
- No production bot mutation or Internal Integrations API call exists in this tool.

## Current parser status

The first parser deliberately preserves source fidelity rather than pretending the unknown Tickety DOM has already been proven.

For every successfully fetched transcript it stores:

1. exact raw HTML;
2. conservative visible-text extraction;
3. normalized source/ticket metadata;
4. likely attachment URLs;
5. an estimated message count when common transcript markers exist.

After the first real five-ticket sample is generated, inspect the raw HTML and upgrade the parser to message-level structured JSON against Tickety's actual DOM rather than guessed selectors.
