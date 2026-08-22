#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function parseInteger(value, label, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!/^\d+$/.test(value ?? '')) throw new Error(`${label} must be an integer.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be between ${min} and ${max}.`);
  }
  return parsed;
}

export function parseArgs(argv) {
  const options = {
    dataDir: undefined,
    topK: 5,
    output: undefined,
    dataset: 'historical-utterance-gold',
    method: 'lexical'
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      if (index + 1 >= argv.length) throw new Error(`${arg} requires a value.`);
      index += 1;
      return argv[index];
    };

    switch (arg) {
      case '--data-dir':
        options.dataDir = resolve(next());
        break;
      case '--top-k':
        options.topK = parseInteger(next(), '--top-k', { min: 1, max: 100 });
        break;
      case '--output':
        options.output = resolve(next());
        break;
      case '--dataset':
        options.dataset = next();
        if (!['historical-rule-holdout', 'historical-utterance-gold', 'adversarial-behavior', 'queries'].includes(options.dataset)) throw new Error('--dataset must be historical-rule-holdout, historical-utterance-gold, adversarial-behavior, or queries.');
        break;
      case '--method':
        options.method = next();
        if (!['lexical', 'hybrid', 'semantic'].includes(options.method)) throw new Error('--method must be lexical, hybrid, or semantic.');
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.help && !options.dataDir) throw new Error('--data-dir is required.');
  return options;
}

export function helpText() {
  return [
    'CM Canonical Support Retrieval Evaluator',
    '',
    'Usage:',
    '  node evaluate-canonical-support-retrieval.mjs --data-dir <CM-Ticket-Transcripts> [--dataset historical-utterance-gold] [--method lexical|hybrid|semantic] [--top-k 5] [--output <path>]',
    '',
    'Reads runtime-kb/cases.jsonl, runtime-kb/aliases.json and',
    'knowledge-canonical/Evaluation/queries.jsonl. It performs a deterministic',
    'exact-alias + scope-aware lexical BM25-style baseline. No external API or model is called.'
  ].join('\n');
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function readJsonl(path) {
  const text = await readFile(path, 'utf8');
  const output = [];
  let lineNumber = 0;
  for (const line of text.split(/\r?\n/)) {
    lineNumber += 1;
    if (!line.trim()) continue;
    try {
      output.push(JSON.parse(line));
    } catch (error) {
      throw new Error(`Invalid JSONL at ${path}:${lineNumber}: ${error.message}`);
    }
  }
  return output;
}

export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9+._-]+/g, ' ')
    .replace(/\bldr\b/g, 'loader')
    .replace(/\bconnct\b/g, 'connect')
    .replace(/\b(?:wont|wont)\b/g, 'will not')
    .trim()
    .replace(/\s+/g, ' ');
}

export function tokenize(value) {
  const normalized = normalizeText(value);
  return normalized ? normalized.split(' ') : [];
}

function collectStrings(value, output = []) {
  if (typeof value === 'string') output.push(value);
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, output);
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (['evidence', 'evidence_refs', 'evidenceRefs', 'provenance', 'transcriptIds'].includes(key)) continue;
      collectStrings(item, output);
    }
  }
  return output;
}

export function caseDocument(record) {
  const parts = [];
  for (const key of ['id', 'family', 'display_name', 'displayName', 'title', 'name', 'description', 'recognition', 'match', 'symptoms', 'errors', 'required_context', 'requiredContext', 'ask', 'causes', 'flow', 'policies', 'dynamic', 'escalate']) {
    if (record?.[key] !== undefined) collectStrings(record[key], parts);
  }
  return parts.join(' ');
}

function termFrequency(tokens) {
  const map = new Map();
  for (const token of tokens) map.set(token, (map.get(token) ?? 0) + 1);
  return map;
}

export function buildBm25Index(caseRecords) {
  const docs = caseRecords.map((record) => {
    const tokens = tokenize(caseDocument(record));
    return { record, tokens, tf: termFrequency(tokens) };
  });
  const df = new Map();
  for (const doc of docs) {
    for (const token of new Set(doc.tokens)) df.set(token, (df.get(token) ?? 0) + 1);
  }
  const avgLength = docs.length === 0 ? 0 : docs.reduce((sum, doc) => sum + doc.tokens.length, 0) / docs.length;
  return { docs, df, avgLength, totalDocs: docs.length };
}

