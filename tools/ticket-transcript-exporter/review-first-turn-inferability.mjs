import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildAliasIndex } from './evaluate-canonical-support-retrieval.mjs';
import { attachObservableFamilies, reviewFirstTurnObservability } from './first-turn-action-router.mjs';

async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }
async function readJsonl(path) { return (await readFile(path, 'utf8')).split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line)); }
async function writeJson(path, value) { await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }
async function writeJsonl(path, values) { await writeFile(path, `${values.map((value) => JSON.stringify(value)).join('\n')}\n`, 'utf8'); }

function actionFor(primaryDecision) {
  if (primaryDecision === 'direct_static_case') return 'answer_case';
  if (primaryDecision === 'direct_dynamic_lookup') return 'request_dynamic_lookup';
  if (primaryDecision === 'direct_policy_route') return 'request_policy_route';
  if (primaryDecision === 'direct_attachment_route') return 'request_attachment';
  if (primaryDecision === 'direct_restricted_escalation') return 'restricted_escalation';
  if (primaryDecision === 'human_escalation') return 'human_escalation';
  if (primaryDecision === 'multi_intent_route') return 'multi_intent_route';
  if (primaryDecision === 'direct_support_operation') return 'support_operation';
  return 'ask_clarification';
}

export function buildActionReviewedRecords({ v1, v2, cases, aliases }) {
  const caseById = new Map(cases.map((record) => [record.id, record]));
  const consumed = [
    ...v1.filter((record) => record.goldStatus === 'reviewed').map((record) => ({ ...record, consumedBenchmark: 'v1' })),
    ...v2.map((record) => ({ ...record, consumedBenchmark: 'v2' }))
  ];
  const transcriptIds = new Set();
  return consumed.map((record, index) => {
    const transcriptId = record.sourceTranscriptIds[0];
    if (transcriptIds.has(transcriptId)) throw new Error(`Consumed benchmark transcript overlap: ${transcriptId}`);
    transcriptIds.add(transcriptId);
    const decision = attachObservableFamilies(reviewFirstTurnObservability(record.query, aliases), caseById);
    return {
      id: `first-turn-action.${String(index + 1).padStart(4, '0')}`,
      query: record.query,
      querySource: 'literal_customer_turn',
      authorship: record.authorship,
      sourceTranscriptIds: record.sourceTranscriptIds,
      sourceTicketNumbers: record.sourceTicketNumbers,
      consumedBenchmark: record.consumedBenchmark,
      goldStatus: 'reviewed',
      labelMethod: 'semantic_review_first_turn_observability',
      inferability: decision.inferability,
      informationSufficiency: decision.inferability === 'exact_case' ? 'sufficient_information' : 'insufficient_information',
      eventualCaseId: record.expected.primaryCaseId,
      observableCaseIds: decision.observableCaseIds,
      observableFamilyIds: decision.observableFamilyIds,
      observableEntityIds: decision.observableEntityIds,
      primaryDecision: decision.primaryDecision,
      action: actionFor(decision.primaryDecision),
      clarificationId: decision.clarificationId,
      lookupIds: decision.lookupIds ?? [],
      dynamicLookupIds: decision.dynamicLookupIds ?? [],
      decisionReason: decision.decisionReason,
      eventualCompatibility: !decision.observableCaseIds.length || decision.observableCaseIds.includes(record.expected.primaryCaseId) || decision.primaryDecision !== 'direct_static_case'
    };
  });
}

function counts(values, key) {
  return Object.fromEntries([...new Set(values.map((value) => value[key]))].sort().map((name) => [name, values.filter((value) => value[key] === name).length]));
}

export async function reviewConsumedFirstTurns(dataDir) {
  const root = resolve(dataDir); const audit = join(root, 'knowledge-canonical', 'Audit'); const evaluation = join(root, 'knowledge-canonical', 'Evaluation');
  const v1 = await readJsonl(join(evaluation, 'historical-first-turn-gold.jsonl'));
  const v2 = await readJsonl(join(evaluation, 'historical-first-turn-gold-v2.jsonl'));
  const cases = await readJsonl(join(root, 'runtime-kb', 'cases.jsonl'));
  const aliases = buildAliasIndex(await readJson(join(root, 'runtime-kb', 'aliases.json')));
  const records = buildActionReviewedRecords({ v1, v2, cases, aliases });
  const summary = {
    schemaVersion: 1,
    reviewedRecords: records.length,
    consumedV1: records.filter((record) => record.consumedBenchmark === 'v1').length,
    consumedV2: records.filter((record) => record.consumedBenchmark === 'v2').length,
    inferability: counts(records, 'inferability'),
    primaryDecisions: counts(records, 'primaryDecision'),
    actions: counts(records, 'action'),
    clarificationIds: Object.fromEntries([...new Set(records.map((record) => record.clarificationId).filter(Boolean))].sort().map((id) => [id, records.filter((record) => record.clarificationId === id).length])),
    directStaticEventualCompatibility: {
      checked: records.filter((record) => record.primaryDecision === 'direct_static_case').length,
      compatible: records.filter((record) => record.primaryDecision === 'direct_static_case' && record.eventualCompatibility).length
    },
    informationBoundary: ['verified_first_customer_turn','explicit_entities','safe_session_metadata','current_authoritative_information','approved_lookup_capability'],
    futureHistoricalTurnsUsedForFirstDecision: false
  };
  await writeJsonl(join(evaluation, 'first-turn-action-reviewed-v1-v2.jsonl'), records);
  await writeJson(join(audit, 'first-turn-inferability-summary.json'), summary);
  return summary;
}

async function main() {
  const args = process.argv.slice(2); const index = args.indexOf('--data-dir'); if (index === -1 || !args[index + 1]) throw new Error('--data-dir is required.');
  process.stdout.write(`${JSON.stringify(await reviewConsumedFirstTurns(args[index + 1]), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { process.stderr.write(`${error.stack ?? error.message}\n`); process.exitCode = 1; });
