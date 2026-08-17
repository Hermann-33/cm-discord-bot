# Command Catalog and Policy

Updated: 2026-08-17

## Current implemented commands

### `cm aura` — message command

Current source behavior, re-verified in `TASK-AUDIT-001`:

- exact normalized trigger `cm aura`;
- ignores bot authors;
- requires exact configured guild;
- silently ignored in DMs/wrong guild;
- allowed in guild channels except `DISCORD_AURA_COMMAND_BLOCKED_CHANNEL_ID`;
- all those guards occur before the API lookup;
- resolves caller by Discord user ID through the read-only Internal API;
- returns available and lifetime Aura in a green embed;
- sanitizes API display name and neutralizes mentions/Discord markdown;
- uses safe allowed mentions;
- maps not-found/service failures to safe user messages.

Tests prove there is no backend lookup for bot messages, DMs, wrong guild or blocked channel.

This is current behavior, **not the accepted end-state command policy**.

Because it is a message command, it is the reason the current Discord client still requires `GuildMessages` and privileged `MessageContent` intent.

### `/refresh-leaderboard` — slash command

Current source behavior, re-verified:

- built and manually registered as a guild command;
- registration uses `Routes.applicationGuildCommands(clientId, guildId)` with bulk overwrite;
- no options;
- default member permission `ManageGuild`;
- handler **already explicitly checks** `interaction.guildId === config.discordGuildId`;
- exact configured command channel required;
- runtime requires `ManageGuild` or `Administrator`;
- requires configured leaderboard message ID;
- replies/defer are ephemeral;
- safe allowed mentions are used for direct reply helper;
- invokes the same overlap-locked refresh service used by scheduler.

Earlier documentation wording that suggested the runtime guild guard still needed to be added was stale.

## Accepted future command policy

ADR-0003 remains authoritative:

- all bot commands should be slash commands;
- all commands must be registered to and runtime-restricted to the configured Cheater's Market guild;
- DMs fail closed;
- guild registration remains explicit/manual;
- public/read-only commands and admin/mutation commands use different authorization levels.

Target read-only catalog:

- `/aura` — replaces `cm aura`;
- `/refresh-leaderboard` — staff operational command.

After `/aura` migration, remove `MessageContent`/`GuildMessages` intents if no other feature requires them.

## Target high-impact admin catalog

Aura first:

- `/aura-adjust preview`
- `/aura-adjust confirm`

Wallet later:

- `/wallet-adjust preview`
- `/wallet-adjust confirm`

None of those commands is implemented today.

## Authorization matrix — target

| Surface | Guild | Channel | User whitelist | Secondary role/permission | Mutation |
| --- | --- | --- | --- | --- | --- |
| `/aura` | configured guild only | approved public surface | no | none | no |
| `/refresh-leaderboard` | configured guild only | command/admin channel | optional product decision | current ManageGuild/Administrator | no |
| `/aura-adjust *` | configured guild only | `BOT_ADMIN_COMMAND_CHANNEL_ID` | **mandatory** | optional Aura-manager role | yes through backend only |
| `/wallet-adjust *` | configured guild only | `BOT_ADMIN_COMMAND_CHANNEL_ID` | **mandatory** | optional wallet-manager role | yes through backend only |

## Required mutation authorization ordering

Before any mutation-capable backend request:

1. `interaction.inGuild()` / non-null guild;
2. exact configured guild ID;
3. exact configured admin command channel;
4. invoking Discord user ID in explicit allowlist;
5. optional domain role/permission check;
6. input validation and caps check suitable for UX;
7. backend-authoritative preview/confirmation/idempotency requirements.

Roles alone are never sufficient for high-impact mutations.

## Backend mutation status discovered by audit

The live DB now contains service-role-only internal integration execute primitives with operation IDs:

- `users.aura.adjust`;
- `users.wallet.adjust`.

They already provide persistent idempotency/request-hash behavior and audit metadata at the DB integration layer.

This does **not** mean these slash commands can be implemented by directly calling DB functions. Before command integration, verify the website Internal Integrations API HTTP endpoints, operation permission scope and bot credential authorization.

See:

- `DATA_STATUS.md`;
- `../security/ADMIN_MUTATION_MODEL.md`;
- `../audits/2026-08-17-full-codebase-audit.md`.