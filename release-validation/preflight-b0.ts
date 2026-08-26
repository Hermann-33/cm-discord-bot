import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RuntimeDeterministicSupportResolver } from "../src/ai/deterministicResolver";
import { reviewFirstTurnObservability, type RuntimeAliasRecord } from "../src/ai/firstTurnRouter";
import { loadBundledSupportRuntimePack } from "../src/ai/runtimePack";
import { createSupportConversationState } from "../src/ai/supportConversation";

type Expected = {
  action: string;
  caseIds?: string[];
  clarificationId?: string;
  lookupIds?: string[];
  policyIds?: string[];
};

type Row = { id: string; query: string; expected: Expected; tags?: string[] };
type Fixture = { schemaVersion: number; name: string; purpose: string; rows: Row[] };
type Manifest = {
  schemaVersion: number;
  status: string;
  productionCandidateSha: string;
  privateCorpusSha: string;
  runtimeKnowledgeVersion: string;
  fixture: string;
  fixtureGitBlobSha?: string | null;
  fixtureSha256?: string | null;
  rows: number;
  classification: string;
};

const root = resolve(__dirname, "..");
const manifestPath = resolve(root, "release-validation/manifest-b0-v1.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
const fixturePath = resolve(root, manifest.fixture);
const fixtureRaw = readFileSync(fixturePath, "utf8");
const actualFixtureSha = createHash("sha256").update(fixtureRaw, "utf8").digest("hex");

if (manifest.fixtureSha256 && actualFixtureSha !== manifest.fixtureSha256) {
  throw new Error(`Fixture SHA mismatch: expected ${manifest.fixtureSha256}, got ${actualFixtureSha}`);
}

const fixture = JSON.parse(fixtureRaw) as Fixture;
if (fixture.schemaVersion !== 1 || manifest.schemaVersion !== 1) throw new Error("Unsupported release acceptance schema");
if (fixture.rows.length !== manifest.rows) throw new Error(`Fixture row count mismatch: ${fixture.rows.length} != ${manifest.rows}`);

const runtime = loadBundledSupportRuntimePack();
if (runtime.knowledgeVersion !== manifest.runtimeKnowledgeVersion) {
  throw new Error(`Runtime knowledge version mismatch: ${runtime.knowledgeVersion} != ${manifest.runtimeKnowledgeVersion}`);
}

const resolver = new RuntimeDeterministicSupportResolver();
const primaryToAction = new Map<string, string>([
  ["direct_static_case", "answer_case"],
  ["generic_clarification", "ask_clarification"],
  ["family_scoped_clarification", "ask_clarification"],
  ["direct_dynamic_lookup", "request_dynamic_lookup"],
  ["direct_policy_route", "request_policy_route"],
  ["direct_attachment_route", "request_attachment"],
  ["direct_restricted_escalation", "restricted_escalation"],
  ["direct_support_operation", "support_operation"],
  ["human_escalation", "human_escalation"],
  ["multi_intent_route", "multi_intent_route"]
]);

function intersects(expected: readonly string[] | undefined, actual: readonly string[]): boolean {
  if (!expected?.length) return true;
  return expected.some((value) => actual.includes(value));
}

function containsAll(expected: readonly string[] | undefined, actual: readonly string[]): boolean {
  if (!expected?.length) return true;
  return expected.every((value) => actual.includes(value));
}

const results = fixture.rows.map((row) => {
  const baseline = reviewFirstTurnObservability(row.query, runtime.aliases as readonly RuntimeAliasRecord[]);
  const baselineAction = primaryToAction.get(baseline.primaryDecision) ?? baseline.primaryDecision;
  const context = resolver.resolve({
    customerText: row.query,
    state: createSupportConversationState(),
    runtime,
    pendingAnswerConsumed: false
  });

  const reasons: string[] = [];
  if (baselineAction !== row.expected.action) reasons.push(`baseline_action:${baselineAction}`);

  if (row.expected.action === "answer_case") {
    if (!intersects(row.expected.caseIds, baseline.observableCaseIds)) {
      reasons.push(`baseline_case:${baseline.observableCaseIds.join(",") || "none"}`);
    }
    if (!intersects(row.expected.caseIds, context.input.allowed.caseIds)) {
      reasons.push(`allowed_case:${context.input.allowed.caseIds.join(",") || "none"}`);
    }
  }

  if (row.expected.action === "ask_clarification") {
    if ((baseline.clarificationId ?? null) !== (row.expected.clarificationId ?? null)) {
      reasons.push(`baseline_clarification:${baseline.clarificationId ?? "none"}`);
    }
    if (row.expected.clarificationId && !context.input.allowed.clarificationIds.includes(row.expected.clarificationId)) {
      reasons.push(`allowed_clarification:${context.input.allowed.clarificationIds.join(",") || "none"}`);
    }
  }

  if (row.expected.action === "request_dynamic_lookup") {
    const baselineLookups = [...(baseline.lookupIds ?? []), ...(baseline.dynamicLookupIds ?? [])];
    if (!containsAll(row.expected.lookupIds, baselineLookups)) {
      reasons.push(`baseline_lookups:${baselineLookups.join(",") || "none"}`);
    }
    if (!containsAll(row.expected.lookupIds, context.input.allowed.dynamicLookupIds)) {
      reasons.push(`allowed_lookups:${context.input.allowed.dynamicLookupIds.join(",") || "none"}`);
    }
  }

  if (row.expected.action === "request_policy_route") {
    if (!containsAll(row.expected.policyIds, context.input.allowed.policyIds)) {
      reasons.push(`allowed_policies:${context.input.allowed.policyIds.join(",") || "none"}`);
    }
  }

  if (row.expected.action === "restricted_escalation" && context.input.restricted !== true) reasons.push("restricted_flag:false");

  return {
    id: row.id,
    pass: reasons.length === 0,
    expectedAction: row.expected.action,
    baselinePrimaryDecision: baseline.primaryDecision,
    baselineAction,
    reasons
  };
});

const failed = results.filter((row) => !row.pass);
const summary = {
  schemaVersion: 1,
  fixture: fixture.name,
  fixtureSha256: actualFixtureSha,
  productionCandidateSha: manifest.productionCandidateSha,
  privateCorpusSha: manifest.privateCorpusSha,
  runtimeKnowledgeVersion: runtime.knowledgeVersion,
  rows: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  passRate: results.length ? (results.length - failed.length) / results.length : 0,
  failures: failed
};

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
if (failed.length > 0) process.exitCode = 1;
