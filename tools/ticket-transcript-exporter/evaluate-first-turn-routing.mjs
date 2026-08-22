import { performance } from 'node:perf_hooks';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildAliasIndex, buildBm25Index, bm25Score, normalizeText, rankCases, resolveAliases, tokenize } from './evaluate-canonical-support-retrieval.mjs';
import { characterDice } from './build-support-evaluation-partitions.mjs';
import { firstTurnRoutingSignals } from './first-turn-routing-signals.mjs';

async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }
async function readJsonl(path) { return (await readFile(path, 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)); }
async function writeJson(path, value) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`); }

function expectedIds(record) {
  return [...new Set([record.expected?.primaryCaseId, ...(record.expected?.caseIds ?? []), ...(record.expected?.acceptableCaseIds ?? []), ...(record.expected?.secondaryCaseIds ?? [])].filter(Boolean))];
}
function scopeValues(scope = {}) { return new Set(Object.values(scope).flatMap((value) => Array.isArray(value) ? value : []).filter((value) => typeof value === 'string')); }
function entityKind(id) { return String(id).split('.')[0]; }
function entityConflict(left, right) {
  for (const target of left) for (const candidate of right) {
    if (entityKind(target) === entityKind(candidate) && ['game', 'vendor', 'product', 'variant', 'account_model', 'account_listing'].includes(entityKind(target)) && target !== candidate) return true;
  }
  return false;
}
function scopeSpecificity(scope = {}) {
  if (scope.variants?.length) return 7;
  if (scope.products?.length) return 6;
  if (scope.accountListings?.length && scope.games?.length) return 5;
  if (scope.accountModels?.length && scope.games?.length) return 4;
  if (scope.games?.length) return 3;
  if (scope.categories?.length) return 2;
  return scope.global ? 0 : 1;
}
function scopePriority(caseRecord, resolvedTargets) {
  const values = scopeValues(caseRecord.scope);
  if (entityConflict(resolvedTargets, values)) return -1_000_000;
  const overlap = resolvedTargets.filter((target) => values.has(target)).length;
  return overlap * 10_000 + (overlap ? scopeSpecificity(caseRecord.scope) * 100 : 0);
}
function wordJaccard(left, right) {
  const a = new Set(tokenize(left).filter((token) => token.length > 1));
  const b = new Set(tokenize(right).filter((token) => token.length > 1));
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const token of a) if (b.has(token)) overlap += 1;
  return overlap / (a.size + b.size - overlap);
}
function aggregate(values, mode) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => b - a);
  if (mode === 'max') return sorted[0];
  const count = mode === 'top2' ? 2 : 3;
  const top = sorted.slice(0, count);
  return top.reduce((sum, value) => sum + value, 0) / top.length;
}
export function aggregateExemplarScores(values, mode) { return aggregate(values, mode); }
export function routingScopePriority(caseRecord, resolvedTargets) { return scopePriority(caseRecord, resolvedTargets); }
function normalizeScores(entries) {
  const values = entries.map((entry) => entry.score);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return new Map(entries.map((entry) => [entry.id, max === min ? 0 : (entry.score - min) / (max - min)]));
}

export function buildRoutingIndexes(cases, exemplars) {
  const exemplarRecords = exemplars.map((record) => ({ id: record.id, displayName: record.text }));
  return { caseById: new Map(cases.map((record) => [record.id, record])), exemplarBm25: buildBm25Index(exemplarRecords), exemplars };
}

function exemplarCaseScores(query, resolvedTargets, indexes, similarity, aggregation) {
  const byCase = new Map();
  for (const [index, exemplar] of indexes.exemplars.entries()) {
    const exemplarEntities = exemplar.entityIds ?? [];
    if (entityConflict(resolvedTargets, exemplarEntities)) continue;
    const raw = similarity === 'bm25'
      ? bm25Score(indexes.exemplarBm25, query, indexes.exemplarBm25.docs[index])
      : similarity === 'character'
        ? characterDice(query, exemplar.text)
        : (characterDice(query, exemplar.text) * 0.58) + (wordJaccard(query, exemplar.text) * 0.42);
    const score = raw * (exemplar.weight ?? 1);
    for (const caseId of exemplar.caseIds ?? []) {
      if (!byCase.has(caseId)) byCase.set(caseId, []);
      byCase.get(caseId).push(score);
    }
  }
  return [...indexes.caseById.keys()].map((id) => ({ id, score: aggregate(byCase.get(id) ?? [], aggregation) }));
}

function rankWithMethod(query, cases, aliases, indexes, method, cache = new Map()) {
  const aliasMatches = resolveAliases(query, aliases);
  const resolvedTargets = [...new Set(aliasMatches.flatMap((match) => match.targetIds))];
  const nonCaseTargets = resolvedTargets.filter((id) => !id.startsWith('case.'));
  const routingSignals = firstTurnRoutingSignals(query);
  const cached = (key, build) => {
    const fullKey = `${query}\u0000${key}`;
    if (!cache.has(fullKey)) cache.set(fullKey, build());
    return cache.get(fullKey);
  };
  const documentRanking = cached('case-document', () => rankCases(query, cases, aliases, cases.length, 'lexical').results.map((entry) => ({ id: entry.id, score: entry.score })));
  const bm25Mode = method.includes('top2') ? 'top2' : method.includes('top3') ? 'top3' : 'max';
  const exemplarBm25 = cached(`bm25:${bm25Mode}`, () => exemplarCaseScores(query, nonCaseTargets, indexes, 'bm25', bm25Mode));
  const exemplarCharacter = cached(`character:${bm25Mode}`, () => exemplarCaseScores(query, nonCaseTargets, indexes, 'character', bm25Mode));
  const classifier = cached('classifier:top3', () => exemplarCaseScores(query, nonCaseTargets, indexes, 'classifier', 'top3'));
  const docNorm = normalizeScores(documentRanking);
  const bmNorm = normalizeScores(exemplarBm25);
  const charNorm = normalizeScores(exemplarCharacter);
  const classifierNorm = normalizeScores(classifier);
  const docRank = new Map(documentRanking.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).map((entry, index) => [entry.id, index + 1]));
  const bmRank = new Map(exemplarBm25.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).map((entry, index) => [entry.id, index + 1]));
  const charRank = new Map(exemplarCharacter.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).map((entry, index) => [entry.id, index + 1]));

  const ranked = cases.map((caseRecord) => {
    let score;
    if (method === 'case-document-bm25') score = docNorm.get(caseRecord.id) ?? 0;
    else if (method.startsWith('exemplar-bm25')) score = bmNorm.get(caseRecord.id) ?? 0;
    else if (method.startsWith('exemplar-character')) score = charNorm.get(caseRecord.id) ?? 0;
    else if (method === 'classifier-local-knn') score = classifierNorm.get(caseRecord.id) ?? 0;
    else if (method === 'fusion-rrf') score = (1 / (60 + (docRank.get(caseRecord.id) ?? cases.length))) + (1 / (60 + (bmRank.get(caseRecord.id) ?? cases.length))) + (1 / (60 + (charRank.get(caseRecord.id) ?? cases.length)));
    else if (method.includes('top3')) score = (docNorm.get(caseRecord.id) ?? 0) * 0.35 + (bmNorm.get(caseRecord.id) ?? 0) * 0.4 + (charNorm.get(caseRecord.id) ?? 0) * 0.25;
    else score = (docNorm.get(caseRecord.id) ?? 0) * 0.42 + (bmNorm.get(caseRecord.id) ?? 0) * 0.38 + (charNorm.get(caseRecord.id) ?? 0) * 0.2;
    if (method === 'fusion-signals') {
      const signalIndex = routingSignals.indexOf(caseRecord.id);
      if (signalIndex >= 0) score += 4 / (signalIndex + 1);
    }
    score += scopePriority(caseRecord, nonCaseTargets);
    return { id: caseRecord.id, score, record: caseRecord };
  }).filter((entry) => entry.score > -900_000).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return { ranked, resolvedTargets, candidateCount: ranked.length };
}

function classifyFailure(record, retrieved, resolvedTargets, caseById) {
  const expected = expectedIds(record);
  if (expected.some((id) => !caseById.has(id))) return 'missing_case';
  if (record.expected?.dynamicLookupIds?.length) return 'dynamic_route';
  if (record.expected?.escalation) return 'policy_route';
  if (expected.length > 1) return 'multi_intent';
  if ((record.expected?.entityIds ?? []).some((id) => !resolvedTargets.includes(id))) return 'entity_resolution';
  const first = caseById.get(retrieved[0]);
  const wanted = caseById.get(expected[0]);
  if (first?.scope?.global === true && wanted?.scope?.global !== true) return 'generic_case_overranked';
  if (entityConflict(record.expected?.entityIds ?? [], [...scopeValues(first?.scope)])) return 'wrong_case_scope';
  if (/\b(?:wont|cant|dont|didnt|pls|plz|ldr|acc|rn|idk|tryna|gonna|wanna|chezz|buye|payed)\b/i.test(record.query)) return 'synonym_or_slang';
  if (first?.family?.split('.')[0] === wanted?.family?.split('.')[0]) return 'lexical_ranking';
  return 'semantic_ranking';
}

function percentile(values, ratio) { return values.length ? values[Math.min(values.length - 1, Math.floor((values.length - 1) * ratio))] : 0; }
export function evaluateRoutingMethod(records, cases, aliases, indexes, method, cache = new Map()) {
  const reviewed = records.filter((record) => record.goldStatus === 'reviewed' && record.labelMethod === 'semantic_review_full_ticket');
  const caseById = indexes.caseById;
  let hit1 = 0; let hit3 = 0; let hit5 = 0; let rr = 0; let ndcg = 0; let entityEligible = 0; let entityCorrect = 0; let dynamicEligible = 0; let dynamicCorrect = 0; let policyEligible = 0; let policyCorrect = 0;
  const failures = {}; const details = []; const tokenValues = []; let candidates = 0; const start = performance.now();
  for (const record of reviewed) {
    const result = rankWithMethod(record.query, cases, aliases, indexes, method, cache);
    const ids = result.ranked.slice(0, 5).map((entry) => entry.id);
    const expected = new Set(expectedIds(record));
    const index = ids.findIndex((id) => expected.has(id));
    if (index === 0) hit1 += 1;
    if (index >= 0 && index < 3) hit3 += 1;
    if (index >= 0) hit5 += 1;
    if (index >= 0) rr += 1 / (index + 1);
    const dcg = ids.reduce((sum, id, position) => sum + (expected.has(id) ? 1 / Math.log2(position + 2) : 0), 0);
    const idealCount = Math.min(expected.size, 5);
    const idcg = Array.from({ length: idealCount }, (_, position) => 1 / Math.log2(position + 2)).reduce((sum, value) => sum + value, 0);
    ndcg += idcg ? dcg / idcg : 0;
    const expectedEntities = record.expected?.entityIds ?? [];
    if (expectedEntities.length) { entityEligible += 1; if (expectedEntities.every((id) => result.resolvedTargets.includes(id))) entityCorrect += 1; }
    if (record.expected?.dynamicLookupIds?.length) { dynamicEligible += 1; if (ids.some((id) => (caseById.get(id)?.dynamic ?? []).some((lookup) => record.expected.dynamicLookupIds.includes(lookup)))) dynamicCorrect += 1; }
    if (record.expected?.escalation) { policyEligible += 1; if (ids.some((id) => (caseById.get(id)?.escalationIds ?? []).length || (caseById.get(id)?.escalate ?? []).length)) policyCorrect += 1; }
    const contextTokens = Math.ceil(JSON.stringify(result.ranked.slice(0, 3).map((entry) => entry.record)).length / 4);
    tokenValues.push(contextTokens); candidates += result.candidateCount;
    const failureClass = index >= 0 ? null : classifyFailure(record, ids, result.resolvedTargets, caseById);
    if (failureClass) failures[failureClass] = (failures[failureClass] ?? 0) + 1;
    details.push({ id: record.id, query: record.query, expectedCaseIds: [...expected], retrievedCaseIds: ids, resolvedTargets: result.resolvedTargets, failureClass, contextTokens });
  }
  const elapsed = performance.now() - start; const n = Math.max(reviewed.length, 1); tokenValues.sort((a, b) => a - b);
  return {
    method, reviewedQueries: reviewed.length, recallAt1: hit1 / n, recallAt3: hit3 / n, recallAt5: hit5 / n, mrr: rr / n, ndcgAt5: ndcg / n,
    entityAccuracy: entityEligible ? entityCorrect / entityEligible : null,
    dynamicRouteAccuracy: dynamicEligible ? dynamicCorrect / dynamicEligible : null,
    policyRouteAccuracy: policyEligible ? policyCorrect / policyEligible : null,
    ambiguityAccuracy: null,
    averageCandidateCount: candidates / n,
    failureClasses: Object.fromEntries(['missing_case','wrong_case_scope','entity_resolution','synonym_or_slang','lexical_ranking','semantic_ranking','generic_case_overranked','multi_intent','dynamic_route','policy_route','ambiguity','gold_label_uncertain'].map((key) => [key, failures[key] ?? 0])),
    contextTokens: { average: tokenValues.reduce((sum, value) => sum + value, 0) / n, median: percentile(tokenValues, 0.5), p95: percentile(tokenValues, 0.95), workload: 'first_turn_retrieval' },
    latencyMs: { total: elapsed, averagePerQuery: elapsed / n }, details
  };
}

export async function evaluateFirstTurnRouting(options) {
  const dataDir = resolve(options.dataDir);
  const runtimeDir = join(dataDir, 'runtime-kb');
  const evaluationDir = join(dataDir, 'knowledge-canonical', 'Evaluation');
  const cases = await readJsonl(join(runtimeDir, 'cases.jsonl'));
  const aliases = buildAliasIndex(await readJson(join(runtimeDir, 'aliases.json')));
  const exemplars = await readJsonl(join(runtimeDir, 'routing-exemplars.jsonl'));
  const gold = await readJsonl(join(evaluationDir, 'historical-first-turn-gold.jsonl'));
  const indexes = buildRoutingIndexes(cases, exemplars);
  const methods = options.methods ?? ['case-document-bm25','exemplar-bm25-max','exemplar-bm25-top2','exemplar-bm25-top3','exemplar-character-max','exemplar-character-top2','exemplar-character-top3','fusion-max','fusion-top3','fusion-rrf','fusion-signals','classifier-local-knn'];
  const scoreCache = new Map();
  const results = methods.map((method) => evaluateRoutingMethod(gold, cases, aliases, indexes, method, scoreCache));
  const best = [...results].sort((a, b) => b.mrr - a.mrr || b.recallAt3 - a.recallAt3 || b.recallAt5 - a.recallAt5)[0];
  const report = { schemaVersion: 1, evaluatedAt: new Date().toISOString(), dataset: 'historical-first-turn-gold', caseCount: cases.length, routingExemplarCount: exemplars.length, methods: results, bestMethod: best.method, targets: { recallAt3: 0.9, recallAt5: 0.95, mrr: 0.8 }, targetsMet: best.recallAt3 >= 0.9 && best.recallAt5 >= 0.95 && best.mrr >= 0.8 };
  if (options.output) await writeJson(resolve(options.output), report);
  return report;
}

async function main() {
  const args = process.argv.slice(2); const dataIndex = args.indexOf('--data-dir'); const outputIndex = args.indexOf('--output');
  if (dataIndex === -1 || !args[dataIndex + 1]) throw new Error('--data-dir is required.');
  const result = await evaluateFirstTurnRouting({ dataDir: args[dataIndex + 1], output: outputIndex === -1 ? null : args[outputIndex + 1] });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { process.stderr.write(`${error.stack ?? error.message}\n`); process.exitCode = 1; });
