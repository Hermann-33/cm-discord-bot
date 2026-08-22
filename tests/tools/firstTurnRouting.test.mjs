import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateExemplarScores, routingScopePriority } from '../../tools/ticket-transcript-exporter/evaluate-first-turn-routing.mjs';

test('exemplar aggregation is class-frequency normalized', () => {
  assert.equal(aggregateExemplarScores([0.8], 'max'), 0.8);
  assert.equal(aggregateExemplarScores([0.8, 0.1, 0.1, 0.1, 0.1], 'max'), 0.8);
  assert.equal(aggregateExemplarScores([0.8, 0.6, 0.1], 'top2'), 0.7);
  assert.equal(aggregateExemplarScores([0.8, 0.6, 0.4, 0.1], 'top3'), 0.6);
});

test('exact scope overlap outranks generic scope and contradictory product scope is excluded', () => {
  const targets = ['game.rust', 'product.ancient.rust'];
  const product = { scope: { products: ['product.ancient.rust'], games: ['game.rust'] } };
  const game = { scope: { games: ['game.rust'] } };
  const global = { scope: { global: true } };
  const conflict = { scope: { products: ['product.exodus.rust'], games: ['game.rust'] } };
  assert.ok(routingScopePriority(product, targets) > routingScopePriority(game, targets));
  assert.ok(routingScopePriority(game, targets) > routingScopePriority(global, targets));
  assert.ok(routingScopePriority(conflict, targets) < -900_000);
});
