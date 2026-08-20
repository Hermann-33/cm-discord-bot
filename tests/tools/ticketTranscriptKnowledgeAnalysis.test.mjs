import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  parseArgs,
  prepareKnowledgeAnalysisPack
} from '../../tools/ticket-transcript-exporter/prepare-knowledge-analysis.mjs';

test('knowledge analysis packer requires a local data repository and keeps output inside it', () => {
  assert.throws(() => parseArgs([]), /--data-dir is required/);
  assert.throws(
    () => parseArgs(['--data-dir', './repo', '--output-subdir', '../outside']),
    /without parent traversal/
  );

  const parsed = parseArgs(['--data-dir', './repo', '--max-excerpt-chars', '3000']);
  assert.equal(parsed.maxExcerptChars, 3000);
  assert.equal(parsed.force, false);
});

test('knowledge analysis packer consolidates the complete schema-v2 corpus into line-addressable analysis inputs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cm-ticket-analysis-'));
  try {
    await mkdir(join(root, 'transcripts'), { recursive: true });
    await mkdir(join(root, 'text'), { recursive: true });

    const records = [
      {
        id: 'TranscriptAlpha01',
        timestamp: '2026-01-01T00:00:00.000Z',
        customer: { id: '100', name: 'Customer A', username: 'customer-a', bot: false },
        staff: { id: '200', name: 'Agent', username: 'agent', bot: false },
        messages: [
          { id: '1', userId: '100', timestamp: '2026-01-01T00:00:01.000Z', content: 'I need help with my order', author: { id: '100', name: 'Customer A', username: 'customer-a', bot: false }, attachments: [], embeds: [] },
          { id: '2', userId: '200', timestamp: '2026-01-01T00:01:00.000Z', content: 'Please send the order reference', author: { id: '200', name: 'Agent', username: 'agent', bot: false }, attachments: [], embeds: [] }
        ],
        text: '[1] Customer A\nI need help with my order\n\n[2] Agent\nPlease send the order reference\n'
      },
      {
        id: 'TranscriptBeta02',
        timestamp: '2026-01-02T00:00:00.000Z',
        customer: { id: '101', name: 'Customer B', username: 'customer-b', bot: false },
        staff: { id: '200', name: 'Agent', username: 'agent', bot: false },
        messages: [
          { id: '3', userId: '101', timestamp: '2026-01-02T00:00:01.000Z', content: 'Where is my delivery?', author: { id: '101', name: 'Customer B', username: 'customer-b', bot: false }, attachments: [], embeds: [] },
          { id: '4', userId: '200', timestamp: '2026-01-02T00:01:00.000Z', content: 'I will check the delivery status', author: { id: '200', name: 'Agent', username: 'agent', bot: false }, attachments: [], embeds: [] }
        ],
        text: '[3] Customer B\nWhere is my delivery?\n\n[4] Agent\nI will check the delivery status\nhttps://example.com/help\n'
      }
    ];

    const indexLines = [];
    for (const record of records) {
      const normalizedPath = `transcripts/${record.id}.json`;
      const textPath = `text/${record.id}.txt`;
      const normalized = {
        schemaVersion: 2,
        source: { transcriptId: record.id },
        acquisition: { method: 'tickety-msgpack-api' },
        transcript: {
          users: [record.customer, record.staff],
          messages: record.messages,
          roles: [],
          channels: [],
          channelId: '300',
          guildId: '400',
          messageCount: record.messages.length
        }
      };
      await writeFile(join(root, normalizedPath), `${JSON.stringify(normalized, null, 2)}\n`);
      await writeFile(join(root, textPath), record.text);
      indexLines.push(JSON.stringify({
        schemaVersion: 2,
        transcriptId: record.id,
        discordLogTimestamp: record.timestamp,
        messageCount: record.messages.length,
        files: { normalized: normalizedPath, text: textPath }
      }));
    }

    await writeFile(join(root, 'index.jsonl'), `${indexLines.join('\n')}\n`);
    await writeFile(join(root, 'manifest.json'), `${JSON.stringify({
      schemaVersion: 2,
      updatedAt: '2026-08-20T00:00:00.000Z',
      sourceTranscriptCount: 2,
      structuredRecordCount: 2
    }, null, 2)}\n`);

    const options = parseArgs(['--data-dir', root]);
    const result = await prepareKnowledgeAnalysisPack(options);

    assert.equal(result.transcriptCount, 2);
    assert.equal(result.totalMessages, 4);

    const corpusLines = (await readFile(join(root, 'analysis-input', 'corpus.ndjson'), 'utf8')).trim().split('\n');
    const reviewLines = (await readFile(join(root, 'analysis-input', 'review.ndjson'), 'utf8')).trim().split('\n');
    const stats = JSON.parse(await readFile(join(root, 'analysis-input', 'stats.json'), 'utf8'));
    const manifest = JSON.parse(await readFile(join(root, 'analysis-input', 'manifest.json'), 'utf8'));

    assert.equal(corpusLines.length, 2);
    assert.match(JSON.parse(corpusLines[0]).plainText, /help with my order/);
    assert.equal(reviewLines.length, 2);

    const firstReview = JSON.parse(reviewLines[0]);
    assert.equal(firstReview.inferredCustomer.username, 'customer-a');
    assert.equal(firstReview.openingCustomerMessages[0].content, 'I need help with my order');
    assert.equal(firstReview.earlyOtherHumanResponses[0].content, 'Please send the order reference');

    assert.equal(stats.transcriptCount, 2);
    assert.equal(stats.messageCount.total, 4);
    assert.deepEqual(stats.topDomains[0], { domain: 'example.com', count: 1 });
    assert.equal(manifest.sourceTranscriptCount, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
