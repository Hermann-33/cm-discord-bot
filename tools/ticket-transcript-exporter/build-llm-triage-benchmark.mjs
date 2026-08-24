import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLlmTriageInput } from './llm-triage-contract.mjs';
import { reviewFirstTurnObservability } from './first-turn-action-router.mjs';
import { estimatePlannerTokens } from './llm-triage-prompt.mjs';

const DEFAULT_DEVELOPMENT_DATASET = 'historical-first-turn-action-v3.jsonl';
const DEFAULT_ADJUDICATION_FILE = 'historical-first-turn-action-v3-adjudication.json';
const INDEPENDENT_LABEL_METHOD = 'independent_semantic_review_first_turn_decision';
const FAMILY_EQUIVALENTS = new Map([
  ['business.media', 'business.application']
]);
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

function normalizedFamilyId(id) {
  return FAMILY_EQUIVALENTS.get(id) ?? id;
}

function intersects(values, allowed) {
  return (values ?? []).some((value) => allowed.has(value));
}

function familiesIntersect(values, allowed) {
  const normalizedAllowed = new Set([...allowed].map(normalizedFamilyId));
  return (values ?? []).some((value) => normalizedAllowed.has(normalizedFamilyId(value)));
}

function compactRuntimeDynamicLookups(rows) {
  return (rows ?? []).map((item) => ({
    id: item.id,
    purpose: [
      ...(item.questionTypes ?? []),
      item.operation ? `operation:${item.operation}` : null,
      item.neverInferFromHistory ? 'current-state only' : null
    ].filter(Boolean).join('; ')
  }));
}

function mergeLookups(...groups) {
  const byId = new Map();
  for (const item of groups.flat()) {
    if (!item?.id || byId.has(item.id)) continue;
    byId.set(item.id, item);
  }
  return [...byId.values()];
}

function buildAdjudicationIndex(document, dataset, reviewedRecordIds) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error('V3 hosted benchmark adjudication must be a JSON object');
  }
  if (document.dataset !== dataset) {
    throw new Error(`Adjudication dataset mismatch: expected ${dataset}, got ${document.dataset ?? 'missing'}`);
  }
  const entries = document.entries ?? [];
  if (!Array.isArray(entries)) throw new Error('Adjudication entries must be an array');
  const byId = new Map();
  for (const entry of entries) {
    if (!entry?.id || typeof entry.id !== 'string') throw new Error('Adjudication entry is missing id');
    if (!['exclude','retain'].includes(entry.disposition)) throw new Error(`Unknown adjudication disposition for ${entry.id}`);
    if (!reviewedRecordIds.has(entry.id)) throw new Error(`Adjudication references unknown or non-reviewed record ${entry.id}`);
    if (byId.has(entry.id)) throw new Error(`Duplicate adjudication entry ${entry.id}`);
    byId.set(entry.id, entry);
  }
  return byId;
}

export function assessGoldRepresentability(gold, input) {
  const reasons = [];
  const allowedCases = new Set(input?.allowed?.caseIds ?? []);
  const allowedFamilies = new Set(input?.allowed?.familyIds ?? []);
  const allowedClarifications = new Set(input?.allowed?.clarificationIds ?? []);
  const allowedLookups = new Set(input?.allowed?.dynamicLookupIds ?? []);
  const allowedPolicies = new Set(input?.allowed?.policyIds ?? []);

  if ((gold?.observableCaseIds ?? []).length > 0 && !intersects(gold.observableCaseIds, allowedCases)) {
    reasons.push('gold_case_not_represented');
  }
  if ((gold?.observableFamilyIds ?? []).length > 0 && allowedFamilies.size > 0 && !familiesIntersect(gold.observableFamilyIds, allowedFamilies)) {
    reasons.push('gold_family_not_represented');
  }
  if (gold?.action === 'answer_case' && !intersects(gold.observableCaseIds ?? [], allowedCases)) {
    reasons.push('gold_answer_case_unavailable');
  }
  if (gold?.action === 'ask_clarification' && gold.clarificationId && !allowedClarifications.has(gold.clarificationId)) {
    reasons.push('gold_clarification_unavailable');
  }
  if (gold?.action === 'request_dynamic_lookup' && (gold.lookupIds ?? []).length > 0 && !intersects(gold.lookupIds, allowedLookups)) {
    reasons.push('gold_lookup_unavailable');
  }
  if (gold?.action === 'request_policy_route' && (gold.policyIds ?? []).length > 0 && !intersects(gold.policyIds, allowedPolicies)) {
    reasons.push('gold_policy_unavailable');
  }

  return { eligible: reasons.length === 0, reasons: unique(reasons) };
}

