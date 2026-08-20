import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  parseArgs,
  chunkKnowledgeAnalysis
} from '../../tools/ticket-transcript-exporter/chunk-knowledge-analysis.mjs';

test('analysis chunker requires the data repo and validates chunk size', () => {
  assert.throws(() => parseArgs([]), /--data-dir is required/);
  assert.throws(() => parseArgs(['--data-dir', './repo', '--chunk-size', '9']), /between 10 and 100/);

  const parsed = parseArgs(['--data-dir', './repo', '--chunk-size', '25']);
  assert.equal(parsed.chunkSize, 25);
  assert.equal(parsed.force, false);
});

test('analysis chunker splits aligned review and corpus records without losing tickets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cm-ticket-chunks-'));
  try {
    const analysis = join(root, 'analysis-input');
    await mkdir(analysis, { recursive: true });

    const corpus = [];
    const review = [];
    for (let index = 1; index <= 23; index += 1) {
      const transcriptId = `Transcript${String(index).padStart(3, '0')}`;
      corpus.push(JSON.stringify({ schemaVersion: 1, transcriptId, plainText: `Full ticket ${index}` }));
      review.push(JSON.stringify({ schemaVersion: 1, transcriptId, openingCustomerMessages: [{ content: `Issue ${index}` }] }));
    }

    await writeFile(join(analysis, 'corpus.ndjson'), `${corpus.join('\n')}\n`);
    await writeFile(join(analysis, 'review.ndjson'), `${review.join('\n')}\n`);
    await writeFile(join(analysis, 'manifest.json'), `${JSON.stringify({
      schemaVersion: 1,
      toolVersion: '1.0.1',
      sourceTranscriptCount: 23
    }, null, 2)}\n`);

    const options = parseArgs(['--data-dir', root, '--chunk-size', '10']);
    const result = await chunkKnowledgeAnalysis(options);

    assert.equal(result.transcriptCount, 23);
    assert.equal(result.chunkCount, 3);

    const manifest = JSON.parse(await readFile(join(analysis, 'chunks', 'manifest.json'), 'utf8'));
    assert.equal(manifest.chunkSize, 10);
    assert.equal(manifest.chunkCount, 3);
    assert.deepEqual(manifest.chunks.map((chunk) => [chunk.startRecord, chunk.endRecord, chunk.count]), [
      [1, 10, 10],
      [11, 20, 10],
      [21, 23, 3]
    ]);

    const firstReview = (await readFile(join(analysis, 'chunks', 'review', 'review-0001-0010.ndjson'), 'utf8')).trim().split('\n');
    const lastCorpus = (await readFile(join(analysis, 'chunks', 'corpus', 'corpus-0021-0023.ndjson'), 'utf8')).trim().split('\n');
    assert.equal(firstReview.length, 10);
    assert.equal(JSON.parse(firstReview[0]).transcriptId, 'Transcript001');
    assert.equal(lastCorpus.length, 3);
    assert.equal(JSON.parse(lastCorpus[2]).transcriptId, 'Transcript023');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('analysis chunker rejects review/corpus ordering mismatches', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cm-ticket-chunks-mismatch-'));
  try {
    const analysis = join(root, 'analysis-input');
    await mkdir(analysis, { recursive: true });
    await writeFile(join(analysis, 'corpus.ndjson'), `${JSON.stringify({ transcriptId: 'TranscriptA' })}\n`);
    await writeFile(join(analysis, 'review.ndjson'), `${JSON.stringify({ transcriptId: 'TranscriptB' })}\n`);
    await writeFile(join(analysis, 'manifest.json'), `${JSON.stringify({ sourceTranscriptCount: 1 })}\n`);

    const options = parseArgs(['--data-dir', root]);
    await assert.rejects(() => chunkKnowledgeAnalysis(options), /alignment mismatch/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
