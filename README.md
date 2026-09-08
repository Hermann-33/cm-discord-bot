# Cheater's Market Discord bot

Standalone Node.js/TypeScript Discord bot for Cheater's Market.

Current command surfaces:

- customer message command `cm aura`;
- staff operational slash command `/refresh-leaderboard`;
- private admin `/cm user` lookup by exact email **or** linked Discord user;
- private admin `/cm order reference:<CM-public-ref-or-order/purchase-UUID>` for canonical orders and pending purchases;
- private `/cm` Aura, wallet and canonical-order refund controls;
- explicit customer-safe **Share to Chat** copies from meaningful `/cm` panels.

## Architecture and data boundary

```text
Discord
  -> CM Discord bot
  -> HMAC-authenticated HTTPS
  -> Cheater's Market Internal Integrations API
  -> website-owned business/database layer
```

The bot has no direct Supabase/Postgres access, database credential, service-role credential or database fallback. Active source uses only:

```text
aura.leaderboards.read
aura.lookup.read
users.overview.read
support.tickets.access.read
support.tickets.verify
support.tickets.override
orders.details.read
orders.fulfillment.read
purchase-intents.lookup.read
orders.refund.preview
orders.refund.execute
users.aura.adjust
users.wallet.adjust
```

Backend per-client `allowedOperations` remains an independent deployment authorization boundary. `purchase-intents.process` and manual fulfillment are not bot operations.

## Requirements

- Node.js 22+
- Discord application/bot
- privileged Message Content intent while `cm aura` remains message-based
- bot-dedicated Internal Integrations API client/key

```powershell
npm ci
Copy-Item .env.example .env
```

## Environment variables

```text
DISCORD_BOT_TOKEN
DISCORD_CLIENT_ID
DISCORD_GUILD_ID
DISCORD_LEADERBOARD_CHANNEL_ID
DISCORD_COMMAND_CHANNEL_ID
DISCORD_AURA_COMMAND_BLOCKED_CHANNEL_ID
DISCORD_LEADERBOARD_MESSAGE_ID

BOT_ADMIN_USER_IDS
BOT_AUDIT_LOG_CHANNEL_ID

CM_INTERNAL_INTEGRATIONS_API_ORIGIN
CM_INTERNAL_INTEGRATIONS_API_CLIENT_ID
CM_INTERNAL_INTEGRATIONS_API_KEY_ID
CM_INTERNAL_INTEGRATIONS_API_HMAC_SECRET_BASE64
CM_INTERNAL_INTEGRATIONS_API_TIMEOUT_MS

GROQ_API_KEY
GROQ_MODEL
GROQ_REASONING_EFFORT

OPENROUTER_API_KEY
OPENROUTER_MODEL
OPENROUTER_DATA_COLLECTION
```

`BOT_ADMIN_USER_IDS` is a comma-separated explicit Discord user-ID allowlist. `/cm` fails closed when it is empty. `BOT_AUDIT_LOG_CHANNEL_ID` is required before refund/Aura/wallet execution. `BOT_ADMIN_COMMAND_CHANNEL_ID` is not supported.

`GROQ_API_KEY` is optional until AI support is enabled. When present, the default primary hosted triage candidate is `openai/gpt-oss-120b` with `GROQ_REASONING_EFFORT=low`. The planner payload is minimized and sanitized before it leaves the bot. See `docs/GROQ_SUPPORT_TRIAGE.md`.

`OPENROUTER_API_KEY` remains optional for the secondary OpenRouter development adapter. Its default model is `google/gemma-4-26b-a4b-it:free`; see `docs/OPENROUTER_SUPPORT_TRIAGE.md`.

## Hosted support triage

Production source includes constrained hosted triage clients under `src/ai/`. Groq GPT-OSS 120B is the primary candidate; OpenRouter remains available as a secondary development provider. Neither provider is authoritative for policy, live account/order/payment state, product scope, restricted technical support, or executable operations.

The Groq client uses:

- `POST https://api.groq.com/openai/v1/chat/completions`;
- `openai/gpt-oss-120b` by default;
- strict JSON-schema Structured Outputs;
- `temperature: 0`;
- `reasoning_effort: low` by default;
- a bounded 400-token completion budget;
- no streaming or model tools;
- deterministic validation of every returned case/clarification/lookup/policy/entity ID;
- scope checks;
- canonical clarification/human fallback on failure.

