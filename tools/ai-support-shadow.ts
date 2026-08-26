import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  appendShadowAdjudication,
  closeShadowCohort,
  emptyShadowReviewFlags,
  initializeShadowCohort,
  readShadowAdjudications,
  readShadowCohort,
  readShadowTurns,
  SHADOW_REVIEW_FLAGS,
  summarizeShadowMetrics,
  validateShadowAdjudication,
  type ShadowAdjudication,
  type ShadowQualityLabel
} from "../src/ai/shadowValidation";

function argumentsMap(values: readonly string[]): Map<string, string> {
  const result = new Map<string, string>();
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    const next = values[index + 1];
    if (!next || next.startsWith("--")) result.set(value.slice(2), "true");
    else {
      result.set(value.slice(2), next);
      index += 1;
    }
  }
  return result;
}

function required(options: Map<string, string>, name: string): string {
  const value = options.get(name)?.trim();
  if (!value) throw new Error(`Missing --${name}`);
  return value;
}

function cohortDirectory(options: Map<string, string>): string {
  return resolve(required(options, "cohort-dir"));
}

async function status(rootDir: string): Promise<Record<string, unknown>> {
  const [manifest, turns, adjudications] = await Promise.all([
    readShadowCohort(rootDir),
    readShadowTurns(rootDir),
    readShadowAdjudications(rootDir)
  ]);
  const latestReviewed = new Set(adjudications.map((item) => item.recordId));
  return {
    cohortId: manifest.cohortId,
    status: manifest.status,
    collectionStartAt: manifest.collectionStartAt,
    releaseCandidateSha: manifest.releaseCandidateSha,
    runtimeKnowledgeVersion: manifest.runtimeKnowledgeVersion,
    eligibleFreshTurns: turns.length,
    adjudicatedTurns: turns.filter((turn) => latestReviewed.has(turn.recordId)).length
  };
}

async function exportWorkItems(rootDir: string, outputPath: string): Promise<number> {
  const [turns, adjudications] = await Promise.all([readShadowTurns(rootDir), readShadowAdjudications(rootDir)]);
  const reviewed = new Map(adjudications.map((item) => [item.recordId, item]));
  const items = turns.filter((turn) => {
    const existing = reviewed.get(turn.recordId);
    return !existing || existing.quality === "needs_review" || existing.quality === "fallback_review";
  }).map((turn) => ({
    recordId: turn.recordId,
    conversationPseudonym: turn.conversationPseudonym,
    turnIndex: turn.turnIndex,
    sanitizedCustomerText: turn.sanitizedCustomerText,
    knownContextBeforeTurn: turn.knownContextBeforeTurn,
    proposedCustomerReply: turn.proposedCustomerReply,
    finalProposedAction: turn.finalProposedAction,
    finalCanonicalIds: turn.finalCanonicalIds,
    quality: "needs_review",
    correctAction: null,
    flags: emptyShadowReviewFlags(),
    notes: ""
  }));
  await writeFile(resolve(outputPath), items.map((item) => JSON.stringify(item)).join("\n") + (items.length ? "\n" : ""), "utf8");
  return items.length;
}

async function importAdjudications(rootDir: string, inputPath: string, reviewer: string): Promise<number> {
  const lines = (await readFile(resolve(inputPath), "utf8")).split(/\r?\n/u).filter(Boolean);
  for (const line of lines) {
    const raw = JSON.parse(line) as Record<string, unknown>;
    await appendShadowAdjudication(rootDir, validateShadowAdjudication({
      schemaVersion: 1,
      recordId: raw.recordId,
      adjudicatedAt: new Date().toISOString(),
      reviewerPseudonym: reviewer,
      quality: raw.quality,
      correctAction: raw.correctAction,
      flags: raw.flags,
      notes: raw.notes ?? ""
    }));
  }
  return lines.length;
}

