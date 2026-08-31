# Command Catalog and Policy

Updated: 2026-08-31

## Authorities

- ADR-0005 — customer vs admin command presentation.
- ADR-0006 — shared `/cm` exact-guild + explicit-user authorization.
- ADR-0007 — Aura/wallet confirmation/idempotency/audit.
- ADR-0008/0009 — separate customer-safe Share to Chat renderer and canonical email disclosure.
- ADR-0011 — order-first pending purchase fallback/private fulfillment support boundary.
- ADR-0014 — broad customer-facing AI activation governance.
- ADR-0015 — controlled single-channel visible AI test.

No command or customer-AI path may directly connect to Supabase/Postgres.

## AI support message surface

AI support is not a slash command. It uses eligible `MessageCreate` traffic behind exact guild + explicit channel/category allowlists.

Current controlled test configuration is intended to be:

```text
AI_SUPPORT_ENABLED=true
AI_SUPPORT_SHADOW_ENABLED=false
AI_SUPPORT_CHANNEL_IDS=1542084649017286727
AI_SUPPORT_CATEGORY_IDS=
```

Therefore visible AI may reply only in that exact channel. DMs, wrong guilds, bots and every other non-allowlisted surface are ignored by AI support. `cm aura` retains its reserved deterministic command path rather than being routed through the support planner.

This is a narrow manual test, not broad customer activation. Kill switch: set `AI_SUPPORT_ENABLED=false` and restart/redeploy.

The separate shadow flag can run the same exact eligibility in no-reply mode when visible AI is disabled. Visible mode takes precedence if both flags are true, preventing duplicate processing. Shadow cohort lifecycle tools are local npm tooling, not Discord commands.

## `cm aura`

Customer message command. Keeps configured-guild/blocked-channel guards, bot-author protection, privacy/sanitization and safe mentions.

## `/refresh-leaderboard`

Operational guild slash command. Keeps exact configured guild + configured command channel + `ManageGuild|Administrator`. It is independent from `/cm` authorization.

## `/cm` authorization

Before sensitive backend access, every slash/button/modal interaction requires:

1. guild interaction;
2. exact `DISCORD_GUILD_ID`;
3. non-empty `BOT_ADMIN_USER_IDS`;
4. invoking Discord user explicitly allowlisted;
5. operator-bound unexpired session for subsequent components/modals.

A whitelisted admin may use `/cm` from any channel inside the configured guild. There is no supported shared `/cm` command-channel restriction.

## `/cm user`

Exactly one lookup is required:

```text
/cm user email:<exact email>
/cm user discord_user:<selected Discord user>
```

Both resolve through the approved website API boundary. Both/neither input fails before backend access.

Private User Operations exposes only the explicitly approved account/order/Aura/wallet summary and controls to the operator.

## `/cm order reference:<selector>`

Order resolution is:

```text
orders.details.read
  -> success: canonical order
  -> stable NOT_FOUND only: purchase-intents.lookup.read
```

Owner identity is resolved and checked exactly before an operator session opens. Pending purchase state is read-only and may transition to the canonical order after refresh.

Other order errors never trigger pending fallback.

## Canonical Order / Delivery

`orders.fulfillment.read` is diagnostics-only. Optional masked support metadata may appear only in the private operator UI. Raw/decrypted material is never accepted or exposed. Missing support does not imply manual fulfillment.

No Manual Fulfillment execute control exists.

## Share to Chat

An authorized operator may publish a separately rendered, buttonless Components V2 customer summary from approved private views. The public copy does not inherit admin controls or private provider/internal/audit/idempotency/masked fulfillment fields.

Canonical customer email is intentionally permitted under ADR-0009.

## Aura/wallet adjustment

Private admin only. Both retain explicit confirmation, fresh-state equality, stable idempotency and audit requirements under ADR-0007.

## Refund

Canonical order only:

```text
orders.refund.preview
 -> explicit confirmation
 -> fresh exact preview equality
 -> orders.refund.execute
```

Customer AI cannot invoke this path.

## Authorization matrix

| Surface | Audience | Location | Explicit whitelist | Mutation |
| --- | --- | --- | --- | --- |
| `cm aura` | customer | configured guild; blocked channel excluded | no | no |
| AI support (ADR-0015 test) | customer | exact configured guild + channel `1542084649017286727` only | surface allowlist | **none** |
| AI shadow | evaluation only | same eligibility, post-cohort-cutoff | surface allowlist | **none; no reply** |
| `/refresh-leaderboard` | staff/admin | configured guild + command channel | permission gate | no |
| `/cm user ...` | admin | configured guild | **mandatory user allowlist** | confirmed admin paths only |
| `/cm order ...` | admin | configured guild | **mandatory user allowlist** | pending read-only; canonical refund/navigation |
| Share to Chat | admin initiates; readers consume | current guild channel | **mandatory for click** | none |

## Bot website-operation surface

Existing concrete operations include:

```text
aura.leaderboards.read
aura.lookup.read
users.overview.read
orders.details.read
orders.fulfillment.read
purchase-intents.lookup.read
orders.refund.preview
orders.refund.execute
users.aura.adjust
users.wallet.adjust
```

Website per-client `allowedOperations` is an independent runtime authorization boundary. Customer AI may use only the separately approved read subset through the deterministic lookup adapter; it never gets refund/Aura/wallet mutation authority.

Slash-command JSON remains `/refresh-leaderboard` + `/cm`; AI support does not require command re-registration.
