import assert from 'node:assert/strict';
import test from 'node:test';
import { CANONICAL_CLARIFICATIONS } from '../../tools/ticket-transcript-exporter/build-canonical-clarifications.mjs';
import { reviewFirstTurnObservability } from '../../tools/ticket-transcript-exporter/first-turn-action-router.mjs';
import { applyClarificationAnswer, applyClarificationQuestion, selectClarification } from '../../tools/ticket-transcript-exporter/select-canonical-clarification.mjs';
import { applyAssistantAction, createSupportState, resolveSupportTurn } from '../../tools/ticket-transcript-exporter/resolve-canonical-support-state.mjs';
import { auditActionPartitions, splitReviewedActions } from '../../tools/ticket-transcript-exporter/build-action-router-training.mjs';

const aliases = [
  { alias: 'nfa', targetIds: ['account_model.nfa'] },
  { alias: 'rust', targetIds: ['game.rust'] },
  { alias: 'cs2', targetIds: ['game.cs2'] },
  { alias: 'exodus', targetIds: ['vendor.exodus'] },
  { alias: 'pubg', targetIds: ['game.pubg'] }
];

test('insufficient first turn asks a support-surface question instead of guessing an eventual case', () => {
  const result = reviewFirstTurnObservability('this shit doesnt work', aliases);
  assert.equal(result.inferability, 'insufficient_context');
  assert.equal(result.primaryDecision, 'generic_clarification');
  assert.equal(result.clarificationId, 'clarify.support_surface');
  assert.deepEqual(result.observableCaseIds, []);
});

test('vague NFA issue preserves sibling cases and asks the discriminating failure-stage question', () => {
  const result = reviewFirstTurnObservability('my rust nfa account doesnt work', aliases);
  assert.equal(result.primaryDecision, 'family_scoped_clarification');
  assert.equal(result.clarificationId, 'clarify.nfa.failure_stage');
  assert.ok(result.observableCaseIds.includes('case.nfa.invalid_first_use'));
  assert.ok(result.observableCaseIds.includes('case.nfa.invalid_after_use'));
});

test('current payment state routes to approved lookup rather than a guessed completed case', () => {
  const result = reviewFirstTurnObservability('i paid but nothing arrived', aliases);
  assert.equal(result.primaryDecision, 'direct_dynamic_lookup');
  assert.ok(result.lookupIds.includes('purchase-intents.lookup.read'));
  assert.deepEqual(result.observableFamilyIds, ['commerce.payment']);
});

test('NFA purchase through PayPal is payment context, not an NFA failure', () => {
  const result = reviewFirstTurnObservability('hey im tryna buy a rust nfa w paypal', aliases);
  assert.equal(result.primaryDecision, 'direct_dynamic_lookup');
  assert.ok(result.lookupIds.includes('purchase-intents.lookup.read'));
  assert.ok(result.observableFamilyIds.includes('commerce.payment'));
});

test('explicit NFA activation beats broad account-delivery heuristics', () => {
  const result = reviewFirstTurnObservability('hello, i need help to activate my nfa account', aliases);
  assert.equal(result.primaryDecision, 'direct_static_case');
  assert.deepEqual(result.observableCaseIds, ['case.nfa.redemption_activation']);
});

test('explicit order identifier on an NFA routes to current order lookup', () => {
  const result = reviewFirstTurnObservability('Hello. CS2 NFA - Order ID: [order identifier omitted]', aliases);
  assert.equal(result.primaryDecision, 'direct_dynamic_lookup');
  assert.ok(result.lookupIds.includes('orders.details.read'));
  assert.ok(result.observableFamilyIds.includes('commerce.order'));
});

test('HWID reset is recognized as a spoofer-state case', () => {
  const result = reviewFirstTurnObservability('hwid reset plssss', aliases);
  assert.equal(result.primaryDecision, 'direct_static_case');
  assert.deepEqual(result.observableCaseIds, ['case.spoofer.hwid_state']);
});

test('setup, controller compatibility, and duration requests expose their exact support cases', () => {
  assert.deepEqual(reviewFirstTurnObservability('where is the config file?', aliases).observableCaseIds, ['case.product.requirements']);
  assert.deepEqual(reviewFirstTurnObservability('does the cheats also work on controller???', aliases).observableCaseIds, ['case.product.compatibility']);
  assert.deepEqual(reviewFirstTurnObservability('is the spoofer perm or temp', aliases).observableCaseIds, ['case.catalog.pricing_duration']);
});

test('media and partnership proposals are not swallowed by generic payment routing', () => {
  assert.deepEqual(reviewFirstTurnObservability('u looking for some media?', aliases).observableCaseIds, ['case.media.application']);
  assert.deepEqual(reviewFirstTurnObservability('hello i was wondering if you offer rebrand/branded?', aliases).observableCaseIds, ['case.reseller.application']);
  assert.deepEqual(reviewFirstTurnObservability('Would you guys be intrested in discord payment bot?', aliases).observableCaseIds, ['case.reseller.application']);
});

