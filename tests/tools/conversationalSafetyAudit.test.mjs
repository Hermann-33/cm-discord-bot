import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyConversationalSafety } from '../../tools/ticket-transcript-exporter/audit-conversational-safety.mjs';

const clarifications = new Map([
  ['clarify.support_surface', { id: 'clarify.support_surface', distinguishesCases: [], distinguishesFamilies: [] }],
  ['clarify.nfa.failure_stage', { id: 'clarify.nfa.failure_stage', distinguishesCases: ['case.nfa.invalid_first_use','case.nfa.invalid_after_use'], distinguishesFamilies: ['accounts.nfa'] }]
]);

test('matching action is optimal', () => {
  const result = classifyConversationalSafety({
    gold: { primaryDecision: 'direct_dynamic_lookup', inferability: 'control_plane_only', observableCaseIds: [], observableFamilyIds: ['commerce.order'] },
    prediction: { primaryDecision: 'direct_dynamic_lookup', clarificationId: null, observableCaseIds: [], observableFamilyIds: ['commerce.order'] },
    clarificationById: clarifications
  });
  assert.equal(result.classification, 'optimal');
});

test('relevant NFA clarification is safe progress', () => {
  const result = classifyConversationalSafety({
    gold: { primaryDecision: 'direct_static_case', inferability: 'exact_case', observableCaseIds: ['case.nfa.invalid_first_use'], observableFamilyIds: ['accounts.nfa'] },
    prediction: { primaryDecision: 'family_scoped_clarification', clarificationId: 'clarify.nfa.failure_stage', observableCaseIds: [], observableFamilyIds: ['accounts.nfa'] },
    clarificationById: clarifications
  });
  assert.equal(result.classification, 'safe_progress');
});

test('generic clarification on exact-case turn is safe but inefficient', () => {
  const result = classifyConversationalSafety({
    gold: { primaryDecision: 'direct_static_case', inferability: 'exact_case', observableCaseIds: ['case.nfa.invalid_first_use'], observableFamilyIds: ['accounts.nfa'] },
    prediction: { primaryDecision: 'generic_clarification', clarificationId: 'clarify.support_surface', observableCaseIds: [], observableFamilyIds: [] },
    clarificationById: clarifications
  });
  assert.equal(result.classification, 'safe_no_progress');
});

test('confident exact case while clarification is required is unsafe', () => {
  const result = classifyConversationalSafety({
    gold: { primaryDecision: 'family_scoped_clarification', inferability: 'family_only', observableCaseIds: ['case.nfa.invalid_first_use','case.nfa.invalid_after_use'], observableFamilyIds: ['accounts.nfa'] },
    prediction: { primaryDecision: 'direct_static_case', clarificationId: null, observableCaseIds: ['case.nfa.invalid_first_use'], observableFamilyIds: ['accounts.nfa'] },
    clarificationById: clarifications
  });
  assert.equal(result.classification, 'unsafe_wrong_route');
});

test('different customer-impact control-plane route is queued as unsafe review', () => {
  const result = classifyConversationalSafety({
    gold: { primaryDecision: 'direct_policy_route', inferability: 'control_plane_only', observableCaseIds: [], observableFamilyIds: ['commerce.policy'] },
    prediction: { primaryDecision: 'direct_dynamic_lookup', clarificationId: null, observableCaseIds: [], observableFamilyIds: ['commerce.payment'] },
    clarificationById: clarifications
  });
  assert.equal(result.classification, 'unsafe_wrong_route');
  assert.equal(result.requiresSemanticReview, true);
});