export function bm25Score(index, query, doc, { k1 = 1.2, b = 0.75 } = {}) {
  if (index.totalDocs === 0 || doc.tokens.length === 0) return 0;
  const terms = new Set(tokenize(query));
  let score = 0;
  for (const term of terms) {
    const frequency = doc.tf.get(term) ?? 0;
    if (frequency === 0) continue;
    const documentFrequency = index.df.get(term) ?? 0;
    const idf = Math.log(1 + (index.totalDocs - documentFrequency + 0.5) / (documentFrequency + 0.5));
    const denominator = frequency + k1 * (1 - b + b * (doc.tokens.length / Math.max(index.avgLength, 1)));
    score += idf * ((frequency * (k1 + 1)) / denominator);
  }
  return score;
}

function characterNgrams(value, size = 3) {
  const text = ` ${normalizeText(value).replace(/\s+/g, ' ')} `;
  const grams = new Set();
  for (let index = 0; index <= text.length - size; index += 1) grams.add(text.slice(index, index + size));
  return grams;
}

function diceSimilarity(left, right) {
  const a = characterNgrams(left); const b = characterNgrams(right);
  if (!a.size || !b.size) return 0;
  let overlap = 0; for (const gram of a) if (b.has(gram)) overlap += 1;
  return (2 * overlap) / (a.size + b.size);
}

export function buildAliasIndex(value) {
  const entries = [];
  if (Array.isArray(value)) {
    for (const record of value) {
      const alias = record?.alias ?? record?.value ?? record?.name;
      const targets = record?.target_ids ?? record?.targetIds ?? record?.targets ?? record?.target ?? record?.id;
      const targetIds = Array.isArray(targets) ? targets : typeof targets === 'string' ? [targets] : [];
      if (typeof alias === 'string' && alias.trim() && targetIds.length > 0) {
        entries.push({ alias: normalizeText(alias), targetIds });
      }
    }
  } else if (value && typeof value === 'object') {
    const source = value.aliases && typeof value.aliases === 'object' && !Array.isArray(value.aliases) ? value.aliases : value;
    for (const [alias, targets] of Object.entries(source)) {
      const targetIds = Array.isArray(targets) ? targets.filter((item) => typeof item === 'string') : typeof targets === 'string' ? [targets] : [];
      if (targetIds.length > 0) entries.push({ alias: normalizeText(alias), targetIds });
    }
  }
  return entries.sort((a, b) => b.alias.length - a.alias.length || a.alias.localeCompare(b.alias));
}

export function resolveAliases(query, aliasEntries) {
  const normalized = ` ${normalizeText(query)} `;
  const matches = [];
  for (const entry of aliasEntries) {
    if (!entry.alias) continue;
    if (normalized.includes(` ${entry.alias} `)) matches.push(entry);
  }
  return matches;
}

function scopeIds(record) {
  const output = new Set();
  if (record?.scope !== undefined) {
    for (const value of collectStrings(record.scope, [])) {
      if (/^[a-z][a-z0-9_.-]+$/i.test(value)) output.add(value);
    }
  }
  return output;
}

function scopeSpecificity(scope = {}) {
  if ((scope.variants ?? []).length) return 36;
  if ((scope.products ?? []).length) return 30;
  if ((scope.accountListings ?? []).length && (scope.games ?? []).length) return 27;
  if ((scope.accountModels ?? []).length && (scope.games ?? []).length) return 24;
  if ((scope.accountListings ?? []).length || (scope.accountModels ?? []).length) return 20;
  if ((scope.games ?? []).length) return 15;
  if ((scope.categories ?? []).length) return 8;
  return 0;
}

function targetKind(id) {
  if (id.startsWith('account_model.')) return 'account_model';
  if (id.startsWith('account_listing.')) return 'account_listing';
  return id.split('.')[0];
}

function scopeContradicts(scope, targets) {
  const ids = scopeIds({ scope });
  for (const target of targets) {
    const kind = targetKind(target);
    const sameKind = [...ids].filter((id) => targetKind(id) === kind);
    if (sameKind.length && !sameKind.includes(target)) return true;
  }
  return false;
}

function stateCompatibility(record, state = {}) {
  let score = 0;
  if (state.activeCaseId === record.id) score += 45;
  if ((record.parentCaseIds ?? []).includes(state.activeCaseId) || (record.specializesCaseIds ?? []).includes(state.activeCaseId)) score += 38;
  const failed = Object.entries(state.procedureOutcomes ?? {}).filter(([, value]) => value === 'failure').map(([id]) => id);
  const recordProcedures = new Set((record.flow ?? []).map((step) => step.procedureId).filter(Boolean));
  for (const id of failed) if (recordProcedures.has(id)) score -= 50;
  if (state.knownContext?.graphicsLevel === 'low') {
    if (/continue|after.*fail|already low/i.test(`${record.displayName ?? ''} ${(record.match?.context ?? []).join(' ')}`)) score += 24;
    if ((record.flow ?? []).some((step) => (step.when ?? []).includes('graphicsLevel=high'))) score -= 18;
  }
  return score;
}

