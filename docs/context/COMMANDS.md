# Command Catalog and Policy

Updated: 2026-08-17

## Product command-surface rule

ADR-0005 supersedes ADR-0003 where they conflict.

Cheater's Market deliberately separates command UX by audience:

- **customers/self-service:** message/text commands;
- **staff/admin:** Discord slash commands.

Therefore `cm aura` should remain a message command under the current product policy. Slash commands are not the intended customer interface.

The interaction style does not change the backend boundary: both command types must use approved website Internal Integrations API operations and must never directly connect to Supabase/Postgres.

## Current customer command

### `cm aura`

Current source behavior:

- exact normalized trigger `cm aura`;
- ignores bot authors;
- requires exact configured guild;
- silently ignored in DMs/wrong guild;
- allowed in guild channels except `DISCORD_AURA_COMMAND_BLOCKED_CHANNEL_ID`;
- all guards occur before API lookup;
- resolves caller by Discord user ID through the read-only Internal API;
- returns available and lifetime Aura;
- sanitizes display name/markdown/mentions;
- uses safe allowed mentions;
- maps not-found/service failures to safe user messages.

Tests prove there is no backend lookup for bot messages, DMs, wrong guild or blocked channel.

Because this customer command is intentionally message-based, `GuildMessages` and privileged `MessageContent` intents remain intentional runtime requirements.

## Current admin/staff command

### `/refresh-leaderboard`

- manually registered as a guild slash command;
- registration uses `Routes.applicationGuildCommands(clientId, guildId)`;
- explicit runtime guild check;
- exact configured command channel;
- runtime `ManageGuild` or `Administrator` permission;
- requires configured leaderboard message ID;
- ephemeral result;
- invokes the shared overlap-locked refresh service.

## Future admin slash commands

Aura administration first:

- `/aura-adjust preview`;
- `/aura-adjust confirm`.

Wallet administration later:

- `/wallet-adjust preview`;
- `/wallet-adjust confirm`.

These are admin/staff surfaces only. None is implemented today.

## Authorization matrix

| Surface | Audience | Interface | Guild | Channel | Explicit user whitelist | Permission/role | Mutation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `cm aura` | customer | message command | configured guild only | all approved channels except blocked channel | no | none | no |
| `/refresh-leaderboard` | staff/admin | slash command | configured guild only | configured command channel | no current whitelist | ManageGuild/Administrator | no |
| `/aura-adjust *` | admin | slash command | configured guild only | `BOT_ADMIN_COMMAND_CHANNEL_ID` | **mandatory** | optional secondary Aura role | yes, backend only |
| `/wallet-adjust *` | admin | slash command | configured guild only | `BOT_ADMIN_COMMAND_CHANNEL_ID` | **mandatory** | optional secondary wallet role | yes, backend only |

## Required mutation authorization ordering

Before any mutation-capable backend request:

1. interaction is in a guild;
2. exact configured guild ID;
3. exact configured admin command channel;
4. invoking Discord user ID is in explicit allowlist;
5. optional domain role/permission gate;
6. input validation/caps suitable for UX;
7. backend-authoritative preview/confirmation/idempotency requirements.

Roles alone are never sufficient for high-impact mutations.

## Backend mutation status

Live DB contains service-role-only integration execute primitives:

- `users.aura.adjust`;
- `users.wallet.adjust`.

This does not authorize direct DB calls from the bot. Before admin command integration, verify website Internal Integrations API HTTP endpoints, operation permission scope and bot credential authorization.

See `DATA_STATUS.md`, ADR-0004, ADR-0005 and `../security/ADMIN_MUTATION_MODEL.md`.
