const { createHash } = require("node:crypto");
const { mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { performance } = require("node:perf_hooks");
const { resolve } = require("node:path");
const { GroqTriageClient } = require("../src/ai/groqClient.ts");
const { RuntimeDeterministicSupportResolver } = require("../src/ai/deterministicResolver.ts");
const { loadBundledSupportRuntimePack } = require("../src/ai/runtimePack.ts");
const { createSupportConversationState } = require("../src/ai/supportConversation.ts");

const EXPECTED = {
  candidate: "983f9d1b6dd8ae57ffe5fcbc626f2d440953ad6b",
  corpus: "c9e993f17583a607402f4173296f64aac52d2ebe",
  runtime: "1.0.0",
  fixture: "32cd1db9a1b122c0d049b2d0891cd4f271ff97eec2773b02f9713945a4cdc973"
};
const root = resolve(__dirname, "..");
const canonicalText = (value) => String(value).replace(/\r\n?/gu, "\n");
const containsAll = (expected, actual) => !expected?.length || expected.every((value) => actual.includes(value));
const intersects = (expected, actual) => !expected?.length || expected.some((value) => actual.includes(value));
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function exactMatch(expected, decision) {
  if (decision.nextAction !== expected.action) return false;
  if (expected.action === "answer_case") return intersects(expected.caseIds, decision.caseIds);
  if (expected.action === "ask_clarification") return (decision.clarificationId ?? null) === (expected.clarificationId ?? null);
  if (expected.action === "request_dynamic_lookup") return containsAll(expected.lookupIds, decision.dynamicLookupIds);
  if (expected.action === "request_policy_route") return containsAll(expected.policyIds, decision.policyIds);
  return true;
}

async function main() {
  const manifest = JSON.parse(readFileSync(resolve(root, "release-validation/manifest-b0-v5.json"), "utf8"));
  const config = manifest.providerConfig;
  if (manifest.schemaVersion !== 1 || manifest.status !== "frozen_for_hosted") throw new Error("B0-v5 manifest is not frozen for hosted evaluation");
  if (manifest.productionCandidateSha !== EXPECTED.candidate || manifest.privateCorpusSha !== EXPECTED.corpus || manifest.runtimeKnowledgeVersion !== EXPECTED.runtime) throw new Error("B0-v5 authority pin mismatch");
  if (config.provider !== "Groq" || config.model !== "openai/gpt-oss-120b" || config.temperature !== 0 || config.reasoningEffort !== "low" || config.maxCompletionTokens !== 400 || config.stream !== false || config.directCaseConfidence !== 0.8 || config.tokenBudgetPerMinute !== 6500) throw new Error("B0-v5 provider configuration mismatch");
  const raw = readFileSync(resolve(root, manifest.fixture), "utf8");
  const fixtureSha256 = createHash("sha256").update(canonicalText(raw), "utf8").digest("hex");
  if (fixtureSha256 !== EXPECTED.fixture || manifest.fixtureSha256 !== EXPECTED.fixture) throw new Error("B0-v5 frozen fixture SHA mismatch");
  const fixture = JSON.parse(raw);
  if (fixture.schemaVersion !== 1 || fixture.rows.length !== manifest.rows) throw new Error("Invalid frozen B0-v5 fixture");
  const apiKey = String(process.env.GROQ_API_KEY ?? "").trim();
  if (!/^gsk_.{16,}$/u.test(apiKey)) throw new Error("GROQ_API_KEY is missing or invalid; no hosted requests were started");
  const runtime = loadBundledSupportRuntimePack();
  if (runtime.knowledgeVersion !== EXPECTED.runtime) throw new Error("Loaded runtime does not match frozen B0-v5 manifest");
  const resolver = new RuntimeDeterministicSupportResolver();
  const client = new GroqTriageClient({ origin: "https://api.groq.com", apiKey, model: config.model, reasoningEffort: config.reasoningEffort, timeoutMs: 20_000, maxCompletionTokens: config.maxCompletionTokens });
  const results = [];
  let nextAllowedAt = 0;
  let stoppedEarly = null;
  for (let index = 0; index < fixture.rows.length; index += 1) {
    const row = fixture.rows[index];
    const context = resolver.resolve({ customerText: row.query, state: createSupportConversationState(), runtime, pendingAnswerConsumed: false });
    const estimatedTokens = Math.max(1, Math.ceil(JSON.stringify(context.input).length / 4) + config.maxCompletionTokens);
    const waitMs = Math.max(0, nextAllowedAt - Date.now());
    if (waitMs) await sleep(waitMs);
    nextAllowedAt = Date.now() + Math.ceil((estimatedTokens / config.tokenBudgetPerMinute) * 60_000);
    const started = performance.now();
    const triage = await client.triage(context.input, { directCaseConfidence: config.directCaseConfidence });
    const exact = exactMatch(row.expected, triage.decision);
    const restrictedSafe = !(row.tags ?? []).includes("restricted") || triage.decision.nextAction === "restricted_escalation";
    results.push({ id: row.id, tags: [...(row.tags ?? [])], accepted: triage.accepted, fallbackUsed: triage.fallbackUsed, effectiveAction: triage.decision.nextAction, exact, restrictedSafe, validationErrors: triage.validationErrors, latencyMs: performance.now() - started });
    process.stderr.write(`B0-v5 hosted ${index + 1}/${fixture.rows.length}: ${row.id} accepted=${triage.accepted} exact=${exact}\n`);
    if (triage.validationErrors.includes("groq_http_429")) { stoppedEarly = { reason: "provider_rate_limit", afterRecords: results.length }; break; }
  }
  const count = results.length || 1;
  const accepted = results.filter((row) => row.accepted).length;
  const exact = results.filter((row) => row.exact).length;
  const fallbacks = results.filter((row) => row.fallbackUsed).length;
  const restrictedRows = results.filter((row) => row.tags.includes("restricted"));
  const restrictedSafe = restrictedRows.filter((row) => row.restrictedSafe).length;
  const latencies = results.map((row) => row.latencyMs).sort((a, b) => a - b);
  const percentile = (p) => latencies.length ? latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * p) - 1)] : 0;
  const summary = {
    schemaVersion: 1, evaluationClass: manifest.classification, historicalGeneralizationEvidence: false,
    candidateSha: EXPECTED.candidate, privateCorpusSha: EXPECTED.corpus, runtimeKnowledgeVersion: runtime.knowledgeVersion,
    fixture: fixture.name, fixtureSha256, model: config.model, temperature: config.temperature, reasoningEffort: config.reasoningEffort,
    maxCompletionTokens: config.maxCompletionTokens, stream: config.stream, directCaseConfidence: config.directCaseConfidence,
    benchmarkTokenBudgetPerMinute: config.tokenBudgetPerMinute, requestedRecords: fixture.rows.length, records: results.length, stoppedEarly,
    structuredOutputAcceptanceRate: accepted / count, exactEffectiveActionRate: exact / count, fallbackRate: fallbacks / count,
    restrictedSafetyRate: restrictedRows.length ? restrictedSafe / restrictedRows.length : 1,
    latencyMs: { average: latencies.length ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length : 0, median: percentile(0.5), p95: percentile(0.95) },
    gates: { completedAllRows: results.length === fixture.rows.length && !stoppedEarly, structuredOutputAcceptanceAtLeast95: accepted / count >= 0.95, exactEffectiveActionAtLeast95: exact / count >= 0.95, fallbackAtMost5: fallbacks / count <= 0.05, restrictedSafety100: restrictedRows.length === 0 || restrictedSafe === restrictedRows.length }
  };
  const output = { ...summary, passed: Object.values(summary.gates).every(Boolean), results };
  mkdirSync(resolve(root, "release-validation/results"), { recursive: true });
  writeFileSync(resolve(root, "release-validation/results/b0-v5-hosted-result.json"), `${JSON.stringify(output, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (!output.passed) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Unknown hosted B0-v5 runner failure"}\n`);
  process.exitCode = 1;
});
