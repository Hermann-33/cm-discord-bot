import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { GroqTriageClient } from "../src/ai/groqClient";
import { RuntimeDeterministicSupportResolver } from "../src/ai/deterministicResolver";
import { loadBundledSupportRuntimePack } from "../src/ai/runtimePack";
import { createSupportConversationState } from "../src/ai/supportConversation";
import type { GroqConfig } from "../src/config/env";
import type { SupportTriageDecision } from "../src/ai/supportTriage";

type Expected = { action: string; caseIds?: string[]; clarificationId?: string; lookupIds?: string[]; policyIds?: string[] };
type Row = { id: string; query: string; expected: Expected; tags?: string[] };
type Fixture = { schemaVersion: number; name: string; purpose: string; createdAt: string; rows: Row[] };
type Manifest = {
  schemaVersion: number;
  status: string;
  productionCandidateSha: string;
  privateCorpusSha: string;
  runtimeManifestGitBlobSha: string;
  runtimeKnowledgeVersion: string;
  fixture: string;
  fixtureGitBlobSha: string;
  fixtureSha256: string | null;
  rows: number;
  classification: string;
};

type RowResult = {
  id: string;
  tags: string[];
  accepted: boolean;
  fallbackUsed: boolean;
  effectiveAction: string;
  exact: boolean;
  restrictedSafe: boolean;
  validationErrors: readonly string[];
  latencyMs: number;
};

const MODEL = "openai/gpt-oss-120b";
const REASONING_EFFORT = "low" as const;
const MAX_COMPLETION_TOKENS = 400;
const DIRECT_CASE_CONFIDENCE = 0.8;
const TOKEN_BUDGET_PER_MINUTE = 6500;
const EXPECTED_CANDIDATE = "4d8790fc90b351d261f8699c7b3cd989c3787fe9";
const EXPECTED_RUNTIME_VERSION = "1.0.0";
const EXPECTED_FIXTURE_SHA256 = "b13f35b03203ceef5eae57f81e62b9c8b1f5bd127232eb9605c2f29b1664f099";

const root = resolve(__dirname, "..");
const manifest = JSON.parse(readFileSync(resolve(root, "release-validation/manifest-b0-v3.json"), "utf8")) as Manifest;
if (manifest.schemaVersion !== 1 || manifest.status !== "frozen_for_hosted") throw new Error("B0 v3 manifest is not frozen for hosted evaluation");
if (manifest.productionCandidateSha !== EXPECTED_CANDIDATE) throw new Error("Unexpected production candidate SHA");
if (manifest.runtimeKnowledgeVersion !== EXPECTED_RUNTIME_VERSION) throw new Error("Unexpected runtime knowledge version");
if (manifest.fixtureSha256 !== EXPECTED_FIXTURE_SHA256) throw new Error("Unexpected frozen fixture SHA in manifest");

const fixtureRaw = readFileSync(resolve(root, manifest.fixture), "utf8");
const actualFixtureSha = createHash("sha256").update(fixtureRaw, "utf8").digest("hex");
if (actualFixtureSha !== EXPECTED_FIXTURE_SHA256) throw new Error("Frozen fixture SHA mismatch");
const fixture = JSON.parse(fixtureRaw) as Fixture;
if (fixture.schemaVersion !== 1 || fixture.rows.length !== manifest.rows) throw new Error("Invalid frozen B0 v3 fixture");

const apiKey = String(process.env.GROQ_API_KEY ?? "").trim();
if (!/^gsk_.{16,}$/u.test(apiKey)) throw new Error("GROQ_API_KEY is missing or invalid; no hosted requests were started");

const runtime = loadBundledSupportRuntimePack();
if (runtime.knowledgeVersion !== EXPECTED_RUNTIME_VERSION) throw new Error("Loaded runtime version does not match frozen manifest");
const resolver = new RuntimeDeterministicSupportResolver();
const groqConfig: GroqConfig = {
  origin: "https://api.groq.com",
  apiKey,
  model: MODEL,
  reasoningEffort: REASONING_EFFORT,
  timeoutMs: 20_000,
  maxCompletionTokens: MAX_COMPLETION_TOKENS
};
const client = new GroqTriageClient(groqConfig);

const containsAll = (expected: readonly string[] | undefined, actual: readonly string[]) => !expected?.length || expected.every((value) => actual.includes(value));
const intersects = (expected: readonly string[] | undefined, actual: readonly string[]) => !expected?.length || expected.some((value) => actual.includes(value));

function exactMatch(expected: Expected, decision: SupportTriageDecision): boolean {
  if (decision.nextAction !== expected.action) return false;
  if (expected.action === "answer_case") return intersects(expected.caseIds, decision.caseIds);
  if (expected.action === "ask_clarification") return (decision.clarificationId ?? null) === (expected.clarificationId ?? null);
  if (expected.action === "request_dynamic_lookup") return containsAll(expected.lookupIds, decision.dynamicLookupIds);
  if (expected.action === "request_policy_route") return containsAll(expected.policyIds, decision.policyIds);
  return true;
}

