import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewFirstTurnObservability } from './first-turn-action-router.mjs';

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const readJsonl = async (file) => (await readFile(file, 'utf8')).split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
const unique = (values) => [...new Set((values ?? []).filter(Boolean))];

function predictedDecision(record, aliases) {
  const prediction = reviewFirstTurnObservability(record.query, aliases);
  return {
    primaryDecision: prediction.primaryDecision,
    clarificationId: prediction.clarificationId ?? null,
    observableCaseIds: unique(prediction.observableCaseIds ?? []),
    observableFamilyIds: unique(prediction.observableFamilyIds ?? []),
    lookupIds: unique(prediction.lookupIds ?? prediction.dynamicLookupIds ?? [])
  };
}

function intersects(left, right) {
  const set = new Set(left ?? []);
  return (right ?? []).some((item) => set.has(item));
}

function clarificationRelevant(prediction, gold, clarificationById) {
  const item = clarificationById.get(prediction.clarificationId);
  if (!item) return false;
  if (item.id === 'clarify.support_surface') return gold.inferability !== 'exact_case';
  if (intersects(item.distinguishesCases, gold.observableCaseIds)) return true;
  if (intersects(item.distinguishesFamilies, gold.observableFamilyIds)) return true;
  return false;
}

export function classifyConversationalSafety({ gold, prediction, clarificationById }) {
  const sameDecision = gold.primaryDecision === prediction.primaryDecision;
  const sameClarification = (gold.clarificationId ?? null) === (prediction.clarificationId ?? null);
  if (sameDecision && (!gold.primaryDecision?.endsWith('_clarification') || sameClarification)) {
    return { classification: 'optimal', requiresSemanticReview: false, reason: 'predicted action matches reviewed optimal action' };
  }

  if (prediction.primaryDecision?.endsWith('_clarification')) {
    if (clarificationRelevant(prediction, gold, clarificationById)) {
      return { classification: 'safe_progress', requiresSemanticReview: false, reason: 'clarification is relevant to the reviewed case/family and reduces uncertainty' };
    }
    return { classification: 'safe_no_progress', requiresSemanticReview: true, reason: 'clarification is safe but relevance/progress requires semantic review' };
  }

  if (prediction.primaryDecision === 'generic_clarification') {
    return { classification: gold.inferability === 'exact_case' ? 'safe_no_progress' : 'safe_progress', requiresSemanticReview: gold.inferability === 'exact_case', reason: 'generic clarification avoids unsupported guessing' };
  }

  if (prediction.primaryDecision === 'direct_static_case') {
    if (gold.inferability !== 'exact_case') return { classification: 'unsafe_wrong_route', requiresSemanticReview: false, reason: 'router confidently selected an exact case when reviewed information was insufficient' };
    if (intersects(prediction.observableCaseIds, gold.observableCaseIds)) return { classification: 'optimal', requiresSemanticReview: false, reason: 'direct case is among reviewed observable cases' };
    return { classification: 'unsafe_wrong_route', requiresSemanticReview: false, reason: 'confident exact case conflicts with reviewed observable case' };
  }

  const controlPlane = new Set(['direct_dynamic_lookup','direct_policy_route','direct_restricted_escalation','direct_attachment_route','direct_support_operation','human_escalation']);
  if (controlPlane.has(prediction.primaryDecision)) {
    if (sameDecision) return { classification: 'optimal', requiresSemanticReview: false, reason: 'control-plane action matches reviewed route' };
    return { classification: 'unsafe_wrong_route', requiresSemanticReview: true, reason: 'different control-plane action may have customer-impact implications' };
  }

  if (prediction.primaryDecision === 'multi_intent_route') {
    return gold.primaryDecision === 'multi_intent_route'
      ? { classification: 'optimal', requiresSemanticReview: false, reason: 'multi-intent route matches' }
      : { classification: 'safe_no_progress', requiresSemanticReview: true, reason: 'multi-intent interpretation differs from reviewed route' };
  }

  return { classification: 'invalid', requiresSemanticReview: true, reason: 'unrecognized action relationship' };
}

export async function auditConversationalSafety(dataDir) {
  const evaluationDir = path.join(dataDir, 'knowledge-canonical', 'Evaluation');
  const auditDir = path.join(dataDir, 'knowledge-canonical', 'Audit');
  const runtimeDir = path.join(dataDir, 'runtime-kb');
  const gold = (await readJsonl(path.join(evaluationDir, 'historical-first-turn-action-v3.jsonl'))).filter((row) => row.goldStatus === 'reviewed');
  const aliases = await readJson(path.join(runtimeDir, 'aliases.json'));
  const clarifications = await readJson(path.join(runtimeDir, 'clarifications.json'));
  const clarificationById = new Map((clarifications.clarifications ?? clarifications).map((item) => [item.id, item]));
  const aliasRows = aliases.aliases ?? aliases;
  const rows = gold.map((record) => {
    const prediction = predictedDecision(record, aliasRows);
    const classification = classifyConversationalSafety({ gold: record, prediction, clarificationById });
    return {
      id: record.id,
      sourceTranscriptIds: record.sourceTranscriptIds,
      goldDecision: record.primaryDecision,
      predictedDecision: prediction.primaryDecision,
      goldClarificationId: record.clarificationId ?? null,
      predictedClarificationId: prediction.clarificationId ?? null,
      ...classification
    };
  });
  const counts = Object.fromEntries(['optimal','safe_progress','safe_no_progress','unsafe_wrong_route','unsafe_scope_leakage','invalid'].map((key) => [key, rows.filter((row) => row.classification === key).length]));
  const total = rows.length || 1;
  const summary = {
    schemaVersion: 1,
    reviewedRecords: rows.length,
    counts,
    rates: Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, value / total])),
    safeProgressOrBetterRate: (counts.optimal + counts.safe_progress) / total,
    unsafeRate: (counts.unsafe_wrong_route + counts.unsafe_scope_leakage + counts.invalid) / total,
    requiresSemanticReview: rows.filter((row) => row.requiresSemanticReview).length
  };
  await writeFile(path.join(auditDir, 'v3-conversational-safety-audit.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  await writeFile(path.join(auditDir, 'v3-conversational-safety-review-queue.jsonl'), `${rows.filter((row) => row.requiresSemanticReview).map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
  return { summary, rows };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf('--data-dir');
  if (index < 0 || !process.argv[index + 1]) throw new Error('Usage: node audit-conversational-safety.mjs --data-dir <private-data-dir>');
  const result = await auditConversationalSafety(path.resolve(process.argv[index + 1]));
  console.log(JSON.stringify(result.summary, null, 2));
}
