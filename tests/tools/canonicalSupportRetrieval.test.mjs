import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAliasIndex,
  evaluateQueries,
  normalizeText,
  rankCases,
  resolveAliases,
  tokenize
} from '../../tools/ticket-transcript-exporter/evaluate-canonical-support-retrieval.mjs';

test('retrieval text normalization is deterministic', () => {
  assert.equal(normalizeText("Rust's WORLD-loading crash!"), 'rusts world-loading crash');
  assert.deepEqual(tokenize('Rust NFA crash'), ['rust', 'nfa', 'crash']);
});

test('alias index supports object and array forms', () => {
  const objectIndex = buildAliasIndex({ 'rust nfa': 'account_listing.rust.nfa' });
  assert.deepEqual(objectIndex, [{ alias: 'rust nfa', targetIds: ['account_listing.rust.nfa'] }]);

  const arrayIndex = buildAliasIndex([
    { alias: 'ancient', targetIds: ['vendor.ancient'] }
  ]);
  assert.deepEqual(arrayIndex, [{ alias: 'ancient', targetIds: ['vendor.ancient'] }]);
});

test('longest exact aliases are detected in query text', () => {
  const aliases = buildAliasIndex({
    rust: 'game.rust',
    'rust nfa': 'account_listing.rust.nfa'
  });
  const matches = resolveAliases('my rust nfa crashes', aliases);
  assert.equal(matches[0].alias, 'rust nfa');
  assert.ok(matches.some((match) => match.alias === 'rust'));
});

test('scope-aware lexical ranking favors applicable case', () => {
  const cases = [
    {
      id: 'case.rust.server_load_crash',
      display_name: 'Rust server load crash',
      scope: { games: ['game.rust'], account_models: ['account_model.nfa'] },
      recognition: { phrases: ['crashes while loading server', 'world load crash'] }
    },
    {
      id: 'case.fortnite.overlay_freeze',
      display_name: 'Fortnite overlay freeze',
      scope: { games: ['game.fortnite'] },
      recognition: { phrases: ['overlay freezes'] }
    }
  ];
  const aliases = buildAliasIndex({ rust: 'game.rust', 'rust nfa': 'account_model.nfa' });
  const ranked = rankCases('my rust nfa crashes while loading a server', cases, aliases, 2);
  assert.equal(ranked.results[0].id, 'case.rust.server_load_crash');
});

test('evaluation computes recall and reciprocal rank from expected cases', () => {
  const cases = [
    {
      id: 'case.rust.server_load_crash',
      display_name: 'Rust server load crash',
      scope: { games: ['game.rust'] },
      recognition: { phrases: ['crash loading world'] }
    },
    {
      id: 'case.order.not_received',
      display_name: 'Order not received',
      scope: { store: ['store.orders'] },
      recognition: { phrases: ['paid but no order'] }
    }
  ];
  const aliases = buildAliasIndex({ rust: 'game.rust' });
  const result = evaluateQueries(cases, aliases, [
    { id: 'q1', query: 'rust crash loading world', expected: { caseIds: ['case.rust.server_load_crash'] } },
    { id: 'q2', query: 'paid but no order', expected: { caseIds: ['case.order.not_received'] } }
  ]);

  assert.equal(result.eligibleQueries, 2);
  assert.equal(result.recallAt1, 1);
  assert.equal(result.recallAt3, 1);
  assert.equal(result.recallAt5, 1);
  assert.equal(result.mrr, 1);
});

test('runtime match fields participate in lexical ranking', () => {
  const cases = [
    { id: 'case.alpha', scope: {}, match: { phrases: ['unrelated account question'] } },
    { id: 'case.delivery', scope: {}, match: { phrases: ['payment completed but delivery missing'] } }
  ];
  const ranked = rankCases('payment went through but delivery is missing', cases, [], 2);
  assert.equal(ranked.results[0].id, 'case.delivery');
});

test('local hybrid ranking improves tolerance for misspelled wording', () => {
  const cases = [
    { id: 'case.loader', scope: {}, match: { phrases: ['loader connection failed'] } },
    { id: 'case.account', scope: {}, match: { phrases: ['account ownership question'] } }
  ];
  const ranked = rankCases('ldr connection faild', cases, [], 2, 'hybrid');
  assert.equal(ranked.results[0].id, 'case.loader');
});
