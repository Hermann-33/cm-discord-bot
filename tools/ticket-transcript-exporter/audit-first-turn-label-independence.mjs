import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewFirstTurnObservability } from './first-turn-action-router.mjs';

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const readJsonl = async (file) => (await readFile(file, 'utf8')).split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
const normalizeArray = (value) => [...new Set(value ?? [])].sort();

function equalArrays(left, right) {
  return JSON.stringify(normalizeArray(left)) === JSON.stringify(normalizeArray(right));
}

function compareToRouter(record, aliases) {
  const predicted = reviewFirstTurnObservability(record.query, aliases);
  const fields = {
    inferability: record.inferability === predicted.inferability,
    primaryDecision: record.primaryDecision === predicted.primaryDecision,
    clarificationId: (record.clarificationId ?? null) === (predicted.clarificationId ?? null),
    observableCaseIds: equalArrays(record.observableCaseIds, predicted.observableCaseIds),
    observableFamilyIds: equalArrays(record.observableFamilyIds, predicted.observableFamilyIds),
    observableEntityIds: equalArrays(record.observableEntityIds, predicted.observableEntityIds)
  };
  return { fields, exact: Object.values(fields).every(Boolean) };
}

export async function auditFirstTurnLabelIndependence(dataDir) {
  const evaluationDir = path.join(dataDir, 'knowledge-canonical', 'Evaluation');
  const auditDir = path.join(dataDir, 'knowledge-canonical', 'Audit');
  const runtimeDir = path.join(dataDir, 'runtime-kb');
  const records = await readJsonl(path.join(evaluationDir, 'first-turn-action-reviewed-v1-v2.jsonl'));
  const aliasesFile = await readJson(path.join(runtimeDir, 'aliases.json'));
  const aliases = aliasesFile.aliases ?? aliasesFile;
  const rows = records.map((record) => {
    const comparison = compareToRouter(record, aliases);
    let provenance = 'unknown';
    let reason = 'No independent reviewer artifact is referenced by the record.';
    if (record.reviewMetadata?.independentReviewer && record.reviewMetadata?.fullTicketReviewed === true) {
      provenance = 'independently_documented';
      reason = 'Record contains explicit independent reviewer metadata.';
    } else if (comparison.exact) {
      provenance = 'router_reproducible';
      reason = 'The deterministic first-turn router reproduces every audited semantic label field exactly; independence is not established.';
    } else if (record.labelMethod === 'semantic_review_first_turn_observability') {
      provenance = 'mixed_or_divergent';
      reason = 'Record claims semantic observability review but differs from the deterministic router on at least one audited field.';
    }
    return {
      id: record.id,
      sourceTranscriptIds: record.sourceTranscriptIds,
      labelMethod: record.labelMethod,
      provenance,
      reason,
      routerComparison: comparison
    };
  });
  const categories = ['independently_documented','router_reproducible','mixed_or_divergent','unknown'];
  const counts = Object.fromEntries(categories.map((key) => [key, rows.filter((row) => row.provenance === key).length]));
  const summary = {
    schemaVersion: 1,
    records: rows.length,
    counts,
    independenceEstablished: counts.independently_documented,
    warning: 'Router-reproducible labels are not automatically wrong, but they must not be treated as independent gold without separate review provenance.'
  };
  await writeFile(path.join(auditDir, 'v1-v2-label-independence-audit.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  await writeFile(path.join(auditDir, 'v1-v2-label-independence-records.jsonl'), `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
  return { summary, rows };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf('--data-dir');
  if (index < 0 || !process.argv[index + 1]) throw new Error('Usage: node audit-first-turn-label-independence.mjs --data-dir <private-data-dir>');
  const result = await auditFirstTurnLabelIndependence(path.resolve(process.argv[index + 1]));
  console.log(JSON.stringify(result.summary, null, 2));
}
