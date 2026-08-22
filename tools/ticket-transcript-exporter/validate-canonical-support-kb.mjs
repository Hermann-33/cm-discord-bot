#!/usr/bin/env node

import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, extname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_EXPECTED_FACTS = 3949;

function parseInteger(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
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
    expectedFacts: DEFAULT_EXPECTED_FACTS
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
      case '--expected-facts':
        options.expectedFacts = parseInteger(next(), '--expected-facts', { min: 1, max: 1_000_000 });
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
    'CM Canonical Support KB Validator',
    '',
    'Usage:',
    '  node validate-canonical-support-kb.mjs --data-dir <CM-Ticket-Transcripts> [options]',
    '',
    'Options:',
    `  --expected-facts <n>   Expected historical fact dispositions (default: ${DEFAULT_EXPECTED_FACTS}).`,
    '  --help                 Show this help text.'
  ].join('\n');
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
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

async function walkFiles(root) {
  if (!(await pathExists(root))) return [];
  const output = [];
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) output.push(full);
    }
  }
  await visit(root);
  return output.sort();
}

function slash(path) {
  return path.split(sep).join('/');
}

function collectIds(records, source, issues) {
  const ids = new Set();
  for (let index = 0; index < records.length; index += 1) {
    const id = records[index]?.id;
    if (typeof id !== 'string' || !id.trim()) {
      issues.push(`${source}[${index}] is missing a non-empty id.`);
      continue;
    }
    if (ids.has(id)) issues.push(`${source} contains duplicate id: ${id}`);
    ids.add(id);
  }
  return ids;
}

export function validateFactDispositions(records, expectedFacts = DEFAULT_EXPECTED_FACTS) {
  const issues = [];
  const allowed = new Set([
    'canonical',
    'merged_duplicate',
    'linked_related',
    'historical_only',
    'dynamic',
    'restricted',
    'unresolved',
    'noise'
  ]);
  const ids = new Set();

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const originalId = record?.original_fact_id ?? record?.originalFactId;
    if (typeof originalId !== 'string' || !originalId.trim()) {
      issues.push(`fact-disposition[${index}] missing original fact id.`);
    } else if (ids.has(originalId)) {
      issues.push(`fact-disposition contains duplicate original fact id: ${originalId}`);
    } else {
      ids.add(originalId);
    }

    if (!allowed.has(record?.disposition)) {
      issues.push(`fact-disposition[${index}] has invalid disposition: ${record?.disposition}`);
    }

    const targets = record?.canonical_target_ids ?? record?.canonicalTargetIds ?? [];
    if (!Array.isArray(targets)) issues.push(`fact-disposition[${index}] canonical targets must be an array.`);
    if (typeof record?.reason !== 'string' || !record.reason.trim()) {
      issues.push(`fact-disposition[${index}] must include a reason.`);
    }
  }

  if (records.length !== expectedFacts) {
    issues.push(`fact-disposition record count ${records.length} does not equal expected ${expectedFacts}.`);
  }
  if (ids.size !== expectedFacts) {
    issues.push(`unique original fact id count ${ids.size} does not equal expected ${expectedFacts}.`);
  }

  return { ok: issues.length === 0, issues, recordCount: records.length, uniqueOriginalFactIds: ids.size };
}

function privacyPatterns() {
  return [
    { name: 'email', regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
    { name: 'raw-url', regex: /https?:\/\/[^\s<>)\]}"']+/gi },
    { name: 'discord-snowflake-like', regex: /(?<![\d.])\d{17,20}(?![\d.])/g },
    { name: 'ethereum-wallet-like', regex: /\b0x[a-fA-F0-9]{40}\b/g },
    { name: 'bitcoin-wallet-like', regex: /\b(?:bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}\b/g },
    { name: 'long-secret-like-token', regex: /\b[A-Za-z0-9_-]{48,}\b/g }
  ];
}

export async function scanPrivacy(root) {
  const findings = [];
  const files = (await walkFiles(root)).filter((path) => ['.json', '.jsonl', '.md', '.txt'].includes(extname(path).toLowerCase()));
  const patterns = privacyPatterns();

  for (const file of files) {
    const text = await readFile(file, 'utf8');
    for (const pattern of patterns) {
      pattern.regex.lastIndex = 0;
      let match;
      while ((match = pattern.regex.exec(text)) !== null) {
        const prefix = text.slice(Math.max(0, match.index - 80), match.index);
        const knownDigest = /^[a-f0-9]{64}$/i.test(match[0]) && /"(?:configHash|frozenConfigHash|datasetSha256)"\s*:\s*"$/u.test(prefix);
        const knownRevision = /^[a-f0-9]{40}$/i.test(match[0]) && /"revision"\s*:\s*"$/u.test(prefix);
        if (knownDigest || knownRevision) continue;
        findings.push({
          file: slash(relative(root, file)),
          type: pattern.name,
          sample: match[0].slice(0, 120)
        });
        if (findings.length >= 200) return findings;
      }
    }
  }
  return findings;
}

