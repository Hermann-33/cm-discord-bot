# Latest Handoff

Updated: 2026-08-17

## Command policy

ADR-0005 is authoritative and supersedes ADR-0003 where they conflict.

- customer/self-service commands may use message/text commands;
- `cm aura` remains message-based;
- staff/admin operations use configured-guild slash commands;
- high-impact mutations additionally follow ADR-0004.

## Main architecture

```text
OLD
Discord bot -> Supabase/Postgres directly

CURRENT
Discord bot -> HMAC Internal Integrations API -> website business/data layer -> Supabase/Postgres
```

The active bot must not regain direct Supabase/Postgres access.

## Current bot truth

- API client exposes only leaderboard and Aura lookup reads;
- current bot credential is still documented for those two Aura read operations;
- `cm aura` is the customer message command;
- `/refresh-leaderboard` is the current staff/admin slash command;
- safe allowed mentions are centralized;
- leaderboard is Components V2;
- scheduled/manual refreshes share one overlap lock;
- legacy is isolated.

## Backend API contract re-baseline

Authoritative backend documentation supplied on 2026-08-17 confirms a broader production Internal Integrations API operation catalog.

Relevant mutation paths now documented:

```text
users.aura.adjust   -> POST /api/internal/integrations/v1/users/aura/adjust
users.wallet.adjust -> POST /api/internal/integrations/v1/users/wallet/adjust
```

For mutations, one logical action keeps the same UUID `idempotencyKey` and exact body across retries; each HTTP attempt gets a fresh timestamp, UUIDv4 nonce and HMAC signature.

The backend client model uses exact `allowedOperations` per integration with no wildcard/master bypass.

### Remaining blockers

- bot credential scope for each new operation is not verified;
- exact DTOs must be verified before adding strict schemas;
- full API contract says external identity is lookup-only, but quickstart mutation examples use Discord `external_identity`; actual mutation route schema must resolve this conflict;
- ADR-0004 requires backend-authoritative preview/confirm or equivalent state, while the supplied Aura/wallet contract documents direct execute endpoints and no adjustment preview endpoint;
- no bot-credential production mutation smoke test has been performed from this repo context.

## Verification limitation

Fresh `npm test`, `npm run typecheck`, `npm run build` and dependency scan still need current-head executable evidence/CI. No bot/runtime code changed in the API-contract documentation re-baseline.

## Exact next engineering action

1. add CI or otherwise execute/record test + typecheck + build on current head;
2. preserve `cm aura` and its current guards;
3. establish a clean dispatcher/registry for admin slash commands;
4. implement reusable explicit admin user-ID whitelist + exact guild + admin channel authorization, with tests and no mutation;
5. select the next command and verify its dedicated bot operation scope plus exact request/response DTO;
6. before Aura execute integration, resolve selector semantics and ADR-0004 confirmation compatibility;
7. implement/prove Aura on a controlled test account;
8. only then proceed to wallet mutation integration.

## Do-not-touch boundaries

- no direct Supabase/Postgres client in bot;
- no direct calls from bot to DB admin/internal functions;
- no customer `cm aura` slash migration without a new explicit product decision;
- no admin message/prefix mutations;
- no wallet admin command before Aura admin path is proven;
- no role-only mutation authorization;
- no global or DM mutation commands;
- no `legacy/` edits during active feature work;
- no real secret values in repo/docs/logs.
