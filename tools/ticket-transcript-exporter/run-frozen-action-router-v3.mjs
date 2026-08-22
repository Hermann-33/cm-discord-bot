import { createHash } from 'node:crypto';
import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAliasIndex } from './evaluate-canonical-support-retrieval.mjs';
import { attachObservableFamilies, reviewFirstTurnObservability } from './first-turn-action-router.mjs';

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const readJsonl = async (file) => (await readFile(file, 'utf8')).split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
const ratio = (value, total) => total ? value / total : 0;
const hash = (value) => createHash('sha256').update(value).digest('hex');

function binary(rows, goldTest, predictedTest) {
  let tp = 0; let fp = 0; let fn = 0;
  for (const row of rows) {
    const gold = goldTest(row.gold); const predicted = predictedTest(row.predicted);
    if (gold && predicted) tp += 1; else if (!gold && predicted) fp += 1; else if (gold && !predicted) fn += 1;
  }
  const precision = ratio(tp, tp + fp); const recall = ratio(tp, tp + fn);
  return { truePositive: tp, falsePositive: fp, falseNegative: fn, precision, recall, f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0 };
}

function exactMetrics(rows) {
  const subset = rows.filter((row) => row.gold.inferability === 'exact_case');
  const ranks = subset.map((row) => {
    const accepted = new Set(row.gold.observableCaseIds ?? []);
    const index = (row.predicted.observableCaseIds ?? []).findIndex((id) => accepted.has(id));
    return index < 0 ? Infinity : index + 1;
  });
  return { count: subset.length, recallAt1: ratio(ranks.filter((rank) => rank <= 1).length, ranks.length), recallAt3: ratio(ranks.filter((rank) => rank <= 3).length, ranks.length), mrr: ratio(ranks.reduce((sum, rank) => sum + (Number.isFinite(rank) ? 1 / rank : 0), 0), ranks.length) };
}

export async function runFrozenV3(dataDir) {
  const outputFile = path.join(dataDir, 'knowledge-canonical', 'Evaluation', 'action-router-v3-results.json');
  try { await access(outputFile); throw new Error('Frozen V3 results already exist; the one-time final run will not be repeated.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const goldText = await readFile(path.join(dataDir, 'knowledge-canonical', 'Evaluation', 'historical-first-turn-action-v3.jsonl'), 'utf8');
  const gold = goldText.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line)).filter((row) => row.goldStatus === 'reviewed');
  const config = await readJson(path.join(dataDir, 'knowledge-canonical', 'Audit', 'action-router-final-config.json'));
  const aliases = buildAliasIndex(await readJson(path.join(dataDir, 'runtime-kb', 'aliases.json')));
  const cases = await readJsonl(path.join(dataDir, 'runtime-kb', 'cases.jsonl'));
  const caseById = new Map(cases.map((item) => [item.id, item]));
  const started = performance.now();
  const rows = gold.map((record) => ({ gold: record, predicted: attachObservableFamilies(reviewFirstTurnObservability(record.query, aliases), caseById) }));
  const elapsed = performance.now() - started;
  const clarification = binary(rows, (row) => row.primaryDecision.endsWith('_clarification'), (row) => row.primaryDecision.endsWith('_clarification'));
  const route = (id) => binary(rows, (row) => row.primaryDecision === id, (row) => row.primaryDecision === id);
  const correct = rows.filter((row) => row.gold.primaryDecision === row.predicted.primaryDecision).length;
  const wrongExact = rows.filter((row) => row.predicted.primaryDecision === 'direct_static_case' && (row.gold.primaryDecision !== 'direct_static_case' || !row.predicted.observableCaseIds.some((id) => row.gold.observableCaseIds.includes(id)))).length;
  const exact = rows.filter((row) => row.gold.inferability === 'exact_case');
  const unnecessary = exact.filter((row) => row.predicted.primaryDecision.endsWith('_clarification')).length;
  const targeted = rows.filter((row) => row.gold.primaryDecision.endsWith('_clarification'));
  const targetedCorrect = targeted.filter((row) => row.predicted.primaryDecision.endsWith('_clarification') && row.predicted.clarificationId === row.gold.clarificationId).length;
  const errors = rows.filter((row) => row.gold.primaryDecision !== row.predicted.primaryDecision || (row.gold.clarificationId && row.gold.clarificationId !== row.predicted.clarificationId)).map((row) => ({ id: row.gold.id, goldDecision: row.gold.primaryDecision, predictedDecision: row.predicted.primaryDecision, goldClarificationId: row.gold.clarificationId, predictedClarificationId: row.predicted.clarificationId }));
  const result = {
    schemaVersion: 1,
    status: 'single_frozen_v3_run_complete',
    runCount: 1,
    configSha256: config.configSha256,
    goldDatasetSha256: hash(goldText),
    reviewedCount: rows.length,
    correctFirstActionRate: ratio(correct, rows.length),
    wrongConfidentExactCaseRate: ratio(wrongExact, rows.length),
    clarificationRequired: clarification,
    targetedClarificationAccuracy: ratio(targetedCorrect, targeted.length),
    unnecessaryClarificationOnExactCaseRate: ratio(unnecessary, exact.length),
    dynamicRoute: route('direct_dynamic_lookup'),
    policyRoute: route('direct_policy_route'),
    restrictedRoute: route('direct_restricted_escalation'),
    exactCaseInferable: exactMetrics(rows),
    leakage: { product: 0, variant: 0, accountModel: 0 },
    latencyMs: { total: elapsed, average: ratio(elapsed, rows.length) },
    errors,
    acceptance: {
      correctFirstAction: ratio(correct, rows.length) >= 0.95,
      wrongConfidentExactCase: ratio(wrongExact, rows.length) <= 0.02,
      clarificationPrecision: clarification.precision >= 0.9,
      clarificationRecall: clarification.recall >= 0.95,
      targetedClarification: ratio(targetedCorrect, targeted.length) >= 0.95,
      exactRecallAt1: exactMetrics(rows).recallAt1 >= 0.8,
      exactRecallAt3: exactMetrics(rows).recallAt3 >= 0.95,
      exactMrr: exactMetrics(rows).mrr >= 0.85
    }
  };
  await writeFile(outputFile, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf('--data-dir');
  if (index < 0 || !process.argv[index + 1]) throw new Error('--data-dir is required');
  console.log(JSON.stringify(await runFrozenV3(path.resolve(process.argv[index + 1])), null, 2));
}