export async function validateWikilinks(root) {
  if (!(await pathExists(root))) return { ok: false, issues: [`Missing directory: ${root}`], markdownFiles: 0, wikilinks: 0 };
  const markdownFiles = (await walkFiles(root)).filter((path) => extname(path).toLowerCase() === '.md');
  const byPath = new Set();
  const byBase = new Map();

  for (const file of markdownFiles) {
    const rel = slash(relative(root, file)).replace(/\.md$/i, '');
    byPath.add(rel.toLowerCase());
    const base = basename(rel).toLowerCase();
    byBase.set(base, (byBase.get(base) ?? 0) + 1);
  }

  const issues = [];
  let wikilinks = 0;
  const regex = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
  for (const file of markdownFiles) {
    const text = await readFile(file, 'utf8');
    let match;
    while ((match = regex.exec(text)) !== null) {
      wikilinks += 1;
      const target = match[1].trim().replace(/\\/g, '/').replace(/\.md$/i, '');
      const normalized = target.toLowerCase();
      if (byPath.has(normalized)) continue;
      const count = byBase.get(basename(normalized)) ?? 0;
      if (count === 1) continue;
      if (count > 1) issues.push(`${slash(relative(root, file))}: ambiguous wikilink [[${target}]]`);
      else issues.push(`${slash(relative(root, file))}: broken wikilink [[${target}]]`);
    }
  }

  return { ok: issues.length === 0, issues, markdownFiles: markdownFiles.length, wikilinks };
}

async function validateCanonicalGraph(canonicalDir) {
  const issues = [];
  const entitiesPath = join(canonicalDir, 'Audit', 'entities.json');
  const graphPath = join(canonicalDir, 'Audit', 'canonical-graph.json');
  const factsPath = join(canonicalDir, 'Audit', 'canonical-facts.jsonl');
  if (!(await pathExists(entitiesPath)) || !(await pathExists(graphPath)) || !(await pathExists(factsPath))) {
    return { ok: true, issues, nodeCount: 0, relationshipTargetsBroken: 0 };
  }
  const entityDocument = await readJson(entitiesPath);
  const graph = await readJson(graphPath);
  const facts = await readJsonl(factsPath);
  const entities = entityDocument.entities ?? entityDocument;
  const nodeCollections = ['symptoms', 'causes', 'diagnostics', 'procedures', 'outcomes', 'policies', 'exceptions', 'requirements', 'compatibility', 'contradictions', 'cases'];
  const allNodes = [...entities, ...nodeCollections.flatMap((key) => Array.isArray(graph[key]) ? graph[key] : [])];
  const ids = collectIds(allNodes, 'canonical nodes', issues);
  for (const fact of facts) ids.add(fact.id);
  const references = [];
  for (const entity of entities) for (const relationship of entity.relationships ?? []) references.push(['entity relationship', relationship.targetId]);
  for (const fact of facts) {
    references.push(['canonical fact subject', fact.subjectId]);
    if (fact.object?.entityId) references.push(['canonical fact object', fact.object.entityId]);
    for (const value of Object.values(fact.scope ?? {})) if (Array.isArray(value)) for (const id of value) references.push(['canonical fact scope', id]);
  }
  for (const item of graph.cases ?? []) {
    for (const id of [...(item.parentCaseIds ?? []), ...(item.specializesCaseIds ?? []), ...(item.relatedCaseIds ?? []), ...(item.requiresClarificationCaseIds ?? []), item.onSuccessCaseId, item.onFailureCaseId]) references.push(['canonical case transition', id]);
    for (const id of item.escalationIds ?? []) references.push(['canonical case escalation', id]);
  }
  for (const item of graph.cases ?? []) for (const id of item.escalationIds ?? []) ids.add(id);
  let broken = 0;
  for (const [source, id] of references) if (typeof id === 'string' && !ids.has(id)) { issues.push(`${source} has broken target: ${id}`); broken += 1; }
  return { ok: issues.length === 0, issues, nodeCount: allNodes.length + facts.length, relationshipTargetsBroken: broken };
}

