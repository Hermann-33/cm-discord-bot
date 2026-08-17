# Command Catalog and Policy

Updated: 2026-08-17

## Product command-surface rule

ADR-0005 supersedes ADR-0003 where they conflict.

Cheater's Market deliberately separates command UX by audience:

- **customers/self-service:** message/text commands;
- **staff/admin:** Discord slash commands.

`cm aura` remains a message command. Slash commands are the admin/staff interface.

Both surfaces must use approved website Internal Integrations API operations and must never directly connect to Supabase/Postgres.

## Current customer command

### `cm aura`

- exact normalized trigger `cm aura`;
- ignores bot authors;
- exact configured guild required;
- silently ignored in DMs/wrong guild;
- blocked in `DISCORD_AURA_COMMAND_BLOCKED_CHANNEL_ID`;
- all guards occur before API lookup;
- resolves caller by Discord user ID through the read-only Internal API;
- returns available and lifetime Aura;
- sanitizes display name/markdown/mentions;
- uses safe allowed mentions;
- maps not-found/service failures to safe user messages.

Because this command is intentionally message-based, `GuildMessages` and privileged `MessageContent` remain intentional runtime requirements.

## Current admin/staff command

### `/refresh-leaderboard`

- manually registered as a guild slash command;
- explicit runtime guild check;
- exact configured command channel;
- runtime `ManageGuild` or `Administrator` permission;
- requires configured leaderboard message ID;
- ephemeral result;
- invokes the shared overlap-locked refresh service.

## Backend operations available for future command work

Authoritative backend documentation now lists production operations for user lookup/overview, order lookup/details/fulfillment, purchase-intent lookup/process/status, refund preview/execute, wallet adjustment and Aura adjustment in addition to the existing Aura reads.

This does **not** mean commands for all of those operations are accepted or implemented. For each future command:

1. define the Discord audience/authorization model;
2. verify the bot client's exact operation allowlist;
3. verify exact request/response DTOs and selector support;
4. add the smallest typed API client method and tests;
5. preserve safe allowed mentions and staff-data handling.

## Future admin mutation slash commands

Aura administration first:

- `/aura-adjust preview`;
- `/aura-adjust confirm`.

Wallet administration later:

- `/wallet-adjust preview`;
- `/wallet-adjust confirm`.

None is implemented today.

## Authorization matrix

| Surface | Audience | Interface | Guild | Channel | Explicit user whitelist | Permission/role | Mutation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `cm aura` | customer | message command | configured guild only | all approved channels except blocked channel | no | none | no |
| `/refresh-leaderboard` | staff/admin | slash command | configured guild only | configured command channel | no current whitelist | ManageGuild/Administrator | no |
| `/aura-adjust *` | admin | slash command | configured guild only | `BOT_ADMIN_COMMAND_CHANNEL_ID` | **mandatory** | optional secondary Aura role | yes, backend only |
| `/wallet-adjust *` | admin | slash command | configured guild only | `BOT_ADMIN_COMMAND_CHANNEL_ID` | **mandatory** | optional secondary wallet role | yes, backend only |

## Required mutation authorization ordering

Before any mutation-capable backend request:

1. chat-input interaction;
2. in a guild;
3. exact configured guild ID;
4. exact configured admin command channel;
5. invoking Discord user ID in explicit allowlist;
6. optional domain role/permission gate;
7. local bounded input validation;
8. backend-authoritative confirmation/idempotency/business rules.

Roles alone are never sufficient for high-impact mutations.

## Backend mutation status

Production HTTP execute paths are now contract-documented:

- `users.aura.adjust` -> `/api/internal/integrations/v1/users/aura/adjust`;
- `users.wallet.adjust` -> `/api/internal/integrations/v1/users/wallet/adjust`.

The contract requires a stable UUID business idempotency key for one logical mutation and fresh transport timestamp/nonce/signature per HTTP retry.

Still blocking bot mutation commands:

- the bot client's actual operation permission;
- exact route selector/DTO verification, including the current external-identity selector contradiction;
- ADR-0004-compatible backend-authoritative preview/confirm or equivalent state;
- admin whitelist/channel/audit implementation and tests.

Direct DB calls remain forbidden.

See `DATA_STATUS.md`, ADR-0004, ADR-0005 and `../security/ADMIN_MUTATION_MODEL.md`.
