import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildAliasIndex } from './evaluate-canonical-support-retrieval.mjs';
import { resolveSupportTurn } from './resolve-canonical-support-state.mjs';

async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }
async function readJsonl(path) { return (await readFile(path, 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)); }
async function writeJson(path, value) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`); }

function customerTurn(record) {
  return [...(record.turns ?? [])].reverse().find((turn) => turn.role === 'customer')?.content ?? '';
}

function entriesMatch(actual = {}, expected = {}) {
  return Object.entries(expected).every(([key, value]) => JSON.stringify(actual[key]) === JSON.stringify(value));
}

function actionMatches(actual = {}, expected = {}) {
  const keys = ['transitionToCaseId', 'askDiagnosticId', 'recommendProcedureId', 'requestDynamicLookupId', 'escalationId'];
  return keys.filter((key) => expected[key]).every((key) => actual?.[key] === expected[key]);
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  return values[Math.min(values.length - 1, Math.floor((values.length - 1) * ratio))];
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: sorted.length,
    average: sorted.length ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length : 0,
    median: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95)
  };
}

function workload(result) {
  if (result.action?.requestDynamicLookupId) return 'dynamic_lookup';
  if (result.action?.escalationId) return 'escalation';
  if (result.usedRetrieval) return 'state_transition_scoped_retrieval';
  return 'deterministic_state_transition';
}

export function evaluateReplayRecords(records, runtimeCases, aliasEntries) {
  const reviewed = records.filter((record) => record.goldStatus === 'reviewed' && record.labelMethod === 'semantic_review_full_ticket' && record.authorship?.verified === true);
  const caseById = new Map(runtimeCases.map((record) => [record.id, record]));
  let transitionCorrect = 0;
  let routeCorrect = 0;
  let entityEligible = 0;
  let entityCorrect = 0;
  let contextEligible = 0;
  let contextCorrect = 0;
  let diagnosticEligible = 0;
  let diagnosticCorrect = 0;
  let procedureEligible = 0;
  let procedureCorrect = 0;
  let dynamicEligible = 0;
  let dynamicCorrect = 0;
  let escalationEligible = 0;
  let escalationCorrect = 0;
  let repeatedDiagnostics = 0;
  let repeatedFailedProcedures = 0;
  const contextTokens = { deterministic_state_transition: [], state_transition_scoped_retrieval: [], dynamic_lookup: [], escalation: [] };
  const details = [];

  for (const record of reviewed) {
    const query = customerTurn(record);
    const result = resolveSupportTurn({ state: record.initialState, customerText: query, runtimeCases, aliasEntries });
    const expected = record.expected ?? {};
    const transitionOk = result.state.activeCaseId === expected.activeCaseId;
    const routeOk = transitionOk && actionMatches(result.action, expected.nextAction);
    if (transitionOk) transitionCorrect += 1;
    if (routeOk) routeCorrect += 1;

    const wantedEntities = [...new Set([...(record.initialState?.resolvedEntities ?? []), ...(expected.resolvedEntities ?? [])])];
    if (wantedEntities.length) {
      entityEligible += 1;
      if (wantedEntities.every((id) => result.state.resolvedEntities.includes(id))) entityCorrect += 1;
    }
    const wantedContext = { ...(record.initialState?.knownContext ?? {}), ...(expected.knownContext ?? {}) };
    if (Object.keys(wantedContext).length) {
      contextEligible += 1;
      if (entriesMatch(result.state.knownContext, wantedContext)) contextCorrect += 1;
    }
    if (Object.keys(expected.diagnosticAnswers ?? {}).length) {
      diagnosticEligible += 1;
      if (entriesMatch(result.state.diagnosticAnswers, expected.diagnosticAnswers)) diagnosticCorrect += 1;
    }
    if (Object.keys(expected.procedureOutcomes ?? {}).length) {
      procedureEligible += 1;
      if (entriesMatch(result.state.procedureOutcomes, expected.procedureOutcomes)) procedureCorrect += 1;
    }

    const dynamicId = expected.nextAction?.requestDynamicLookupId;
    if (dynamicId) {
      dynamicEligible += 1;
      if (result.action?.requestDynamicLookupId === dynamicId) dynamicCorrect += 1;
    }
    const escalationId = expected.nextAction?.escalationId;
    if (escalationId) {
      escalationEligible += 1;
      if (result.action?.escalationId === escalationId) escalationCorrect += 1;
    }

    const blockedDiagnostics = new Set([...(record.initialState?.diagnosticsAsked ?? []), ...(expected.mustNotRepeatDiagnosticIds ?? [])]);
    if (result.action?.askDiagnosticId && blockedDiagnostics.has(result.action.askDiagnosticId)) repeatedDiagnostics += 1;
    const blockedProcedures = new Set([
      ...(expected.mustNotRepeatProcedureIds ?? []),
      ...Object.entries(record.initialState?.procedureOutcomes ?? {}).filter(([, outcome]) => outcome === 'failure').map(([id]) => id)
    ]);
    if (result.action?.recommendProcedureId && blockedProcedures.has(result.action.recommendProcedureId)) repeatedFailedProcedures += 1;

    const kind = workload(result);
    const selectedCase = caseById.get(result.state.activeCaseId) ?? null;
    const tokens = Math.ceil(JSON.stringify({ case: selectedCase, state: result.state, action: result.action }).length / 4);
    contextTokens[kind].push(tokens);
    details.push({ id: record.id, query, expectedCaseId: expected.activeCaseId, actualCaseId: result.state.activeCaseId, expectedAction: expected.nextAction, actualAction: result.action, transitionPriority: result.transitionPriority, usedRetrieval: result.usedRetrieval, transitionCorrect: transitionOk, routeCorrect: routeOk, workload: kind, contextTokens: tokens });
  }

  const n = Math.max(reviewed.length, 1);
  const ratio = (correct, eligible) => eligible ? correct / eligible : null;
  return {
    reviewedConversations: reviewed.length,
    activeCaseTransitionAccuracy: transitionCorrect / n,
    completionRoutingAccuracy: routeCorrect / n,
    entityCarryForwardAccuracy: ratio(entityCorrect, entityEligible),
    entityCarryForwardEligible: entityEligible,
    knownContextCarryForwardAccuracy: ratio(contextCorrect, contextEligible),
    knownContextCarryForwardEligible: contextEligible,
    diagnosticAnswerInterpretationAccuracy: ratio(diagnosticCorrect, diagnosticEligible),
    diagnosticAnswerEligible: diagnosticEligible,
    procedureOutcomeInterpretationAccuracy: ratio(procedureCorrect, procedureEligible),
    procedureOutcomeEligible: procedureEligible,
    repeatedKnownDiagnosticCount: repeatedDiagnostics,
    repeatedFailedProcedureCount: repeatedFailedProcedures,
    dynamicRoutingAccuracy: ratio(dynamicCorrect, dynamicEligible),
    dynamicRoutingEligible: dynamicEligible,
    escalationRoutingAccuracy: ratio(escalationCorrect, escalationEligible),
    escalationRoutingEligible: escalationEligible,
    contextTokens: Object.fromEntries(Object.entries(contextTokens).map(([key, values]) => [key, summarize(values)])),
    targets: { transitionAccuracy: 0.95, entityCarryForwardAccuracy: 0.99, knownContextCarryForwardAccuracy: 0.99, repeatedKnownDiagnosticCount: 0, repeatedFailedProcedureCount: 0 },
    targetsMet: transitionCorrect / n >= 0.95 && ratio(entityCorrect, entityEligible) >= 0.99 && ratio(contextCorrect, contextEligible) >= 0.99 && repeatedDiagnostics === 0 && repeatedFailedProcedures === 0,
    details
  };
}

export async function evaluateHistoricalStateReplay(options) {
  const dataDir = resolve(options.dataDir);
  const cases = await readJsonl(join(dataDir, 'runtime-kb', 'cases.jsonl'));
  const aliases = buildAliasIndex(await readJson(join(dataDir, 'runtime-kb', 'aliases.json')));
  const records = await readJsonl(join(dataDir, 'knowledge-canonical', 'Evaluation', 'historical-state-replay.jsonl'));
  const metrics = evaluateReplayRecords(records, cases, aliases);
  const report = { schemaVersion: 1, evaluatedAt: new Date().toISOString(), dataset: 'historical-state-replay', caseCount: cases.length, ...metrics };
  if (options.output) await writeJson(resolve(options.output), report);
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  const dataIndex = args.indexOf('--data-dir');
  const outputIndex = args.indexOf('--output');
  if (dataIndex === -1 || !args[dataIndex + 1]) throw new Error('--data-dir is required.');
  const result = await evaluateHistoricalStateReplay({ dataDir: args[dataIndex + 1], output: outputIndex === -1 ? null : args[outputIndex + 1] });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { process.stderr.write(`${error.stack ?? error.message}\n`); process.exitCode = 1; });