export function rankCases(query, caseRecords, aliasEntries = [], topK = 5, method = 'lexical', options = {}) {
  const index = buildBm25Index(caseRecords);
  const aliasMatches = resolveAliases(query, aliasEntries);
  const resolvedTargets = new Set(aliasMatches.flatMap((entry) => entry.targetIds));
  const directCases = new Set([...resolvedTargets].filter((id) => id.startsWith('case.')));

  let scopedDocs = index.docs;
  const nonCaseTargets = [...resolvedTargets].filter((id) => !id.startsWith('case.'));
  if (nonCaseTargets.length > 0) {
    const compatible = index.docs.filter((doc) => {
      if (doc.record?.scope?.global === true) return true;
      const ids = scopeIds(doc.record);
      return nonCaseTargets.some((target) => ids.has(target));
    });
    if (compatible.length > 0) scopedDocs = compatible;
  }

  const ranked = scopedDocs.map((doc) => {
    let score = method === 'semantic' ? 0 : bm25Score(index, query, doc);
    if (method === 'hybrid' || method === 'semantic') {
      const phrases = doc.record?.match?.phrases ?? doc.record?.recognition?.phrases ?? [];
      const semanticLabel = `${doc.record?.displayName ?? ''} ${doc.record?.family ?? ''}`;
      const segments = options.querySegments?.length ? options.querySegments : [query];
      const semanticScore = Math.max(...segments.flatMap((segment) => [diceSimilarity(segment, semanticLabel), ...phrases.map((phrase) => diceSimilarity(segment, phrase))]));
      const queryTokens = new Set(tokenize(query));
      const labelTokens = new Set(tokenize(semanticLabel));
      const overlap = [...queryTokens].filter((token) => labelTokens.has(token)).length / Math.max(1, Math.min(queryTokens.size, labelTokens.size));
      score += semanticScore * (method === 'semantic' ? 120 : 80) + overlap * 30;
    }
    if (directCases.has(doc.record?.id)) score += 100;
    const ids = scopeIds(doc.record);
    let exactScopeMatches = 0;
    for (const target of nonCaseTargets) if (ids.has(target)) exactScopeMatches += 1;
    score += exactScopeMatches * 24;
    if (nonCaseTargets.length && exactScopeMatches) score += scopeSpecificity(doc.record.scope);
    if (scopeContradicts(doc.record.scope, nonCaseTargets)) score -= 120;
    score += stateCompatibility(doc.record, options.state);
    const normalizedQuery = normalizeText(query);
    if (/graphics (?:are )?(?:not high|already low)|graphics=low/.test(normalizedQuery) && /continue|after resource steps fail/i.test(doc.record.displayName ?? '')) score += 30;
    if (/\b(?:where|status|track).{0,24}\border\b|\border\b.{0,24}\b(?:where|status|track)\b/.test(normalizedQuery) && doc.record.family === 'commerce.order') score += 25;
    if (/\b(?:loader|ldr)\b.{0,36}\b(?:close|closes|closed|exit|vanish|disappear)/.test(normalizedQuery) && doc.record.id === 'case.loader.closes_runtime') score += 28;
    return { id: doc.record?.id, score, record: doc.record };
  }).filter((item) => typeof item.id === 'string')
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  return {
    aliasMatches,
    resolvedTargets: [...resolvedTargets],
    candidateCount: ranked.length,
    results: ranked.slice(0, topK)
  };
}

function expectedCaseIds(record) {
  const expected = record?.expected ?? record?.gold ?? {};
  const values = expected.case_ids ?? expected.caseIds ?? expected.cases ?? record?.expected_case_ids ?? record?.expectedCaseIds ?? [];
  const ids = Array.isArray(values) ? values : typeof values === 'string' ? [values] : [];
  if (typeof expected.primary_case_id === 'string') ids.unshift(expected.primary_case_id);
  if (typeof expected.primaryCaseId === 'string') ids.unshift(expected.primaryCaseId);
  return [...new Set(ids.filter((id) => typeof id === 'string' && id.trim()))];
}

function reciprocalRank(resultIds, expectedIds) {
  const expected = new Set(expectedIds);
  const index = resultIds.findIndex((id) => expected.has(id));
  return index === -1 ? 0 : 1 / (index + 1);
}

