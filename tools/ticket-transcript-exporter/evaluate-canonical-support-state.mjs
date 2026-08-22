#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildAliasIndex } from './evaluate-canonical-support-retrieval.mjs';
import { applyAssistantAction, createSupportState, resolveSupportTurn } from './resolve-canonical-support-state.mjs';

export function parseArgs(argv) {
  const options = { dataDir: undefined, output: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--data-dir') options.dataDir = resolve(argv[++index] ?? '');
    else if (arg === '--output') options.output = resolve(argv[++index] ?? '');
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.help && !options.dataDir) throw new Error('--data-dir is required.');
  return options;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function readJsonl(path) {
  return (await readFile(path, 'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse);
}

function subset(actual, expected) {
  if (Array.isArray(expected)) return expected.every((item) => actual?.includes(item));
  if (expected && typeof expected === 'object') return Object.entries(expected).every(([key, value]) => subset(actual?.[key], value));
  return Object.is(actual, expected);
}

function validateTransitionReferences(cases, escalationIds) {
  const caseIds = new Set(cases.map((item) => item.id));
  let checked = 0;
  let valid = 0;
  for (const item of cases) {
    for (const id of [...(item.parentCaseIds ?? []), ...(item.specializesCaseIds ?? []), ...(item.relatedCaseIds ?? []), ...(item.requiresClarificationCaseIds ?? []), item.onSuccessCaseId, item.onFailureCaseId]) {
      if (!id) continue;
      checked += 1;
      if (caseIds.has(id)) valid += 1;
    }
    for (const id of item.escalationIds ?? []) {
      checked += 1;
      if (escalationIds.has(id)) valid += 1;
    }
    for (const flow of item.flow ?? []) for (const id of [flow.onSuccess, flow.onFailure]) {
      if (!id || id.startsWith('outcome.')) continue;
      checked += 1;
      if ((id.startsWith('case.') && caseIds.has(id)) || (id.startsWith('escalation.') && escalationIds.has(id))) valid += 1;
    }
  }
  return { checked, valid, rate: checked ? valid / checked : 1 };
}

export function evaluateStatefulConversations(records, cases, aliasEntries, escalationIds = new Set()) {
  const details = [];
  let repeatedDiagnostics = 0;
  let repeatedFailedProcedures = 0;
  for (const record of records) {
    let state = createSupportState(record.initialState);
    const actions = [];
    let recordRepeatedDiagnostics = 0;
    let recordRepeatedProcedures = 0;
    for (const turn of record.turns ?? []) {
      if (turn.role === 'assistant') {
        state = applyAssistantAction(state, turn.action);
        actions.push(turn.action ?? {});
        continue;
      }
      if (turn.role !== 'customer') continue;
      const before = createSupportState(state);
      const result = resolveSupportTurn({ state, customerText: turn.content, runtimeCases: cases, aliasEntries });
      state = result.state;
      if (result.action) actions.push(result.action);
      if (result.action?.askDiagnosticId && before.diagnosticsAsked.includes(result.action.askDiagnosticId)) { repeatedDiagnostics += 1; recordRepeatedDiagnostics += 1; }
      if (result.action?.recommendProcedureId && before.procedureOutcomes[result.action.recommendProcedureId] === 'failure') { repeatedFailedProcedures += 1; recordRepeatedProcedures += 1; }
    }
    const caseCorrect = state.activeCaseId === record.expectedCaseId;
    const finalStateCorrect = subset(state, record.expectedFinalState ?? {});
    const entitiesCarried = subset(state.resolvedEntities, record.expectedResolvedEntities ?? []);
    const forbiddenProcedureRepeated = recordRepeatedProcedures > 0;
    const forbiddenDiagnosticRepeated = recordRepeatedDiagnostics > 0;
    details.push({ id: record.id, family: record.family, caseCorrect, finalStateCorrect, entitiesCarried, forbiddenProcedureRepeated, forbiddenDiagnosticRepeated, finalState: state, actions });
  }
  const references = validateTransitionReferences(cases, escalationIds);
  const rate = (items, predicate) => items.length ? items.filter(predicate).length / items.length : 1;
  const alreadyTried = details.filter((item) => item.family === 'already_tried');
  const multiTurn = details.filter((item) => item.family === 'multi_turn');
  return {
    schemaVersion: 1,
    conversationCount: records.length,
    alreadyTriedTransitionAccuracy: rate(alreadyTried, (item) => item.caseCorrect && item.finalStateCorrect && !item.forbiddenProcedureRepeated),
    caseTransitionAccuracy: rate(details, (item) => item.caseCorrect && item.finalStateCorrect),
    multiTurnCompletionRouting: rate(multiTurn, (item) => item.caseCorrect && item.finalStateCorrect && !item.forbiddenDiagnosticRepeated),
    knownContextCarryForwardAccuracy: rate(details.filter((item) => (records.find((record) => record.id === item.id)?.expectedResolvedEntities ?? []).length), (item) => item.entitiesCarried),
    repeatedKnownDiagnosticCount: repeatedDiagnostics,
    repeatedFailedProcedureCount: repeatedFailedProcedures,
    validTransitionReferences: references,
    details
  };
}

export async function evaluateCanonicalSupportState(options) {
  const runtimeDir = join(options.dataDir, 'runtime-kb');
  const cases = await readJsonl(join(runtimeDir, 'cases.jsonl'));
  const aliasEntries = buildAliasIndex(await readJson(join(runtimeDir, 'aliases.json')));
  const escalationIds = new Set((await readJson(join(runtimeDir, 'escalations.json'))).map((item) => item.id));
  const records = await readJsonl(join(options.dataDir, 'knowledge-canonical', 'Evaluation', 'stateful-conversations.jsonl'));
  return { evaluatedAt: new Date().toISOString(), ...evaluateStatefulConversations(records, cases, aliasEntries, escalationIds) };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write('Usage: node evaluate-canonical-support-state.mjs --data-dir <CM-Ticket-Transcripts> [--output <path>]\n');
    return;
  }
  const result = await evaluateCanonicalSupportState(options);
  if (options.output) {
    await mkdir(resolve(options.output, '..'), { recursive: true });
    await writeFile(options.output, `${JSON.stringify(result, null, 2)}\n`);
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
