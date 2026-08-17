# Active Context

Updated: 2026-08-17

## Current audited state

The production bot is the v2 Internal Integrations API rebuild on `master`. The pre-rebuild bot is frozen under `legacy/`.

Latest full re-baseline audit: `../audits/2026-08-17-full-codebase-audit.md`.

The current bot remains **read-only** against Cheater's Market data and contains no Supabase/Postgres credential or direct database client.

## Main architectural difference from the legacy bot

The legacy design accessed Supabase directly from the bot. The current design does not.

Current path:

```text
Discord command
  -> standalone CM Discord bot
  -> HMAC-authenticated Cheater's Market Internal Integrations API
  -> website-owned business/data layer
  -> Supabase/Postgres
```

This API boundary is mandatory for both customer and admin features.

## Current implemented command/runtime surfaces

- `cm aura` — **customer-facing message command**, exact configured guild, blocked in one configured channel.
- `/refresh-leaderboard` — **staff/admin operational slash command** with explicit runtime guild check, exact command channel and `ManageGuild|Administrator` permission.
- one persistent Components V2 Aura leaderboard message;
- bootstrap creation when no message ID is configured;
- immediate startup refresh plus five-minute schedule;
- shared in-memory overlap lock for scheduled/manual refresh.

## Accepted command policy

ADR-0005 supersedes ADR-0003 where they conflict.

- customer/self-service commands may use message/text commands;
- `cm aura` remains a customer message command and is not migration debt;
- staff/admin operational and mutation surfaces use slash commands;
- admin slash commands remain configured-guild-only at registration and runtime;
- DMs fail closed for admin slash commands;
- high-impact mutation commands additionally require ADR-0004 whitelist/channel/confirmation controls.

`GuildMessages` and privileged `MessageContent` remain intentional while `cm aura` exists.

## Current bot API usage

Bot production source still calls only:

- `POST /api/internal/integrations/v1/aura/leaderboards`;
- `POST /api/internal/integrations/v1/aura/lookup`.

The currently documented bot credential is limited to the corresponding Aura read operations. No mutation client or mutation command exists in this repo.

## Backend Internal Integrations API contract re-baseline

Authoritative backend contract documentation supplied on 2026-08-17 confirms production operations beyond the two currently consumed by the bot, including user lookup/overview, order lookup/details/fulfillment, purchase-intent lookup/process/status, refund preview/execute, wallet adjustment and Aura adjustment.

Mutation paths are now contract-documented:

- `users.aura.adjust` -> `POST /api/internal/integrations/v1/users/aura/adjust`;
- `users.wallet.adjust` -> `POST /api/internal/integrations/v1/users/wallet/adjust`.

The documented transport contract matches the current bot signing model: exact raw JSON body bytes are signed, timestamp and lowercase UUIDv4 nonce are fresh per HTTP attempt, and HMAC-SHA256 uses the existing eight-line `cm-integrations-v1` canonical request.

For mutations, the business `idempotencyKey` is separate from the transport nonce and must remain stable across retries of one logical action while timestamp/nonce/signature are regenerated per attempt.

The backend contract states exact per-client operation allowlists with no wildcard/master bypass. Endpoint existence therefore does **not** prove this bot credential can call an operation.

### Mutation blockers still unresolved

- bot-dedicated client `allowedOperations` for any new read or mutation operation;
- exact response DTOs and route schemas before adding strict bot Zod schemas;
- selector conflict: the full authoritative contract says external identity is lookup-only, while the bot quickstart shows `external_identity` in Aura/wallet mutation examples; do not implement Discord external-identity mutation targeting until the route schema/source resolves this;
- ADR-0004 requires backend-authoritative preview/confirm or equivalent confirmation state, while the supplied Aura/wallet execute contract documents direct adjustment endpoints and no dedicated adjustment preview endpoint;
- authenticated smoke behavior using the bot-dedicated credential.

The database execute primitives and HTTP execute endpoints do not authorize direct DB access from the bot.

## Audit findings that still affect next work

1. no GitHub CI/workflow/current-head test status exists;
2. command registration currently requires full runtime config including Internal API HMAC material;
3. generic logger error sanitization is not universal secret/PII pattern redaction;
4. `@types/node` 25.x is newer than the minimum Node 22 runtime contract;
5. `.gitignore` does not ignore ZIP archives;
6. several small defensive/test gaps remain in the full audit.

The earlier audit finding that `cm aura` violates a slash-only end state is superseded by ADR-0005.

## Do-not-touch boundaries

- website source unless separately scoped;
- direct Supabase/Postgres access from bot;
- customer/admin command-surface separation without an explicit product decision;
- `legacy/` history;
- real environment values/secrets;
- mutation execution before bot authorization, credential scope and ADR-0004 confirmation requirements are satisfied.

## Exact next engineering gate

1. add/restore executable current-head verification, preferably CI;
2. preserve `cm aura` and its current guards;
3. establish a clean admin slash-command registry/dispatcher;
4. implement reusable explicit admin user-ID whitelist + configured guild/admin-channel authorization with tests and no mutation;
5. for each new command, verify the exact backend operation scope and request/response DTO before client code;
6. resolve the Aura mutation selector contradiction and ADR-0004 confirmation gap before wiring `users.aura.adjust`;
7. prove Aura end-to-end on a controlled test account before wallet mutation work.
