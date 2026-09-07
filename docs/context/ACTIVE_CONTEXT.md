# Active Context

Updated: 2026-09-08

## Read first

1. `CURRENT_STATE_2026-08-31.md`
2. `DOCS_AUDIT_2026-08-31.md`
3. `HANDOFF.md`
4. `../README.md`
5. `../decisions/ADR-0015-single-channel-visible-ai-test.md`
6. `AI_SUPPORT_RELEASE_VALIDATION_2026-08-26.md` for consumed release history
7. `../AI_SUPPORT_SHADOW_VALIDATION.md` for prospective shadow operations

## Repository / deployment

```text
repository: Hermann-33/cm-discord-bot
default/deployed branch: master
validated master baseline: f8988037994146f5d51455878fb8fa9d8a987928
active remediation branch: task/ai-support-response-reconstruction
parallel ticket-gate branch: feature/tickety-account-link-gate
private corpus repo: Hermann-33/CM-Ticket-Transcripts
private corpus reference SHA: c9e993f17583a607402f4173296f64aac52d2ebe
```

Northflank is linked to the CM Discord Bot repository. The operator has authorized a controlled visible test using exactly one channel and no category allowlist:

```text
AI_SUPPORT_ENABLED=true
AI_SUPPORT_SHADOW_ENABLED=false
AI_SUPPORT_CHANNEL_IDS=1542084649017286727
AI_SUPPORT_CATEGORY_IDS=
```

This is not a broad release. Other channels/categories/DMs remain outside visible AI support.

## Parallel deterministic ticket-gate work

`feature/tickety-account-link-gate` implements ADR-0016 without changing the AI planner/runtime authority.

Key state:

- website/Supabase remains durable ticket-access authority;
- bot uses only the existing HMAC Internal Integrations API;
- initial Tickety category: `1382569775988871330`; uncategorized `support-<number>` handles overflow;
- exact eight-hour verified lease;
- no global lease poll and no per-message checks during an active lease;
- after expiry, only the creator/customer's next message or **Check Again** triggers verification;
- staff/admin/bot messages never renew customer verification;
- `/cm ticket-allow` reuses ADR-0006 authorization and is ticket-scoped;
- production rollout requires site route deployment + exact client allowlist + slash registration + end-to-end smoke.

This branch must not be conflated with or merged into the separate response-reconstruction workstream by accident.
## Current quality finding

Live test input:

```text
Im unable to download the nfa loader
```

Observed response:

```text
A staff member needs to continue this support request.
```

The corpus does contain relevant historical support material. The defect is in how response knowledge is distilled/routed/rendered:

- broad NFA routing can outrank the more specific loader-download stage;
- the public runtime carries strong classification metadata but insufficient approved customer-response guidance for some ordinary cases;
- some supported action types still fall through to generic escalation rendering.

## Active work

`task/ai-support-response-reconstruction` is the current engineering branch. Its goal is to reconstruct a safe response-guidance layer from all relevant structured transcript conversations while keeping production independent from the private corpus.

Expected outputs include full 55-case response-strategy coverage, specific loader/NFA precedence, explicit renderers for all triage action types, sanitized response guidance, privacy-safe diagnostics, a runtime knowledge-version bump, and regression coverage for the exact live failure.

## Release evidence

The previous candidate passed B0-v6 at 44/44 deterministic, 44/44 hosted structured acceptance, 44/44 exact action, 0 fallback, and 3/3 restricted safety. B0-v6 is consumed synthetic evidence and cannot certify the material response-reconstruction changes.

A fresh B0-v7-or-later fixture will be required after remediation. It must pass deterministic preflight before any hosted call.

## Shadow / broad rollout

Prospective shadow tooling is implemented, but no real cohort has started and no fresh prospective tickets have been collected. Broad customer-facing activation remains blocked pending fresh release evidence for the remediated candidate, prospective validation, and a separate rollout decision.

The proposed 200-turn / 14-day shadow target remains a governance recommendation, not an ADR-0014 hard requirement.

## Invariants

- no direct DB/Supabase access;
- HMAC Internal Integrations API only;
- AI support read-only operations only;
- model is a constrained planner, never business/action authority;
- no private transcript repository runtime dependency;
- raw transcripts/provenance/secrets/PII are not planner input;
- restricted bypass/evasion/injection/kernel/driver/spoofing/detection-avoidance content remains non-autonomous;
- existing narrow Rust NFA resource-lowering exception remains unchanged;
- kill switch remains `AI_SUPPORT_ENABLED=false`.
