import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeTicketyMsgpackr } from '../../tools/ticket-transcript-exporter/tickety-msgpackr-decoder.mjs';
import {
  formatTranscriptText,
  isCompletePayloadRecord,
  parsePayloadArgs,
  parseSourceLogs,
  validateDecodedTranscript
} from '../../tools/ticket-transcript-exporter/extract-ticket-transcript-payloads.mjs';

test('decodes a msgpackr record definition used by Tickety payloads', () => {
  const encoded = Buffer.from([
    0xd4, 0x72, 0x40,
    0x92,
    0xa4, 0x6e, 0x61, 0x6d, 0x65,
    0xa7, 0x63, 0x6f, 0x6e, 0x74, 0x65, 0x6e, 0x74,
    0xa5, 0x61, 0x6c, 0x69, 0x63, 0x65,
    0xa5, 0x68, 0x65, 0x6c, 0x6c, 0x6f
  ]);
  assert.deepEqual(decodeTicketyMsgpackr(encoded), { name: 'alice', content: 'hello' });
});

test('decodes Tickety extension type 7 wrapper', () => {
  const encoded = Buffer.from([0xd4, 0x07, 0x00, 0xa5, 0x68, 0x65, 0x6c, 0x6c, 0x6f]);
  assert.equal(decodeTicketyMsgpackr(encoded), 'hello');
});

test('payload CLI defaults to one transcript and requires explicit --all for bulk mode', () => {
  const sample = parsePayloadArgs(['--input-dir', './data']);
  assert.equal(sample.limit, 1);
  assert.equal(sample.all, false);
  assert.equal(sample.resume, true);

  const all = parsePayloadArgs(['--input-dir', './data', '--all']);
  assert.equal(all.limit, Number.POSITIVE_INFINITY);
  assert.equal(all.all, true);

  assert.throws(
    () => parsePayloadArgs(['--input-dir', './data', '--all', '--limit', '5']),
    /either --all or --limit/
  );
});

test('source log parsing validates and deduplicates transcript IDs', () => {
  const record = {
    discordLog: { messageId: '1' },
    ticket: { name: 'support-1' },
    transcript: { transcriptId: 'abc123', url: 'https://tickety.top/transcripts/abc123' }
  };
  const parsed = parseSourceLogs(`${JSON.stringify(record)}\n${JSON.stringify(record)}\n`);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].transcript.transcriptId, 'abc123');
});

test('decoded transcript validation and text projection preserve message content and attachments', () => {
  const decoded = {
    users: [{ id: '1', username: 'alice', name: 'Alice' }],
    messages: [{
      id: 'm1',
      userId: '1',
      content: 'hello support',
      timestamp: '2026-01-01T00:00:00.000Z',
      attachments: [{ name: 'proof.png', contentType: 'image/png', url: 'https://cdn.discordapp.com/proof.png' }],
      embeds: [],
      type: 0
    }],
    roles: [],
    channels: [],
    channelId: '10',
    guildId: '20',
    exportedAt: '2026-01-01T00:00:01.000Z'
  };
  assert.equal(validateDecodedTranscript(decoded), decoded);
  const text = formatTranscriptText(decoded);
  assert.match(text, /Alice \(@alice\)/);
  assert.match(text, /hello support/);
  assert.match(text, /proof\.png/);
});

test('resume skips only complete schema-v2 API payload records', () => {
  const complete = {
    schemaVersion: 2,
    source: { transcriptId: 'abc123' },
    acquisition: { method: 'tickety-msgpack-api-v1' },
    transcript: { messages: [], users: [] }
  };
  const oldHtmlPlaceholder = {
    schemaVersion: 1,
    source: { transcriptId: 'abc123' },
    acquisition: { method: 'http', htmlSha256: 'x' },
    transcript: { plainText: '', estimatedMessageCount: 0 }
  };
  assert.equal(isCompletePayloadRecord(complete, 'abc123'), true);
  assert.equal(isCompletePayloadRecord(oldHtmlPlaceholder, 'abc123'), false);
});
