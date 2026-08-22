import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function parseArgs(argv) {
  const options = { dataDir: null, nearDuplicateThreshold: 0.9 };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--data-dir') options.dataDir = resolve(argv[++index]);
    else if (value === '--near-duplicate-threshold') options.nearDuplicateThreshold = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!options.dataDir) throw new Error('--data-dir is required.');
  if (!(options.nearDuplicateThreshold > 0 && options.nearDuplicateThreshold <= 1)) {
    throw new Error('--near-duplicate-threshold must be in (0, 1].');
  }
  return options;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function readJsonl(path) {
  return (await readFile(path, 'utf8')).split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeJsonl(path, values) {
  await writeFile(path, `${values.map((value) => JSON.stringify(value)).join('\n')}\n`, 'utf8');
}

export function normalizeRoutingText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/cm-nfa-[a-z0-9-]+/giu, '[account token omitted]')
    .replace(/\s+/gu, ' ')
    .trim();
}

function grams(value, size = 3) {
  const normalized = normalizeRoutingText(value).replace(/[^a-z0-9]+/gu, ' ');
  const result = new Set();
  for (let index = 0; index <= normalized.length - size; index += 1) result.add(normalized.slice(index, index + size));
  return result;
}

export function characterDice(left, right) {
  const a = grams(left);
  const b = grams(right);
  if (a.size === 0 || b.size === 0) return normalizeRoutingText(left) === normalizeRoutingText(right) ? 1 : 0;
  let overlap = 0;
  for (const item of a) if (b.has(item)) overlap += 1;
  return (2 * overlap) / (a.size + b.size);
}

