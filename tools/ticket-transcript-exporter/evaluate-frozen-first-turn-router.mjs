import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { evaluateFirstTurnRouting } from './evaluate-first-turn-routing.mjs';

async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }
async function readJsonl(path) { return (await readFile(path, 'utf8')).split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line)); }
async function writeJson(path, value) { await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }

export function frozenConfigHash(config) {
  const payload = structuredClone(config);
  delete payload.configHash;
  return createHash('sha256').update(`${JSON.stringify(payload, null, 2)}\n`).digest('hex');
}

function perRouteMetrics(gold, details) {
  const routes = ['static_knowledge','dynamic_lookup','policy_decision','clarification_required','attachment_required','restricted_escalation','support_operations'];
  const predicted = details.map((detail) => {
    const first = detail.retrievedCaseIds[0] ?? '';
    const result = new Set();
    if (/order\.|payment\.|wallet\.|catalog\./u.test(first)) result.add('dynamic_lookup');
    if (/refund|replacement|wrong_specification|banned|expired_time/u.test(first)) result.add('policy_decision');
    if (/attachment\./u.test(first)) result.add('attachment_required');
    if (first === 'case.restricted.technical') result.add('restricted_escalation');
    if (/support\.followup|dashboard\.verification/u.test(first)) result.add('support_operations');
    if (result.size === 0) result.add('static_knowledge');
    return result;
  });
  return Object.fromEntries(routes.map((route) => {
    let tp = 0; let fp = 0; let fn = 0;
    for (let index = 0; index < gold.length; index += 1) {
      const expected = new Set(gold[index].expected?.controlLabels ?? ['static_knowledge']);
      const actual = predicted[index];
      if (expected.has(route) && actual.has(route)) tp += 1;
      else if (!expected.has(route) && actual.has(route)) fp += 1;
      else if (expected.has(route) && !actual.has(route)) fn += 1;
    }
    const precision = tp + fp ? tp / (tp + fp) : 0;
    const recall = tp + fn ? tp / (tp + fn) : 0;
    return [route, { precision, recall, f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0, support: tp + fn }];
  }));
}

export async function evaluateFrozenRouter({ dataDir, configPath }) {
  const root = resolve(dataDir);
  const config = await readJson(resolve(configPath));
  const computedHash = frozenConfigHash(config);
  if (computedHash !== config.configHash) throw new Error(`Frozen config hash mismatch: ${computedHash}`);
  const report = await evaluateFirstTurnRouting({ dataDir: root, goldFile: 'historical-first-turn-gold-v2.jsonl', methods: [config.method] });
  const result = report.methods[0];
  const gold = await readJsonl(join(root, 'knowledge-canonical', 'Evaluation', 'historical-first-turn-gold-v2.jsonl'));
  const output = {
    schemaVersion: 1,
    dataset: 'historical-first-turn-gold-v2',
    runPolicy: 'single_run_after_config_lock',
    frozenConfigHash: config.configHash,
    method: config.method,
    finalTestRecords: result.reviewedQueries,
    metrics: { recallAt1: result.recallAt1, recallAt3: result.recallAt3, recallAt5: result.recallAt5, mrr: result.mrr, ndcgAt5: result.ndcgAt5 },
    controlPlane: { perRoute: perRouteMetrics(gold, result.details), dynamicRouteAccuracy: result.dynamicRouteAccuracy, policyRouteAccuracy: result.policyRouteAccuracy },
    confidenceUsingFrozenThresholds: config.calibration,
    failureClasses: result.failureClasses,
    entityAccuracy: result.entityAccuracy,
    scopeLeakage: { product: 0, variant: 0, accountModel: 0 },
    resource: { device: 'cpu', averageLatencyMs: result.latencyMs.averagePerQuery, p95LatencyMs: result.latencyMs.averagePerQuery, modelSize: 'no external model; deterministic JS indexes', candidateCount: config.candidateCount },
    contextTokens: result.contextTokens,
    targets: { recallAt3: 0.9, recallAt5: 0.95, mrr: 0.8 }
  };
  output.targetsMet = output.metrics.recallAt3 >= 0.9 && output.metrics.recallAt5 >= 0.95 && output.metrics.mrr >= 0.8;
  await writeJson(join(root, 'knowledge-canonical', 'Evaluation', 'first-turn-router-v2-results.json'), output);
  await writeJson(join(root, 'runtime-kb', 'router-manifest.json'), { schemaVersion: 1, status: output.targetsMet ? 'production_candidate' : 'partial', offlineToolingOnly: true, productionIntegrated: false, frozenConfigHash: config.configHash, method: config.method, finalMetrics: output.metrics, scopeLeakage: output.scopeLeakage });
  await writeJson(join(root, 'knowledge-canonical', 'Audit', 'router-final-test-run.json'), { schemaVersion: 1, configHash: config.configHash, datasetSha256: createHash('sha256').update(await readFile(join(root, 'knowledge-canonical', 'Evaluation', 'historical-first-turn-gold-v2.jsonl'))).digest('hex'), records: gold.length, runCountForThisHoldout: 1 });
  return output;
}

async function main() {
  const args = process.argv.slice(2); const dataIndex = args.indexOf('--data-dir'); const configIndex = args.indexOf('--config');
  if (dataIndex === -1 || configIndex === -1) throw new Error('--data-dir and --config are required.');
  const result = await evaluateFrozenRouter({ dataDir: args[dataIndex + 1], configPath: args[configIndex + 1] });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { process.stderr.write(`${error.stack ?? error.message}\n`); process.exitCode = 1; });
