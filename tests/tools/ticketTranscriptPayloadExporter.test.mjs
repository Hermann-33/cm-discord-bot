import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeDecodedTranscript,
  parseArgs,
  renderTranscriptText,
  validateDecodedPayload
} from '../../tools/ticket-transcript-exporter/export-ticket-payloads.mjs';

test('structured exporter defaults to a five-ticket sample and requires explicit bulk mode', () => {
  const sample = parseArgs(['--output-dir', './out']);
  assert.equal(sample.limit, 5);
  assert.equal(sample.all, false);
  assert.equal(sample.resume, true);
  assert.match(sample.sourceLogs, /source-logs\.jsonl$/);

  const all = parseArgs(['--output-dir', './out', '--all']);
  assert.equal(all.limit, Number.POSITIVE_INFINITY);
  assert.equal(all.all, true);

  assert.throws(
    () => parseArgs(['--output-dir', './out', '--all', '--limit', '5']),
    /either --all or --limit/
  );
});

test('structured exporter validates and resolves Tickety users onto messages', () => {
  const payload = {
    users: [
      { id: '359438867536936971', name: 'Ciscø999', username: 'hela8166', bot: false },
      { id: '610488512202145792', name: '.Todoroki', username: 'todoroki.joe', bot: false }
    ],
    messages: [
      {
        id: '1518408211596709919',
        userId: '359438867536936971',
        timestamp: '2026-06-22T00:12:08.305000+00:00',
        content: 'hello',
        attachments: [],
        embeds: []
      }
    ],
    roles: [],
    channels: [{ id: '1518408184732323900', name: 'support-hela8166', type: 0 }],
    channelId: '1518408184732323900',
    guildId: '1375025904996061277',
    exportedAt: 1787054857982
  };

  assert.equal(validateDecodedPayload(payload), payload);
  const normalized = normalizeDecodedTranscript(payload);
  assert.equal(normalized.messageCount, 1);
  assert.equal(normalized.messages[0].author.name, 'Ciscø999');
  assert.equal(normalized.messages[0].author.username, 'hela8166');
  assert.equal(normalized.channelId, '1518408184732323900');
});

test('structured exporter renders message content, attachments, embeds and reply references', () => {
  const transcript = normalizeDecodedTranscript({
    users: [{ id: '1', name: 'Agent', username: 'agent', bot: false }],
    messages: [{
      id: '2',
      userId: '1',
      timestamp: '2026-06-22T00:12:08.305000+00:00',
      content: 'replacement sent',
      attachments: [{ name: 'image.png', url: 'https://cdn.discordapp.com/attachments/1/2/image.png' }],
      embeds: [{ title: 'Status', description: 'Resolved' }],
      messageReference: { messageId: '1' }
    }],
    roles: [],
    channels: [],
    channelId: '3',
    guildId: '4'
  });

  const text = renderTranscriptText(transcript);
  assert.match(text, /Agent \(@agent\)/);
  assert.match(text, /replacement sent/);
  assert.match(text, /\[embed title\] Status/);
  assert.match(text, /Resolved/);
  assert.match(text, /\[attachment\] image\.png/);
  assert.match(text, /\[reply-to\] 1/);
});

test('structured exporter rejects malformed decoded payloads', () => {
  assert.throws(() => validateDecodedPayload(null), /not an object/);
  assert.throws(() => validateDecodedPayload({ users: [] }), /messages\[\]/);
  assert.throws(() => validateDecodedPayload({ users: [], messages: [null] }), /invalid message record/);
});
