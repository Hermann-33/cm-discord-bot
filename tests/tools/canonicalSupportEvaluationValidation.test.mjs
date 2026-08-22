import assert from 'node:assert/strict';
import test from 'node:test';

import {
  validateEvaluationRecords
} from '../../tools/ticket-transcript-exporter/validate-canonical-support-evaluation.mjs';

function baseExpected(caseId) {
  return {
    entityIds: [],
    caseIds: caseId ? [caseId] : [],
    acceptableCaseIds: [],
    policyIds: [],
    dynamicLookupIds: [],
    mustIncludeClaims: [],
    mustNotIncludeClaims: [],
    diagnosticIds: [],
    escalation: false
  };
}

test('evaluation validator accepts complete synthetic behavior coverage', () => {
  const caseIds = new Set(['case.synthetic']);
  const families = [
    'paraphrase',
    'typo_or_slang',
    'negation',
    'already_tried',
    'product_isolation',
    'variant_isolation',
    'account_model_isolation',
    'dynamic_state',
    'multi_turn',
    'ambiguity'
  ];
  const records = families.map((family, index) => ({
    id: `eval.${index + 1}`,
    query: `safe synthetic query ${index + 1}`,
    behaviorFamily: family,
    conversationContext: [],
    expected: {
      ...baseExpected('case.synthetic'),
      dynamicLookupIds: family === 'dynamic_state' ? ['dynamic.order.status'] : [],
      escalation: family === 'ambiguity'
    },
    sourceTranscriptIds: []
  }));

  const result = validateEvaluationRecords(records, caseIds, records.length);
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.queryCount, families.length);
  assert.equal(result.dynamicExpectedCount, 1);
  assert.equal(result.escalationExpectedCount, 1);
});

test('evaluation validator catches unknown cases, missing families and privacy leakage', () => {
  const result = validateEvaluationRecords([
    {
      id: 'eval.bad',
      query: 'contact customer@example.com at https://example.com/private',
      conversationContext: [],
      expected: {
        ...baseExpected('case.unknown')
      },
      sourceTranscriptIds: []
    }
  ], new Set(['case.synthetic']), 2);

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.includes('unknown runtime case')));
  assert.ok(result.issues.some((issue) => issue.includes('privacy candidate email')));
  assert.ok(result.issues.some((issue) => issue.includes('below required minimum')));
  assert.ok(result.issues.some((issue) => issue.includes('missing required behavior family')));
});

test('historical rule holdout requires transcript provenance and rejects padding', () => {
  const valid = validateEvaluationRecords([{ id: 'holdout.1', query: 'real sanitized customer wording', expected: baseExpected('case.synthetic'), sourceTranscriptIds: ['transcript-a'], sourceType: 'historical_rule_holdout', behaviorFamily: 'historical' }], new Set(['case.synthetic']), 1, 'historical-rule');
  assert.equal(valid.ok, true, JSON.stringify(valid, null, 2));
  const invalid = validateEvaluationRecords([{ id: 'holdout.2', query: 'query (support wording 7)', expected: baseExpected('case.synthetic'), sourceTranscriptIds: [], sourceType: 'historical_rule_holdout', behaviorFamily: 'historical' }], new Set(['case.synthetic']), 1, 'historical-rule');
  assert.equal(invalid.ok, false);
  assert.ok(invalid.issues.some((issue) => issue.includes('transcript provenance')));
  assert.ok(invalid.issues.some((issue) => issue.includes('artificial padding')));
});

test('literal historical gold requires independent review metadata', () => {
  const valid = validateEvaluationRecords([{ id: 'gold.1', query: 'ldr wont open', expected: baseExpected('case.synthetic'), sourceTranscriptIds: ['transcript-a'], sourceTicketNumbers: [1], sourceType: 'historical_utterance_gold', querySource: 'literal_customer_turn', goldStatus: 'reviewed', goldReason: 'Full reviewed ticket semantics map to the expected case.' }], new Set(['case.synthetic']), 1, 'historical-gold');
  assert.equal(valid.ok, true, JSON.stringify(valid, null, 2));
});
