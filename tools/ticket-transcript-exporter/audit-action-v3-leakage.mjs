import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const readJsonl = async (file) => (await readFile(file, 'utf8')).split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
const normalize = (value) => String(value ?? '').toLowerCase().replace(/\[[^\]]+ omitted\]/gu, ' ').replace(/[^a-z0-9]+/gu, ' ').trim();
const tokens = (value) => new Set(normalize(value).split(' ').filter(Boolean));
function jaccard(left, right) { const a = tokens(left); const b = tokens(right); if (!a.size && !b.size) return 1; let intersection = 0; for (const value of a) if (b.has(value)) intersection += 1; return intersection / (a.size + b.size - intersection); }

export async function auditV3Leakage(dataDir, threshold = 0.9) {
  const consumed = await readJsonl(path.join(dataDir, 'knowledge-canonical', 'Evaluation', 'first-turn-action-reviewed-v1-v2.jsonl'));
  const v3 = await readJsonl(path.join(dataDir, 'knowledge-canonical', 'Evaluation', 'historical-first-turn-action-v3.jsonl'));
  const training = await readJson(path.join(dataDir, 'knowledge-canonical', 'Audit', 'action-router-training-manifest.json'));
  const consumedTranscriptIds = new Set([...training.trainTranscriptIds, ...training.devTranscriptIds]);
  const sameTranscript = v3.filter((row) => row.sourceTranscriptIds.some((id) => consumedTranscriptIds.has(id))).map((row) => row.id);
  const byNormalized = new Map(); for (const row of consumed) { const key = normalize(row.query); if (!byNormalized.has(key)) byNormalized.set(key, []); byNormalized.get(key).push(row.id); }
  const exactQuery = v3.filter((row) => byNormalized.has(normalize(row.query))).map((row) => ({ v3Id: row.id, consumedIds: byNormalized.get(normalize(row.query)) }));
  const exactIds = new Set(exactQuery.map((row) => row.v3Id));
  const nearDuplicate = [];
  for (const row of v3) {
    if (exactIds.has(row.id)) continue;
    let best = null;
    for (const source of consumed) { const score = jaccard(row.query, source.query); if (score >= threshold && (!best || score > best.score)) best = { v3Id: row.id, consumedId: source.id, score }; }
    if (best) nearDuplicate.push(best);
  }
  const audit = { schemaVersion: 1, comparison: 'frozen_v3_vs_consumed_v1_v2_train_and_dev', threshold, sameTranscriptCount: sameTranscript.length, exactQueryCount: exactQuery.length, nearDuplicateCount: nearDuplicate.length, sameTranscript, exactQuery, nearDuplicate, holdoutQualification: sameTranscript.length === 0 ? 'transcript_isolated' : 'invalid_transcript_overlap', note: 'Exact and near-duplicate cross-transcript utterances are reported, not removed after the V3 freeze.' };
  await writeFile(path.join(dataDir, 'knowledge-canonical', 'Audit', 'router-v3-leakage-audit.json'), `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
  return audit;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf('--data-dir');
  if (index < 0 || !process.argv[index + 1]) throw new Error('--data-dir is required');
  console.log(JSON.stringify(await auditV3Leakage(path.resolve(process.argv[index + 1])), null, 2));
}