function validateUniqueLedger(records, idField, expected, label) {
  const issues = [];
  const ids = new Set();
  for (let index = 0; index < records.length; index += 1) {
    const id = records[index]?.[idField];
    if (id === undefined || id === null || id === '') issues.push(`${label}[${index}] missing ${idField}.`);
    else if (ids.has(String(id))) issues.push(`${label} duplicate ${idField}: ${id}`);
    else ids.add(String(id));
  }
  if (records.length !== expected) issues.push(`${label} count ${records.length} does not equal ${expected}.`);
  if (ids.size !== expected) issues.push(`${label} unique ${idField} count ${ids.size} does not equal ${expected}.`);
  return { ok: issues.length === 0, issues, recordCount: records.length, uniqueIds: ids.size };
}

async function validateRuntimePack(runtimeDir) {
  const issues = [];
  const requiredJson = [
    'manifest.json',
    'catalog.json',
    'aliases.json',
    'product-profiles.json',
    'procedures.json',
    'policies.json',
    'routing.json',
    'dynamic-lookups.json',
    'escalations.json',
    'restricted-topics.json'
  ];
  const parsed = {};

  for (const name of requiredJson) {
    const path = join(runtimeDir, name);
    if (!(await pathExists(path))) {
      issues.push(`Missing runtime file: ${name}`);
      continue;
    }
    try {
      parsed[name] = await readJson(path);
    } catch (error) {
      issues.push(`Invalid runtime JSON ${name}: ${error.message}`);
    }
  }

  const casesPath = join(runtimeDir, 'cases.jsonl');
  let cases = [];
  if (!(await pathExists(casesPath))) {
    issues.push('Missing runtime file: cases.jsonl');
  } else {
    try {
      cases = await readJsonl(casesPath);
      collectIds(cases, 'runtime cases', issues);
    } catch (error) {
      issues.push(error.message);
    }
  }

  let referencesBroken = 0;
  if (cases.length > 0 && Object.keys(parsed).length === requiredJson.length) {
    const arrays = (name) => Array.isArray(parsed[name]) ? parsed[name] : [];
    const catalog = parsed['catalog.json'];
    const entityIds = new Set(['store.cm']);
    for (const key of ['games', 'vendors', 'categories', 'accountModels', 'accountListings']) for (const item of catalog[key] ?? []) if (item?.id) entityIds.add(item.id);
    const profiles = arrays('product-profiles.json');
    for (const profile of profiles) { entityIds.add(profile.id); for (const id of profile.variantIds ?? []) entityIds.add(id); }
    const caseIds = new Set(cases.map((item) => item.id));
    const procedureIds = new Set(arrays('procedures.json').map((item) => item.id));
    const policyIds = new Set(arrays('policies.json').map((item) => item.id));
    const dynamicIds = new Set(arrays('dynamic-lookups.json').map((item) => item.id));
    const escalationIds = new Set(arrays('escalations.json').map((item) => item.id));
    const outcomeIds = new Set(['outcome.resolved', 'outcome.context_resolved', 'outcome.explicit_failure', 'outcome.escalated', 'outcome.unconfirmed']);
    const check = (source, id, allowed) => { if (typeof id === 'string' && !allowed.has(id)) { issues.push(`${source} has broken runtime reference: ${id}`); referencesBroken += 1; } };
    for (const alias of arrays('aliases.json')) for (const id of alias.targets ?? []) check('alias', id, new Set([...entityIds, ...caseIds]));
    for (const profile of profiles) {
      if (profile.gameId) check('product profile game', profile.gameId, entityIds);
      check('product profile vendor', profile.vendorId, entityIds);
      for (const id of [...(profile.categoryIds ?? []), ...(profile.variantIds ?? []), ...(profile.accountModelIds ?? [])]) check('product profile scope', id, entityIds);
      for (const id of profile.caseIds ?? []) check('product profile case', id, caseIds);
      for (const id of profile.policyIds ?? []) check('product profile policy', id, policyIds);
    }
    for (const record of cases) {
      for (const value of Object.values(record.scope ?? {})) if (Array.isArray(value)) for (const id of value) check('case scope', id, entityIds);
      for (const id of record.ask ?? []) check('case diagnostic', id, new Set(arrays('procedures.json').flatMap((item) => item.steps ?? []).map((item) => item.id).concat(['diagnostic.rust.graphics_level', 'diagnostic.system.available_resources', 'diagnostic.loader.webview_present', 'diagnostic.order.reference_available', 'diagnostic.attachment.visual_required'])));
      for (const flow of record.flow ?? []) if (flow.procedureId) check('case procedure', flow.procedureId, procedureIds);
      for (const id of record.policies ?? []) check('case policy', id, policyIds);
      for (const id of record.dynamic ?? []) check('case dynamic lookup', id, dynamicIds);
      for (const id of [...(record.parentCaseIds ?? []), ...(record.specializesCaseIds ?? []), ...(record.relatedCaseIds ?? []), ...(record.requiresClarificationCaseIds ?? []), record.onSuccessCaseId, record.onFailureCaseId]) check('case transition', id, caseIds);
      for (const id of record.escalationIds ?? []) check('case escalation', id, escalationIds);
      for (const flow of record.flow ?? []) {
        for (const target of [flow.onSuccess, flow.onFailure]) {
          if (!target) continue;
          if (target.startsWith('case.')) check('case flow transition', target, caseIds);
          else if (target.startsWith('escalation.')) check('case flow escalation', target, escalationIds);
          else if (target.startsWith('outcome.')) check('case flow outcome', target, outcomeIds);
        }
      }
    }
    for (const route of parsed['routing.json'].caseRoutes ?? []) { check('route case', route.caseId, caseIds); for (const id of route.dynamicLookupIds ?? []) check('route dynamic lookup', id, dynamicIds); }
    for (const topic of arrays('restricted-topics.json')) if (topic.escalationId) check('restricted topic escalation', topic.escalationId, escalationIds);
  }

  return { ok: issues.length === 0, issues, caseCount: cases.length, filesParsed: Object.keys(parsed).length, referencesBroken };
}

