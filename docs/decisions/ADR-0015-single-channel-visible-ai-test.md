# ADR-0015 — Controlled Single-Channel Customer-Visible AI Test

- Status: Accepted
- Date: 2026-08-31
- Supersedes: none
- Narrows/temporarily exceptions: ADR-0014 only for an explicitly operator-authorized test surface; ADR-0014 remains the broad-release gate

## Context

ADR-0014 established default-off customer-facing AI support and required prospective evidence plus a separate release decision before broad activation. After synthetic B0-v6 passed and shadow tooling was implemented, the operator explicitly requested a small manual live test before starting prospective shadow collection.

The test is intended to expose practical response-quality defects using a single Discord channel without enabling AI across ticket categories or the wider guild.

## Decision

A customer-visible AI test is permitted only when all of the following are true:

```text
AI_SUPPORT_ENABLED=true
AI_SUPPORT_SHADOW_ENABLED=false
AI_SUPPORT_CHANNEL_IDS=1542084649017286727
AI_SUPPORT_CATEGORY_IDS=
```

The exact channel allowlist must contain only `1542084649017286727`. Category allowlisting must be empty.

The production source must not hard-code the test channel; the restriction remains deployment configuration.

If both visible and shadow flags are true, existing visible-mode precedence remains authoritative and duplicate processing must not occur.

## What this authorizes

- manual customer-visible testing in the one exact channel;
- normal deterministic routing/planner/validator/action resolution;
- approved read-only live lookups already authorized for AI support;
- observation of response quality and safe canonical diagnostics.

## What this does not authorize

- guild-wide AI support;
- ticket-category-wide AI support;
- DM support;
- mutation operations;
- direct DB/Supabase access;
- private transcript-repository runtime access;
- broad production release;
- treating manual test messages as prospective shadow evidence;
- skipping a fresh release acceptance set after material routing/knowledge/rendering changes;
- skipping prospective validation for the remediated candidate.

## Safety and privacy

All ADR-0012/0013/0014 privacy, canonical-ID, scope, read-only authority and restricted-topic controls remain in force.

The model remains planner-only. Raw historical transcripts, private provenance, credentials, user emails/Discord IDs, raw selectors, fulfillment secrets, provider error bodies and unsafe restricted material must not be sent to the hosted planner.

## Rollback

The immediate kill switch is:

```text
AI_SUPPORT_ENABLED=false
```

The service must then be restarted/redeployed so the environment change takes effect.

## Observed result

The first recorded live quality defect used:

```text
Im unable to download the nfa loader
```

and produced the generic fallback:

```text
A staff member needs to continue this support request.
```

This exposed a need for response-knowledge reconstruction and more specific loader-vs-NFA routing precedence. It does not justify broadening the test surface.

## Consequence

The active remediation branch is `task/ai-support-response-reconstruction`. Because that work materially changes routing/knowledge/rendering, the consumed B0-v6 result does not certify the resulting candidate. A fresh synthetic acceptance set and later prospective validation remain required before broad activation.