function inferControlLabels(caseRecord, dynamicLookupIds, policyIds) {
  const labels = new Set();
  if (dynamicLookupIds.length > 0) labels.add('dynamic_lookup');
  if (policyIds.length > 0 || /refund|replacement|wrong_specification|banned|expired_time/u.test(caseRecord.id)) labels.add('policy_decision');
  if (caseRecord.id === 'case.attachment.review' || caseRecord.id === 'case.attachment.visual_required') labels.add('attachment_required');
  if (caseRecord.id === 'case.restricted.technical') labels.add('restricted_escalation');
  if (/support\.followup|dashboard\.verification/u.test(caseRecord.id)) labels.add('support_operations');
  if (labels.size === 0) labels.add('static_knowledge');
  return [...labels];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function buildReviewedV2({ v1, candidates, reviewManifest, cases }) {
  const goldByTicket = new Map(v1.map((record) => [String(record.sourceTicketNumbers[0]).padStart(4, '0'), record]));
  const candidateByTicket = new Map(candidates.map((record) => [String(record.sourceTicketNumber).padStart(4, '0'), record]));
  const caseById = new Map(cases.map((record) => [record.id, record]));
  const primaryByTicket = new Map();
  for (const [caseId, tickets] of Object.entries(reviewManifest.reviewedByCase)) {
    if (!caseById.has(caseId)) throw new Error(`Unknown reviewed case: ${caseId}`);
    for (const ticket of tickets) {
      if (primaryByTicket.has(ticket)) throw new Error(`Ticket ${ticket} has more than one primary case.`);
      primaryByTicket.set(ticket, caseId);
    }
  }
  const records = [];
  for (const [ticket, primaryCaseId] of [...primaryByTicket].sort(([a], [b]) => a.localeCompare(b))) {
    const prior = goldByTicket.get(ticket);
    const candidate = candidateByTicket.get(ticket);
    if (!prior || !candidate) throw new Error(`Reviewed ticket ${ticket} is absent from the verified first-turn pool.`);
    if (prior.goldStatus !== 'needs_review') throw new Error(`Reviewed V2 ticket ${ticket} is not an unused V1 candidate.`);
    const primaryCase = caseById.get(primaryCaseId);
    const acceptableCaseIds = unique(reviewManifest.acceptableCaseIds?.[ticket] ?? []).filter((id) => id !== primaryCaseId);
    for (const id of acceptableCaseIds) if (!caseById.has(id)) throw new Error(`Unknown acceptable case ${id} for ticket ${ticket}.`);
    const selectedCases = [primaryCase, ...acceptableCaseIds.map((id) => caseById.get(id))];
    const dynamicLookupIds = unique(selectedCases.flatMap((item) => (item.dynamic ?? []).map((entry) => typeof entry === 'string' ? entry : entry.id)));
    const policyIds = unique(selectedCases.flatMap((item) => item.policies ?? []));
    const escalation = selectedCases.some((item) => (item.escalationIds?.length ?? 0) > 0 || (item.escalate?.length ?? 0) > 0);
    const query = normalizeRoutingText(prior.query);
    if (/cm-nfa-[a-z0-9-]+/iu.test(query)) throw new Error(`Unsanitized account token in V2 ticket ${ticket}.`);
    records.push({
      id: `first-turn-gold-v2.${ticket}`,
      query,
      expected: {
        primaryCaseId,
        caseIds: [primaryCaseId, ...acceptableCaseIds],
        acceptableCaseIds,
        secondaryCaseIds: acceptableCaseIds,
        entityIds: unique(prior.expected?.entityIds ?? candidate.entityIds ?? []),
        policyIds,
        dynamicLookupIds,
        escalation,
        controlLabels: inferControlLabels(primaryCase, dynamicLookupIds, policyIds)
      },
      goldStatus: 'reviewed',
      labelMethod: 'semantic_review_full_ticket',
      goldReason: `Full-ticket semantic review confirms that the verified opening issue and reviewed ticket outcome route primarily to ${primaryCase.displayName}.`,
      querySource: 'literal_customer_turn',
      authorship: { verified: true, method: 'structured_message_customer_id_match', messageRef: candidate.messageRef },
      sourceTranscriptIds: [candidate.sourceTranscriptId],
      sourceTicketNumbers: [candidate.sourceTicketNumber],
      turnType: 'first_turn',
      auditDimensions: {
        caseFamily: primaryCase.family,
        games: candidate.ticketSemantics?.games ?? [],
        productsOrAccountModels: unique([...(candidate.ticketSemantics?.products ?? []), ...(candidate.ticketSemantics?.accountModels ?? [])]),
        dynamicLookup: dynamicLookupIds.length > 0,
        escalation
      }
    });
  }
  return records;
}

export function buildTrainingExemplars({ candidates, v1ReviewedTranscriptIds, v2, threshold }) {
  const heldOut = new Set([...v1ReviewedTranscriptIds, ...v2.flatMap((record) => record.sourceTranscriptIds)]);
  const exactGold = new Set(v2.map((record) => normalizeRoutingText(record.query)));
  const rows = [];
  const excluded = { heldOutTranscript: 0, exactQuery: 0, nearDuplicate: 0 };
  for (const candidate of candidates) {
    if (heldOut.has(candidate.sourceTranscriptId)) { excluded.heldOutTranscript += 1; continue; }
    const text = normalizeRoutingText(candidate.query);
    if (exactGold.has(text)) { excluded.exactQuery += 1; continue; }
    if (v2.some((record) => characterDice(text, record.query) >= threshold)) { excluded.nearDuplicate += 1; continue; }
    rows.push({ candidate, text });
  }
  const labelsFor = (candidate) => unique([candidate.autoCandidateCaseId ?? candidate.candidateCaseIds?.[0]]);
  const frequency = new Map();
  for (const { candidate } of rows) for (const caseId of labelsFor(candidate)) frequency.set(caseId, (frequency.get(caseId) ?? 0) + 1);
  const exemplars = rows.map(({ candidate, text }, index) => ({
    id: `route-example.${String(index + 1).padStart(6, '0')}`,
    text,
    caseIds: labelsFor(candidate),
    entityIds: unique(candidate.entityIds ?? []),
    scope: {},
    turnType: 'first_turn',
    weight: Number(Math.min(...labelsFor(candidate).map((id) => 1 / Math.sqrt(frequency.get(id) ?? 1)), 1).toFixed(6))
  }));
  const provenance = rows.map(({ candidate }, index) => ({
    id: `route-example.${String(index + 1).padStart(6, '0')}`,
    sourceTranscriptId: candidate.sourceTranscriptId,
    sourceTicketNumber: candidate.sourceTicketNumber,
    messageRef: candidate.messageRef
  }));
  return { exemplars, provenance, excluded };
}

export function auditLeakage(exemplars, provenance, v2, threshold) {
  const v2Transcripts = new Set(v2.flatMap((record) => record.sourceTranscriptIds));
  const v2Queries = new Set(v2.map((record) => normalizeRoutingText(record.query)));
  let sameTranscript = 0;
  let exactQuery = 0;
  let nearDuplicate = 0;
  for (let index = 0; index < exemplars.length; index += 1) {
    if (v2Transcripts.has(provenance[index].sourceTranscriptId)) sameTranscript += 1;
    if (v2Queries.has(normalizeRoutingText(exemplars[index].text))) exactQuery += 1;
    if (v2.some((record) => characterDice(exemplars[index].text, record.query) >= threshold)) nearDuplicate += 1;
  }
  return { sameTranscript, exactQuery, nearDuplicate, threshold };
}

async function run(options) {
  const dataDir = options.dataDir;
  const auditDir = join(dataDir, 'knowledge-canonical', 'Audit');
  const evaluationDir = join(dataDir, 'knowledge-canonical', 'Evaluation');
  const runtimeDir = join(dataDir, 'runtime-kb');
  const v1 = await readJsonl(join(evaluationDir, 'historical-first-turn-gold.jsonl'));
  const candidates = await readJsonl(join(auditDir, 'first-turn-authorship-candidates.jsonl'));
  const queue = await readJsonl(join(auditDir, 'first-turn-semantic-review-queue.jsonl'));
  const autoByTranscript = new Map(queue.map((record) => [record.sourceTranscriptId, record.autoCandidateCaseId]));
  for (const candidate of candidates) candidate.autoCandidateCaseId = autoByTranscript.get(candidate.sourceTranscriptId);
  const cases = await readJsonl(join(runtimeDir, 'cases.jsonl'));
  const reviewManifest = await readJson(join(auditDir, 'router-v2-semantic-review.json'));
  const v2 = buildReviewedV2({ v1, candidates, reviewManifest, cases });
  const v1Reviewed = v1.filter((record) => record.goldStatus === 'reviewed');
  const training = buildTrainingExemplars({
    candidates,
    v1ReviewedTranscriptIds: new Set(v1Reviewed.flatMap((record) => record.sourceTranscriptIds)),
    v2,
    threshold: options.nearDuplicateThreshold
  });
  const leakage = auditLeakage(training.exemplars, training.provenance, v2, options.nearDuplicateThreshold);
  const familyCounts = Object.fromEntries([...new Map(v2.map((record) => [record.auditDimensions.caseFamily, 0]))].map(([family]) => [family, v2.filter((record) => record.auditDimensions.caseFamily === family).length]));
  const caseCounts = Object.fromEntries([...new Map(v2.map((record) => [record.expected.primaryCaseId, 0]))].map(([caseId]) => [caseId, v2.filter((record) => record.expected.primaryCaseId === caseId).length]));
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    benchmarkV1: { role: 'development', reason: 'This benchmark influenced prior architecture and is not an untouched final test.', reviewedRecords: v1Reviewed.length, transcripts: new Set(v1Reviewed.flatMap((record) => record.sourceTranscriptIds)).size },
    benchmarkV2: { role: 'final_test', usage: 'run_once_after_config_lock', reviewedRecords: v2.length, transcripts: new Set(v2.flatMap((record) => record.sourceTranscriptIds)).size, caseCounts, familyCounts },
    train: { role: 'model_fit_only', exemplars: training.exemplars.length, transcripts: new Set(training.provenance.map((record) => record.sourceTranscriptId)).size },
    transcriptGrouped: true,
    nearDuplicateThreshold: options.nearDuplicateThreshold,
    excludedDuringTrainingBuild: training.excluded,
    leakage
  };
  await writeJsonl(join(evaluationDir, 'historical-first-turn-gold-v2.jsonl'), v2);
  await writeJsonl(join(runtimeDir, 'routing-exemplars.jsonl'), training.exemplars);
  await writeJsonl(join(auditDir, 'routing-exemplar-provenance.jsonl'), training.provenance);
  await writeJson(join(auditDir, 'router-split-manifest.json'), manifest);
  await writeJson(join(auditDir, 'router-v2-leakage-audit.json'), leakage);
  await writeJson(join(auditDir, 'router-v2-review-audit.json'), {
    schemaVersion: 1,
    needsReviewCandidatePool: v1.filter((record) => record.goldStatus === 'needs_review').length,
    reviewed: v2.length,
    needsReviewRemaining: v1.filter((record) => record.goldStatus === 'needs_review').length - v2.length,
    uniqueTranscripts: new Set(v2.flatMap((record) => record.sourceTranscriptIds)).size,
    uniqueCases: Object.keys(caseCounts).length,
    uniqueFamilies: Object.keys(familyCounts).length,
    sourceVerifiedLiteral: v2.every((record) => record.querySource === 'literal_customer_turn' && record.authorship.verified)
  });
  const hash = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
  process.stdout.write(`${JSON.stringify({ v1: v1Reviewed.length, v2: v2.length, train: training.exemplars.length, leakage, manifestHash: hash }, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(parseArgs(process.argv.slice(2))).catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
