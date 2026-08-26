import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RuntimeDeterministicSupportResolver } from "../src/ai/deterministicResolver";
import { reviewFirstTurnObservability, type RuntimeAliasRecord } from "../src/ai/firstTurnRouter";
import { loadBundledSupportRuntimePack } from "../src/ai/runtimePack";
import { createSupportConversationState } from "../src/ai/supportConversation";

type Expected = { action: string; caseIds?: string[]; clarificationId?: string; lookupIds?: string[]; policyIds?: string[] };
type Row = { id: string; query: string; expected: Expected; tags?: string[] };
type Fixture = { schemaVersion: number; name: string; rows: Row[] };
type Manifest = { schemaVersion: number; status: string; productionCandidateSha: string; privateCorpusSha: string; runtimeKnowledgeVersion: string; fixture: string; fixtureSha256?: string | null; rows: number };

const root = resolve(__dirname, "..");
const manifest = JSON.parse(readFileSync(resolve(root, "release-validation/manifest-b0-v3.json"), "utf8")) as Manifest;
const fixtureRaw = readFileSync(resolve(root, manifest.fixture), "utf8");
const fixtureSha256 = createHash("sha256").update(fixtureRaw, "utf8").digest("hex");
if (manifest.fixtureSha256 && manifest.fixtureSha256 !== fixtureSha256) throw new Error("B0 v3 fixture SHA mismatch");
const fixture = JSON.parse(fixtureRaw) as Fixture;
if (fixture.schemaVersion !== 1 || manifest.schemaVersion !== 1 || fixture.rows.length !== manifest.rows) throw new Error("Invalid B0 v3 fixture/manifest");
const runtime = loadBundledSupportRuntimePack();
if (runtime.knowledgeVersion !== manifest.runtimeKnowledgeVersion) throw new Error("Runtime knowledge version mismatch");
const resolver = new RuntimeDeterministicSupportResolver();
const primaryToAction = new Map<string, string>([
  ["direct_static_case", "answer_case"], ["generic_clarification", "ask_clarification"], ["family_scoped_clarification", "ask_clarification"],
  ["entity_scoped_clarification", "ask_clarification"], ["direct_dynamic_lookup", "request_dynamic_lookup"], ["direct_policy_route", "request_policy_route"],
  ["direct_attachment_route", "request_attachment"], ["direct_restricted_escalation", "restricted_escalation"], ["direct_support_operation", "support_operation"],
  ["human_escalation", "human_escalation"], ["multi_intent_route", "multi_intent_route"]
]);
const containsAll = (expected: readonly string[] | undefined, actual: readonly string[]) => !expected?.length || expected.every((value) => actual.includes(value));
const intersects = (expected: readonly string[] | undefined, actual: readonly string[]) => !expected?.length || expected.some((value) => actual.includes(value));
const results = fixture.rows.map((row) => {
  const baseline = reviewFirstTurnObservability(row.query, runtime.aliases as readonly RuntimeAliasRecord[]);
  const baselineAction = primaryToAction.get(baseline.primaryDecision) ?? baseline.primaryDecision;
  const context = resolver.resolve({ customerText: row.query, state: createSupportConversationState(), runtime, pendingAnswerConsumed: false });
  const reasons: string[] = [];
  if (baselineAction !== row.expected.action) reasons.push(`baseline_action:${baselineAction}`);
  if (row.expected.action === "answer_case") {
    if (!intersects(row.expected.caseIds, baseline.observableCaseIds)) reasons.push(`baseline_case:${baseline.observableCaseIds.join(",") || "none"}`);
    if (!intersects(row.expected.caseIds, context.input.allowed.caseIds)) reasons.push(`allowed_case:${context.input.allowed.caseIds.join(",") || "none"}`);
  }
  if (row.expected.action === "ask_clarification") {
    if ((baseline.clarificationId ?? null) !== (row.expected.clarificationId ?? null)) reasons.push(`baseline_clarification:${baseline.clarificationId ?? "none"}`);
    if (row.expected.clarificationId && !context.input.allowed.clarificationIds.includes(row.expected.clarificationId)) reasons.push(`allowed_clarification:${context.input.allowed.clarificationIds.join(",") || "none"}`);
  }
  if (row.expected.action === "request_dynamic_lookup") {
    const baselineLookups = [...(baseline.lookupIds ?? []), ...(baseline.dynamicLookupIds ?? [])];
    if (!containsAll(row.expected.lookupIds, baselineLookups)) reasons.push(`baseline_lookups:${baselineLookups.join(",") || "none"}`);
    if (!containsAll(row.expected.lookupIds, context.input.allowed.dynamicLookupIds)) reasons.push(`allowed_lookups:${context.input.allowed.dynamicLookupIds.join(",") || "none"}`);
  }
  if (row.expected.action === "request_policy_route" && !containsAll(row.expected.policyIds, context.input.allowed.policyIds)) reasons.push(`allowed_policies:${context.input.allowed.policyIds.join(",") || "none"}`);
  if (row.expected.action === "restricted_escalation" && context.input.restricted !== true) reasons.push("restricted_flag:false");
  return { id: row.id, pass: reasons.length === 0, expectedAction: row.expected.action, baselinePrimaryDecision: baseline.primaryDecision, reasons };
});
const failures = results.filter((row) => !row.pass);
const summary = { schemaVersion: 1, fixture: fixture.name, fixtureSha256, productionCandidateSha: manifest.productionCandidateSha, privateCorpusSha: manifest.privateCorpusSha, runtimeKnowledgeVersion: runtime.knowledgeVersion, rows: results.length, passed: results.length - failures.length, failed: failures.length, passRate: results.length ? (results.length - failures.length) / results.length : 0, failures };
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
if (failures.length) process.exitCode = 1;
