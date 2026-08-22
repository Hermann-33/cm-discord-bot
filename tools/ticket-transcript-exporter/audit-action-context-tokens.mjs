import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const readJsonl = async (file) => (await readFile(file, 'utf8')).split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
const tokens = (value) => Math.ceil(JSON.stringify(value).length / 4);
const percentile = (values, p) => { if (!values.length) return 0; const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)]; };
const stats = (values) => ({ count: values.length, average: values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0, median: percentile(values, 0.5), p95: percentile(values, 0.95) });

export async function auditActionContextTokens(dataDir) {
  const actions = await readJsonl(path.join(dataDir, 'knowledge-canonical', 'Evaluation', 'first-turn-action-reviewed-v1-v2.jsonl'));
  const cases = await readJsonl(path.join(dataDir, 'runtime-kb', 'cases.jsonl'));
  const clarifications = await readJson(path.join(dataDir, 'runtime-kb', 'clarifications.json'));
  const dynamic = await readJson(path.join(dataDir, 'runtime-kb', 'dynamic-lookups.json'));
  const policies = await readJson(path.join(dataDir, 'runtime-kb', 'policies.json'));
  const byCase = new Map(cases.map((item) => [item.id, item])); const byClarification = new Map(clarifications.map((item) => [item.id, item]));
  const byDynamic = new Map((dynamic.lookups ?? dynamic).map((item) => [item.id, item])); const byPolicy = new Map((policies.policies ?? policies).map((item) => [item.id, item]));
  const groups = { static_case: [], dynamic_lookup: [], policy_route: [], clarification: [], state_transition: [] };
  for (const record of actions) {
    const common = { entities: record.observableEntityIds, candidateFamilyIds: record.observableFamilyIds };
    if (record.primaryDecision === 'direct_static_case') {
      const item = byCase.get(record.observableCaseIds[0]);
      groups.static_case.push(tokens({ ...common, case: item && { id: item.id, displayName: item.displayName, scope: item.scope, ask: item.ask, causes: item.causes, flow: item.flow, policies: item.policies, dynamic: item.dynamic, escalationIds: item.escalationIds } }));
    } else if (record.primaryDecision === 'direct_dynamic_lookup') {
      groups.dynamic_lookup.push(tokens({ ...common, lookupIds: record.lookupIds, lookups: (record.dynamicLookupIds ?? []).map((id) => byDynamic.get(id)).filter(Boolean), knownContext: {} }));
    } else if (record.primaryDecision === 'direct_policy_route') {
      groups.policy_route.push(tokens({ ...common, caseIds: record.observableCaseIds, policies: (record.policyIds ?? []).map((id) => byPolicy.get(id)).filter(Boolean), currentAuthorityRequired: true }));
    } else if (record.primaryDecision.endsWith('_clarification')) {
      groups.clarification.push(tokens({ ...common, candidateCaseIds: record.observableCaseIds, clarification: byClarification.get(record.clarificationId), knownContext: {} }));
    }
  }
  const replays = (await readJsonl(path.join(dataDir, 'knowledge-canonical', 'Evaluation', 'historical-state-replay.jsonl'))).filter((row) => row.goldStatus === 'reviewed');
  for (const replay of replays) {
    const item = byCase.get(replay.expected.activeCaseId);
    groups.state_transition.push(tokens({ activeCase: item && { id: item.id, displayName: item.displayName, flow: item.flow, ask: item.ask, dynamic: item.dynamic, escalationIds: item.escalationIds }, knownContext: replay.expected.knownContext, resolvedEntities: replay.expected.resolvedEntities, procedureOutcomes: replay.expected.procedureOutcomes }));
  }
  const audit = { schemaVersion: 1, tokenEstimator: 'ceil(JSON_UTF16_characters/4)', exemplarsSentToLlm: false, byActionType: Object.fromEntries(Object.entries(groups).map(([key, values]) => [key, stats(values)])) };
  await writeFile(path.join(dataDir, 'knowledge-canonical', 'Audit', 'action-context-token-audit.json'), `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
  return audit;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf('--data-dir');
  if (index < 0 || !process.argv[index + 1]) throw new Error('--data-dir is required');
  console.log(JSON.stringify(await auditActionContextTokens(path.resolve(process.argv[index + 1])), null, 2));
}
