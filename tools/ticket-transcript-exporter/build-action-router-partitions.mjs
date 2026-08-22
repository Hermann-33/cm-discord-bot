import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }
async function readJsonl(path) { return (await readFile(path, 'utf8')).split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line)); }
async function writeJson(path, value) { await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }

function hash(value) { return createHash('sha256').update(value).digest('hex'); }

export function selectFrozenV3({ candidates, v1, v2, target = 300, salt = 'cm-action-router-v3-v1' }) {
  const consumed = new Set([
    ...v1.filter((record) => record.goldStatus === 'reviewed').flatMap((record) => record.sourceTranscriptIds ?? []),
    ...v2.flatMap((record) => record.sourceTranscriptIds ?? [])
  ]);
  const unused = candidates.filter((record) => !consumed.has(record.sourceTranscriptId));
  const groups = new Map();
  for (const record of unused) {
    const stratum = record.autoCandidateCaseId ?? record.candidateCaseIds?.[0] ?? 'unclassified';
    if (!groups.has(stratum)) groups.set(stratum, []);
    groups.get(stratum).push(record);
  }
  for (const records of groups.values()) records.sort((left, right) => hash(`${salt}:${left.sourceTranscriptId}`).localeCompare(hash(`${salt}:${right.sourceTranscriptId}`)));
  const orderedGroups = [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
  const selected = [];
  let round = 0;
  while (selected.length < Math.min(target, unused.length)) {
    let added = false;
    for (const [stratum, records] of orderedGroups) {
      if (records[round]) {
        selected.push({ record: records[round], stratum });
        added = true;
        if (selected.length >= target) break;
      }
    }
    if (!added) break;
    round += 1;
  }
  return {
    unusedCount: unused.length,
    selected: selected.map(({ record, stratum }) => ({
      sourceTranscriptId: record.sourceTranscriptId,
      sourceTicketNumber: record.sourceTicketNumber,
      candidateId: record.id,
      selectionStratum: stratum,
      selectionDigest: hash(`${salt}:${record.sourceTranscriptId}`)
    }))
  };
}

export function auditTranscriptPartitions({ v1, v2, v3, train = [], dev = [] }) {
  const sets = {
    consumedV1: new Set(v1.filter((record) => record.goldStatus === 'reviewed').flatMap((record) => record.sourceTranscriptIds ?? [])),
    consumedV2: new Set(v2.flatMap((record) => record.sourceTranscriptIds ?? [])),
    v3: new Set(v3.map((record) => record.sourceTranscriptId)),
    train: new Set(train.flatMap((record) => record.sourceTranscriptIds ?? [])),
    dev: new Set(dev.flatMap((record) => record.sourceTranscriptIds ?? []))
  };
  const overlaps = {};
  const keys = Object.keys(sets);
  for (let left = 0; left < keys.length; left += 1) for (let right = left + 1; right < keys.length; right += 1) {
    const pair = `${keys[left]}:${keys[right]}`;
    overlaps[pair] = [...sets[keys[left]]].filter((id) => sets[keys[right]].has(id)).length;
  }
  return overlaps;
}

export async function freezeV3(dataDir, target = 300) {
  const root = resolve(dataDir);
  const audit = join(root, 'knowledge-canonical', 'Audit');
  const evaluation = join(root, 'knowledge-canonical', 'Evaluation');
  const candidates = await readJsonl(join(audit, 'first-turn-authorship-candidates.jsonl'));
  const queue = await readJsonl(join(audit, 'first-turn-semantic-review-queue.jsonl'));
  const autoByTranscript = new Map(queue.map((record) => [record.sourceTranscriptId, record.autoCandidateCaseId]));
  for (const candidate of candidates) candidate.autoCandidateCaseId = autoByTranscript.get(candidate.sourceTranscriptId);
  const v1 = await readJsonl(join(evaluation, 'historical-first-turn-gold.jsonl'));
  const v2 = await readJsonl(join(evaluation, 'historical-first-turn-gold-v2.jsonl'));
  const result = selectFrozenV3({ candidates, v1, v2, target });
  const selectionHash = hash(`${result.selected.map((record) => `${record.sourceTranscriptId}:${record.sourceTicketNumber}`).join('\n')}\n`);
  const manifest = {
    schemaVersion: 1,
    status: 'frozen_before_model_selection',
    selectionMethod: 'stable_hash_round_robin_by_weak_case_stratum_without_router_predictions',
    weakStrataUsedForSelectionOnly: true,
    weakLabelsUsedAsGold: false,
    availableUnusedCandidates: result.unusedCount,
    target,
    selectedCount: result.selected.length,
    selectionHash,
    records: result.selected,
    initialLeakage: auditTranscriptPartitions({ v1, v2, v3: result.selected })
  };
  await writeJson(join(audit, 'router-v3-holdout-manifest.json'), manifest);
  return manifest;
}

async function main() {
  const args = process.argv.slice(2); const dataIndex = args.indexOf('--data-dir'); const targetIndex = args.indexOf('--target');
  if (dataIndex === -1 || !args[dataIndex + 1]) throw new Error('--data-dir is required.');
  const result = await freezeV3(args[dataIndex + 1], targetIndex === -1 ? 300 : Number(args[targetIndex + 1]));
  process.stdout.write(`${JSON.stringify({ available: result.availableUnusedCandidates, selected: result.selectedCount, hash: result.selectionHash, leakage: result.initialLeakage }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { process.stderr.write(`${error.stack ?? error.message}\n`); process.exitCode = 1; });