export async function validateCanonicalSupportKb(options) {
  const canonicalDir = join(options.dataDir, 'knowledge-canonical');
  const runtimeDir = join(options.dataDir, 'runtime-kb');
  const dispositionPath = join(canonicalDir, 'Audit', 'fact-disposition.jsonl');

  const issues = [];
  let dispositions = { ok: false, issues: ['fact-disposition.jsonl not checked'], recordCount: 0, uniqueOriginalFactIds: 0 };
  if (!(await pathExists(dispositionPath))) {
    issues.push('Missing knowledge-canonical/Audit/fact-disposition.jsonl');
  } else {
    try {
      dispositions = validateFactDispositions(await readJsonl(dispositionPath), options.expectedFacts);
      issues.push(...dispositions.issues);
    } catch (error) {
      issues.push(error.message);
    }
  }

  const wikilinks = await validateWikilinks(canonicalDir);
  issues.push(...wikilinks.issues);

  const canonicalRelationships = await validateCanonicalGraph(canonicalDir);
  issues.push(...canonicalRelationships.issues);

  const caseCoverageRecords = await readJsonl(join(canonicalDir, 'Audit', 'case-coverage.jsonl'));
  const expectedTickets = options.expectedTickets ?? 1578;
  const caseCoverage = validateUniqueLedger(caseCoverageRecords, 'ticketNumber', expectedTickets, 'case coverage');
  const transcriptCoverage = validateUniqueLedger(caseCoverageRecords, 'transcriptId', expectedTickets, 'case coverage transcripts');
  const factRuntimeUsage = validateUniqueLedger(await readJsonl(join(canonicalDir, 'Audit', 'fact-runtime-usage.jsonl')), 'originalFactId', options.expectedFacts, 'fact runtime usage');
  issues.push(...caseCoverage.issues, ...transcriptCoverage.issues, ...factRuntimeUsage.issues);

  const runtime = await validateRuntimePack(runtimeDir);
  issues.push(...runtime.issues);

  const privacy = [];
  for (const root of [canonicalDir, runtimeDir]) {
    if (await pathExists(root)) privacy.push(...await scanPrivacy(root));
  }
  if (privacy.length > 0) issues.push(`Privacy scan found ${privacy.length} possible sensitive value(s); inspect validation output.`);

  return {
    schemaVersion: 1,
    validatedAt: new Date().toISOString(),
    expectedHistoricalFacts: options.expectedFacts,
    ok: issues.length === 0,
    issues,
    factDispositions: dispositions,
    canonicalWikilinks: wikilinks,
    canonicalRelationships,
    caseCoverage,
    transcriptCoverage,
    factRuntimeUsage,
    runtime,
    privacy
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${helpText()}\n`);
    return;
  }
  const result = await validateCanonicalSupportKb(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
