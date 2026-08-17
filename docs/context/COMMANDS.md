# Command Catalog and Policy

Updated: 2026-08-17

## Current implemented commands

### `cm aura` — message command

Current source behavior:

- exact normalized trigger `cm aura`;
- ignores bot authors;
- requires exact configured guild;
- silently ignored in DMs/wrong guild;
- allowed in guild channels except `DISCORD_AURA_COMMAND_BLOCKED_CHANNEL_ID`;
- resolves the caller by Discord user ID through the read-only Internal API;
- returns a green Aura embed with available and lifetime earned Aura;
- uses sanitized display name and safe allowed mentions;
- linked-account missing and service failures are mapped to safe user messages.

This is current behavior, **not the accepted end-state command policy**.

### `/refresh-leaderboard` — slash command

Current behavior:

- explicitly registered as a guild command;
- no options;
- only intended in the configured bot command channel;
- requires runtime `ManageGuild` or `Administrator` permissions;
- responses are ephemeral;
- uses the same leaderboard refresh service/overlap lock as scheduled refresh.

Any future refactor should add/retain an explicit runtime guild/DM guard even though registration is guild-scoped.

## Accepted future command policy

ADR-0003 establishes:

- all bot commands should be slash commands;
- all commands must be restricted to the configured Cheater's Market guild at runtime;
- DMs must fail closed;
- guild command registration remains explicit/manual;
- public/read-only commands and admin/mutation commands use different authorization levels.

Target public command catalog:

- `/aura` — replacement for `cm aura`;
- `/refresh-leaderboard` — staff operational command.

Target admin mutation catalog:

- `/aura-adjust preview`
- `/aura-adjust confirm`
- later: `/wallet-adjust preview`
- later: `/wallet-adjust confirm`

## Authorization matrix — target

| Surface | Guild | Channel | User whitelist | Role/permission | Mutation |
| --- | --- | --- | --- | --- | --- |
| `/aura` | configured guild only | normal allowed surface; product decision may retain a blocked channel | no | none | no |
| `/refresh-leaderboard` | configured guild only | admin/command channel | optional product decision | `ManageGuild`/`Administrator` or future shared admin policy | no |
| `/aura-adjust *` | configured guild only | `BOT_ADMIN_COMMAND_CHANNEL_ID` | **required** | optional additional Aura-manager role | yes, backend only |
| `/wallet-adjust *` | configured guild only | `BOT_ADMIN_COMMAND_CHANNEL_ID` | **required** | optional additional wallet-manager role | yes, backend only |

## Mutation command rule

Admin/mutation commands must check, before any backend mutation request:

1. interaction is in a guild;
2. guild ID matches configured guild;
3. channel ID matches admin command channel;
4. invoking Discord user ID is in the explicit whitelist;
5. optional role/permission gate passes;
6. request inputs are valid;
7. preview/confirmation contract requirements are satisfied.

Roles alone are never sufficient for high-impact mutation authorization.

See `../security/ADMIN_MUTATION_MODEL.md`.