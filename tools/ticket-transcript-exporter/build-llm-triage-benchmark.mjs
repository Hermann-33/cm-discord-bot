import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLlmTriageInput } from './llm-triage-contract.mjs';
import { reviewFirstTurnObservability } from './first-turn-action-router.mjs';
import { estimatePlannerTokens } from './llm-triage-prompt.mjs';

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const readJsonl = async (file) => (await readFile(file, 'utf8')).split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
const unique = (values) => [...new Set((values ?? []).filter(Boolean))];

function scopeCompatible(caseRecord, entityIds) {
  const groups = [
    ['games','game.'],['vendors','vendor.'],['products','product.'],['variants','variant.'],['accountModels','account_model.'],['accountListings','account_listing.']
  ];
  for (const [field, prefix] of groups) {
    const resolved = (entityIds ?? []).filter((id) => id.startsWith(prefix));
    const scoped = caseRecord.scope?.[field] ?? [];
    if (resolved.length && scoped.length && !resolved.some((id) => scoped.includes(id))) return false;
  }
  return true;
}

function candidateCasesFor(record, baseline, cases, maxCases = 8) {
  const ids = new Set(baseline.observableCaseIds ?? []);
  const families = new Set(baseline.observableFamilyIds ?? []);
  for (const item of cases) {
    if (ids.size >= maxCases) break;
    if (families.has(item.family) && scopeCompatible(item, baseline.observableEntityIds ?? [])) ids.add(item.id);
  }
  if (ids.size === 0 && (baseline.observableEntityIds ?? []).length > 0) {
    for (const item of cases) {
      if (ids.size >= maxCases) break;
      if (scopeCompatible(item, baseline.observableEntityIds)) ids.add(item.id);
    }
  }
  return [...ids].map((id) => cases.find((item) => item.id === id)).filter(Boolean).slice(0, maxCases);
}

function goldView(record) {
  return {
    action: record.action,
    inferability: record.inferability,
    primaryDecision: record.primaryDecision,
    observableCaseIds: record.observableCaseIds ?? [],
    observableFamilyIds: record.observableFamilyIds ?? [],
    clarificationId: record.clarificationId ?? null,
    lookupIds: record.lookupIds ?? record.dynamicLookupIds ?? [],
    policyIds: record.policyIds ?? []
  };
}

export async function buildLlmTriageBenchmark(dataDir, { dataset = 'first-turn-action-reviewed-v1-v2.jsonl', output = 'llm-triage-development-inputs.jsonl', maxCases = 8 } = {}) {
  const evaluationDir = path.join(dataDir, 'knowledge-canonical', 'Evaluation');
  const auditDir = path.join(dataDir, 'knowledge-canonical', 'Audit');
  const runtimeDir = path.join(dataDir, 'runtime-kb');
  const records = (await readJsonl(path.join(evaluationDir, dataset))).filter((row) => row.goldStatus === 'reviewed');
  const cases = await readJsonl(path.join(runtimeDir, 'cases.jsonl'));
  const clarificationsFile = await readJson(path.join(runtimeDir, 'clarifications.json'));
  const clarifications = clarificationsFile.clarifications ?? clarificationsFile;
  const aliasesFile = await readJson(path.join(runtimeDir, 'aliases.json'));
  const aliases = aliasesFile.aliases ?? aliasesFile;
  const actionRouting = await readJson(path.join(runtimeDir, 'action-routing.json'));
  const dynamicLookups = (actionRouting.approvedLookups ?? []).map((item) => ({ id: item.id, purpose: (item.useWhen ?? []).join('; ') }));
  const policiesFile = await readJson(path.join(runtimeDir, 'policies.json'));
  const policies = policiesFile.policies ?? policiesFile;

  const rows = records.map((record) => {
    const baseline = reviewFirstTurnObservability(record.query, aliases);
    const candidateCases = candidateCasesFor(record, baseline, cases, maxCases);
    const input = buildLlmTriageInput({
      customerText: record.query,
      state: {
        resolvedEntities: baseline.observableEntityIds ?? [],
        candidateCaseIds: baseline.observableCaseIds ?? [],
        candidateFamilyIds: baseline.observableFamilyIds ?? [],
        knownContext: {},
        questionsAsked: []
      },
      candidateCases,
      candidateFamilies: baseline.observableFamilyIds ?? [],
      clarifications,
      dynamicLookups,
      policies,
      restricted: baseline.primaryDecision === 'direct_restricted_escalation',
      maxCases
    });
    return {
      id: record.id,
      sourceTranscriptIds: record.sourceTranscriptIds,
      input,
      gold: goldView(record),
      baseline: {
        primaryDecision: baseline.primaryDecision,
        clarificationId: baseline.clarificationId ?? null,
        observableCaseIds: baseline.observableCaseIds ?? [],
        observableFamilyIds: baseline.observableFamilyIds ?? []
      },
      plannerTokenEstimate: estimatePlannerTokens(input)
    };
  });

  const tokenValues = rows.map((row) => row.plannerTokenEstimate).sort((a, b) => a - b);
  const percentile = (p) => tokenValues.length ? tokenValues[Math.min(tokenValues.length - 1, Math.ceil(tokenValues.length * p) - 1)] : 0;
  const summary = {
    schemaVersion: 1,
    dataset,
    records: rows.length,
    maxCases,
    plannerTokens: {
      average: tokenValues.length ? tokenValues.reduce((sum, value) => sum + value, 0) / tokenValues.length : 0,
      median: percentile(0.5),
      p95: percentile(0.95)
    },
    candidateCases: {
      average: rows.length ? rows.reduce((sum, row) => sum + row.input.allowed.caseIds.length, 0) / rows.length : 0,
      max: Math.max(0, ...rows.map((row) => row.input.allowed.caseIds.length))
    }
  };
  await writeFile(path.join(auditDir, output), `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
  await writeFile(path.join(auditDir, output.replace(/\.jsonl$/u, '-summary.json')), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  return summary;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const dataIndex = args.indexOf('--data-dir');
  if (dataIndex < 0 || !args[dataIndex + 1]) throw new Error('Usage: node build-llm-triage-benchmark.mjs --data-dir <private-data-dir> [--dataset file.jsonl]');
  const datasetIndex = args.indexOf('--dataset');
  const dataset = datasetIndex >= 0 ? args[datasetIndex + 1] : undefined;
  console.log(JSON.stringify(await buildLlmTriageBenchmark(path.resolve(args[dataIndex + 1]), { dataset }), null, 2));
}
