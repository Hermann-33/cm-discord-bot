# ADR-0008: Customer-Safe Sharing from the Private Admin Console

## Status

Accepted

- Date: 2026-08-18
- Type: Security / Product / Discord presentation

## Context

The `/cm` console is intentionally private and contains information and controls that must never be exposed as customer-operable Discord components. Staff also need a low-friction way to communicate the current account/order/refund/fulfillment state to a customer in the same Discord channel.

Copying the private Components V2 message directly is unsafe even if buttons are visually removed: private panels can include full account email, internal user UUIDs, provider/failure details, mutation reasons, backend transaction/audit identifiers and other operator-only context.

## Decision

Meaningful `/cm` operational panels may expose a **Share to Chat** button to the authorized operator.

The share action must:

1. run through the normal `/cm` button dispatcher;
2. re-run exact-guild + explicit `BOT_ADMIN_USER_IDS` authorization;
3. require the original operator-bound session;
4. publish only into the current guild text-capable channel;
5. use a dedicated customer-safe renderer rather than cloning the private panel;
6. publish a Components V2 message containing display components only and **no buttons, select menus, modals, custom IDs or other interactive controls**;
7. use `safeAllowedMentions` so displayed Discord identities do not generate notifications;
8. perform no Internal Integrations API mutation and no database operation.

### Customer-safe field policy

The public renderer may show the customer-relevant state needed for support communication, such as:

- account status;
- linked Discord identity;
- wallet/Aura summary;
- order public reference, item, status, amount and delivery state;
- refund amounts/effects;
- adjustment before/change/after values;
- customer-facing fulfillment status/messages;
- Discord-formatted timestamps.

The public renderer must omit operator/private/internal data such as:

- full account email;
- internal CM user UUID;
- backend audit IDs;
- transaction IDs;
- idempotency keys;
- HMAC/API material;
- internal provider codes and failure codes;
- admin mutation/refund reasons;
- private navigation/session identifiers.

A system/error/authorization notice that does not have a defined customer-safe representation is not shareable merely because it appears in the private interaction.

### Discord identity lookup

`/cm user` may accept either an exact account email or a selected Discord user. Discord lookup uses the existing website-owned `users.overview.read` operation with the canonical `external_identity` selector (`provider=discord`). Exactly one lookup input is required at runtime.

No new website endpoint or database path is introduced.

### Time presentation

Dates/times shown in `/cm`, customer-safe shared panels and Discord audit panels use Discord timestamps in two simultaneous forms:

```text
<t:unix:f> · <t:unix:R>
```

This gives a locale-aware absolute date/time and a relative age such as “2 hours ago”.

### Discord audit presentation

Mutation audit messages remain secondary to the website-owned immutable backend audit. Discord audit output is a concise Components V2 operational summary containing the customer identity when available, action/result, reason, operator and completion time. Backend transaction/audit IDs are not required in the Discord presentation because the backend record remains authoritative.

## Security properties retained

This ADR does not weaken:

- ADR-0006 exact-guild + explicit-user authorization;
- per-interaction reauthorization;
- session ownership and expiry;
- private admin controls;
- ADR-0007 Aura/wallet confirmation and stale-state checks;
- refund canonical preview/re-preview/execute flow;
- stable mutation idempotency;
- required audit channel before mutation execution;
- website Internal Integrations API boundary;
- no direct Supabase/Postgres access;
- manual-fulfillment prohibition.

## Consequences

Benefits:

- support staff can publish a readable state summary without manually rewriting it;
- customers receive no admin control surface;
- sensitive/private fields are intentionally filtered rather than accidentally inherited from the admin panel;
- timestamps render in the viewer's locale and relative context;
- audit channel noise is reduced while retaining actionable attribution and result information.

Costs:

- private and customer-safe panel renderers must be maintained separately;
- public sharing is an explicit disclosure action by the authorized operator, so field additions require review against this policy;
- the bot remains single-process session-based for panel state.

## Rollback/supersession

Allowing customer-shared messages to contain interactive admin controls, private identifiers, mutation reasons, or direct database/API authority requires a new explicit security decision. Removing `/cm` authorization/session ownership from the share action likewise requires a superseding ADR.
