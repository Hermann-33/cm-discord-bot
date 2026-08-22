import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { classifyConversationalSafety } from './audit-conversational-safety.mjs';
import { runLlmTriage } from './llm-triage-contract.mjs';
import { createLocalOpenAiCompatibleTriageProvider } from './llm-triage-provider.mjs';
import { createOpenRouterTriageProvider, DEFAULT_OPENROUTER_TRIAGE_MODEL } from './openrouter-triage-provider.mjs';

const readJsonl = async (file) => (await readFile(file, 'utf8')).split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
const safeName = (value) => String(value).replace(/[^a-z0-9._-]+/giu, '-').replace(/^-+|-+$/gu, '').toLowerCase() || 'model';
const unique = (values) => [...new Set((values ?? []).filter(Boolean))];

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
}

export function triageOutputToPrediction(output) {
  const mapping = {
    answer_case: 'direct_static_case',
    request_dynamic_lookup: 'direct_dynamic_lookup',
    request_policy_route: 'direct_policy_route',
    request_attachment: 'direct_attachment_route',
    restricted_escalation: 'direct_restricted_escalation',
    support_operation: 'direct_support_operation',
    human_escalation: 'human_escalation',
    multi_intent_route: 'multi_intent_route'
  };
  let primaryDecision = mapping[output?.nextAction] ?? null;
  if (output?.nextAction === 'ask_clarification') {
    primaryDecision = output.clarificationId === 'clarify.support_surface'
      ? 'generic_clarification'
      : 'family_scoped_clarification';
  }
  return {
    primaryDecision,
    clarificationId: output?.clarificationId ?? null,
    observableCaseIds: unique(output?.caseIds ?? []),
    observableFamilyIds: [],
    lookupIds: unique(output?.dynamicLookupIds ?? []),
    policyIds: unique(output?.policyIds ?? [])
  };
}

function clarificationIndex(input) {
  return new Map((input?.allowed?.clarifications ?? []).map((item) => [item.id, item]));
}

function exactActionMatch(gold, output) {
  if (gold.action !== output.nextAction) return false;
  if (gold.action === 'ask_clarification') return (gold.clarificationId ?? null) === (output.clarificationId ?? null);
  if (gold.action === 'answer_case') return (gold.observableCaseIds ?? []).some((id) => (output.caseIds ?? []).includes(id));
  if (gold.action === 'request_dynamic_lookup') return (gold.lookupIds ?? []).some((id) => (output.dynamicLookupIds ?? []).includes(id));
  if (gold.action === 'request_policy_route' && (gold.policyIds ?? []).length) return gold.policyIds.some((id) => (output.policyIds ?? []).includes(id));
  return true;
}

export async function evaluateLlmTriageRows(rows, {
  provider,
  model = 'unknown',
  directCaseConfidence = 0.8,
  onProgress = null
} = {}) {
  if (typeof provider !== 'function') throw new TypeError('provider is required');
  const results = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const started = performance.now();
    const result = await runLlmTriage({ provider, input: row.input, validatorOptions: { directCaseConfidence } });
    const latencyMs = performance.now() - started;
    const prediction = triageOutputToPrediction(result.output);
    const safety = classifyConversationalSafety({ gold: { ...row.gold, primaryDecision: row.gold.primaryDecision }, prediction, clarificationById: clarificationIndex(row.input) });
    results.push({
      id: row.id,
      sourceTranscriptIds: row.sourceTranscriptIds,
      accepted: result.accepted,
      validationErrors: result.errors,
      latencyMs,
      plannerTokenEstimate: row.plannerTokenEstimate,
      gold: row.gold,
      effectiveOutput: result.output,
      rejectedOutput: result.rejectedOutput ?? null,
      prediction,
      exactOptimalAction: exactActionMatch(row.gold, result.output),
      ...safety
    });
    if (onProgress) onProgress({ index: index + 1, total: rows.length, latest: results.at(-1) });
  }

  const counts = Object.fromEntries(['optimal','safe_progress','safe_no_progress','unsafe_wrong_route','unsafe_scope_leakage','invalid'].map((key) => [key, results.filter((row) => row.classification === key).length]));
  const total = results.length || 1;
  const latencies = results.map((row) => row.latencyMs);
  const summary = {
    schemaVersion: 1,
    model,
    records: results.length,
    structuredOutputAcceptanceRate: results.filter((row) => row.accepted).length / total,
    exactOptimalActionRate: results.filter((row) => row.exactOptimalAction).length / total,
    counts,
    safeProgressOrBetterRate: (counts.optimal + counts.safe_progress) / total,
    unsafeRate: (counts.unsafe_wrong_route + counts.unsafe_scope_leakage + counts.invalid) / total,
    safeNoProgressRate: counts.safe_no_progress / total,
    semanticReviewQueue: results.filter((row) => row.requiresSemanticReview).length,
    latencyMs: {
      average: latencies.length ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length : 0,
      median: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95)
    },
    plannerTokens: {
      average: results.length ? results.reduce((sum, row) => sum + (row.plannerTokenEstimate ?? 0), 0) / results.length : 0,
      median: percentile(results.map((row) => row.plannerTokenEstimate ?? 0), 0.5),
      p95: percentile(results.map((row) => row.plannerTokenEstimate ?? 0), 0.95)
    }
  };
  return { summary, results };
}

