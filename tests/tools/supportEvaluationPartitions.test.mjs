import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRoutingExemplars, characterDice, partitionHistoricalRecords, sanitizeCustomerText, verifyCustomerMessages } from '../../tools/ticket-transcript-exporter/build-support-evaluation-partitions.mjs';

test('customer sanitizer removes NFA account tokens without polishing surrounding language', () => {
  assert.equal(sanitizeCustomerText('yo CM-NFA-N52X1HS79PC2YR9RXM578G015 dont work'), 'yo [account token omitted] dont work');
});

test('structured authorship accepts only the inferred non-bot customer', () => {
  const raw = {
    source: { transcriptId: 'transcript-safe' },
    transcript: {
      users: [{ id: 'customer', bot: false }, { id: 'staff', bot: false }, { id: 'bot', bot: true }],
      messages: [
        { id: '1', author: { id: 'staff', bot: false }, content: 'Please describe the loader problem.' },
        { id: '2', author: { id: 'bot', bot: true }, content: 'Automated support ticket created.' },
        { id: '3', author: { id: 'customer', bot: false }, content: 'my loader keeps closing' }
      ]
    }
  };
  const result = verifyCustomerMessages(raw, 'customer');
  assert.deepEqual(result.verified.map((message) => message.content), ['my loader keeps closing']);
  assert.equal(result.rejected.staff, 1);
  assert.equal(result.rejected.bot, 1);
});

test('historical records split first turns from follow-ups deterministically', () => {
  const split = partitionHistoricalRecords([{ id: 'a', turnType: 'first_turn' }, { id: 'b', turnType: 'follow_up' }, { id: 'c', turnType: 'first_turn' }]);
  assert.deepEqual(split.firstTurn.map((record) => record.id), ['a', 'c']);
  assert.deepEqual(split.followUp.map((record) => record.id), ['b']);
});

test('routing exemplars exclude holdout transcripts, exact queries, and near duplicates', () => {
  const gold = [{ goldStatus: 'reviewed', query: 'my loader keeps closing immediately', sourceTranscriptIds: ['gold-transcript'] }];
  const candidates = [
    { query: 'unrelated query from held out transcript', sourceTranscriptId: 'gold-transcript', sourceTicketNumber: 1, messageRef: 'a', candidateCaseIds: ['case.loader.closes_runtime'], entityIds: [] },
    { query: 'my loader keeps closing immediately', sourceTranscriptId: 'exact', sourceTicketNumber: 2, messageRef: 'b', candidateCaseIds: ['case.loader.closes_runtime'], entityIds: [] },
    { query: 'my loader keep closing immediately', sourceTranscriptId: 'near', sourceTicketNumber: 3, messageRef: 'c', candidateCaseIds: ['case.loader.closes_runtime'], entityIds: [] },
    { query: 'loader runtime exits on launch', sourceTranscriptId: 'safe', sourceTicketNumber: 4, messageRef: 'd', candidateCaseIds: ['case.loader.closes_runtime'], entityIds: [] }
  ];
  const result = buildRoutingExemplars(candidates, gold, 0.9);
  assert.equal(result.exemplars.length, 1);
  assert.equal(result.provenance[0].sourceTranscriptId, 'safe');
  assert.equal(result.excludedDuringBuild.sameTranscript, 1);
  assert.equal(result.excludedDuringBuild.exactQuery, 1);
  assert.equal(result.excludedDuringBuild.nearDuplicate, 1);
  assert.deepEqual(result.leakageAudit, { sameTranscript: 0, exactQuery: 0, nearDuplicate: 0, threshold: 0.9 });
  assert.ok(characterDice('loader keeps closing', 'loader keeps closing!') >= 0.9);
});