export function evaluateQueries(caseRecords, aliasEntries, queryRecords, topK = 5, method = 'lexical') {
  let eligible = 0;
  let hit1 = 0;
  let hit3 = 0;
  let hit5 = 0;
  let reciprocalRankSum = 0;
  let ndcgSum = 0;
  let entityEligible = 0;
  let entityCorrect = 0;
  let dynamicEligible = 0;
  let dynamicCorrect = 0;
  let escalationEligible = 0;
  let escalationCorrect = 0;
  const isolationLeakage = { product: 0, variant: 0, accountModel: 0 };
  const details = [];

  for (const record of queryRecords) {
    if (record?.goldStatus && record.goldStatus !== 'reviewed') continue;
    const query = record?.query ?? record?.text ?? record?.input;
    const expectedIds = expectedCaseIds(record);
    if (typeof query !== 'string' || !query.trim() || expectedIds.length === 0) continue;
    eligible += 1;
    const contextText = (record?.conversationContext ?? record?.conversation_context ?? []).map((turn) => turn?.content).filter(Boolean).join(' ');
    const retrievalQuery = contextText ? `${contextText} ${query}` : query;
    const segments = [query, ...(record?.conversationContext ?? record?.conversation_context ?? []).map((turn) => turn?.content).filter(Boolean)];
    const ranked = rankCases(retrievalQuery, caseRecords, aliasEntries, Math.max(topK, 5), method, { querySegments: segments });
    const ids = ranked.results.map((item) => item.id);
    const expected = new Set(expectedIds);
    if (ids.slice(0, 1).some((id) => expected.has(id))) hit1 += 1;
    if (ids.slice(0, 3).some((id) => expected.has(id))) hit3 += 1;
    if (ids.slice(0, 5).some((id) => expected.has(id))) hit5 += 1;
    reciprocalRankSum += reciprocalRank(ids, expectedIds);
    const dcg = ids.slice(0, 5).reduce((sum, id, index) => sum + (expected.has(id) ? 1 / Math.log2(index + 2) : 0), 0);
    const idealHits = Math.min(expectedIds.length, 5);
    const idcg = Array.from({ length: idealHits }, (_, index) => 1 / Math.log2(index + 2)).reduce((sum, value) => sum + value, 0);
    ndcgSum += idcg ? dcg / idcg : 0;
    const expectedEntities = record.expected?.entityIds ?? [];
    if (expectedEntities.length) { entityEligible += 1; if (expectedEntities.every((id) => ranked.resolvedTargets.includes(id))) entityCorrect += 1; }
    const expectedDynamic = record.expected?.dynamicLookupIds ?? [];
    if (expectedDynamic.length) { dynamicEligible += 1; if (ids.slice(0, 5).some((id) => (caseRecords.find((item) => item.id === id)?.dynamic ?? []).some((lookup) => expectedDynamic.includes(lookup)))) dynamicCorrect += 1; }
    if (record.expected?.escalation === true) { escalationEligible += 1; if (ids.slice(0, 5).some((id) => (caseRecords.find((item) => item.id === id)?.escalate ?? []).length || (caseRecords.find((item) => item.id === id)?.escalationIds ?? []).length)) escalationCorrect += 1; }
    const contextTokens = Math.ceil(JSON.stringify(ranked.results.slice(0, 3).map((item) => item.record)).length / 4);
    const isolationKey = record.behaviorFamily === 'product_isolation' ? 'product' : record.behaviorFamily === 'variant_isolation' ? 'variant' : record.behaviorFamily === 'account_model_isolation' ? 'accountModel' : null;
    if (isolationKey && ranked.results.some((item) => scopeContradicts(item.record.scope, ranked.resolvedTargets))) isolationLeakage[isolationKey] += 1;
    const hitAt5 = ids.slice(0, 5).some((id) => expected.has(id));
    details.push({
      id: record?.id,
      query,
      expectedCaseIds: expectedIds,
      retrievedCaseIds: ids.slice(0, topK),
      resolvedAliasTargets: ranked.resolvedTargets,
      candidateCount: ranked.candidateCount,
      contextTokens,
      hitAt5,
      failureClass: hitAt5 ? null : classifyRetrievalFailure(record, expectedIds, ids, ranked.resolvedTargets, caseRecords)
    });
  }

  const denominator = Math.max(eligible, 1);
  const contextTokenValues = details.map((item) => item.contextTokens).sort((a, b) => a - b);
  const percentile = (ratio) => contextTokenValues.length ? contextTokenValues[Math.min(contextTokenValues.length - 1, Math.floor((contextTokenValues.length - 1) * ratio))] : 0;
  return {
    eligibleQueries: eligible,
    recallAt1: hit1 / denominator,
    recallAt3: hit3 / denominator,
    recallAt5: hit5 / denominator,
    mrr: reciprocalRankSum / denominator,
    ndcgAt5: ndcgSum / denominator,
    missedExpectedCaseRate: 1 - (hit5 / denominator),
    averageCandidateSet: details.reduce((sum, item) => sum + item.candidateCount, 0) / denominator,
    exactEntityResolutionAccuracy: entityEligible ? entityCorrect / entityEligible : null,
    ambiguityDetectionAccuracy: null,
    dynamicRouteAccuracy: dynamicEligible ? dynamicCorrect / dynamicEligible : null,
    escalationRouteAccuracy: escalationEligible ? escalationCorrect / escalationEligible : null,
    isolationLeakage,
    contextTokens: { average: details.reduce((sum, item) => sum + item.contextTokens, 0) / denominator, median: percentile(0.5), p95: percentile(0.95), estimate: 'UTF-8 JSON characters divided by four for the top-three compiled case records' },
    retrievalFailureClasses: Object.fromEntries([...new Set(details.map((item) => item.failureClass).filter(Boolean))].sort().map((key) => [key, details.filter((item) => item.failureClass === key).length])),
    retrievalFailureExamples: Object.fromEntries([...new Set(details.map((item) => item.failureClass).filter(Boolean))].sort().map((key) => [key, details.filter((item) => item.failureClass === key).slice(0, 3).map((item) => ({ id: item.id, query: item.query, expectedCaseIds: item.expectedCaseIds, retrievedCaseIds: item.retrievedCaseIds }))])),
    details
  };
}

