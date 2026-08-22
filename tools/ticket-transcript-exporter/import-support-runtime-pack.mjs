import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PUBLIC_SUPPORT_RUNTIME_ARTIFACTS = Object.freeze([
  'action-routing.json',
  'aliases.json',
  'cases.json',
  'catalog.json',
  'clarifications.json',
  'dynamic-lookups.json',
  'escalations.json',
  'policies.json',
  'procedures.json',
  'product-profiles.json',
  'restricted-topics.json',
  'routing.json'
]);

const PRIVATE_INPUT_FILES = Object.freeze({
  'action-routing.json': 'action-routing.json',
  'aliases.json': 'aliases.json',
  'cases.json': 'cases.jsonl',
  'catalog.json': 'catalog.json',
  'clarifications.json': 'clarifications.json',
  'dynamic-lookups.json': 'dynamic-lookups.json',
  'escalations.json': 'escalations.json',
  'policies.json': 'policies.json',
  'procedures.json': 'procedures.json',
  'product-profiles.json': 'product-profiles.json',
  'restricted-topics.json': 'restricted-topics.json',
  'routing.json': 'routing.json'
});

const FORBIDDEN_KEY = /(?:provenance|evidence|transcript|historicalfact|source(ref|id)|canonicalrefs|outcomeevidence)/iu;
const FORBIDDEN_STRING = /(?:\bfact\.\d+\b|\btranscript[_ .-]?(?:id|ids)?\b|\b[\w.%+-]+@[\w.-]+\.[a-z]{2,}\b|<@!?\d{5,32}>|(?<!\d)\d{17,20}(?!\d)|\bsk-or-[A-Za-z0-9_-]{12,}\b|\b(?:CM|ORDER)-[A-Za-z0-9-]{4,}\b|https?:\/\/[^\s<>()]+|\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b)/iu;
const CREDENTIAL_TOKEN = /(?<![A-Za-z0-9_.-])[A-Za-z0-9_-]{32,}(?![A-Za-z0-9_.-])/gu;

const select = (record, keys) => Object.fromEntries(keys.filter((key) => record[key] !== undefined).map((key) => [key, record[key]]));

function sanitizeCase(record) {
  const result = select(record, [
    'id', 'displayName', 'family', 'scope', 'ask', 'causes', 'flow', 'policies', 'dynamic',
    'parentCaseIds', 'specializesCaseIds', 'relatedCaseIds', 'onSuccessCaseId', 'onFailureCaseId',
    'requiresClarificationCaseIds', 'escalationIds', 'escalate'
  ]);
  result.match = select(record.match ?? {}, ['phrases', 'symptoms', 'errors']);
  return result;
}

function sanitizePolicy(record) {
  return select(record, ['id', 'displayName', 'scope', 'authority', 'rule', 'conditions', 'exceptionIds', 'dynamicRequirements', 'escalateWhen']);
}

function sanitizeProcedure(record) {
  return select(record, ['id', 'displayName', 'scope', 'steps', 'restricted']);
}

function assertSafe(value, pointer = '$') {
  if (typeof value === 'string') {
    if (FORBIDDEN_STRING.test(value)) throw new Error(`Forbidden private/evidence value in runtime pack at ${pointer}`);
    for (const token of value.match(CREDENTIAL_TOKEN) ?? []) {
      if (/[a-z]/iu.test(token) && /\d/u.test(token)) {
        throw new Error(`Credential-like value in runtime pack at ${pointer}`);
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafe(item, `${pointer}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(key)) throw new Error(`Forbidden private/evidence field in runtime pack at ${pointer}.${key}`);
    assertSafe(child, `${pointer}.${key}`);
  }
}

function parseJsonLines(raw, file) {
  return raw.split(/\r?\n/u).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); }
    catch { throw new Error(`Invalid JSONL in ${file} at line ${index + 1}`); }
  });
}

function transform(publicFile, value) {
  if (publicFile === 'cases.json') return value.map(sanitizeCase);
  if (publicFile === 'policies.json') return value.map(sanitizePolicy);
  if (publicFile === 'procedures.json') return value.map(sanitizeProcedure);
  return value;
}

function recordCount(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object' && Array.isArray(value.caseRoutes)) return value.caseRoutes.length;
  return 1;
}

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value) => createHash('sha256').update(value, 'utf8').digest('hex');

export async function importSupportRuntimePack({ sourceDirectory, outputDirectory }) {
  if (!sourceDirectory || !outputDirectory) throw new Error('sourceDirectory and outputDirectory are required');
  const source = path.resolve(sourceDirectory);
  const output = path.resolve(outputDirectory);
  await mkdir(output, { recursive: true });

  const artifacts = [];
  for (const publicFile of PUBLIC_SUPPORT_RUNTIME_ARTIFACTS) {
    const privateFile = PRIVATE_INPUT_FILES[publicFile];
    const raw = await readFile(path.join(source, privateFile), 'utf8');
    const parsed = privateFile.endsWith('.jsonl') ? parseJsonLines(raw, privateFile) : JSON.parse(raw);
    const transformed = transform(publicFile, parsed);
    assertSafe(transformed);
    const content = json(transformed);
    await writeFile(path.join(output, publicFile), content, 'utf8');
    artifacts.push({ file: publicFile, sha256: sha256(content), records: recordCount(transformed) });
  }

  const privateManifest = JSON.parse(await readFile(path.join(source, 'manifest.json'), 'utf8'));
  const manifest = {
    schemaVersion: 1,
    knowledgeVersion: String(privateManifest.knowledgeVersion ?? 'unknown'),
    artifacts
  };
  await writeFile(path.join(output, 'manifest.json'), json(manifest), 'utf8');
  return manifest;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const get = (name, fallback = null) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : fallback;
  };
  const dataDir = get('--data-dir');
  if (!dataDir) throw new Error('Usage: npm run import:support-runtime-pack -- --data-dir <private-data-repository> [--output-dir support-runtime]');
  const manifest = await importSupportRuntimePack({
    sourceDirectory: path.join(path.resolve(dataDir), 'runtime-kb'),
    outputDirectory: path.resolve(get('--output-dir', 'support-runtime'))
  });
  console.log(JSON.stringify({ imported: true, knowledgeVersion: manifest.knowledgeVersion, artifacts: manifest.artifacts.length }));
}
