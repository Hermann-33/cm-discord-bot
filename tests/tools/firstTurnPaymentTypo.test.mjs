import assert from 'node:assert/strict';
import test from 'node:test';
import { reviewFirstTurnObservability } from '../../tools/ticket-transcript-exporter/first-turn-action-router.mjs';

test('common payed typo still routes to current payment lookup', () => {
  const result = reviewFirstTurnObservability('i just payed again its wtv bro', []);
  assert.equal(result.primaryDecision, 'direct_dynamic_lookup');
  assert.deepEqual(result.observableFamilyIds, ['commerce.payment']);
  assert.ok(result.lookupIds.includes('purchase-intents.lookup.read'));
  assert.ok(result.lookupIds.includes('purchase-intents.process.status.read'));
});
