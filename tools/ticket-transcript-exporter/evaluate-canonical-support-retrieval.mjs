#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
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
    topK: 5
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
    '  node evaluate-canonical-support-retrieval.mjs --data-dir <CM-Ticket-Transcripts> [--top-k 5]',
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
  for (const key of ['id', 'display_name', 'displayName', 'title', 'name', 'description', 'recognition', 'symptoms', 'errors', 'required_context', 'requiredContext']) {
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

export function rankCases(query, caseRecords, aliasEntries = [], topK = 5) {
  const index = buildBm25Index(caseRecords);
  const aliasMatches = resolveAliases(query, aliasEntries);
  const resolvedTargets = new Set(aliasMatches.flatMap((entry) => entry.targetIds));
  const directCases = new Set([...resolvedTargets].filter((id) => id.startsWith('case.')));

  let scopedDocs = index.docs;
  const nonCaseTargets = [...resolvedTargets].filter((id) => !id.startsWith('case.'));
  if (nonCaseTargets.length > 0) {
    const compatible = index.docs.filter((doc) => {
      const ids = scopeIds(doc.record);
      return nonCaseTargets.some((target) => ids.has(target));
    });
    if (compatible.length > 0) scopedDocs = compatible;
  }

  const ranked = scopedDocs.map((doc) => {
    let score = bm25Score(index, query, doc);
    if (directCases.has(doc.record?.id)) score += 100;
    const ids = scopeIds(doc.record);
    for (const target of nonCaseTargets) if (ids.has(target)) score += 5;
    return { id: doc.record?.id, score, record: doc.record };
  }).filter((item) => typeof item.id === 'string')
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  return {
    aliasMatches,
    resolvedTargets: [...resolvedTargets],
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

export function evaluateQueries(caseRecords, aliasEntries, queryRecords, topK = 5) {
  let eligible = 0;
  let hit1 = 0;
  let hit3 = 0;
  let hit5 = 0;
  let reciprocalRankSum = 0;
  const details = [];

  for (const record of queryRecords) {
    const query = record?.query ?? record?.text ?? record?.input;
    const expectedIds = expectedCaseIds(record);
    if (typeof query !== 'string' || !query.trim() || expectedIds.length === 0) continue;
    eligible += 1;
    const ranked = rankCases(query, caseRecords, aliasEntries, Math.max(topK, 5));
    const ids = ranked.results.map((item) => item.id);
    const expected = new Set(expectedIds);
    if (ids.slice(0, 1).some((id) => expected.has(id))) hit1 += 1;
    if (ids.slice(0, 3).some((id) => expected.has(id))) hit3 += 1;
    if (ids.slice(0, 5).some((id) => expected.has(id))) hit5 += 1;
    reciprocalRankSum += reciprocalRank(ids, expectedIds);
    details.push({
      id: record?.id,
      query,
      expectedCaseIds: expectedIds,
      retrievedCaseIds: ids.slice(0, topK),
      resolvedAliasTargets: ranked.resolvedTargets
    });
  }

  const denominator = Math.max(eligible, 1);
  return {
    eligibleQueries: eligible,
    recallAt1: hit1 / denominator,
    recallAt3: hit3 / denominator,
    recallAt5: hit5 / denominator,
    mrr: reciprocalRankSum / denominator,
    details
  };
}

export async function evaluateCanonicalSupportRetrieval(options) {
  const runtimeDir = join(options.dataDir, 'runtime-kb');
  const evaluationDir = join(options.dataDir, 'knowledge-canonical', 'Evaluation');
  const caseRecords = await readJsonl(join(runtimeDir, 'cases.jsonl'));
  const aliases = buildAliasIndex(await readJson(join(runtimeDir, 'aliases.json')));
  const queries = await readJsonl(join(evaluationDir, 'queries.jsonl'));
  const metrics = evaluateQueries(caseRecords, aliases, queries, options.topK);
  return {
    schemaVersion: 1,
    evaluatedAt: new Date().toISOString(),
    method: 'exact-alias+scope-filter+bm25-style',
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
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
