import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decodeHtmlEntities,
  estimateMessageCount,
  extractAttachmentCandidates,
  htmlToPlainText,
  normalizeTicketyTranscriptUrl,
  parseArgs,
  parseTicketLogMessage
} from '../../tools/ticket-transcript-exporter/export-ticket-transcripts.mjs';
import {
  collectViewTranscriptButtons,
  isViewTranscriptButton,
  sanitizeDiscordMessageForTranscriptTarget
} from '../../tools/ticket-transcript-exporter/run-ticket-transcript-export.mjs';

test('normalizes only Tickety transcript URLs', () => {
  assert.deepEqual(
    normalizeTicketyTranscriptUrl('https://tickety.top/transcripts/bsEXln56gFna3TFo2E6?x=1'),
    {
      transcriptId: 'bsEXln56gFna3TFo2E6',
      url: 'https://tickety.top/transcripts/bsEXln56gFna3TFo2E6'
    }
  );
  assert.equal(normalizeTicketyTranscriptUrl('http://tickety.top/transcripts/abc123'), null);
  assert.equal(normalizeTicketyTranscriptUrl('https://evil.example/transcripts/bsEXln56gFna3TFo2E6'), null);
  assert.equal(normalizeTicketyTranscriptUrl('https://tickety.top/legal/privacy-policy'), null);
});

test('parses ticket metadata and link button from a Discord log message', () => {
  const message = {
    id: '123456789012345678',
    timestamp: '2026-08-01T12:34:56.000Z',
    author: { id: '718493970652594217', username: 'Tickety' },
    embeds: [{
      title: 'Ticket Closed',
      fields: [
        { name: 'Ticket', value: 'support-2033', inline: true },
        { name: 'Ticket ID', value: 'lsEmf9cZIKPhysGf63g', inline: true },
        { name: 'Close Reason', value: 'No further action required.' },
        { name: 'Creator', value: '<@880844681037107260>' },
        { name: 'Creator Username', value: '@austin_hill_bestrust' },
        { name: 'Creator ID', value: '880844681037107260' },
        { name: 'Executor', value: '<@610488512202145792>' },
        { name: 'Executor Username', value: '@todoroki.joe' },
        { name: 'Executor ID', value: '610488512202145792' }
      ]
    }],
    components: [{
      type: 1,
      components: [{
        type: 2,
        style: 5,
        label: 'View Transcript',
        url: 'https://tickety.top/transcripts/bsEXln56gFna3TFo2E6'
      }]
    }]
  };

  const parsed = parseTicketLogMessage(message, '999999999999999999');
  assert.equal(parsed.transcript.transcriptId, 'bsEXln56gFna3TFo2E6');
  assert.equal(parsed.ticket.name, 'support-2033');
  assert.equal(parsed.ticket.ticketId, 'lsEmf9cZIKPhysGf63g');
  assert.equal(parsed.ticket.creator.discordId, '880844681037107260');
  assert.equal(parsed.ticket.executor.discordId, '610488512202145792');
  assert.equal(parsed.ticket.closeReason, 'No further action required.');
});

test('strict discovery targets only the View Transcript link button', () => {
  const viewTicket = {
    type: 2,
    style: 5,
    label: 'View Ticket',
    url: 'https://tickety.top/transcripts/WrongTicket123'
  };
  const transcript = {
    type: 2,
    style: 5,
    label: '  View   Transcript  ',
    url: 'https://tickety.top/transcripts/RightTranscript123'
  };
  const message = {
    id: '123456789012345678',
    timestamp: '2026-08-01T12:34:56.000Z',
    author: { id: '718493970652594217', username: 'Tickety' },
    content: 'https://tickety.top/transcripts/ContentFallback123',
    embeds: [{
      title: 'Ticket Closed',
      fields: [{ name: 'Ticket', value: 'support-2033' }]
    }],
    components: [{ type: 1, components: [viewTicket, transcript] }]
  };

  assert.equal(isViewTranscriptButton(viewTicket), false);
  assert.equal(isViewTranscriptButton(transcript), true);
  assert.deepEqual(collectViewTranscriptButtons(message.components), [transcript]);

  const sanitized = sanitizeDiscordMessageForTranscriptTarget(message);
  assert.equal(sanitized.components[0].components.length, 1);
  assert.equal(sanitized.components[0].components[0].label, '  View   Transcript  ');
  assert.equal(sanitized.content, '');

  const parsed = parseTicketLogMessage(sanitized, '999999999999999999');
  assert.equal(parsed.transcript.transcriptId, 'RightTranscript123');
});

test('a ticket-log message with only View Ticket is ignored even if transcript URLs appear elsewhere', () => {
  const message = {
    id: '123456789012345678',
    timestamp: '2026-08-01T12:34:56.000Z',
    author: { id: '718493970652594217', username: 'Tickety' },
    content: 'https://tickety.top/transcripts/ContentFallback123',
    embeds: [{
      title: 'Ticket Opened',
      url: 'https://tickety.top/transcripts/EmbedFallback123'
    }],
    components: [{
      type: 1,
      components: [{
        type: 2,
        style: 5,
        label: 'View Ticket',
        url: 'https://tickety.top/transcripts/ViewTicketOnly123'
      }]
    }]
  };

  const sanitized = sanitizeDiscordMessageForTranscriptTarget(message);
  assert.equal(sanitized.components.length, 0);
  assert.equal(sanitized.embeds.length, 0);
  assert.equal(sanitized.content, '');
  assert.equal(parseTicketLogMessage(sanitized, '999999999999999999'), null);
});

test('converts HTML into useful visible plain text', () => {
  const html = '<html><head><title>Ignore Head</title><script>secret()</script></head><body><div>Alice &amp; Bob</div><div>Hello<br>world</div><ul><li>One</li><li>Two</li></ul></body></html>';
  assert.equal(htmlToPlainText(html), 'Alice & Bob\nHello\nworld\n- One\n- Two');
  assert.equal(decodeHtmlEntities('&#65; &#x42; &nbsp;'), 'A B  ');
});

test('extracts likely attachment URLs but ignores ordinary site assets', () => {
  const html = `
    <a href="https://cdn.discordapp.com/attachments/1/2/test.png">image</a>
    <a href="https://example.com/document.pdf">pdf</a>
    <link href="https://tickety.top/assets/site.css" rel="stylesheet">
  `;
  const found = extractAttachmentCandidates(html, 'https://tickety.top/transcripts/abc123');
  assert.equal(found.length, 2);
  assert.equal(found[0].kind, 'discord_cdn');
  assert.equal(found[1].kind, 'file_link');
});

test('estimates message count from common transcript markers', () => {
  assert.equal(estimateMessageCount('<div data-message-id="1"></div><div data-message-id="2"></div>'), 2);
  assert.equal(estimateMessageCount('<div class="chatlog__message-group"></div>'), 1);
});

test('CLI defaults to a five-transcript sample and requires explicit --all for bulk mode', () => {
  const sample = parseArgs(['--channel-id', '123456789012345678', '--output-dir', './out']);
  assert.equal(sample.limit, 5);
  assert.equal(sample.all, false);
  assert.equal(sample.resume, true);

  const all = parseArgs(['--channel-id', '123456789012345678', '--output-dir', './out', '--all']);
  assert.equal(all.limit, Number.POSITIVE_INFINITY);
  assert.equal(all.all, true);

  assert.throws(
    () => parseArgs(['--channel-id', '123456789012345678', '--output-dir', './out', '--all', '--limit', '5']),
    /either --all or --limit/
  );
});
