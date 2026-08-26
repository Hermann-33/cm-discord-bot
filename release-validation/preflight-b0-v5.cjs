const { createHash } = require("node:crypto");
const { mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { RuntimeDeterministicSupportResolver } = require("../src/ai/deterministicResolver.ts");
const { loadBundledSupportRuntimePack } = require("../src/ai/runtimePack.ts");
const { createSupportConversationState } = require("../src/ai/supportConversation.ts");
const { buildSupportTriageJsonSchema, chooseSupportTriageFallback, validateSupportTriageDecision } = require("../src/ai/supportTriage.ts");

const root = resolve(__dirname, "..");
const canonicalText = (value) => String(value).replace(/\r\n?/gu, "\n");
const containsAll = (expected, actual) => !expected?.length || expected.every((value) => actual.includes(value));
const intersects = (expected, actual) => !expected?.length || expected.some((value) => actual.includes(value));

function actionMatches(expected, decision) {
  if (decision.nextAction !== expected.action) return false;
  if (expected.action === "answer_case") return intersects(expected.caseIds, decision.caseIds);
  if (expected.action === "ask_clarification") return (decision.clarificationId ?? null) === (expected.clarificationId ?? null);
  if (expected.action === "request_dynamic_lookup") return containsAll(expected.lookupIds, decision.dynamicLookupIds);
  if (expected.action === "request_policy_route") return containsAll(expected.policyIds, decision.policyIds);
  return true;
}

async function main() {
  const manifest = JSON.parse(readFileSync(resolve(root, "release-validation/manifest-b0-v5.json"), "utf8"));
  const raw = readFileSync(resolve(root, manifest.fixture), "utf8");
  const fixtureSha256 = createHash("sha256").update(canonicalText(raw), "utf8").digest("hex");
  if (manifest.status !== "frozen_for_deterministic_preflight" || fixtureSha256 !== manifest.fixtureSha256) throw new Error("B0-v5 frozen fixture mismatch");
  const fixture = JSON.parse(raw);
  if (fixture.schemaVersion !== 1 || fixture.rows.length !== manifest.rows) throw new Error("Invalid B0-v5 fixture/manifest");
  const runtime = loadBundledSupportRuntimePack();
  if (runtime.knowledgeVersion !== manifest.runtimeKnowledgeVersion) throw new Error("Runtime knowledge version mismatch");
  const resolver = new RuntimeDeterministicSupportResolver();
  const results = fixture.rows.map((row) => {
    const context = resolver.resolve({ customerText: row.query, state: createSupportConversationState(), runtime, pendingAnswerConsumed: false });
    const fallback = chooseSupportTriageFallback(context.input);
    const validation = validateSupportTriageDecision(fallback, context.input, manifest.providerConfig.directCaseConfidence);
    const actionEnum = buildSupportTriageJsonSchema(context.input)?.properties?.nextAction?.enum;
    const reasons = [];
    if (context.input.allowed.deterministicNextAction !== row.expected.action) reasons.push(`deterministic_action:${context.input.allowed.deterministicNextAction ?? "none"}`);
    if (!actionMatches(row.expected, fallback)) reasons.push(`fallback:${fallback.nextAction}:${fallback.clarificationId ?? "none"}`);
    if (!validation.valid) reasons.push(`fallback_validation:${validation.errors.join(",")}`);
    if (!Array.isArray(actionEnum) || actionEnum.length !== 1 || actionEnum[0] !== row.expected.action) reasons.push(`schema_action:${JSON.stringify(actionEnum)}`);
    if (row.expected.action === "answer_case" && !intersects(row.expected.caseIds, context.input.allowed.caseIds)) reasons.push(`allowed_case:${context.input.allowed.caseIds.join(",") || "none"}`);
    if (row.expected.action === "ask_clarification" && !context.input.allowed.clarificationIds.includes(row.expected.clarificationId)) reasons.push(`allowed_clarification:${context.input.allowed.clarificationIds.join(",") || "none"}`);
    if (row.expected.action === "request_dynamic_lookup" && !containsAll(row.expected.lookupIds, context.input.allowed.dynamicLookupIds)) reasons.push(`allowed_lookups:${context.input.allowed.dynamicLookupIds.join(",") || "none"}`);
    if (row.expected.action === "request_policy_route" && !containsAll(row.expected.policyIds, context.input.allowed.deterministicPolicyIds ?? [])) reasons.push(`deterministic_policies:${(context.input.allowed.deterministicPolicyIds ?? []).join(",") || "none"}`);
    if ((row.tags ?? []).includes("restricted") && (!context.input.restricted || fallback.nextAction !== "restricted_escalation")) reasons.push("restricted_fail_closed:false");
    return { id: row.id, pass: reasons.length === 0, expectedAction: row.expected.action, deterministicAction: context.input.allowed.deterministicNextAction ?? null, reasons };
  });
  const failures = results.filter((row) => !row.pass);
  const summary = { schemaVersion: 1, evaluationClass: manifest.classification, fixture: fixture.name, fixtureSha256, productionCandidateSha: manifest.productionCandidateSha, privateCorpusSha: manifest.privateCorpusSha, runtimeKnowledgeVersion: runtime.knowledgeVersion, rows: results.length, passed: results.length - failures.length, failed: failures.length, passRate: results.length ? (results.length - failures.length) / results.length : 0, failures };
  mkdirSync(resolve(root, "release-validation/results"), { recursive: true });
  writeFileSync(resolve(root, "release-validation/results/b0-v5-preflight-result.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Unknown B0-v5 preflight failure"}\n`);
  process.exitCode = 1;
});