Common customer identifiers and sensitive live-context fields are removed from planner payloads before hosted calls. Raw transcript history, credentials, account tokens and private evidence are not part of the production planner input.

Adding a hosted-model API key does not by itself turn on customer-facing support. Activation remains gated on benchmark quality and later Discord support-flow integration.

## `/cm` authorization

Every `/cm` slash command, button and modal requires:

1. guild interaction;
2. exact `DISCORD_GUILD_ID`;
3. non-empty `BOT_ADMIN_USER_IDS`;
4. invoking Discord user explicitly allowlisted;
5. operator-bound unexpired session for component/modal navigation.

A whitelisted admin may use `/cm` from any channel in the configured guild. DMs and wrong guilds fail closed. Ephemeral output is privacy, not authorization. `/refresh-leaderboard` keeps its separate configured channel and Discord permission policy.

## Tickety account-link gate

CM support-ticket gating is deterministic bot logic, not AI support.

Initial ticket recognition is:

```text
parent == 1382569775988871330
OR
(parent == none AND name matches support-<number>)
```

The bot resolves exactly one non-bot member overwrite as the ticket creator. It immediately makes only that creator read-only while the website verifies the active CM ↔ Discord link through `support.tickets.verify`.

Unlinked customers receive **Open CM Settings** and **Check Again**. The website linking destination is:

```text
https://cheaters.market/dashboard?tab=settings
```

A successful verification creates an exact eight-hour website lease. The bot performs no recurring eight-hour poll and no per-message verification while the lease is active. During normal runtime after expiry, only the ticket creator's next message (or **Check Again**) performs a fresh check. Staff/admin/bot messages never renew the customer's link state. **Process startup is the deliberate exception:** one paced startup sweep fresh-verifies every existing non-overridden support ticket once.

If that fresh check says unlinked, the triggering creator message is deleted and the creator is locked. API/service failure also fails closed, but uses distinct verification-unavailable copy rather than claiming the user is unlinked.

Tickety permission rewrites are re-enforced while a durable ticket is locked. Startup reconciliation now performs a paced one-time fresh verification sweep across existing support tickets so a restart can recover immediately after API-permission/configuration fixes. `admin_override` tickets remain bypassed, and no recurring polling is introduced.

`/cm ticket-allow` is the ticket-scoped administrator bypass. It uses the same exact-guild + explicit `BOT_ADMIN_USER_IDS` authorization as every other `/cm` admin control, requires the configured audit channel, records the website override, restores participation and writes a sanitized Discord audit entry. The bypass does not carry to future tickets.

ADR-0016 defines the complete gate and recovery model.

## `/cm user`

Exactly one lookup input is required:

```text
/cm user email:user@example.com
```

or select:

```text
/cm user discord_user:<Discord user>
```

Discord lookup reuses `users.overview.read` with the canonical `external_identity` selector.

The User Operations panel shows canonical email, account state, linked Discord state, current wallet, available/lifetime Aura, pending Aura when non-zero, order/license/account counts and the latest order. Adjust Aura, Adjust Wallet, recent-order access, Order History and Share to Chat remain available.

## `/cm order` — canonical and pending

```text
/cm order reference:CM-...
/cm order reference:<order-or-purchase UUID>
```

The lookup is intentionally order-first:

```text
orders.details.read
  -> success: resolve exact owner and open canonical order
  -> NOT_FOUND only: purchase-intents.lookup.read
       -> resolve exact owner
       -> pending purchase panel
       -> Refresh Purchase
       -> transition automatically to canonical order when created
```

Authentication/authorization/rate-limit/service failures never trigger the purchase-intent fallback.

A pending purchase is read-only support state. It has no refund or delivery controls until the website creates the canonical order. The bot does not call `purchase-intents.process`.

## Fulfillment support view

For canonical orders, the bot consumes the website's optional `orders.fulfillment.read.support` metadata. The private staff panel can show:

- human-readable product/account type;
- finite duration when known;
- useful provider context;
- delivery progress;
- at most 10 stored **masked** license/account values;
- canonical manual-required state.

Raw/decrypted fulfillment secrets are not part of the API DTO and unexpected raw-material fields are rejected by strict validation.