function restrictedSafe(row: Row, decision: SupportTriageDecision): boolean {
  if (!(row.tags ?? []).includes("restricted")) return true;
  return decision.nextAction === "restricted_escalation" && decision.caseIds.every((id) => id !== "case.restricted.technical" || true);
}

function estimatedTokens(value: unknown): number {
  return Math.max(1, Math.ceil(JSON.stringify(value).length / 4) + MAX_COMPLETION_TOKENS);
}

const sleep = (ms: number) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

async function main(): Promise<void> {
  let nextAllowedAt = 0;
  const results: RowResult[] = [];
  let stoppedEarly: { reason: string; afterRecords: number } | null = null;

  for (let index = 0; index < fixture.rows.length; index += 1) {
    const row = fixture.rows[index];
    const context = resolver.resolve({
      customerText: row.query,
      state: createSupportConversationState(),
      runtime,
      pendingAnswerConsumed: false
    });

    const waitMs = Math.max(0, nextAllowedAt - Date.now());
    if (waitMs > 0) await sleep(waitMs);
    nextAllowedAt = Date.now() + Math.ceil((estimatedTokens(context.input) / TOKEN_BUDGET_PER_MINUTE) * 60_000);

    const started = performance.now();
    const result = await client.triage(context.input, { directCaseConfidence: DIRECT_CASE_CONFIDENCE });
    const latencyMs = performance.now() - started;
    const exact = exactMatch(row.expected, result.decision);
    const safe = restrictedSafe(row, result.decision);
    results.push({
      id: row.id,
      tags: [...(row.tags ?? [])],
      accepted: result.accepted,
      fallbackUsed: result.fallbackUsed,
      effectiveAction: result.decision.nextAction,
      exact,
      restrictedSafe: safe,
      validationErrors: result.validationErrors,
      latencyMs
    });

    process.stderr.write(`B0-v3 hosted ${index + 1}/${fixture.rows.length}: ${row.id} accepted=${result.accepted} exact=${exact}\n`);
    if (result.validationErrors.some((value) => /^groq_http_429$/u.test(value))) {
      stoppedEarly = { reason: "provider_rate_limit", afterRecords: results.length };
      break;
    }
  }

  const count = results.length || 1;
  const accepted = results.filter((row) => row.accepted).length;
  const exact = results.filter((row) => row.exact).length;
  const fallbacks = results.filter((row) => row.fallbackUsed).length;
  const restrictedRows = results.filter((row) => row.tags.includes("restricted"));
  const restrictedSafeCount = restrictedRows.filter((row) => row.restrictedSafe).length;
  const latencies = results.map((row) => row.latencyMs).sort((a, b) => a - b);
  const percentile = (p: number) => latencies.length ? latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * p) - 1)] : 0;
  const summary = {
    schemaVersion: 1,
    evaluationClass: manifest.classification,
    historicalGeneralizationEvidence: false,
    candidateSha: EXPECTED_CANDIDATE,
    privateCorpusSha: manifest.privateCorpusSha,
    runtimeKnowledgeVersion: runtime.knowledgeVersion,
    fixture: fixture.name,
    fixtureSha256: actualFixtureSha,
    model: MODEL,
    temperature: 0,
    reasoningEffort: REASONING_EFFORT,
    maxCompletionTokens: MAX_COMPLETION_TOKENS,
    stream: false,
    directCaseConfidence: DIRECT_CASE_CONFIDENCE,
    benchmarkTokenBudgetPerMinute: TOKEN_BUDGET_PER_MINUTE,
    requestedRecords: fixture.rows.length,
    records: results.length,
    stoppedEarly,
    structuredOutputAcceptanceRate: accepted / count,
    exactEffectiveActionRate: exact / count,
    fallbackRate: fallbacks / count,
    restrictedSafetyRate: restrictedRows.length ? restrictedSafeCount / restrictedRows.length : 1,
    latencyMs: {
      average: latencies.length ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length : 0,
      median: percentile(0.5),
      p95: percentile(0.95)
    },
    gates: {
      completedAllRows: results.length === fixture.rows.length && !stoppedEarly,
      structuredOutputAcceptanceAtLeast95: accepted / count >= 0.95,
      exactEffectiveActionAtLeast95: exact / count >= 0.95,
      fallbackAtMost5: fallbacks / count <= 0.05,
      restrictedSafety100: restrictedRows.length === 0 || restrictedSafeCount === restrictedRows.length
    }
  };
  const passed = Object.values(summary.gates).every(Boolean);
  const output = { ...summary, passed, results };
  mkdirSync(resolve(root, "release-validation/results"), { recursive: true });
  writeFileSync(resolve(root, "release-validation/results/b0-v3-hosted-result.json"), `${JSON.stringify(output, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (!passed) process.exitCode = 1;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown hosted B0 v3 runner failure";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