function reportMarkdown(metrics: ReturnType<typeof summarizeShadowMetrics>): string {
  return `# Prospective Fresh-Ticket Shadow Governance Report

- Cohort: ${metrics.cohortId}
- Status: ${metrics.cohortStatus}
- Candidate: ${metrics.releaseCandidateSha}
- Collection start: ${metrics.collectionStartAt}
- Eligible/adjudicated: ${metrics.totalEligibleFreshTurns}/${metrics.adjudicatedTurns}
- Safe progress or better: ${metrics.safeProgressOrBetterRate ?? "not available"}
- Unsafe: ${metrics.unsafeRate ?? "not available"}
- Structured acceptance: ${metrics.structuredPlannerAcceptanceRate ?? "not available"}
- Fallback: ${metrics.fallbackRate ?? "not available"}
- Correct action: ${metrics.correctActionRate ?? "not available"}
- Restricted safety: ${metrics.restrictedSafetyRate ?? "not available"}
- Scope leakage: ${metrics.scopeLeakageCount}
- Repeated-known questions: ${metrics.repeatedKnownQuestionCount}
- Context-answerable unnecessary questions: ${metrics.contextAnswerableUnnecessaryQuestionCount}
- Privacy violations: ${metrics.privacyViolationCount}
- Mutation attempts: ${metrics.mutationAttemptCount}
- Latency average/median/p95 ms: ${metrics.latencyAverageMs ?? "not available"} / ${metrics.latencyMedianMs ?? "not available"} / ${metrics.latencyP95Ms ?? "not available"}
- ADR-0014 gates satisfied: ${Object.values(metrics.gates).every(Boolean)}
- Measured gates satisfied: ${metrics.measuredGatesSatisfied}
- Release decision ready: false (ADR-0014 has no approved minimum sample rule)
- Minimum sample: not defined by ADR-0014; approval of a release-governance sample rule remains required.

Customer-facing AI remains disabled unless a separate release decision explicitly authorizes activation.
`;
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const options = argumentsMap(process.argv.slice(3));
  if (command === "init") {
    const manifest = await initializeShadowCohort({
      rootDir: cohortDirectory(options),
      cohortId: required(options, "cohort-id"),
      collectionStartAt: options.has("start") ? new Date(required(options, "start")) : undefined
    });
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }
  const rootDir = cohortDirectory(options);
  if (command === "status") console.log(JSON.stringify(await status(rootDir), null, 2));
  else if (command === "export") console.log(JSON.stringify({ exported: await exportWorkItems(rootDir, required(options, "out")) }));
  else if (command === "import") console.log(JSON.stringify({ imported: await importAdjudications(rootDir, required(options, "in"), required(options, "reviewer")) }));
  else if (command === "adjudicate") {
    const flags = emptyShadowReviewFlags();
    for (const flag of (options.get("flags") ?? "").split(",").filter(Boolean)) {
      if (!(SHADOW_REVIEW_FLAGS as readonly string[]).includes(flag)) throw new Error(`Unknown review flag: ${flag}`);
      flags[flag as keyof typeof flags] = true;
    }
    const quality = required(options, "quality") as ShadowQualityLabel;
    const correct = required(options, "correct-action");
    if (!new Set(["true", "false", "unknown"]).has(correct)) throw new Error("Invalid --correct-action");
    const value: ShadowAdjudication = {
      schemaVersion: 1,
      recordId: required(options, "record-id"),
      adjudicatedAt: new Date().toISOString(),
      reviewerPseudonym: required(options, "reviewer"),
      quality,
      correctAction: correct === "unknown" ? null : correct === "true",
      flags,
      notes: options.get("notes") ?? ""
    };
    await appendShadowAdjudication(rootDir, value);
    console.log(JSON.stringify({ adjudicated: value.recordId }));
  } else if (command === "summarize" || command === "report") {
    const manifest = await readShadowCohort(rootDir);
    const metrics = summarizeShadowMetrics(manifest, await readShadowTurns(rootDir), await readShadowAdjudications(rootDir));
    if (command === "summarize") console.log(JSON.stringify(metrics, null, 2));
    else {
      const output = required(options, "out");
      await writeFile(resolve(output), reportMarkdown(metrics), "utf8");
      console.log(JSON.stringify({ report: resolve(output) }));
    }
  } else if (command === "close") console.log(JSON.stringify(await closeShadowCohort(rootDir), null, 2));
  else throw new Error("Usage: init|status|export|adjudicate|import|summarize|close|report --cohort-dir <path>");
}

main().catch((error: unknown) => {
  const name = error instanceof Error ? error.name : "UnknownError";
  console.error(JSON.stringify({ errorName: name }));
  process.exitCode = 1;
});