Support enrichment is optional. If it is absent/unavailable, the canonical order still opens and existing order/refund navigation remains usable. Missing masked material does **not** mean manual fulfillment is required.

`Delivery Details` remains read-only diagnostics. No manual-fulfillment execute operation exists.

## Customer-safe sharing

Meaningful private `/cm` panels include **Share to Chat**. The click reauthorizes the admin and owning session, then posts a separately rendered read-only Components V2 summary into the current channel.

The shared copy contains no buttons or other interactive components. It includes the canonical customer account email plus linked Discord identity when available, but omits internal CM user UUIDs, internal purchase/purchase-intent option IDs, provider/provider-status internals, admin reasons, backend audit/transaction/idempotency identifiers and credentials.

**Masked fulfillment support material is private staff data and is never copied into Share to Chat.** Mentions are disabled with `safeAllowedMentions`.

ADR-0008 defines the separate public renderer; ADR-0009 permits canonical customer email; ADR-0011 defines pending-purchase and fulfillment-support disclosure rules.

## Mutations

Aura and wallet adjustments retain the ADR-0007 model: signed bounded delta, reason, fresh overview, current/change/projected preview, explicit five-minute confirmation, second fresh relevant-balance equality check, stable UUID idempotency/body, website-owned execution and backend + Discord audit.

Refund remains canonical-order-only:

```text
orders.refund.preview
  -> explicit confirmation
  -> fresh exact re-preview
  -> orders.refund.execute
```

Pending purchase intents do not expose refund execution.

## Develop and validate

```powershell
npm ci
npm test
npm run typecheck
npm run build
git diff --check
```

`npm start` runs `dist/index.js`.

## Guild slash-command registration

Registration is explicit and never happens on startup:

```powershell
npm run register:commands
```

Top-level commands remain `/refresh-leaderboard` and `/cm`. The `/cm` subcommands are now `user`, `order`, and `ticket-allow`.

This task **does change guild command JSON**, so run `npm run register:commands` once after deploying the bot revision and website operation permissions. Command registration is still explicit and is never performed at bot startup.

## Deployment note for pending lookup

The deployed website integration client used by the bot must include every operation required by the deployed source. In addition to the existing lookup/admin permissions, this ticket-gate revision requires:

```text
support.tickets.access.read
support.tickets.verify
support.tickets.override
```

`purchase-intents.lookup.read` remains required for pending order lookup. Endpoint existence does not grant any permission; the website client's exact `allowedOperations` list remains authoritative.

## Non-production transcript tooling

The parallel `CM-Ticket-Transcripts` side project remains governed by ADR-0010. Export tooling lives under `tools/ticket-transcript-exporter/`, is not imported by `src/`, and is not a production bot dependency.

The canonical-support evaluation helpers keep first-turn retrieval separate from follow-up state replay:

```powershell
npm run build:support-evaluation-partitions -- --data-dir "C:\code\CM-Ticket-Transcripts"
npm run evaluate:first-turn-routing -- --data-dir "C:\code\CM-Ticket-Transcripts" --output "C:\code\CM-Ticket-Transcripts\knowledge-canonical\Evaluation\historical-first-turn-routing-results.json"
npm run evaluate:historical-state-replay -- --data-dir "C:\code\CM-Ticket-Transcripts" --output "C:\code\CM-Ticket-Transcripts\knowledge-canonical\Evaluation\historical-state-replay-results.json"
```

After `GROQ_API_KEY` is set, start with a three-record hosted smoke test without running the Discord bot:

```powershell
npm.cmd run evaluate:groq-triage -- --data-dir ..\CM-Ticket-Transcripts --limit 3
```

If accepted outputs are returned, continue with a 20-record smoke benchmark. The Groq evaluator token-paces hosted calls and stops after a provider HTTP 429 instead of repeatedly consuming failed requests.

These commands use already-consumed development records, keep new final holdouts out of model selection, never send routing exemplars or raw historical evidence to the model, and do not execute the production bot.

## Production notes

Use a single bot replica unless the in-memory session/scheduler architecture is redesigned. Keep Discord/API credentials only in the host secret store, collect structured logs without request bodies/credentials, and keep the bot limited to the exact website operations required by deployed source.

## Legacy archive

The pre-rebuild implementation remains frozen under `legacy/`; active source, builds and tests must not import or execute it.
