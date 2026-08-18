# ADR-0009: Customer Email in Shared `/cm` Panels

## Status

Accepted

- Date: 2026-08-18
- Type: Security / Product / Discord presentation
- Supersedes: ADR-0008 only where ADR-0008 prohibited full account email in customer-safe Share to Chat output

## Context

ADR-0008 introduced a separate read-only renderer for customer-visible Share to Chat messages and intentionally excluded the full account email from those messages. In operational use, staff need the shared order/account summary to identify the same customer account that is visible in the private admin panel. The product owner has explicitly requested that the customer account email be included in the shared message.

The Share to Chat action is already an explicit disclosure action by an allowlisted administrator. It publishes into the current guild text-capable channel and therefore makes the permitted fields visible to readers of that channel. This decision changes only the email disclosure policy; it does not weaken authorization or grant customer control.

## Decision

Customer-safe Share to Chat panels **must include the canonical customer account email** when they display customer/account identity.

The email must:

1. come from the already-authorized canonical `session.overview.identity.email` value;
2. be rendered through the existing Discord-safe text escaping helper;
3. be displayed as account-identification information only;
4. never be placed in a component custom ID, session token, log credential field or backend mutation request solely for sharing;
5. remain subject to `safeAllowedMentions` so the shared message cannot trigger mentions.

This applies consistently to the customer identity section of shareable User, Orders, Order, Fulfillment, Refund and Aura/Wallet views.

### Boundaries retained from ADR-0008

The shared message remains a separately rendered read-only Components V2 message. It must still contain **no buttons, select menus, modals, custom IDs or other customer-operable admin controls**.

The public renderer must continue to omit internal/operator-only data including:

- internal CM user UUID;
- internal purchase option identifiers where not customer-facing;
- backend audit IDs;
- transaction IDs;
- idempotency keys;
- HMAC/API/credential material;
- internal provider codes and failure codes;
- admin refund/adjustment reasons;
- private navigation/session identifiers.

The existing exact-guild + explicit `BOT_ADMIN_USER_IDS` authorization, operator-bound session ownership, current-channel publication rule and no-mutation/no-database rule remain unchanged.

## Security consequence

The account email is personally identifying account information and will be visible to everyone who can read the Discord channel where the authorized administrator presses Share to Chat. This is an intentional product disclosure. The admin remains responsible for choosing an appropriate channel before sharing.

This decision does **not** authorize exposing other private/internal fields by analogy. Any additional disclosure expansion requires explicit review and, where material, another superseding ADR.

## Verification requirements

Tests must prove that:

- customer email is present in the rendered public user/order summaries;
- the email is Discord-escaped rather than interpolated unsafely;
- internal user UUID/provider/option identifiers/admin reasons remain absent;
- public shared payloads still contain no interactive custom IDs;
- existing Share to Chat authorization/session ownership tests remain passing.

## Rollback / supersession

Removing customer email from shared messages may be done by a later explicit product/security decision. Expanding shared disclosure beyond the fields allowed by ADR-0008 plus this email exception requires a new superseding decision.