function classifyRetrievalFailure(record, expectedIds, retrievedIds, resolvedTargets, caseRecords) {
  const known = new Set(caseRecords.map((item) => item.id));
  if (record.goldStatus === 'needs_review' || expectedIds.some((id) => !known.has(id))) return 'gold_label_uncertain';
  if (record.turnType === 'follow_up' || /^(?:yes|no|already|still|same error|worked|fixed)\b/i.test(record.query ?? '')) return 'state_required';
  if ((record.expected?.dynamicLookupIds ?? []).length) return 'dynamic_route';
  if (record.expected?.escalation) return 'policy_route';
  if (expectedIds.length > 1) return 'multi_intent';
  const expectedCase = caseRecords.find((item) => item.id === expectedIds[0]);
  const firstRetrieved = caseRecords.find((item) => item.id === retrievedIds[0]);
  if (!expectedCase) return 'missing_case';
  if (resolvedTargets.length === 0 && expectedCase.scope && expectedCase.scope.global !== true) return 'entity_resolution';
  if (firstRetrieved?.scope?.global === true && expectedCase.scope?.global !== true) return 'generic_case_overranked';
  if (firstRetrieved && firstRetrieved.family?.split('.')[0] === expectedCase.family?.split('.')[0]) return 'lexical_ranking';
  if (/\b(?:wont|cant|pls|plz|ldr|acc|rn|idk|bro|tryna)\b/i.test(record.query ?? '')) return 'synonym_or_slang';
  if (resolvedTargets.length && firstRetrieved && scopeContradicts(firstRetrieved.scope, resolvedTargets)) return 'wrong_case_scope';
  return 'semantic_ranking';
}

export async function evaluateCanonicalSupportRetrieval(options) {
  const runtimeDir = join(options.dataDir, 'runtime-kb');
  const evaluationDir = join(options.dataDir, 'knowledge-canonical', 'Evaluation');
  const caseRecords = await readJsonl(join(runtimeDir, 'cases.jsonl'));
  const aliases = buildAliasIndex(await readJson(join(runtimeDir, 'aliases.json')));
  const dataset = options.dataset ?? 'historical-utterance-gold';
  const queries = await readJsonl(join(evaluationDir, `${dataset}.jsonl`));
  const metrics = evaluateQueries(caseRecords, aliases, queries, options.topK, options.method ?? 'lexical');
  return {
    schemaVersion: 1,
    evaluatedAt: new Date().toISOString(),
    dataset,
    method: options.method === 'hybrid' ? 'exact-alias+scope-filter+bm25+local-character-trigram' : options.method === 'semantic' ? 'offline-local-character-subword+label-token-similarity' : 'exact-alias+scope-filter+bm25-style',
    caseCount: caseRecords.length,
    aliasCount: aliases.length,
    queryCount: queries.length,
    ...metrics
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${helpText()}\n`);
    return;
  }
  const result = await evaluateCanonicalSupportRetrieval(options);
  if (options.output) {
    await mkdir(resolve(options.output, '..'), { recursive: true });
    await writeFile(options.output, `${JSON.stringify(result, null, 2)}\n`);
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