export async function buildLlmTriageBenchmark(dataDir, {
  dataset = DEFAULT_DEVELOPMENT_DATASET,
  adjudication = DEFAULT_ADJUDICATION_FILE,
  output = 'llm-triage-development-inputs.jsonl',
  maxCases = 8
} = {}) {
  const evaluationDir = path.join(dataDir, 'knowledge-canonical', 'Evaluation');
  const auditDir = path.join(dataDir, 'knowledge-canonical', 'Audit');
  const runtimeDir = path.join(dataDir, 'runtime-kb');
  const allRecords = await readJsonl(path.join(evaluationDir, dataset));
  const records = allRecords.filter((row) => row.goldStatus === 'reviewed');
  const adjudicationDocument = await readJson(path.join(evaluationDir, adjudication));
  const adjudicationById = buildAdjudicationIndex(adjudicationDocument, dataset, new Set(records.map((row) => row.id)));
  const cases = await readJsonl(path.join(runtimeDir, 'cases.jsonl'));
  const clarificationsFile = await readJson(path.join(runtimeDir, 'clarifications.json'));
  const clarifications = clarificationsFile.clarifications ?? clarificationsFile;
  const aliasesFile = await readJson(path.join(runtimeDir, 'aliases.json'));
  const aliases = aliasesFile.aliases ?? aliasesFile;
  const actionRouting = await readJson(path.join(runtimeDir, 'action-routing.json'));
  const runtimeDynamicLookups = await readJson(path.join(runtimeDir, 'dynamic-lookups.json'));
  const actionLookups = (actionRouting.approvedLookups ?? []).map((item) => ({ id: item.id, purpose: (item.useWhen ?? []).join('; ') }));
  const dynamicLookups = mergeLookups(actionLookups, compactRuntimeDynamicLookups(runtimeDynamicLookups));
  const policiesFile = await readJson(path.join(runtimeDir, 'policies.json'));
  const policies = policiesFile.policies ?? policiesFile;

  const reviewedRows = records.map((record) => {
    const baseline = reviewFirstTurnObservability(record.query, aliases);
    const candidateCases = candidateCasesFor(record, baseline, cases, maxCases);
    const candidateDynamicLookupIds = unique([
      ...(baseline.lookupIds ?? []),
      ...(baseline.dynamicLookupIds ?? [])
    ]);
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
      candidateDynamicLookupIds,
      clarifications,
      dynamicLookups,
      policies,
      restricted: baseline.primaryDecision === 'direct_restricted_escalation',
      maxCases
    });
    const gold = goldView(record);
    return {
      id: record.id,
      sourceTranscriptIds: record.sourceTranscriptIds,
      goldLabelMethod: record.labelMethod ?? null,
      goldReviewReason: record.reviewReason ?? record.decisionReason ?? null,
      benchmarkAdjudication: adjudicationById.get(record.id) ?? { disposition: 'retain', category: 'not_flagged' },
      input,
      gold,
      baseline: {
        primaryDecision: baseline.primaryDecision,
        clarificationId: baseline.clarificationId ?? null,
        observableCaseIds: baseline.observableCaseIds ?? [],
        observableFamilyIds: baseline.observableFamilyIds ?? []
      },
      benchmarkEligibility: assessGoldRepresentability(gold, input),
      plannerTokenEstimate: estimatePlannerTokens(input)
    };
  });

  const adjudicatedRows = reviewedRows.filter((row) => row.benchmarkAdjudication.disposition !== 'exclude');
  const excludedRows = reviewedRows.filter((row) => row.benchmarkAdjudication.disposition === 'exclude');
  const rows = adjudicatedRows.filter((row) => row.benchmarkEligibility.eligible);
  const reviewQueue = adjudicatedRows.filter((row) => !row.benchmarkEligibility.eligible);
  const rawRepresentable = reviewedRows.filter((row) => row.benchmarkEligibility.eligible).length;
  const tokenValues = rows.map((row) => row.plannerTokenEstimate).sort((a, b) => a - b);
  const percentile = (p) => tokenValues.length ? tokenValues[Math.min(tokenValues.length - 1, Math.ceil(tokenValues.length * p) - 1)] : 0;
  const independentReviewed = reviewedRows.filter((row) => row.goldLabelMethod === INDEPENDENT_LABEL_METHOD).length;
  const reasonCounts = Object.fromEntries(unique(reviewQueue.flatMap((row) => row.benchmarkEligibility.reasons)).map((reason) => [
    reason,
    reviewQueue.filter((row) => row.benchmarkEligibility.reasons.includes(reason)).length
  ]));
  const adjudicationCategories = Object.fromEntries(unique(excludedRows.map((row) => row.benchmarkAdjudication.category ?? 'unspecified')).map((category) => [
    category,
    excludedRows.filter((row) => (row.benchmarkAdjudication.category ?? 'unspecified') === category).length
  ]));
  const summary = {
    schemaVersion: 3,
    dataset,
    adjudicationFile: adjudication,
    sourceRecords: allRecords.length,
    reviewedRecords: reviewedRows.length,
    adjudicatedRecords: adjudicatedRows.length,
    excludedByAdjudication: excludedRows.length,
    adjudicationCategories,
    records: rows.length,
    reviewQueueRecords: reviewQueue.length,
    rawRepresentabilityRate: reviewedRows.length ? rawRepresentable / reviewedRows.length : 0,
    representabilityRate: adjudicatedRows.length ? rows.length / adjudicatedRows.length : 0,
    representabilityReasons: reasonCounts,
    independentReviewed,
    independentReviewRate: reviewedRows.length ? independentReviewed / reviewedRows.length : 0,
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
  const reviewQueuePath = output.replace(/\.jsonl$/u, '-review-queue.jsonl');
  const excludedPath = output.replace(/\.jsonl$/u, '-adjudication-excluded.jsonl');
  await writeFile(path.join(auditDir, output), `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
  await writeFile(path.join(auditDir, reviewQueuePath), reviewQueue.length ? `${reviewQueue.map((row) => JSON.stringify(row)).join('\n')}\n` : '', 'utf8');
  await writeFile(path.join(auditDir, excludedPath), excludedRows.length ? `${excludedRows.map((row) => JSON.stringify(row)).join('\n')}\n` : '', 'utf8');
  await writeFile(path.join(auditDir, output.replace(/\.jsonl$/u, '-summary.json')), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  return summary;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const dataIndex = args.indexOf('--data-dir');
  if (dataIndex < 0 || !args[dataIndex + 1]) throw new Error('Usage: node build-llm-triage-benchmark.mjs --data-dir <private-data-dir> [--dataset file.jsonl] [--adjudication file.json]');
  const datasetIndex = args.indexOf('--dataset');
  const dataset = datasetIndex >= 0 ? args[datasetIndex + 1] : undefined;
  const adjudicationIndex = args.indexOf('--adjudication');
  const adjudication = adjudicationIndex >= 0 ? args[adjudicationIndex + 1] : undefined;
  console.log(JSON.stringify(await buildLlmTriageBenchmark(path.resolve(args[dataIndex + 1]), { dataset, adjudication }), null, 2));
}
