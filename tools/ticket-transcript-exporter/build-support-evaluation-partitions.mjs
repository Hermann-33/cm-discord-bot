import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildAliasIndex, resolveAliases } from './evaluate-canonical-support-retrieval.mjs';
import { classifySupportText } from './synthesize-support-cases.mjs';

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--data-dir') options.dataDir = resolve(argv[++index]);
    else if (value === '--near-duplicate-threshold') options.nearDuplicateThreshold = Number(argv[++index]);
    else if (value === '--help' || value === '-h') options.help = true;
    else throw new Error(`Unknown option: ${value}`);
  }
  if (!options.help && !options.dataDir) throw new Error('--data-dir is required.');
  return options;
}

async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }
async function readJsonl(path, optional = false) {
  try {
    const text = await readFile(path, 'utf8');
    return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    if (optional && error.code === 'ENOENT') return [];
    throw error;
  }
}
async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
async function writeJsonl(path, records) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`);
}

export function normalizeRoutingText(value) {
  return String(value ?? '').normalize('NFKD').toLowerCase().replace(/[’']/g, '').replace(/https?:\/\/\S+/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

export function sanitizeCustomerText(value) {
  return String(value ?? '')
    .replace(/https?:\/\/\S+/gi, '[URL omitted]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email omitted]')
    .replace(/<@!?\d{17,20}>/g, '[mention omitted]')
    .replace(/\bCM-NFA-[A-Z0-9-]{12,}\b/gi, '[account token omitted]')
    .replace(/\bCM-\d{6}-[A-Z0-9]{12,}\b/gi, '[order identifier omitted]')
    .replace(/\b\d{17,20}\b/g, '[identifier omitted]')
    .replace(/\b(?:bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}\b/g, '[wallet omitted]')
    .replace(/\b[A-Za-z0-9_-]{48,}\b/g, '[secret omitted]')
    .replace(/\b(?=[A-Z0-9]{8,16}\b)(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]+\b/g, '[order identifier omitted]')
    .trim();
}

export function isMeaningfulSupportText(value) {
  const text = sanitizeCustomerText(value);
  if (!text || text.length < 5 || !/[a-z]/i.test(text)) return false;
  if (/^(?:hi|hello|hey|yo|sup|thanks|thank you|ty|cheers|ok|okay|test|anyone|help|pls+|please|plz+|im lost|i bought|i buy|i buye|there you go?|order id|scammer)[.!? ]*$/i.test(text)) return false;
  if (/^(?:and\s+)?(?:order|order#|order id|order number)\s*:?[\s\[]*(?:\[order identifier omitted\]|[a-z0-9-]+)?\s*$/i.test(text)) return false;
  if (/^(?:\[mention omitted\]\s*)+$/i.test(text)) return false;
  if (/^(?:use (?:the license|the usual nfa loader)|try another browser|download and install evergreen|accounts usually last|meaning the account has gone invalid|this is normal behavior|typically means the account|typically you don.t need a vpn|you.ve paid|api error,? order has been fixed|using what cheat\?|hello,? sorry for the inconvenience|hello \[mention omitted\]\. your order has been fullfilled|what was the email that you used)/i.test(text)) return false;
  if (/^(?:hey\s+so\s+|hello\s+|so\s+)?i\s+(?:just\s+)?(?:bought|purchased|buy)\b(?!.*\b(?:but|cant|cannot|didnt|doesnt|where|when|how|why|missing|invalid|banned|failed|error|issue|problem|not|need|want|says?)\b)[^?]*$/i.test(text)) return false;
  if (/^[a-z0-9_-]{5,20}$/i.test(text) && !/^(?:paypal|spoofer|loader|website|account|fortnite|valorant|rust)$/i.test(text)) return false;
  if (/^\[(?:attachment|url|identifier|order identifier|mention|secret) omitted\]$/i.test(text)) return false;
  const supportSignal = /\b(?:account|nfa|order|payment|paid|buy|bought|purchase|refund|cancel|wallet|balance|key|license|loader|inject|launch|game|crash|close|error|issue|problem|work|working|website|site|checkout|login|password|banned|ban|spoofer|hwid|vpn|media|resell|discount|coupon|stock|restock|price|duration|compatible|support|available|status|deliver|receive|missing|failed|pending|expired|reset|requirements?|virtualization|secure boot|menu|overlay|aimbot|esp)\b/i.test(text);
  return supportSignal || text.includes('?') || text.length >= 28;
}

function messageAuthorId(message) { return String(message?.author?.id ?? message?.userId ?? ''); }
function isBotMessage(message, usersById) {
  const authorId = messageAuthorId(message);
  return message?.author?.bot === true || usersById.get(authorId)?.bot === true;
}
function stableMessageRef(transcriptId, messageId) {
  return createHash('sha256').update(`${transcriptId}:${messageId}`).digest('hex').slice(0, 20);
}
function unique(values) { return [...new Set(values.filter(Boolean))]; }

export function verifyCustomerMessages(rawTranscript, inferredCustomerId) {
  const users = rawTranscript?.transcript?.users ?? [];
  const usersById = new Map(users.map((user) => [String(user.id), user]));
  const customerId = String(inferredCustomerId ?? '');
  const messages = rawTranscript?.transcript?.messages ?? [];
  const verified = [];
  let botRejected = 0;
  let staffRejected = 0;
  let systemRejected = 0;
  for (const [index, message] of messages.entries()) {
    const content = sanitizeCustomerText(message?.content);
    if (!isMeaningfulSupportText(content)) {
      if (message?.type && message.type !== 0) systemRejected += 1;
      continue;
    }
    if (isBotMessage(message, usersById)) { botRejected += 1; continue; }
    if (!customerId || messageAuthorId(message) !== customerId) { staffRejected += 1; continue; }
    verified.push({
      content,
      index,
      timestamp: message.timestamp ?? null,
      messageRef: stableMessageRef(rawTranscript.source?.transcriptId ?? '', message.id ?? `${index}`)
    });
  }
  return { verified, rejected: { bot: botRejected, staff: staffRejected, system: systemRejected } };
}

function ngrams(value, size = 3) {
  const text = ` ${normalizeRoutingText(value)} `;
  const result = new Set();
  for (let index = 0; index <= text.length - size; index += 1) result.add(text.slice(index, index + size));
  return result;
}
export function characterDice(left, right) {
  const a = ngrams(left);
  const b = ngrams(right);
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const gram of a) if (b.has(gram)) overlap += 1;
  return (2 * overlap) / (a.size + b.size);
}

async function loadTicketKnowledge(dataDir) {
  const root = join(dataDir, 'deep-review');
  const directories = (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory() && entry.name.startsWith('batch-'));
  const records = [];
  for (const directory of directories) records.push(...await readJsonl(join(root, directory.name, 'ticket-knowledge.ndjson'), true));
  return new Map(records.map((record) => [record.transcriptId, record]));
}

function compactTicketSemantics(ticket) {
  const sanitizeAuditValue = (value) => {
    if (Array.isArray(value)) return value.map(sanitizeAuditValue);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeAuditValue(item)]));
    if (typeof value !== 'string') return value;
    return sanitizeCustomerText(value).replace(/\b[a-z0-9]+(?:-[a-z0-9]+){4,}\b/gi, (match) => match.replaceAll('-', ' '));
  };
  return sanitizeAuditValue({
    disposition: ticket?.disposition ?? null,
    products: ticket?.products ?? [],
    games: ticket?.games ?? [],
    accountModels: ticket?.accountModels ?? [],
    problems: ticket?.problems ?? [],
    symptoms: ticket?.symptoms ?? [],
    customerGoals: ticket?.customerGoals ?? [],
    actionsAlreadyAttempted: ticket?.actionsAlreadyAttempted ?? [],
    staffDiagnosis: ticket?.staffDiagnosis ?? [],
    policyDecisions: ticket?.policyDecisions ?? [],
    outcome: ticket?.outcome ?? ticket?.outcomeClassification ?? []
  });
}

async function buildAuthorshipCandidates(dataDir, coverage, reviewByTranscript, ticketByTranscript) {
  const candidates = [];
  const rejected = [];
  const contamination = { bot: 0, staff: 0, system: 0 };
  for (const row of coverage) {
    if (!row.caseIds?.length) continue;
    const review = reviewByTranscript.get(row.transcriptId);
    if (!review?.inferredCustomer?.id) {
      rejected.push({ transcriptId: row.transcriptId, ticketNumber: row.ticketNumber, reason: 'missing_inferred_customer_id' });
      continue;
    }
    let raw;
    try { raw = await readJson(join(dataDir, 'transcripts', `${row.transcriptId}.json`)); }
    catch { rejected.push({ transcriptId: row.transcriptId, ticketNumber: row.ticketNumber, reason: 'missing_or_invalid_structured_transcript' }); continue; }
    const verification = verifyCustomerMessages(raw, review.inferredCustomer.id);
    for (const key of Object.keys(contamination)) contamination[key] += verification.rejected[key];
    const first = verification.verified[0];
    if (!first) {
      rejected.push({ transcriptId: row.transcriptId, ticketNumber: row.ticketNumber, reason: 'no_verified_meaningful_customer_message' });
      continue;
    }
    candidates.push({
      id: `first-turn-candidate.${String(row.ticketNumber).padStart(4, '0')}`,
      query: first.content.slice(0, 700),
      messageRef: first.messageRef,
      sourceTranscriptId: row.transcriptId,
      sourceTicketNumber: row.ticketNumber,
      inferredCustomerVerified: true,
      authorBot: false,
      candidateCaseIds: unique(row.caseIds),
      entityIds: unique([...(row.profileIds ?? []), ...(row.entityIds ?? [])]),
      policyIds: row.policyIds ?? [],
      dynamicLookupIds: row.dynamicLookupIds ?? [],
      runtimeDisposition: row.runtimeDisposition,
      ticketSemantics: compactTicketSemantics(ticketByTranscript.get(row.transcriptId))
    });
  }
  return { candidates, rejected, contamination };
}

function applyFirstTurnReviews(candidates, reviews, caseById) {
  const reviewsByTranscript = new Map(reviews.map((review) => [review.transcriptId, review]));
  return candidates.map((candidate) => {
    const review = reviewsByTranscript.get(candidate.sourceTranscriptId);
    const reviewed = review?.goldStatus === 'reviewed' && review.labelMethod === 'semantic_review_full_ticket' && caseById.has(review.primaryCaseId);
    const primaryCaseId = reviewed ? review.primaryCaseId : candidate.candidateCaseIds[0];
    return {
      id: candidate.id.replace('candidate', 'gold'),
      query: candidate.query,
      expected: {
        primaryCaseId,
        caseIds: unique([primaryCaseId, ...(reviewed ? review.acceptableCaseIds ?? [] : [])]),
        acceptableCaseIds: reviewed ? review.acceptableCaseIds ?? [] : [],
        secondaryCaseIds: reviewed ? review.secondaryCaseIds ?? [] : [],
        entityIds: reviewed ? review.entityIds ?? candidate.entityIds : candidate.entityIds,
        policyIds: reviewed ? review.policyIds ?? candidate.policyIds : candidate.policyIds,
        dynamicLookupIds: reviewed ? review.dynamicLookupIds ?? candidate.dynamicLookupIds : candidate.dynamicLookupIds,
        escalation: reviewed ? Boolean(review.escalation) : /escalation|attachment/.test(candidate.runtimeDisposition ?? '')
      },
      goldStatus: reviewed ? 'reviewed' : 'needs_review',
      labelMethod: reviewed ? 'semantic_review_full_ticket' : 'auto_candidate',
      goldReason: reviewed ? review.goldReason : 'Authorship is verified, but no explicit full-ticket semantic review decision exists for this candidate.',
      querySource: 'literal_customer_turn',
      authorship: { verified: true, method: 'structured_message_customer_id_match', messageRef: candidate.messageRef },
      sourceTranscriptIds: [candidate.sourceTranscriptId],
      sourceTicketNumbers: [candidate.sourceTicketNumber],
      turnType: 'first_turn',
      auditDimensions: {
        caseFamily: caseById.get(primaryCaseId)?.family ?? null,
        games: candidate.ticketSemantics.games,
        productsOrAccountModels: unique([...(candidate.ticketSemantics.products ?? []), ...(candidate.ticketSemantics.accountModels ?? [])]),
        dynamicLookup: (reviewed ? review.dynamicLookupIds ?? candidate.dynamicLookupIds : candidate.dynamicLookupIds).length > 0,
        escalation: reviewed ? Boolean(review.escalation) : /escalation|attachment/.test(candidate.runtimeDisposition ?? '')
      }
    };
  });
}

function oldFollowUpMatch(record, verifiedMessages) {
  const query = normalizeRoutingText(record.query);
  return verifiedMessages.find((message, index) => index > 0 && normalizeRoutingText(message.content) === query)
    ?? verifiedMessages.find((message, index) => index > 0 && (normalizeRoutingText(message.content).includes(query) || query.includes(normalizeRoutingText(message.content))));
}

async function buildReplayCandidates(dataDir, oldGold, reviewByTranscript, ticketByTranscript, coverageByTranscript) {
  const records = [];
  for (const record of oldGold.filter((item) => item.turnType === 'follow_up')) {
    const transcriptId = record.sourceTranscriptIds?.[0];
    const review = reviewByTranscript.get(transcriptId);
    if (!transcriptId || !review?.inferredCustomer?.id) continue;
    let raw;
    try { raw = await readJson(join(dataDir, 'transcripts', `${transcriptId}.json`)); } catch { continue; }
    const verification = verifyCustomerMessages(raw, review.inferredCustomer.id);
    const target = oldFollowUpMatch(record, verification.verified);
    if (!target) continue;
    const messages = raw.transcript?.messages ?? [];
    const users = new Map((raw.transcript?.users ?? []).map((user) => [String(user.id), user]));
    const priorTurns = messages.slice(0, target.index).filter((message) => {
      const content = sanitizeCustomerText(message.content);
      return isMeaningfulSupportText(content) && !isBotMessage(message, users);
    }).slice(-6).map((message) => ({
      role: messageAuthorId(message) === String(review.inferredCustomer.id) ? 'customer' : 'assistant',
      content: sanitizeCustomerText(message.content).slice(0, 700)
    }));
    const coverage = coverageByTranscript.get(transcriptId);
    records.push({
      id: `replay-candidate.${String(record.sourceTicketNumbers?.[0] ?? records.length + 1).padStart(4, '0')}.${target.messageRef.slice(0, 6)}`,
      sourceGoldId: record.id,
      query: target.content.slice(0, 700),
      messageRef: target.messageRef,
      sourceTranscriptId: transcriptId,
      sourceTicketNumber: record.sourceTicketNumbers?.[0],
      priorTurns,
      candidateCaseIds: unique(record.expected?.caseIds ?? coverage?.caseIds ?? []),
      entityIds: record.expected?.entityIds ?? [],
      policyIds: record.expected?.policyIds ?? [],
      dynamicLookupIds: record.expected?.dynamicLookupIds ?? [],
      escalation: Boolean(record.expected?.escalation),
      ticketSemantics: compactTicketSemantics(ticketByTranscript.get(transcriptId))
    });
  }
  return records;
}

function applyReplayReviews(candidates, reviews) {
  const byId = new Map(reviews.map((review) => [review.candidateId, review]));
  return candidates.map((candidate) => {
    const review = byId.get(candidate.id);
    const reviewed = review?.goldStatus === 'reviewed' && review.labelMethod === 'semantic_review_full_ticket';
    const activeCaseId = reviewed ? review.activeCaseId : candidate.candidateCaseIds[0];
    return {
      id: candidate.id.replace('candidate', 'historical'),
      sourceTranscriptIds: [candidate.sourceTranscriptId],
      sourceTicketNumbers: [candidate.sourceTicketNumber],
      initialState: {
        activeCaseId,
        resolvedEntities: reviewed ? review.resolvedEntities ?? candidate.entityIds : candidate.entityIds,
        knownContext: reviewed ? review.knownContext ?? {} : {},
        pendingDiagnosticId: reviewed ? review.pendingDiagnosticId ?? null : null,
        diagnosticsAsked: reviewed ? review.diagnosticsAsked ?? [] : [],
        diagnosticAnswers: reviewed ? review.diagnosticAnswers ?? {} : {},
        proceduresAttempted: reviewed ? review.proceduresAttempted ?? [] : [],
        procedureOutcomes: reviewed ? review.procedureOutcomes ?? {} : {},
        dynamicLookupResults: reviewed ? review.dynamicLookupResults ?? {} : {}
      },
      turns: [...candidate.priorTurns, { role: 'customer', content: candidate.query }],
      expected: {
        activeCaseId: reviewed ? review.expectedCaseId ?? activeCaseId : activeCaseId,
        resolvedEntities: reviewed ? review.expectedResolvedEntities ?? review.resolvedEntities ?? candidate.entityIds : candidate.entityIds,
        knownContext: reviewed ? review.expectedKnownContext ?? review.knownContext ?? {} : {},
        diagnosticAnswers: reviewed ? review.expectedDiagnosticAnswers ?? {} : {},
        procedureOutcomes: reviewed ? review.expectedProcedureOutcomes ?? {} : {},
        nextAction: reviewed ? review.nextAction ?? {} : {},
        mustNotRepeatProcedureIds: reviewed ? review.mustNotRepeatProcedureIds ?? [] : [],
        mustNotRepeatDiagnosticIds: reviewed ? review.mustNotRepeatDiagnosticIds ?? [] : []
      },
      goldStatus: reviewed ? 'reviewed' : 'needs_review',
      labelMethod: reviewed ? 'semantic_review_full_ticket' : 'auto_candidate',
      goldReason: reviewed ? review.goldReason : 'Verified historical customer follow-up awaiting full-ticket semantic replay review.',
      authorship: { verified: true, method: 'structured_message_customer_id_match', messageRef: candidate.messageRef }
    };
  });
}

export function buildRoutingExemplars(candidates, goldRecords, threshold) {
  const reviewedGold = goldRecords.filter((record) => record.goldStatus === 'reviewed');
  const goldTranscripts = new Set(reviewedGold.flatMap((record) => record.sourceTranscriptIds));
  const goldQueries = reviewedGold.map((record) => record.query);
  const exactGold = new Set(goldQueries.map(normalizeRoutingText));
  const exemplars = [];
  const provenance = [];
  const leakage = { sameTranscript: 0, exactQuery: 0, nearDuplicate: 0, threshold };
  for (const candidate of candidates) {
    if (goldTranscripts.has(candidate.sourceTranscriptId)) { leakage.sameTranscript += 1; continue; }
    const normalized = normalizeRoutingText(candidate.query);
    if (exactGold.has(normalized)) { leakage.exactQuery += 1; continue; }
    if (goldQueries.some((query) => characterDice(candidate.query, query) >= threshold)) { leakage.nearDuplicate += 1; continue; }
    const id = `route-example.${String(exemplars.length + 1).padStart(6, '0')}`;
    const ruleMatches = unique(classifySupportText(candidate.query).filter((caseId) => candidate.candidateCaseIds.includes(caseId)));
    const caseIds = candidate.candidateCaseIds.length === 1 ? candidate.candidateCaseIds : ruleMatches.length === 1 ? ruleMatches : candidate.candidateCaseIds.slice(0, 3);
    exemplars.push({
      id,
      text: candidate.query,
      caseIds,
      entityIds: candidate.entityIds,
      scope: {},
      turnType: 'first_turn',
      weight: caseIds.length === 1 ? 1 : Number((1 / Math.sqrt(caseIds.length)).toFixed(4))
    });
    provenance.push({ id, sourceTranscriptId: candidate.sourceTranscriptId, sourceTicketNumber: candidate.sourceTicketNumber, messageRef: candidate.messageRef });
  }
  const postAudit = { sameTranscript: 0, exactQuery: 0, nearDuplicate: 0, threshold };
  for (const [index, exemplar] of exemplars.entries()) {
    const source = provenance[index];
    if (goldTranscripts.has(source.sourceTranscriptId)) postAudit.sameTranscript += 1;
    if (exactGold.has(normalizeRoutingText(exemplar.text))) postAudit.exactQuery += 1;
    if (goldQueries.some((query) => characterDice(exemplar.text, query) >= threshold)) postAudit.nearDuplicate += 1;
  }
  return { exemplars, provenance, excludedDuringBuild: leakage, leakageAudit: postAudit };
}

export function partitionHistoricalRecords(records) {
  return {
    firstTurn: records.filter((record) => record.turnType === 'first_turn'),
    followUp: records.filter((record) => record.turnType === 'follow_up')
  };
}

function distribution(records, caseById) {
  const reviewed = records.filter((record) => record.goldStatus === 'reviewed');
  const cases = {};
  const families = {};
  for (const record of reviewed) {
    for (const id of record.expected.caseIds) cases[id] = (cases[id] ?? 0) + 1;
    const family = caseById.get(record.expected.primaryCaseId)?.family ?? 'unknown';
    families[family] = (families[family] ?? 0) + 1;
  }
  return { reviewed: reviewed.length, needsReview: records.length - reviewed.length, uniqueTranscripts: new Set(reviewed.flatMap((record) => record.sourceTranscriptIds)).size, uniqueCases: Object.keys(cases).length, uniqueFamilies: Object.keys(families).length, cases, families };
}

export async function buildSupportEvaluationPartitions(options) {
  const dataDir = resolve(options.dataDir);
  const canonicalDir = join(dataDir, 'knowledge-canonical');
  const auditDir = join(canonicalDir, 'Audit');
  const evaluationDir = join(canonicalDir, 'Evaluation');
  const runtimeDir = join(dataDir, 'runtime-kb');
  const threshold = options.nearDuplicateThreshold ?? 0.9;
  const coverage = await readJsonl(join(auditDir, 'case-coverage.jsonl'));
  const reviewRecords = await readJsonl(join(dataDir, 'analysis-input', 'review.ndjson'));
  const reviewByTranscript = new Map(reviewRecords.map((record) => [record.transcriptId, record]));
  const ticketByTranscript = await loadTicketKnowledge(dataDir);
  const runtimeCases = await readJsonl(join(runtimeDir, 'cases.jsonl'));
  const caseById = new Map(runtimeCases.map((record) => [record.id, record]));
  const aliasEntries = buildAliasIndex(await readJson(join(runtimeDir, 'aliases.json')));
  const firstTurnReviews = await readJsonl(join(auditDir, 'first-turn-semantic-review.jsonl'), true);
  const replayReviews = await readJsonl(join(auditDir, 'historical-replay-semantic-review.jsonl'), true);
  const oldGold = await readJsonl(join(evaluationDir, 'historical-utterance-gold.jsonl'));
  const coverageByTranscript = new Map(coverage.map((record) => [record.transcriptId, record]));

  const authorship = await buildAuthorshipCandidates(dataDir, coverage, reviewByTranscript, ticketByTranscript);
  for (const candidate of authorship.candidates) {
    candidate.entityIds = unique([...candidate.entityIds, ...resolveAliases(candidate.query, aliasEntries).flatMap((match) => match.targetIds).filter((id) => !id.startsWith('case.'))]);
  }
  const firstTurnGold = applyFirstTurnReviews(authorship.candidates, firstTurnReviews, caseById);
  const replayCandidates = await buildReplayCandidates(dataDir, oldGold, reviewByTranscript, ticketByTranscript, coverageByTranscript);
  const historicalReplay = applyReplayReviews(replayCandidates, replayReviews);
  const routing = buildRoutingExemplars(authorship.candidates, firstTurnGold, threshold);
  const goldDistribution = distribution(firstTurnGold, caseById);
  const contaminationRejected = authorship.contamination.bot + authorship.contamination.staff + authorship.contamination.system;
  const qualityAudit = {
    schemaVersion: 1,
    candidateLiteralRecords: authorship.candidates.length + authorship.rejected.length,
    authorshipVerified: authorship.candidates.length,
    authorshipRejected: authorship.rejected.length,
    botStaffSystemContaminationRejected: contaminationRejected,
    contaminationByType: authorship.contamination,
    reviewed: goldDistribution.reviewed,
    needsReview: goldDistribution.needsReview,
    firstTurn: goldDistribution.reviewed,
    followUpReplay: historicalReplay.filter((record) => record.goldStatus === 'reviewed').length,
    uniqueTranscripts: goldDistribution.uniqueTranscripts,
    uniqueCases: goldDistribution.uniqueCases,
    uniqueFamilies: goldDistribution.uniqueFamilies,
    structuredSpotChecksRequired: 50,
    structuredSpotChecksCompleted: Math.min(50, firstTurnReviews.filter((record) => record.structuredTranscriptSpotCheck === true && record.goldStatus === 'reviewed').length)
  };

  await writeJsonl(join(auditDir, 'first-turn-authorship-candidates.jsonl'), authorship.candidates);
  await writeJsonl(join(auditDir, 'first-turn-authorship-rejected.jsonl'), authorship.rejected);
  await writeJsonl(join(auditDir, 'historical-replay-candidates.jsonl'), replayCandidates);
  await writeJsonl(join(evaluationDir, 'historical-first-turn-gold.jsonl'), firstTurnGold);
  await writeJsonl(join(evaluationDir, 'historical-state-replay.jsonl'), historicalReplay);
  await writeJsonl(join(runtimeDir, 'routing-exemplars.jsonl'), routing.exemplars);
  await writeJsonl(join(auditDir, 'routing-exemplar-provenance.jsonl'), routing.provenance);
  await writeJson(join(auditDir, 'routing-exemplar-leakage-audit.json'), { schemaVersion: 1, goldReviewedRecords: goldDistribution.reviewed, exemplarRecords: routing.exemplars.length, excludedDuringBuild: routing.excludedDuringBuild, finalLeakage: routing.leakageAudit });
  await writeJson(join(auditDir, 'first-turn-gold-quality-audit.json'), qualityAudit);
  await writeJson(join(auditDir, 'first-turn-gold-distribution.json'), goldDistribution);
  return { qualityAudit, goldDistribution, replayCandidates: replayCandidates.length, reviewedReplay: historicalReplay.filter((record) => record.goldStatus === 'reviewed').length, routingExemplars: routing.exemplars.length, leakage: routing.leakageAudit };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write('node build-support-evaluation-partitions.mjs --data-dir <CM-Ticket-Transcripts> [--near-duplicate-threshold 0.9]\n');
    return;
  }
  process.stdout.write(`${JSON.stringify(await buildSupportEvaluationPartitions(options), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { process.stderr.write(`${error.stack ?? error.message}\n`); process.exitCode = 1; });
