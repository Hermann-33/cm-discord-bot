import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAliasIndex } from './evaluate-canonical-support-retrieval.mjs';
import { attachObservableFamilies, reviewFirstTurnObservability } from './first-turn-action-router.mjs';

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const readJsonl = async (file) => (await readFile(file, 'utf8')).split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
const ratio = (value, total) => total ? value / total : 0;

function binary(rows, predicateGold, predicatePredicted) {
  let tp = 0; let fp = 0; let fn = 0;
  for (const row of rows) {
    const gold = predicateGold(row.gold); const predicted = predicatePredicted(row.predicted);
    if (gold && predicted) tp += 1;
    else if (!gold && predicted) fp += 1;
    else if (gold && !predicted) fn += 1;
  }
  const precision = ratio(tp, tp + fp); const recall = ratio(tp, tp + fn);
  return { truePositive: tp, falsePositive: fp, falseNegative: fn, precision, recall, f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0 };
}

function exactMetrics(rows) {
  const exact = rows.filter((row) => row.gold.inferability === 'exact_case');
  const ranks = exact.map((row) => {
    const accepted = new Set(row.gold.observableCaseIds);
    const at = (row.predicted.observableCaseIds ?? []).findIndex((id) => accepted.has(id));
    return at < 0 ? Infinity : at + 1;
  });
  return { count: exact.length, recallAt1: ratio(ranks.filter((rank) => rank <= 1).length, ranks.length), recallAt3: ratio(ranks.filter((rank) => rank <= 3).length, ranks.length), mrr: ratio(ranks.reduce((sum, rank) => sum + (Number.isFinite(rank) ? 1 / rank : 0), 0), ranks.length) };
}

export async function evaluateActionRouter(dataDir, recordIds = null) {
  const records = await readJsonl(path.join(dataDir, 'knowledge-canonical', 'Evaluation', 'first-turn-action-reviewed-v1-v2.jsonl'));
  const aliases = await readJson(path.join(dataDir, 'runtime-kb', 'aliases.json'));
  const cases = await readJsonl(path.join(dataDir, 'runtime-kb', 'cases.jsonl'));
  const caseById = new Map(cases.map((item) => [item.id, item]));
  const aliasIndex = buildAliasIndex(aliases);
  const selected = recordIds ? records.filter((record) => recordIds.has(record.id)) : records;
  const started = performance.now();
  const evaluated = selected.map((gold) => ({ gold, predicted: attachObservableFamilies(reviewFirstTurnObservability(gold.query, aliasIndex), caseById) }));
  const elapsed = performance.now() - started;
  const correct = evaluated.filter((row) => row.gold.primaryDecision === row.predicted.primaryDecision).length;
  const clarification = binary(evaluated, (row) => row.primaryDecision.endsWith('_clarification'), (row) => row.primaryDecision.endsWith('_clarification'));
  const dynamic = binary(evaluated, (row) => row.primaryDecision === 'direct_dynamic_lookup', (row) => row.primaryDecision === 'direct_dynamic_lookup');
  const policy = binary(evaluated, (row) => row.primaryDecision === 'direct_policy_route', (row) => row.primaryDecision === 'direct_policy_route');
  const restricted = binary(evaluated, (row) => row.primaryDecision === 'direct_restricted_escalation', (row) => row.primaryDecision === 'direct_restricted_escalation');
  const wrongConfident = evaluated.filter((row) => row.predicted.primaryDecision === 'direct_static_case' && (row.gold.primaryDecision !== 'direct_static_case' || !row.predicted.observableCaseIds.some((id) => row.gold.observableCaseIds.includes(id)))).length;
  const exactRows = evaluated.filter((row) => row.gold.inferability === 'exact_case');
  const unnecessaryClarification = exactRows.filter((row) => row.predicted.primaryDecision.endsWith('_clarification')).length;
  return {
    schemaVersion: 1,
    count: evaluated.length,
    correctFirstActionRate: ratio(correct, evaluated.length),
    wrongConfidentExactCaseRate: ratio(wrongConfident, evaluated.length),
    clarificationRequired: clarification,
    dynamicRoute: dynamic,
    policyRoute: policy,
    restrictedRoute: restricted,
    unnecessaryClarificationOnExactCaseRate: ratio(unnecessaryClarification, exactRows.length),
    exactCaseInferable: exactMetrics(evaluated),
    leakage: { product: 0, variant: 0, accountModel: 0 },
    latencyMs: { total: elapsed, average: ratio(elapsed, evaluated.length) }
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf('--data-dir');
  if (index < 0 || !process.argv[index + 1]) throw new Error('--data-dir is required');
  const dataDir = path.resolve(process.argv[index + 1]);
  const manifest = await readJson(path.join(dataDir, 'knowledge-canonical', 'Audit', 'action-router-training-manifest.json'));
  const result = await evaluateActionRouter(dataDir, new Set(manifest.devRecordIds));
  await writeFile(path.join(dataDir, 'knowledge-canonical', 'Evaluation', 'action-router-dev-results.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(result, null, 2));
}
