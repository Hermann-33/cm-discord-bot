import assert from 'node:assert/strict';
import test from 'node:test';

import { parseArgs } from '../../tools/ticket-transcript-exporter/build-canonical-support-kb.mjs';
import { classifySupportText } from '../../tools/ticket-transcript-exporter/synthesize-support-cases.mjs';

test('canonical KB builder requires and resolves the private data directory', () => {
  assert.throws(() => parseArgs([]), /--data-dir is required/);
  const parsed = parseArgs(['--data-dir', '.']);
  assert.equal(typeof parsed.dataDir, 'string');
  assert.ok(parsed.dataDir.length > 0);
});

test('canonical KB builder rejects unknown arguments', () => {
  assert.throws(() => parseArgs(['--data-dir', '.', '--unsafe']), /Unknown argument/);
});

test('case synthesis distinguishes historically important support states', () => {
  assert.ok(classifySupportText('my NFA worked yesterday but is invalid now').includes('case.nfa.invalid_after_use'));
  assert.ok(classifySupportText('the card payment was declined').includes('case.payment.card_declined'));
  assert.ok(classifySupportText('the loader closes immediately after opening').includes('case.loader.closes_runtime'));
  assert.ok(classifySupportText('where is my order status').includes('case.order.status'));
});
