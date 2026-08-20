import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  mineSupportKnowledge,
  parseArgs,
  sanitizeExcerpt
} from '../../tools/ticket-transcript-exporter/mine-support-knowledge.mjs';

test('parseArgs requires data dir and validates sample limit', () => {
  assert.throws(() => parseArgs([]), /--data-dir is required/);
  assert.throws(() => parseArgs(['--data-dir', '.', '--sample-limit', '2']), /between 3 and 30/);
  const parsed = parseArgs(['--data-dir', '.', '--sample-limit', '8', '--force']);
  assert.equal(parsed.sampleLimit, 8);
  assert.equal(parsed.force, true);
});

test('sanitizeExcerpt masks URLs, emails, Discord IDs and likely order/license tokens', () => {
  const sanitized = sanitizeExcerpt('mail test@example.com <@123456789012345678> https://example.com/x ABCD1234EFGH 123456789012345678');
  assert.equal(sanitized, 'mail <email> <mention> <url> <token> <id>');
});

test('mineSupportKnowledge processes the full review input and flags restricted topics', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cm-ticket-mining-'));
  const analysisDir = join(root, 'analysis-input');
  await mkdir(analysisDir, { recursive: true });
  await writeFile(join(analysisDir, 'manifest.json'), JSON.stringify({ toolVersion: 'test', sourceTranscriptCount: 3 }));

  const records = [
    {
      transcriptId: 't1',
      messageCount: 4,
      humanMessageCount: 3,
      openingCustomerMessages: [{ content: 'I paid but I did not receive my order' }],
      earlyOtherHumanResponses: [{ content: 'Please send your order ID ABCD1234EFGH' }]
    },
    {
      transcriptId: 't2',
      messageCount: 5,
      humanMessageCount: 4,
      openingCustomerMessages: [{ content: 'my loader gives an error and will not launch' }],
      earlyOtherHumanResponses: [{ content: 'Please send a screenshot' }]
    },
    {
      transcriptId: 't3',
      messageCount: 2,
      humanMessageCount: 1,
      openingCustomerMessages: [{ content: 'hello there' }],
      earlyOtherHumanResponses: []
    }
  ];
  await writeFile(join(analysisDir, 'review.ndjson'), `${records.map((record) => JSON.stringify(record)).join('\n')}\n`);

  try {
    const options = parseArgs(['--data-dir', root]);
    const result = await mineSupportKnowledge(options);
    assert.equal(result.transcriptCount, 3);
    assert.equal(result.classifiedTicketCount, 2);
    assert.equal(result.unclassifiedTicketCount, 1);

    const intents = JSON.parse(await readFile(join(analysisDir, 'mining', 'intent-candidates.json'), 'utf8')).intents;
    const delivery = intents.find((intent) => intent.id === 'order_not_received');
    assert.equal(delivery.ticketCount, 1);
    const loader = intents.find((intent) => intent.id === 'launch_or_loader_error');
    assert.equal(loader.ticketCount, 1);
    assert.equal(loader.restrictedTechnical, true);

    const assignments = (await readFile(join(analysisDir, 'mining', 'ticket-intents.ndjson'), 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(assignments.length, 3);
    assert.equal(assignments[1].restrictedTechnical, true);

    const unclassified = JSON.parse(await readFile(join(analysisDir, 'mining', 'unclassified.json'), 'utf8'));
    assert.equal(unclassified.count, 1);
    assert.equal(unclassified.samples[0].transcriptId, 't3');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
