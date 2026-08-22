#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_MIN_QUERIES = 300;
const REQUIRED_BEHAVIOR_FAMILIES = new Set([
  'paraphrase',
  'typo_or_slang',
  'negation',
  'already_tried',
  'product_isolation',
  'variant_isolation',
  'account_model_isolation',
  'dynamic_state',
  'multi_turn',
  'ambiguity'
]);

function parseInteger(value, label, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!/^\d+$/.test(value ?? '')) throw new Error(`${label} must be an integer.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be between ${min} and ${max}.`);
  }
  return parsed;
}

export function parseArgs(argv) {
  const options = { dataDir: undefined, minQueries: DEFAULT_MIN_QUERIES };
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
      case '--min-queries':
        options.minQueries = parseInteger(next(), '--min-queries', { min: 1, max: 100_000 });
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
    'CM Canonical Support Evaluation Dataset Validator',
    '',
    'Usage:',
    '  node validate-canonical-support-evaluation.mjs --data-dir <CM-Ticket-Transcripts> [--min-queries 300]',
    '',
    'Validates sanitized gold query structure, required behavior families, unique IDs,',
    'case references, and obvious privacy leakage. No external service is called.'
  ].join('\n');
}

async function readJsonl(path) {
  const text = await readFile(path, 'utf8');
  const records = [];
  let lineNumber = 0;
  for (const line of text.split(/\r?\n/)) {
    lineNumber += 1;
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch (error) {
      throw new Error(`Invalid JSONL at ${path}:${lineNumber}: ${error.message}`);
    }
  }
  return records;
}

function asStrings(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()) : [];
}

function expected(record) {
  return record?.expected && typeof record.expected === 'object' ? record.expected : {};
}

function privacyFindings(text) {
  const checks = [
    ['email', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi],
    ['raw-url', /https?:\/\/[^\s<>)\]}"']+/gi],
    ['discord-snowflake-like', /(?<!\d)\d{17,20}(?!\d)/g],
    ['ethereum-wallet-like', /\b0x[a-fA-F0-9]{40}\b/g],
    ['long-secret-like-token', /\b[A-Za-z0-9_-]{48,}\b/g]
  ];
  const findings = [];
  for (const [type, regex] of checks) {
    regex.lastIndex = 0;
    const match = regex.exec(text);
    if (match) findings.push({ type, sample: match[0].slice(0, 120) });
  }
  return findings;
}

export function validateEvaluationRecords(records, runtimeCaseIds, minQueries = DEFAULT_MIN_QUERIES) {
  const issues = [];
  const ids = new Set();
  const behaviorFamilies = new Map();
  let privacyCount = 0;
  let dynamicExpectedCount = 0;
  let escalationExpectedCount = 0;

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const id = record?.id;
    if (typeof id !== 'string' || !id.trim()) issues.push(`query[${index}] missing id.`);
    else if (ids.has(id)) issues.push(`duplicate evaluation id: ${id}`);
    else ids.add(id);

    if (typeof record?.query !== 'string' || !record.query.trim()) issues.push(`query[${index}] missing query text.`);

    const gold = expected(record);
    const caseIds = asStrings(gold.caseIds ?? gold.case_ids);
    const acceptableCaseIds = asStrings(gold.acceptableCaseIds ?? gold.acceptable_case_ids);
    for (const caseId of [...caseIds, ...acceptableCaseIds]) {
      if (!runtimeCaseIds.has(caseId)) issues.push(`query ${id ?? index} references unknown runtime case: ${caseId}`);
    }

    if (!Array.isArray(gold.entityIds ?? gold.entity_ids ?? [])) issues.push(`query ${id ?? index} entityIds must be an array.`);
    if (!Array.isArray(gold.policyIds ?? gold.policy_ids ?? [])) issues.push(`query ${id ?? index} policyIds must be an array.`);
    if (!Array.isArray(gold.dynamicLookupIds ?? gold.dynamic_lookup_ids ?? [])) issues.push(`query ${id ?? index} dynamicLookupIds must be an array.`);
    if (!Array.isArray(gold.mustIncludeClaims ?? gold.must_include_claims ?? [])) issues.push(`query ${id ?? index} mustIncludeClaims must be an array.`);
    if (!Array.isArray(gold.mustNotIncludeClaims ?? gold.must_not_include_claims ?? [])) issues.push(`query ${id ?? index} mustNotIncludeClaims must be an array.`);
    if (!Array.isArray(gold.diagnosticIds ?? gold.diagnostic_ids ?? [])) issues.push(`query ${id ?? index} diagnosticIds must be an array.`);
    if (typeof gold.escalation !== 'boolean') issues.push(`query ${id ?? index} expected.escalation must be boolean.`);

    if (asStrings(gold.dynamicLookupIds ?? gold.dynamic_lookup_ids).length > 0) dynamicExpectedCount += 1;
    if (gold.escalation === true) escalationExpectedCount += 1;

    const family = record?.behaviorFamily ?? record?.behavior_family;
    if (typeof family === 'string' && family.trim()) {
      behaviorFamilies.set(family, (behaviorFamilies.get(family) ?? 0) + 1);
    }

    const sanitizedView = JSON.stringify({
      query: record?.query,
      conversationContext: record?.conversationContext ?? record?.conversation_context ?? [],
      expected: gold
    });
    const findings = privacyFindings(sanitizedView);
    privacyCount += findings.length;
    for (const finding of findings) issues.push(`query ${id ?? index} privacy candidate ${finding.type}: ${finding.sample}`);
  }

  if (records.length < minQueries) issues.push(`evaluation query count ${records.length} is below required minimum ${minQueries}.`);
  for (const family of REQUIRED_BEHAVIOR_FAMILIES) {
    if ((behaviorFamilies.get(family) ?? 0) === 0) issues.push(`missing required behavior family: ${family}`);
  }

  return {
    ok: issues.length === 0,
    issues,
    queryCount: records.length,
    uniqueQueryIds: ids.size,
    privacyFindingCount: privacyCount,
    dynamicExpectedCount,
    escalationExpectedCount,
    behaviorFamilies: Object.fromEntries([...behaviorFamilies.entries()].sort())
  };
}

export async function validateCanonicalSupportEvaluation(options) {
  const queryPath = join(options.dataDir, 'knowledge-canonical', 'Evaluation', 'queries.jsonl');
  const casesPath = join(options.dataDir, 'runtime-kb', 'cases.jsonl');
  const queries = await readJsonl(queryPath);
  const cases = await readJsonl(casesPath);
  const runtimeCaseIds = new Set(cases.map((record) => record?.id).filter((id) => typeof id === 'string' && id.trim()));
  return {
    schemaVersion: 1,
    validatedAt: new Date().toISOString(),
    runtimeCaseCount: runtimeCaseIds.size,
    ...validateEvaluationRecords(queries, runtimeCaseIds, options.minQueries)
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${helpText()}\n`);
    return;
  }
  const result = await validateCanonicalSupportEvaluation(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
