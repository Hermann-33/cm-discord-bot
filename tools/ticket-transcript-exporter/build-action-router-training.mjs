import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const stableHash = (value) => createHash('sha256').update(String(value)).digest('hex');
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const readJsonl = async (file) => (await readFile(file, 'utf8')).split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));

function keyFor(record) {
  return [record.primaryDecision, record.inferability, record.observableFamilyIds?.[0] ?? 'none'].join('|');
}

export function splitReviewedActions(records, devFraction = 0.2) {
  const groups = new Map();
  for (const record of records) {
    const key = keyFor(record);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  const train = [];
  const dev = [];
  for (const rows of groups.values()) {
    rows.sort((a, b) => stableHash(a.sourceTranscriptIds[0]).localeCompare(stableHash(b.sourceTranscriptIds[0])));
    const devCount = rows.length < 3 ? 0 : Math.max(1, Math.round(rows.length * devFraction));
    dev.push(...rows.slice(0, devCount));
    train.push(...rows.slice(devCount));
  }
  const targetDev = Math.round(records.length * devFraction);
  const orderedTrain = [...train].sort((a, b) => stableHash(`rebalance:${a.sourceTranscriptIds[0]}`).localeCompare(stableHash(`rebalance:${b.sourceTranscriptIds[0]}`)));
  while (dev.length < targetDev && orderedTrain.length > 0) dev.push(orderedTrain.shift());
  train.length = 0;
  train.push(...orderedTrain);
  return { train, dev };
}

export function auditActionPartitions(train, dev, v3Manifest) {
  const ids = (rows) => new Set(rows.flatMap((row) => row.sourceTranscriptIds ?? []));
  const trainIds = ids(train);
  const devIds = ids(dev);
  const v3Ids = new Set((v3Manifest.records ?? []).map((record) => record.sourceTranscriptId));
  const overlap = (left, right) => [...left].filter((id) => right.has(id));
  return {
    trainDevTranscriptOverlap: overlap(trainIds, devIds),
    trainV3TranscriptOverlap: overlap(trainIds, v3Ids),
    devV3TranscriptOverlap: overlap(devIds, v3Ids),
    trainUniqueTranscripts: trainIds.size,
    devUniqueTranscripts: devIds.size,
    v3UniqueTranscripts: v3Ids.size
  };
}

function distribution(rows, field) {
  return Object.fromEntries([...rows.reduce((map, row) => {
    const value = row[field] ?? 'none';
    map.set(value, (map.get(value) ?? 0) + 1);
    return map;
  }, new Map())].sort(([a], [b]) => a.localeCompare(b)));
}

export async function buildActionTraining(dataDir) {
  const reviewedFile = path.join(dataDir, 'knowledge-canonical', 'Evaluation', 'first-turn-action-reviewed-v1-v2.jsonl');
  const v3File = path.join(dataDir, 'knowledge-canonical', 'Audit', 'router-v3-holdout-manifest.json');
  const outputFile = path.join(dataDir, 'knowledge-canonical', 'Audit', 'action-router-training-manifest.json');
  const records = await readJsonl(reviewedFile);
  const v3Manifest = await readJson(v3File);
  const { train, dev } = splitReviewedActions(records);
  const audit = auditActionPartitions(train, dev, v3Manifest);
  if (audit.trainDevTranscriptOverlap.length || audit.trainV3TranscriptOverlap.length || audit.devV3TranscriptOverlap.length) throw new Error('Transcript partition leakage detected.');
  const manifest = {
    schemaVersion: 1,
    purpose: 'Consumed V1+V2 first-turn action development split; V3 remains frozen and excluded.',
    labelAuthority: 'semantic_review_first_turn_observability',
    weakHistoricalLabelsUsedAsGold: false,
    splitMethod: 'transcript_grouped_deterministic_stratification',
    source: path.relative(dataDir, reviewedFile).replaceAll('\\', '/'),
    counts: { total: records.length, train: train.length, dev: dev.length },
    trainRecordIds: train.map((row) => row.id).sort(),
    devRecordIds: dev.map((row) => row.id).sort(),
    trainTranscriptIds: train.flatMap((row) => row.sourceTranscriptIds).sort(),
    devTranscriptIds: dev.flatMap((row) => row.sourceTranscriptIds).sort(),
    distributions: {
      trainPrimaryDecision: distribution(train, 'primaryDecision'),
      devPrimaryDecision: distribution(dev, 'primaryDecision'),
      trainInferability: distribution(train, 'inferability'),
      devInferability: distribution(dev, 'inferability')
    },
    leakageAudit: audit,
    v3SelectionHash: v3Manifest.selectionHash,
    contentHash: stableHash(records.map((row) => `${row.id}\t${row.primaryDecision}\t${row.inferability}`).sort().join('\n'))
  };
  await writeFile(outputFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf('--data-dir');
  if (index < 0 || !process.argv[index + 1]) throw new Error('Usage: node build-action-router-training.mjs --data-dir <private-data-dir>');
  console.log(JSON.stringify(await buildActionTraining(path.resolve(process.argv[index + 1])), null, 2));
}
