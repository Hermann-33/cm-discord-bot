import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyControlPlane,
  confidenceDisposition,
  generateCandidateCases,
  isScopeCompatible,
  normalizeClassFrequencyScore,
  scopeSpecificity
} from '../../tools/ticket-transcript-exporter/hierarchical-first-turn-router.mjs';
import { auditLeakage, buildTrainingExemplars } from '../../tools/ticket-transcript-exporter/build-hierarchical-router-partitions.mjs';
import { frozenConfigHash } from '../../tools/ticket-transcript-exporter/evaluate-frozen-first-turn-router.mjs';

test('control plane detects dynamic, policy, attachment, restricted, and support routes independently', () => {
  assert.deepEqual(classifyControlPlane('where is my paid order?'), ['dynamic_lookup']);
  assert.deepEqual(classifyControlPlane('refund the wrong delivery'), ['dynamic_lookup', 'policy_decision']);
  assert.deepEqual(classifyControlPlane('this error is in my screenshot'), ['attachment_required']);
  assert.deepEqual(classifyControlPlane('help bypass the anti-cheat driver'), ['restricted_escalation']);
  assert.deepEqual(classifyControlPlane('please link discord for customer role'), ['support_operations']);
});

test('scope precedence is variant, product, listing+game, model+game, game, category, global', () => {
  assert.equal(scopeSpecificity({ variants: ['variant.a'] }), 7);
  assert.equal(scopeSpecificity({ products: ['product.a'] }), 6);
  assert.equal(scopeSpecificity({ accountListings: ['account_listing.a'], games: ['game.rust'] }), 5);
  assert.equal(scopeSpecificity({ accountModels: ['account_model.nfa'], games: ['game.rust'] }), 4);
  assert.equal(scopeSpecificity({ games: ['game.rust'] }), 3);
  assert.equal(scopeSpecificity({ categories: ['category.accounts'] }), 2);
  assert.equal(scopeSpecificity({ global: true }), 0);
});

test('exact Ancient scope cannot leak into an Exodus-scoped case', () => {
  assert.equal(isScopeCompatible({ products: ['product.ancient.rust'] }, ['product.ancient.rust']), true);
  assert.equal(isScopeCompatible({ products: ['product.exodus.rust'] }, ['product.ancient.rust']), false);
});

test('candidate generation gives exact entities and specialized scope priority', () => {
  const cases = [
    { id: 'case.global', family: 'technical', scope: { global: true }, dynamic: [], policies: [] },
    { id: 'case.rust', family: 'technical', scope: { games: ['game.rust'] }, dynamic: [], policies: [] },
    { id: 'case.rust.nfa', family: 'technical', scope: { games: ['game.rust'], accountModels: ['account_model.nfa'] }, dynamic: [], policies: [] },
    { id: 'case.exodus', family: 'technical', scope: { products: ['product.exodus.rust'] }, dynamic: [], policies: [] }
  ];
  const ranked = generateCandidateCases({ cases, resolvedEntities: ['game.rust', 'account_model.nfa', 'product.ancient.rust'], familyScores: [{ family: 'technical', score: 1 }], limit: 3, globalFallbackCount: 1 });
  assert.equal(ranked[0].id, 'case.rust.nfa');
  assert.equal(ranked.some((entry) => entry.id === 'case.exodus'), false);
});

test('class frequency normalization prevents large classes winning by count alone', () => {
  assert.equal(normalizeClassFrequencyScore(10, 100), 1);
  assert.equal(normalizeClassFrequencyScore(2, 1), 2);
});

test('confidence disposition supports safe abstention and control-plane routing', () => {
  const thresholds = { top1: 0.8, margin: 0.2, family: 0.7, multiCase: 0.7, clarificationFamily: 0.5 };
  assert.equal(confidenceDisposition({ top1: 0.9, top2: 0.4, familyConfidence: 0.8, thresholds }), 'confident_case');
  assert.equal(confidenceDisposition({ top1: 0.4, top2: 0.3, familyConfidence: 0.1, thresholds }), 'human_escalation');
  assert.equal(confidenceDisposition({ top1: 0, top2: 0, familyConfidence: 0, controlRoutes: ['dynamic_lookup'], thresholds }), 'dynamic_lookup');
});

test('V2 holdout isolation rejects same-transcript, exact, and near-duplicate training examples', () => {
  const v2 = [{ query: 'my loader keeps closing immediately', sourceTranscriptIds: ['held-out'] }];
  const candidates = [
    { query: 'different issue', sourceTranscriptId: 'held-out', sourceTicketNumber: 1, messageRef: 'a', autoCandidateCaseId: 'case.loader' },
    { query: 'my loader keeps closing immediately', sourceTranscriptId: 'exact', sourceTicketNumber: 2, messageRef: 'b', autoCandidateCaseId: 'case.loader' },
    { query: 'my loader keep closing immediately', sourceTranscriptId: 'near', sourceTicketNumber: 3, messageRef: 'c', autoCandidateCaseId: 'case.loader' },
    { query: 'runtime exits right after launch', sourceTranscriptId: 'safe', sourceTicketNumber: 4, messageRef: 'd', autoCandidateCaseId: 'case.loader' }
  ];
  const result = buildTrainingExemplars({ candidates, v1ReviewedTranscriptIds: new Set(), v2, threshold: 0.9 });
  assert.equal(result.exemplars.length, 1);
  assert.deepEqual(result.excluded, { heldOutTranscript: 1, exactQuery: 1, nearDuplicate: 1 });
  assert.deepEqual(auditLeakage(result.exemplars, result.provenance, v2, 0.9), { sameTranscript: 0, exactQuery: 0, nearDuplicate: 0, threshold: 0.9 });
});

test('frozen router config hash excludes only its own hash field', () => {
  const config = { method: 'fusion-signals', candidateCount: 55 };
  const hash = frozenConfigHash(config);
  assert.equal(hash.length, 64);
  assert.equal(frozenConfigHash({ ...config, configHash: 'ignored' }), hash);
  assert.notEqual(frozenConfigHash({ ...config, candidateCount: 15 }), hash);
});