test('security reports escalate and current detection-status questions enter the restricted boundary', () => {
  const security = reviewFirstTurnObservability('I reported your domain to cloudflare for phishing and reported the bot token', aliases);
  assert.equal(security.primaryDecision, 'human_escalation');
  assert.ok(security.observableFamilyIds.includes('support.security'));

  const detection = reviewFirstTurnObservability('is exodus ud rn?', aliases);
  assert.equal(detection.primaryDecision, 'direct_restricted_escalation');
  assert.deepEqual(detection.observableCaseIds, ['case.restricted.technical']);
});

test('spoofer launch failures expose a targeted technical clarification', () => {
  const result = reviewFirstTurnObservability('i got a problem launching your spoofer', aliases);
  assert.equal(result.primaryDecision, 'family_scoped_clarification');
  assert.equal(result.clarificationId, 'clarify.technical.failure_stage');
  assert.ok(result.observableFamilyIds.includes('technical.product'));
});

test('information-gain selection chooses NFA failure stage and never repeats known questions', () => {
  const cases = ['case.nfa.invalid_first_use','case.nfa.invalid_after_use','case.nfa.owner_session_conflict','case.nfa.redemption_activation'];
  const selected = selectClarification({ clarifications: CANONICAL_CLARIFICATIONS, candidateCaseIds: cases, candidateFamilyIds: ['accounts.nfa'], state: { knownContext: {}, questionsAsked: [], dynamicLookupResults: {} } });
  assert.equal(selected.id, 'clarify.nfa.failure_stage');
  const skipped = selectClarification({ clarifications: CANONICAL_CLARIFICATIONS, candidateCaseIds: cases, candidateFamilyIds: ['accounts.nfa'], state: { knownContext: {}, questionsAsked: ['clarify.nfa.failure_stage'], dynamicLookupResults: {} } });
  assert.notEqual(skipped?.id, 'clarify.nfa.failure_stage');
});

test('approved completed lookup suppresses a redundant order selector question', () => {
  const candidates = ['case.order.status','case.order.fulfillment_delayed'];
  const ranked = selectClarification({ clarifications: CANONICAL_CLARIFICATIONS, candidateCaseIds: candidates, candidateFamilyIds: ['commerce.order','commerce.fulfillment'], state: { knownContext: {}, questionsAsked: [], dynamicLookupResults: { 'orders.lookup.read': { status: 'complete' } } } });
  assert.notEqual(ranked?.id, 'clarify.order_selector');
});

test('clarification answer narrows candidates, persists context, and does not repeat the question', () => {
  const question = CANONICAL_CLARIFICATIONS.find((item) => item.id === 'clarify.nfa.failure_stage');
  const initial = { candidateCaseIds: question.distinguishesCases, candidateFamilyIds: ['accounts.nfa'], knownContext: {}, questionsAsked: [], answersReceived: [], unknownContext: [], dynamicLookupResults: {} };
  const asked = applyClarificationQuestion(initial, question);
  const answered = applyClarificationAnswer(asked, question, 'worked_then_invalid', 'worked yesterday, invalid now');
  assert.deepEqual(answered.candidateCaseIds, ['case.nfa.invalid_after_use']);
  assert.equal(answered.knownContext.workedBefore, 'worked_then_invalid');
  assert.equal(answered.pendingClarificationId, null);
  assert.ok(answered.questionsAsked.includes(question.id));
});

test('short replies are interpreted relative to pending diagnostic context', () => {
  let state = applyAssistantAction(createSupportState(), { askDiagnosticId: 'diagnostic.nfa.worked_before' });
  const result = resolveSupportTurn({ state, customerText: 'no', runtimeCases: [], aliasEntries: aliases });
  assert.equal(result.state.knownContext.workedBefore, false);
  assert.equal(result.state.pendingDiagnosticId, null);
});

test('explicit entity correction replaces stale scope', () => {
  const state = createSupportState({ resolvedEntities: ['game.rust', 'account_model.nfa'] });
  const result = resolveSupportTurn({ state, customerText: "actually it's my CS2 one", runtimeCases: [], aliasEntries: aliases });
  assert.ok(result.state.resolvedEntities.includes('game.cs2'));
  assert.ok(!result.state.resolvedEntities.includes('game.rust'));
});

test('transcript-grouped action split remains isolated from frozen V3', () => {
  const rows = Array.from({ length: 10 }, (_, index) => ({ id: `r${index}`, primaryDecision: index % 2 ? 'generic_clarification' : 'direct_dynamic_lookup', inferability: index % 2 ? 'insufficient_context' : 'control_plane_only', observableFamilyIds: [], sourceTranscriptIds: [`t${index}`] }));
  const { train, dev } = splitReviewedActions(rows, 0.2);
  const audit = auditActionPartitions(train, dev, { records: [{ sourceTranscriptId: 'v3' }] });
  assert.deepEqual(audit.trainDevTranscriptOverlap, []);
  assert.deepEqual(audit.trainV3TranscriptOverlap, []);
  assert.deepEqual(audit.devV3TranscriptOverlap, []);
});
