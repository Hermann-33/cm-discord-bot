import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAssistantAction, createSupportState, resolveSupportTurn } from '../../tools/ticket-transcript-exporter/resolve-canonical-support-state.mjs';

const cases = [
  { id: 'case.rust.nfa.server_load_crash', family: 'technical.rust_nfa', scope: { global: false, games: ['game.rust'], accountModels: ['account_model.nfa'] }, ask: ['diagnostic.rust.graphics_level'], flow: [{ procedureId: 'procedure.system.reduce_resource_pressure', onFailure: 'case.rust.nfa.server_load_crash.continue' }], onFailureCaseId: 'case.rust.nfa.server_load_crash.continue', match: { phrases: ['rust crashes loading world'] } },
  { id: 'case.rust.nfa.server_load_crash.continue', family: 'technical.rust_nfa', scope: { global: false, games: ['game.rust'], accountModels: ['account_model.nfa'] }, parentCaseIds: ['case.rust.nfa.server_load_crash'], match: { phrases: ['graphics low still crashes'] }, flow: [] },
  { id: 'case.game.crash_loading', family: 'technical.game', scope: { global: true }, match: { phrases: ['game crashes loading'] }, flow: [] },
  { id: 'case.loader.closes_runtime', family: 'technical.loader', scope: { global: true }, ask: ['diagnostic.loader.webview_present'], flow: [{ procedureId: 'procedure.loader.install_webview_runtime', onFailure: 'escalation.known_flow_exhausted' }], match: { phrases: ['loader closes'] } },
  { id: 'case.order.status', family: 'commerce.order', scope: { global: true }, ask: ['diagnostic.order.reference_available'], dynamic: ['dynamic.order.status'], flow: [], match: { phrases: ['where is my order'] } }
];

const aliases = [
  { alias: 'rust', targetIds: ['game.rust'] },
  { alias: 'nfa', targetIds: ['account_model.nfa'] },
  { alias: 'ancient', targetIds: ['vendor.ancient'] },
  { alias: 'exodus', targetIds: ['vendor.exodus'] }
];

test('already-tried Rust resource procedure deterministically advances without retrieval', () => {
  let state = createSupportState({ activeCaseId: 'case.rust.nfa.server_load_crash', resolvedEntities: ['game.rust', 'account_model.nfa'] });
  state = applyAssistantAction(state, { recommendProcedureId: 'procedure.system.reduce_resource_pressure' });
  const result = resolveSupportTurn({ state, customerText: 'graphics are already low and background apps are already closed; still crashes', runtimeCases: cases, aliasEntries: aliases });
  assert.equal(result.usedRetrieval, false);
  assert.equal(result.state.activeCaseId, 'case.rust.nfa.server_load_crash.continue');
  assert.equal(result.state.procedureOutcomes['procedure.system.reduce_resource_pressure'], 'failure');
  assert.ok(result.state.caseHistory.includes('case.rust.nfa.server_load_crash'));
  assert.notEqual(result.action?.recommendProcedureId, 'procedure.system.reduce_resource_pressure');
});

test('WebView already present advances to escalation and never recommends installation', () => {
  let state = applyAssistantAction(createSupportState({ activeCaseId: 'case.loader.closes_runtime' }), { askDiagnosticId: 'diagnostic.loader.webview_present' });
  const result = resolveSupportTurn({ state, customerText: 'Yes, WebView is already installed.', runtimeCases: cases, aliasEntries: aliases });
  assert.equal(result.state.knownContext.webviewInstalled, true);
  assert.equal(result.state.procedureOutcomes['procedure.loader.install_webview_runtime'], 'not_applicable_already_present');
  assert.equal(result.action.escalationId, 'escalation.known_flow_exhausted');
  assert.notEqual(result.action.recommendProcedureId, 'procedure.loader.install_webview_runtime');
});

test('known order selector suppresses repeated diagnostic and requests live lookup', () => {
  let state = applyAssistantAction(createSupportState({ activeCaseId: 'case.order.status', knownContext: { orderSelector: '[known selector]' } }), { askDiagnosticId: 'diagnostic.order.reference_available' });
  const result = resolveSupportTurn({ state, customerText: 'I already sent it above.', runtimeCases: cases, aliasEntries: aliases });
  assert.equal(result.action.requestDynamicLookupId, 'dynamic.order.status');
  assert.equal(result.action.useKnownSelector, true);
  assert.equal(result.state.pendingDiagnosticId, null);
});

test('ordinary negation records negative state instead of positive lexical conditions', () => {
  const result = resolveSupportTurn({ state: { activeCaseId: 'case.game.crash_loading' }, customerText: "graphics aren't high, I don't use a VPN, and I didn't receive the order", runtimeCases: cases, aliasEntries: aliases });
  assert.equal(result.state.knownContext.graphicsLevel, 'low');
  assert.equal(result.state.knownContext.vpnActive, false);
  assert.equal(result.state.knownContext.fulfillmentReceived, false);
});

test('resolved entities carry forward and explicitly negated aliases do not replace them', () => {
  const result = resolveSupportTurn({ state: { resolvedEntities: ['game.rust', 'vendor.ancient'], activeCaseId: 'case.rust.nfa.server_load_crash' }, customerText: 'still happens after WebView, not Exodus', runtimeCases: cases, aliasEntries: aliases });
  assert.ok(result.state.resolvedEntities.includes('game.rust'));
  assert.ok(result.state.resolvedEntities.includes('vendor.ancient'));
  assert.ok(!result.state.resolvedEntities.includes('vendor.exodus'));
});

test('failed procedures and answered diagnostics are not repeated while context is unchanged', () => {
  const state = createSupportState({ activeCaseId: 'case.rust.nfa.server_load_crash', diagnosticsAsked: ['diagnostic.rust.graphics_level'], diagnosticAnswers: { 'diagnostic.rust.graphics_level': 'low' }, proceduresAttempted: ['procedure.system.reduce_resource_pressure'], procedureOutcomes: { 'procedure.system.reduce_resource_pressure': 'failure' } });
  const result = resolveSupportTurn({ state, customerText: 'same error', runtimeCases: cases, aliasEntries: aliases });
  assert.notEqual(result.action?.askDiagnosticId, 'diagnostic.rust.graphics_level');
  assert.notEqual(result.action?.recommendProcedureId, 'procedure.system.reduce_resource_pressure');
});

test('specialized Rust NFA case outranks generic loading crash when scope is resolved', () => {
  const result = resolveSupportTurn({ state: {}, customerText: 'Rust NFA crashes loading the world', runtimeCases: cases, aliasEntries: aliases });
  assert.equal(result.state.activeCaseId, 'case.rust.nfa.server_load_crash');
});
