# Latest Handoff

Updated: 2026-08-26
Status: `SHADOW TOOLING IMPLEMENTED / REAL PROSPECTIVE COLLECTION NOT STARTED / PRODUCTION DISABLED`

## Read first

1. `AI_SUPPORT_RELEASE_VALIDATION_2026-08-26.md` — definitive B0-v3 failure, remediation, B0-v4/B0-v5 preflight, B0-v6 pass, and activation status.
2. `../AI_SUPPORT_SHADOW_VALIDATION.md` — no-reply cohort operations, privacy, adjudication, and metrics.
3. `AI_SUPPORT_TRIAGE_VALIDATION_2026-08-25.md` — consumed development history.
4. `ACTIVE_CONTEXT.md` — concise current state and remaining gate.
5. `AI_SUPPORT_HANDOVER_PROMPT.md` and its ordered references.

The validation checkpoint supersedes earlier validation-pending and stale 25-exclusion/230-record text.

## Boundaries

- Public repository: `Hermann-33/cm-discord-bot`, branch `task/ai-support-integration`.
- Private repository: `Hermann-33/CM-Ticket-Transcripts`, branch `main`, data/specification-only under ADR-0010.
- Original V3 is immutable; exclusions live only in its adjudication overlay.
- No bot startup, command registration, deployment, production merge, website mutation, direct database access, or customer-facing AI activation occurred.
- No unapproved website operation was added. `catalog.current.read` remains unresolved and unavailable.
- B0-v3 is consumed and failed; B0-v4/B0-v5 are consumed failed preflights; B0-v6 is consumed passing synthetic release evidence.
- Prospective tooling exists on `task/ai-support-shadow-validation`; no real bot run or fresh-ticket collection occurred.

## What changed

Deterministic routing now transports every known next action, including policy, attachment, restricted, human-security, support-operation, and multi-intent routes. Groq receives singleton action schemas for those routes. Every canonical response ID is constrained by the input-aware schema and independently checked by the validator. Fallback reproduces deterministic actions and IDs, and restricted turns fail closed to canonical escalation.

The private data repository has no source/specification change from this task. Preserve its pre-existing Obsidian graph edit and unrelated generated audit artifacts.

The shadow implementation introduces `AI_SUPPORT_SHADOW_ENABLED=false`, an explicit cohort directory, and a dedicated local pseudonym secret. With visible AI disabled and shadow enabled, exact eligible messages traverse the frozen planner/action path and approved read-only lookup adapter but never receive an AI reply. Prospective cutoff, candidate/runtime/model pins, sanitized evidence, independent labels, deterministic ADR metrics, and cohort close/report operations are implemented. Visible mode wins if both flags are true, preventing duplicate processing.

Implementation commit: `fe644f33be2341d71bc9c0860d339046fcdf0c37` (`TASK-AI-SUPPORT-034: add prospective shadow validation`). Its local gate was 388/388 tests plus typecheck/build/diff/audit pass with zero vulnerabilities.

## Current release evidence

```text
candidate:                  2e8b763f699b4c1aaa138320f4e0420c736e82dc
local validation:           375 / 375, typecheck/build/diff pass, audit 0
shadow implementation:      388 / 388, typecheck/build/diff pass, audit 0
B0-v6 fixture SHA-256:      64c299a6d07b1f06bd49f14aca0ecd90a52d97298d4094ab19dff832eb855b02
B0-v6 deterministic:       44 / 44
B0-v6 hosted accepted:     44 / 44
B0-v6 hosted exact:        44 / 44
B0-v6 fallback:             0 / 44
B0-v6 restricted safe:      3 / 3
```

## Next gate

Do not treat synthetic B0-v6 as historical generalization evidence. When an explicit activation-readiness task authorizes it:

1. approve a minimum prospective sample/review duration; ADR-0014 does not define one (the documented 200-turn/14-day rule is a proposal only);
2. confirm candidate `2e8b763`, runtime, model configuration, and pseudonym secret remain frozen;
3. initialize an open cohort and separately authorize an operator to start the bot in shadow mode;
4. collect and independently score newly arriving tickets without customer-visible AI activation;
5. inspect every non-optimal, fallback, invalid, unsafe, leakage, or semantic-review row;
6. verify privacy, restricted-topic precision, lookup authorization, multi-turn state, and operational rollout controls;
7. keep production disabled unless all ADR-0012/ADR-0013/ADR-0014 criteria and a separate release decision pass.

No cohort ID/start time/count exists yet because no real collection was started in this implementation task.
