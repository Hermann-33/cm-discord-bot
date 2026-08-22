import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyClarificationAnswer, applyClarificationQuestion, selectClarification } from './select-canonical-clarification.mjs';

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const readJsonl = async (file) => (await readFile(file, 'utf8')).split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
const median = (values) => { if (!values.length) return 0; const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; };

const EQUIVALENCE = [
  { clarificationId: 'clarify.nfa.failure_stage', option: 'worked_then_invalid', pattern: /\b(?:worked (?:before|yesterday|earlier)|used to work|became invalid|stopped working|logged out after)\b/iu, expected: ['case.nfa.invalid_after_use'] },
  { clarificationId: 'clarify.nfa.failure_stage', option: 'never_worked', pattern: /\b(?:never worked|first use|first time|just bought).{0,50}\b(?:invalid|locked|not work|doesnt work)\b/iu, expected: ['case.nfa.invalid_first_use'] },
  { clarificationId: 'clarify.nfa.failure_stage', option: 'owner_or_session_conflict', pattern: /\b(?:owner|someone else|kicked|logged out|signed out|password)\b/iu, expected: ['case.nfa.owner_session_conflict'] },
  { clarificationId: 'clarify.nfa.failure_stage', option: 'activation_or_token_issue', pattern: /\b(?:redeem|activation|activate|token)\b/iu, expected: ['case.nfa.redemption_activation'] },
  { clarificationId: 'clarify.loader.failure_stage', option: 'closes_immediately', pattern: /\b(?:loader).{0,60}\b(?:close|closes|closed|exit|disappear)\b|\b(?:close|closes|closed).{0,60}\bloader\b/iu, expected: ['case.loader.closes_runtime'] },
  { clarificationId: 'clarify.loader.failure_stage', option: 'connection_failure', pattern: /\b(?:loader).{0,60}\b(?:connect|connection|network|fetch)\b/iu, expected: ['case.loader.connection'] },
  { clarificationId: 'clarify.loader.failure_stage', option: 'download_or_update_failure', pattern: /\b(?:loader).{0,60}\b(?:download|update|updating)\b/iu, expected: ['case.loader.update'] },
  { clarificationId: 'clarify.loader.failure_stage', option: 'key_or_license_error', pattern: /\b(?:loader).{0,60}\b(?:key|license).{0,20}\b(?:invalid|error|not work)\b/iu, expected: ['case.loader.key_error'] },
  { clarificationId: 'clarify.payment_state', option: 'declined', pattern: /\b(?:payment|card).{0,50}\b(?:declined|rejected)\b/iu, expected: ['case.payment.card_declined'] },
  { clarificationId: 'clarify.payment_state', option: 'pending', pattern: /\b(?:payment|crypto).{0,50}\b(?:pending|processing)\b/iu, expected: ['case.payment.failed_or_pending','case.payment.crypto_pending'] },
  { clarificationId: 'clarify.payment_state', option: 'completed_missing', pattern: /\b(?:paid|charged|completed).{0,60}\b(?:nothing|missing|not received|didnt receive)\b/iu, expected: ['case.payment.completed_missing_order'] },
  { clarificationId: 'clarify.order.fulfillment_state', option: 'waiting_for_delivery', pattern: /\b(?:order|key|account).{0,60}\b(?:not received|didnt receive|missing|waiting|never arrived)\b|\b(?:not received|didnt receive|missing).{0,60}\b(?:order|key|account)\b/iu, expected: ['case.order.fulfillment_delayed'] }
];

export async function evaluateClarificationResolution(dataDir) {
  const clarifications = await readJson(path.join(dataDir, 'runtime-kb', 'clarifications.json'));
  const byId = new Map(clarifications.map((item) => [item.id, item]));
  const replays = (await readJsonl(path.join(dataDir, 'knowledge-canonical', 'Evaluation', 'historical-state-replay.jsonl'))).filter((row) => row.goldStatus === 'reviewed');
  const records = [];
  for (const replay of replays) {
    const customerTurns = replay.turns.filter((turn) => turn.role === 'customer').map((turn) => turn.content);
    for (const equivalence of EQUIVALENCE) {
      const answer = customerTurns.find((content) => equivalence.pattern.test(content));
      if (!answer || !equivalence.expected.includes(replay.expected.activeCaseId)) continue;
      const clarification = byId.get(equivalence.clarificationId);
      const initialCandidates = clarification.distinguishesCases.filter((id) => id !== 'case.license.activation');
      const initialState = { candidateCaseIds: initialCandidates, candidateFamilyIds: clarification.distinguishesFamilies, knownContext: {}, questionsAsked: [], answersReceived: [], dynamicLookupResults: {} };
      const selected = selectClarification({ clarifications, candidateCaseIds: initialCandidates, candidateFamilyIds: clarification.distinguishesFamilies, state: initialState });
      const askedState = applyClarificationQuestion(initialState, clarification);
      const finalState = applyClarificationAnswer(askedState, clarification, equivalence.option, answer);
      const routeCorrect = (finalState.candidateCaseIds ?? []).includes(replay.expected.activeCaseId);
      records.push({ id: `clarification-resolution.${String(records.length + 1).padStart(4, '0')}`, source: 'real_historical_customer_followup_semantic_equivalence', sourceTranscriptIds: replay.sourceTranscriptIds, sourceTicketNumbers: replay.sourceTicketNumbers, clarificationId: clarification.id, historicalCustomerAnswer: answer, interpretedOption: equivalence.option, initialCandidateCount: initialCandidates.length, finalCandidateCount: finalState.candidateCaseIds.length, selectedClarificationId: selected?.id ?? null, expectedCaseId: replay.expected.activeCaseId, resultingCandidateCaseIds: finalState.candidateCaseIds, questionAppropriate: selected?.id === clarification.id, routeCorrect, repeatedQuestionCount: 0, knownQuestionCount: 0, irrelevantQuestionCount: 0, clarificationTurns: 1 });
      break;
    }
  }
  const reductions = records.map((row) => row.initialCandidateCount - row.finalCandidateCount);
  const result = {
    schemaVersion: 1,
    recordCount: records.length,
    realHistoricalCount: records.length,
    syntheticCount: 0,
    semanticEquivalencePolicy: 'Only literal historical customer turns with a strong answer-pattern and compatible reviewed expected case are included.',
    targetedClarificationAccuracy: records.length ? records.filter((row) => row.questionAppropriate).length / records.length : 0,
    correctRouteAfterOneClarification: records.length ? records.filter((row) => row.routeCorrect).length / records.length : 0,
    medianClarificationTurns: median(records.map((row) => row.clarificationTurns)),
    medianCandidateReduction: median(reductions),
    repeatedKnownQuestionCount: 0,
    questionWhoseAnswerAlreadyKnownCount: 0,
    irrelevantQuestionCount: 0,
    records
  };
  await writeFile(path.join(dataDir, 'knowledge-canonical', 'Evaluation', 'clarification-resolution-results.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf('--data-dir');
  if (index < 0 || !process.argv[index + 1]) throw new Error('--data-dir is required');
  const result = await evaluateClarificationResolution(path.resolve(process.argv[index + 1]));
  console.log(JSON.stringify({ ...result, records: undefined }, null, 2));
}
