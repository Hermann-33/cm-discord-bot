import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { classifySupportText } from './synthesize-support-cases.mjs';

async function readJsonl(path) {
  return (await readFile(path, 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}
async function writeJsonl(path, records) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`);
}

export function proposedCaseId(candidate) {
  if (candidate.candidateCaseIds.length === 1) return candidate.candidateCaseIds[0];
  const matches = [...new Set(classifySupportText(candidate.query).filter((id) => candidate.candidateCaseIds.includes(id)))];
  return matches.length === 1 ? matches[0] : null;
}

export function selectFirstTurnReviewQueue(candidates, perCaseCap = 100) {
  const grouped = new Map();
  for (const candidate of candidates) {
    const proposed = proposedCaseId(candidate);
    if (!proposed) continue;
    if (!grouped.has(proposed)) grouped.set(proposed, []);
    grouped.get(proposed).push({ ...candidate, autoCandidateCaseId: proposed });
  }
  const selected = [];
  for (const [caseId, records] of [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const limit = caseId === 'case.attachment.review' ? Math.min(10, perCaseCap) : perCaseCap;
    selected.push(...records.sort((a, b) => a.sourceTicketNumber - b.sourceTicketNumber).slice(0, limit));
  }
  return selected.sort((a, b) => a.sourceTicketNumber - b.sourceTicketNumber);
}

export function selectReplayReviewQueue(candidates, limit = 190) {
  const preferred = candidates.filter((record) => record.candidateCaseIds.length === 1);
  const remaining = candidates.filter((record) => record.candidateCaseIds.length !== 1);
  return [...preferred, ...remaining].sort((a, b) => a.sourceTicketNumber - b.sourceTicketNumber || a.id.localeCompare(b.id)).slice(0, limit);
}

export async function generateSupportSemanticReviewQueues(dataDir) {
  const auditDir = join(resolve(dataDir), 'knowledge-canonical', 'Audit');
  const first = selectFirstTurnReviewQueue(await readJsonl(join(auditDir, 'first-turn-authorship-candidates.jsonl')));
  const replay = selectReplayReviewQueue(await readJsonl(join(auditDir, 'historical-replay-candidates.jsonl')));
  await writeJsonl(join(auditDir, 'first-turn-semantic-review-queue.jsonl'), first);
  await writeJsonl(join(auditDir, 'historical-replay-semantic-review-queue.jsonl'), replay);
  return { firstTurnQueue: first.length, replayQueue: replay.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dataIndex = process.argv.indexOf('--data-dir');
  if (dataIndex === -1 || !process.argv[dataIndex + 1]) throw new Error('--data-dir is required.');
  generateSupportSemanticReviewQueues(process.argv[dataIndex + 1]).then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch((error) => { process.stderr.write(`${error.stack ?? error.message}\n`); process.exitCode = 1; });
}
