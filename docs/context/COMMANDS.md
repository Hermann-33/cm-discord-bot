# Command Catalog and Policy

Updated: 2026-09-09

## Authorities

- ADR-0005 — customer vs admin command presentation.
- ADR-0006 — shared `/cm` exact-guild + explicit-user authorization.
- ADR-0007 — existing button/modal Aura/wallet confirmation/idempotency/audit.
- ADR-0008/0009 — separate customer-safe Share to Chat renderer and canonical email disclosure.
- ADR-0011 — order-first pending purchase fallback/private fulfillment support boundary.
- ADR-0014 — broad customer-facing AI activation governance.
- ADR-0015 — controlled single-channel visible AI test.
- ADR-0016 — Tickety support-ticket account-link gate and ticket-scoped admin override.
- ADR-0017 — direct Aura/balance/refund slash mutations; slash submission itself is the confirmation.

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

## Tickety support-ticket gate

The ticket gate is deterministic authorization logic and runs before customer Aura/AI message handling.

Initial ticket recognition:

```text
parentId == 1382569775988871330
OR
(parentId == null AND name matches /^support-\d+$/i)
```

Exactly one non-bot member-specific overwrite must resolve as the ticket creator. Ambiguous creator evidence is never guessed.

The creator is made read-only while `support.tickets.verify` checks the authoritative website link. Visibility/history remain unchanged and staff/support role overwrites are never modified.

A successful verification grants an exact eight-hour lease. There is no background eight-hour poll and no verification on every creator message while the lease remains valid. Once expired, only the ticket creator's next message or explicit **Check Again** triggers a fresh verification. Staff/admin/bot messages never renew the customer's link state.

Unlinked or verification-unavailable creators remain read-only. An unlinked creator receives **Open CM Settings** pointing at `https://cheaters.market/dashboard?tab=settings` plus **Check Again**. Service/API failure uses distinct copy and never claims the account is unlinked.

Tickety permission rewrites are re-enforced for locked tickets through `ChannelUpdate`. Startup performs durable-state recovery only; it does not globally fresh-verify every persisted ticket.

## `/cm ticket-allow`

Ticket-scoped administrator bypass. It must be run in a recognized/durable CM support ticket and uses the exact ADR-0006 `/cm` authorization:

- configured guild only;
- non-empty explicit `BOT_ADMIN_USER_IDS`;
- invoker explicitly allowlisted;
- no role-only authorization;
- no shared command-channel restriction.

`BOT_AUDIT_LOG_CHANNEL_ID` must be configured before the override mutation. The bot calls only `support.tickets.override`, restores that ticket creator's participation, posts `Ticket lockdown has been overridden by <@operator>.` in the ticket after a successful Discord unlock, and emits a sanitized Discord audit. If Discord access restoration fails, the public success notice is not posted. The override applies only to that ticket; future tickets remain gated.

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

The existing User Operations button/modal path remains available and keeps ADR-0007's preview, five-minute confirmation, fresh-state equality, stable idempotency and audit model.

ADR-0017 additionally adds direct slash mutations:

```text
/cm aura amount:<+/- whole Aura> email:<exact email> [reason:<optional>]
/cm aura amount:<+/- whole Aura> discord_user:<user> [reason:<optional>]

/cm balance amount:<+/- decimal amount> email:<exact email> [reason:<optional>]
/cm balance amount:<+/- decimal amount> discord_user:<user> [reason:<optional>]
```

Exactly one of `email` or `discord_user` is required. Positive values add; negative values deduct. The direct command resolves a fresh user overview, freezes the canonical user ID, performs the website mutation immediately, posts the normal audit, and returns only the final completed result. There is no preview/confirm button in the direct path.

If `reason` is omitted, the bot supplies a fixed auditable direct-command reason.

## Refund

The existing order-panel refund flow remains:

```text
orders.refund.preview
 -> explicit confirmation
 -> fresh exact preview equality
 -> orders.refund.execute
```

ADR-0017 additionally provides:

```text
/cm refund reference:<public ref|order UUID> [reason:<optional>]
```

The direct command accepts canonical orders only. It resolves the order and owner, performs `orders.refund.preview` as an immediate eligibility/identity check, then executes `orders.refund.execute` without showing an intermediate confirmation panel. The reply is the final completed refund result.

Customer AI cannot invoke either refund path.

## Authorization matrix

| Surface | Audience | Location | Explicit whitelist | Mutation |
| --- | --- | --- | --- | --- |
| `cm aura` | customer | configured guild; blocked channel excluded | no | no |
| AI support (ADR-0015 test) | customer | exact configured guild + channel `1542084649017286727` only | surface allowlist | **none** |
| AI shadow | evaluation only | same eligibility, post-cohort-cutoff | surface allowlist | **none; no reply** |
| `/refresh-leaderboard` | staff/admin | configured guild + command channel | permission gate | no |
| `/cm user ...` | admin | configured guild | **mandatory user allowlist** | interactive admin paths |
| `/cm order ...` | admin | configured guild | **mandatory user allowlist** | pending read-only; canonical navigation/refund buttons |
| `/cm aura ...` | admin | configured guild | **mandatory user allowlist** | direct Aura adjustment |
| `/cm balance ...` | admin | configured guild | **mandatory user allowlist** | direct wallet adjustment |
| `/cm refund ...` | admin | configured guild | **mandatory user allowlist** | direct canonical-order refund |
| `/cm ticket-allow` | admin | current CM support ticket | **mandatory user allowlist** | ticket-scoped access override |
| Share to Chat | admin initiates; readers consume | current guild channel | **mandatory for click** | none |

## Bot website-operation surface

Existing concrete operations include:

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

Website per-client `allowedOperations` is an independent runtime authorization boundary. Customer AI may use only the separately approved read subset through the deterministic lookup adapter; it never gets refund/Aura/wallet mutation authority.

Top-level slash commands remain `/refresh-leaderboard` + `/cm`. `/cm` now contains `user`, `order`, `aura`, `balance`, `refund`, and `ticket-allow`. This changes guild command JSON, so deployment requires one explicit `npm run register:commands`. The direct mutation commands reuse the already-approved website operation set; no new website permission string is required.