async function writeEvaluation({ dataDir, inputFile, model, providerName, evaluated, metadata = {} }) {
  const auditDir = path.join(dataDir, 'knowledge-canonical', 'Audit');
  const stem = `llm-triage-${providerName}-${safeName(model)}`;
  const output = {
    ...evaluated.summary,
    provider: providerName,
    inputFile,
    ...metadata
  };
  await writeFile(path.join(auditDir, `${stem}-summary.json`), `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  await writeFile(path.join(auditDir, `${stem}-results.jsonl`), `${evaluated.results.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
  return output;
}

async function loadRows(dataDir, inputFile, limit) {
  const auditDir = path.join(dataDir, 'knowledge-canonical', 'Audit');
  let rows = await readJsonl(path.join(auditDir, inputFile));
  if (Number.isInteger(limit) && limit > 0) rows = rows.slice(0, limit);
  return rows;
}

export async function evaluateLocalLlmTriage({
  dataDir,
  inputFile = 'llm-triage-development-inputs.jsonl',
  model,
  baseUrl = 'http://127.0.0.1:11434/v1',
  limit = null,
  timeoutMs = 30_000,
  useJsonSchema = true,
  directCaseConfidence = 0.8
}) {
  const rows = await loadRows(dataDir, inputFile, limit);
  const provider = createLocalOpenAiCompatibleTriageProvider({ baseUrl, model, timeoutMs, useJsonSchema });
  const evaluated = await evaluateLlmTriageRows(rows, {
    provider,
    model,
    directCaseConfidence,
    onProgress: ({ index, total }) => {
      if (index === 1 || index === total || index % 25 === 0) process.stderr.write(`triage ${index}/${total}\n`);
    }
  });
  return writeEvaluation({
    dataDir,
    inputFile,
    model,
    providerName: 'local',
    evaluated,
    metadata: { baseUrl, useJsonSchema, directCaseConfidence }
  });
}

export async function evaluateOpenRouterLlmTriage({
  dataDir,
  inputFile = 'llm-triage-development-inputs.jsonl',
  model = DEFAULT_OPENROUTER_TRIAGE_MODEL,
  apiKey,
  limit = null,
  timeoutMs = 30_000,
  dataCollection = 'allow',
  maxTokens = 400,
  directCaseConfidence = 0.8
}) {
  const rows = await loadRows(dataDir, inputFile, limit);
  const provider = createOpenRouterTriageProvider({ apiKey, model, timeoutMs, dataCollection, maxTokens });
  const evaluated = await evaluateLlmTriageRows(rows, {
    provider,
    model,
    directCaseConfidence,
    onProgress: ({ index, total }) => {
      if (index === 1 || index === total || index % 10 === 0) process.stderr.write(`openrouter triage ${index}/${total}\n`);
    }
  });
  return writeEvaluation({
    dataDir,
    inputFile,
    model,
    providerName: 'openrouter',
    evaluated,
    metadata: { dataCollection, maxTokens, directCaseConfidence }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const get = (name, fallback = null) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : fallback;
  };
  const dataDir = get('--data-dir');
  const providerName = get('--provider', 'local');
  const model = get('--model', providerName === 'openrouter' ? DEFAULT_OPENROUTER_TRIAGE_MODEL : null);
  if (!dataDir || !model) throw new Error('Usage: node evaluate-llm-triage.mjs --data-dir <private-data-dir> --provider <local|openrouter> --model <model> [--limit N]');
  const limitRaw = get('--limit');
  const timeoutRaw = get('--timeout-ms');
  const confidenceRaw = get('--direct-case-confidence');
  const common = {
    dataDir: path.resolve(dataDir),
    inputFile: get('--input-file', 'llm-triage-development-inputs.jsonl'),
    model,
    limit: limitRaw ? Number(limitRaw) : null,
    timeoutMs: timeoutRaw ? Number(timeoutRaw) : 30_000,
    directCaseConfidence: confidenceRaw ? Number(confidenceRaw) : 0.8
  };

  let result;
  if (providerName === 'openrouter') {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('OPENROUTER_API_KEY is required for --provider openrouter');
    result = await evaluateOpenRouterLlmTriage({
      ...common,
      apiKey,
      dataCollection: get('--data-collection', process.env.OPENROUTER_DATA_COLLECTION ?? 'allow'),
      maxTokens: Number(get('--max-tokens', '400'))
    });
  } else if (providerName === 'local') {
    result = await evaluateLocalLlmTriage({
      ...common,
      baseUrl: get('--base-url', 'http://127.0.0.1:11434/v1'),
      useJsonSchema: !args.includes('--no-json-schema')
    });
  } else {
    throw new Error('--provider must be local or openrouter');
  }
  console.log(JSON.stringify(result, null, 2));
}
