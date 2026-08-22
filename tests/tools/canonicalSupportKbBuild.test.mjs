import assert from 'node:assert/strict';
import test from 'node:test';

import { parseArgs } from '../../tools/ticket-transcript-exporter/build-canonical-support-kb.mjs';

test('canonical KB builder requires and resolves the private data directory', () => {
  assert.throws(() => parseArgs([]), /--data-dir is required/);
  const parsed = parseArgs(['--data-dir', '.']);
  assert.equal(typeof parsed.dataDir, 'string');
  assert.ok(parsed.dataDir.length > 0);
});

test('canonical KB builder rejects unknown arguments', () => {
  assert.throws(() => parseArgs(['--data-dir', '.', '--unsafe']), /Unknown argument/);
});
