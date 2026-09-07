# ADR-0016 — Tickety Support Ticket Account-Link Gate

Status: Accepted  
Date: 2026-09-08

## Context

Cheater's Market support tickets are created by Tickety as Discord text channels. Support should be available only when the ticket creator's Discord account is linked to a Cheater's Market website account, while staff must retain normal access and customers must still be able to read the ticket and the linking instructions.

The authoritative link state and durable ticket-access state live on the Cheater's Market website/Supabase side behind the existing HMAC Internal Integrations API. The Discord bot must not gain direct Supabase/Postgres credentials or a local authorization database.

The website exposes these closed operations:

```text
support.tickets.access.read
support.tickets.verify
support.tickets.override
```

The verified-access lease is exactly eight hours. The product decision is deliberately activity-driven rather than timer-driven: after lease expiry, no work occurs until the ticket creator next sends a message or explicitly presses **Check Again**.

## Decision

### Ticket recognition

Initial Tickety tickets are recognized only when:

```text
parentId == 1382569775988871330
OR
(parentId == null AND channel name matches /^support-\d+$/i)
```

The second rule covers Tickety overflow channels created uncategorized at the top of the server.

A ticket already known by durable channel ID continues to be treated as the same ticket if Tickety later moves it. Startup recovery may inspect other `support-<number>` channels only to ask the website whether durable state already exists; a matching name outside the recognized initial location does not create new ticket state by itself.

### Creator resolution

For a new ticket, the bot inspects member-specific channel permission overwrites. The creator is accepted only when exactly one non-bot member candidate can be resolved.

If there are zero or multiple candidates, the bot does not guess. It logs the ambiguity and leaves creator-specific mutation alone until authoritative state exists or staff resolves the ticket another way.

### Initial verification

For a newly created ticket:

1. resolve the creator;
2. capture the creator's pre-gate state for the permissions the CM gate changes;
3. immediately deny participation permissions so the creator cannot race the verification request;
4. call `support.tickets.verify`;
5. if access is granted, restore the captured permission state;
6. if unlinked, keep the creator locked and send the linking panel;
7. if CM verification fails, keep the creator locked but use distinct **verification unavailable** wording instead of claiming the account is unlinked.

### Discord permission gate

The creator keeps visibility/read access. The CM gate changes only:

```text
SendMessages
AddReactions
UseApplicationCommands
CreatePublicThreads
CreatePrivateThreads
SendMessagesInThreads
AttachFiles
EmbedLinks
```

Staff/support role overwrites are never modified.

The normal unlock path restores the exact pre-gate tri-state for those permissions. The lock notice's button custom ID carries only non-secret recovery metadata:

```text
channel ID
creator Discord ID
allow bit mask
deny bit mask
```

This permits exact restoration after a bot restart without adding another persistence store.

If that Discord-side recovery snapshot is unavailable, the bot restores only the gated permissions to Tickety's current default participant allow state. This fallback is valid for the current CM server because Tickety uses its default participant permission configuration. It does not modify unrelated permissions.

### Customer linking UI

Locked customers are sent to:

```text
https://cheaters.market/dashboard?tab=settings
```

The notice tells signed-out users to sign in, reopen Settings if necessary, select **Connect Discord**, authorize the Discord account currently in use, then return and press **Check Again**.

Only the encoded ticket creator may use that recheck component.

### Eight-hour renewal

A successful verification establishes the website's exact eight-hour lease.

During the active lease:

- creator messages cause zero CM verification calls;
- staff/admin/bot messages cause zero CM verification calls.

After expiry:

- there is no eight-hour timer;
- there is no global ticket poll;
- an inactive ticket causes no verification work;
- staff/admin/bot activity does not renew the creator;
- only the ticket creator's next message, or explicit **Check Again**, performs a fresh verification.

When an expired creator message triggers verification:

- linked -> renew the lease and keep the message;
- unlinked -> delete that triggering message, lock the creator, and show the link panel;
- API failure -> delete the triggering message, fail closed, and show verification-unavailable state.

Per-channel work is serialized so concurrent creator activity at the expiry boundary cannot cause parallel verification races.

### Startup reconciliation

Startup reconciliation is one-time recovery, not periodic polling.

The bot paces candidate recovery to stay below the website support-ticket operation limits. Durable state is applied as follows:

- `locked` -> re-enforce the creator deny;
- `admin_override` -> ensure the creator is unlocked;
- active `verified` -> preserve access and repair a half-completed unlock if a gate notice proves one exists;
- expired `verified` -> do not proactively renew or lock merely because time elapsed; wait for creator activity;
- no durable state in a recognized initial ticket -> perform the normal initial verification.

Channel deletion clears only bot runtime cache. No website delete operation exists; Discord channel snowflakes are not reused, so stale durable rows do not authorize another ticket.

### Interaction ordering

The ticket gate handles customer ticket messages before `cm aura` and before customer AI support. A blocked creator message therefore cannot continue into Aura or AI handling.

Ticket recheck buttons are handled before the ordinary `/cm` component controller because their custom IDs intentionally use the `cm:` namespace.

### Administrator override

The command is:

```text
/cm ticket-allow
```

It is ticket-scoped and permanent for that ticket state.

Authorization is exactly ADR-0006:

1. guild interaction;
2. exact configured `DISCORD_GUILD_ID`;
3. non-empty `BOT_ADMIN_USER_IDS`;
4. invoking Discord user explicitly allowlisted.

No Discord-role-only or website-side human-admin authorization model is added.

The bot calls `support.tickets.override` with a fresh logical UUID idempotency key and a fixed safe reason. The website records administrator attribution. The bot restores ticket participation and writes the normal sanitized Discord audit entry. `BOT_AUDIT_LOG_CHANNEL_ID` must be configured before the override mutation is attempted.

The override applies only to the current ticket channel. Future tickets from the same Discord user remain subject to the normal account-link gate.

## Consequences

Benefits:

- no local SQLite/Northflank volume is required for ticket authorization;
- no direct database credential is added to the bot;
- website link state remains authoritative;
- stale access after unlinking is bounded to eight hours without background polling;
- inactive tickets generate no recurring verification traffic;
- staff access is unaffected;
- restart recovery is durable through website state plus minimal Discord-side permission recovery metadata;
- administrator bypass remains explicit, ticket-scoped, allowlisted and audited.

Costs / limitations:

- creator resolution intentionally refuses ambiguous member-overwrite layouts;
- if the permission snapshot notice is deleted and no runtime snapshot remains, unlock uses the documented Tickety-default fallback for only the gated permissions;
- startup recovery of many first-time tickets is intentionally paced;
- the website retains ticket rows after Discord channel deletion until a future narrowly scoped cleanup operation exists.

## Deployment requirements

Before production use:

1. deploy the website support-ticket routes;
2. add exactly these operations to the dedicated CM Discord bot integration client's `allowedOperations`:
   - `support.tickets.access.read`
   - `support.tickets.verify`
   - `support.tickets.override`
3. deploy this bot revision;
4. run `npm run register:commands` once because `/cm ticket-allow` changes guild command JSON;
5. verify linked, unlinked, recheck, eight-hour expiry, Tickety overwrite rewrite, restart recovery and admin override end to end.

No new bot environment variable or direct database credential is required.
