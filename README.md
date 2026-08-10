# Cheater's Market Discord bot

Standalone Discord bot for the Aura leaderboard and related Cheater's Market commands.

## Website internal API rollout

The website-owned internal API client is committed **inactive by default**. With
`CM_INTERNAL_API_ENABLED=false` (or absent), the bot keeps its existing direct Supabase Aura
behavior and does not register the support lookup command.

Activation is a coordinated future operation. It requires an HTTPS website origin, a key ID,
and a standard-base64 HMAC secret containing at least 32 decoded bytes. Never commit real
values. The website API must be enabled only after both deployments have matching secrets and
the nonce migration has been verified.

When enabled, the bot uses only these read routes:

- `POST /api/internal/discord-bot/v1/aura/leaderboards`
- `POST /api/internal/discord-bot/v1/aura/user`
- `POST /api/internal/discord-bot/v1/users/lookup`
- `POST /api/internal/discord-bot/v1/orders/lookup`

The scheduled leaderboard request has no human actor. Manual refreshes carry the invoking
Discord actor and interaction ID. `cm aura` is self-service: its signed actor is always the
lookup subject. `/cm-support user` and `/cm-support order` retain Discord permission and
channel checks, while the website independently enforces the current CM-admin allowlists and
account link.

Requests use a finite timeout. A transport failure or HTTP 502/503/504 may be retried once,
but every attempt receives a fresh timestamp, cryptographically secure UUIDv4 nonce, and HMAC
signature. Other responses are not automatically retried. Logs and Discord replies never
include the shared secret, signature, nonce, raw request body, or raw selector.

Run `npm test`, `npm run typecheck`, and `npm run build` before release. Existing command
registration remains manual through `npm run register:commands`. Internal support command
registration is a separate, fail-closed `npm run register:internal-api-commands`; do not run it
until the coordinated activation review approves the feature.
