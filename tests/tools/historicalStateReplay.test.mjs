import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateReplayRecords } from '../../tools/ticket-transcript-exporter/evaluate-historical-state-replay.mjs';

test('historical replay validates carry-forward, dynamic routing, and repetition guards', () => {
  const cases = [{ id: 'case.order.status', family: 'commerce.order', scope: { global: true }, ask: [], flow: [], dynamic: ['dynamic.order.status'], escalationIds: [], match: { phrases: ['where is my order'] } }];
  const records = [{
    id: 'replay.1', goldStatus: 'reviewed', labelMethod: 'semantic_review_full_ticket', authorship: { verified: true },
    initialState: { activeCaseId: 'case.order.status', resolvedEntities: ['game.rust'], knownContext: { orderSelectorAvailable: true }, diagnosticsAsked: ['diagnostic.order.reference_available'], diagnosticAnswers: { 'diagnostic.order.reference_available': true }, proceduresAttempted: ['procedure.failed'], procedureOutcomes: { 'procedure.failed': 'failure' } },
    turns: [{ role: 'customer', content: 'where is my order now?' }],
    expected: { activeCaseId: 'case.order.status', resolvedEntities: ['game.rust'], knownContext: { orderSelectorAvailable: true }, diagnosticAnswers: {}, procedureOutcomes: {}, nextAction: { requestDynamicLookupId: 'dynamic.order.status' }, mustNotRepeatDiagnosticIds: ['diagnostic.order.reference_available'], mustNotRepeatProcedureIds: ['procedure.failed'] }
  }];
  const result = evaluateReplayRecords(records, cases, []);
  assert.equal(result.activeCaseTransitionAccuracy, 1);
  assert.equal(result.entityCarryForwardAccuracy, 1);
  assert.equal(result.knownContextCarryForwardAccuracy, 1);
  assert.equal(result.dynamicRoutingAccuracy, 1);
  assert.equal(result.repeatedKnownDiagnosticCount, 0);
  assert.equal(result.repeatedFailedProcedureCount, 0);
});
