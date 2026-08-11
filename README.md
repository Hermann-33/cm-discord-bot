# Cheater's Market Discord bot

The production Cheater's Market Discord bot publishes the Aura leaderboard, answers the self-service `cm aura` message command, and provides the staff-only `/refresh-leaderboard` guild command.

## Architecture and data boundary

```text
Discord
  -> CM Discord bot
  -> HMAC-authenticated HTTPS
  -> Cheater's Market Internal Integrations API
  -> website-owned business and database layer
```

The bot has no direct Supabase or Postgres access, no database credential, and no database fallback. It uses only:

- `aura.leaderboards.read`
- `aura.lookup.read`

The bot credential must be dedicated to this deployment and limited to those two operations. Never reuse an owner CLI, terminal-helper, website, or unrelated integration credential.

## Local setup

Requirements:

- Node.js 22 or newer
- A Discord application with the privileged Message Content intent enabled
- A bot-dedicated Internal Integrations API client/key

Install and configure:

```powershell
npm ci
Copy-Item .env.example .env
```

Set these environment variables without committing their values:

```text
DISCORD_BOT_TOKEN
DISCORD_CLIENT_ID
DISCORD_GUILD_ID
DISCORD_LEADERBOARD_CHANNEL_ID
DISCORD_COMMAND_CHANNEL_ID
DISCORD_AURA_COMMAND_BLOCKED_CHANNEL_ID
DISCORD_LEADERBOARD_MESSAGE_ID
CM_INTERNAL_INTEGRATIONS_API_ORIGIN
CM_INTERNAL_INTEGRATIONS_API_CLIENT_ID
CM_INTERNAL_INTEGRATIONS_API_KEY_ID
CM_INTERNAL_INTEGRATIONS_API_HMAC_SECRET_BASE64
CM_INTERNAL_INTEGRATIONS_API_TIMEOUT_MS
```

`DISCORD_LEADERBOARD_MESSAGE_ID` is intentionally optional for bootstrap. The API origin must be an origin-only HTTPS URL. Client/key IDs and the canonical standard-base64 secret are strictly validated; the decoded secret must contain at least 32 bytes.

## Develop and validate

```powershell
npm run dev
npm test
npm run typecheck
npm run build
npm start
```

`npm start` runs `dist/index.js`. The root `index.js` shim is retained for hosts that execute the package entry directly.

## Guild slash-command registration

Register the single guild command explicitly:

```powershell
npm run register:commands
```

Registration uses Discord's guild bulk-overwrite endpoint and intentionally publishes only `/refresh-leaderboard`. Do not run it until the target application and guild configuration have been reviewed. Bot startup never registers commands automatically.

## Leaderboard bootstrap

To create the initial Components V2 leaderboard message:

1. Leave `DISCORD_LEADERBOARD_MESSAGE_ID` empty.
2. Start the bot once.
3. The bot posts the leaderboard, safely logs the created message ID, and exits successfully.
4. Set that ID in the environment and restart.

Normal startup immediately refreshes the configured message and then refreshes it every five minutes. Scheduled and manual refreshes share one in-memory overlap lock.

## Legacy archive

The pre-rebuild bot is frozen under `legacy/` at commit `6dfe75f`. Production code, builds, and tests exclude that directory and must never import from it. The audit and exact parity matrix are in `docs/legacy-parity.md`.

## Production deployment requirements

- Long-running Node.js 22+ process with automatic restart on failure
- HTTPS egress to the configured CM API origin
- Discord bot token and dedicated API credentials stored only in the host secret store
- API allowlist containing only the two Aura read operations
- Discord Message Content intent enabled
- Bot access to view/send/read-history/edit in the leaderboard channel and respond in the command surface
- Explicit guild command registration after environment review
- Initial message bootstrap completed before normal long-running startup
- Central collection of the bot's structured JSON logs without secret/body capture

The website change adding Aura `displayName` is source-validated at website commit `d0afca510122ab5d828dbc273366480153f6a123`; its deployed additive field still requires a later authenticated HTTP verification with the dedicated bot credential. The bot does not call production during build or tests.
