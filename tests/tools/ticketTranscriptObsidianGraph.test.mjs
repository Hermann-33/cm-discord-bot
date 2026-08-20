import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildObsidianKnowledgeGraph,
  parseArgs
} from '../../tools/ticket-transcript-exporter/build-obsidian-knowledge-graph.mjs';

test('Obsidian graph builder requires the data repository', () => {
  assert.throws(() => parseArgs([]), /--data-dir is required/);
  const parsed = parseArgs(['--data-dir', '.', '--force']);
  assert.equal(parsed.force, true);
  assert.match(parsed.outputDir, /knowledge$/);
});

test('Obsidian graph builder creates linked candidate nodes and restricted escalation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cm-ticket-obsidian-'));
  const miningDir = join(root, 'analysis-input', 'mining');
  await mkdir(miningDir, { recursive: true });
  await writeFile(join(miningDir, 'manifest.json'), JSON.stringify({
    toolVersion: 'test',
    sourceTranscriptCount: 3,
    classifiedTicketCount: 2,
    unclassifiedTicketCount: 1,
    reviewableUnclassifiedCount: 1,
    coveragePercent: 66.67
  }));
  await writeFile(join(miningDir, 'intent-candidates.json'), JSON.stringify({
    intents: [
      {
        id: 'order_not_received',
        label: 'Order Not Received',
        category: 'Orders & Delivery',
        restrictedTechnical: false,
        ticketCount: 1,
        topTopicPhrases: [{ value: 'didnt receive', count: 1 }],
        samples: [{ transcriptId: 't1', score: 1, topic: 'I did not receive my order' }]
      },
      {
        id: 'launch_or_loader_error',
        label: 'Launch Or Loader Error',
        category: 'Technical Support',
        restrictedTechnical: true,
        ticketCount: 1,
        topTopicPhrases: [{ value: 'loader error', count: 1 }],
        samples: [{ transcriptId: 't2', score: 1, topic: 'loader error' }]
      }
    ]
  }));

  try {
    const result = await buildObsidianKnowledgeGraph(parseArgs(['--data-dir', root]));
    assert.equal(result.transcriptCount, 3);
    assert.equal(result.intentCount, 2);

    const rootNote = await readFile(join(root, 'knowledge', '00 - Support Knowledge Graph.md'), 'utf8');
    assert.match(rootNote, /\[\[Categories\/Orders & Delivery\|Orders & Delivery\]\]/);
    assert.match(rootNote, /\[\[Escalations\/Human Review Required\|Human Review Required\]\]/);

    const intentNote = await readFile(join(root, 'knowledge', 'Intents', 'Launch Or Loader Error.md'), 'utf8');
    assert.match(intentNote, /restricted_technical: true/);
    assert.match(intentNote, /automation: human-only/);
    assert.match(intentNote, /Human Review Required/);

    const graph = JSON.parse(await readFile(join(root, 'knowledge', 'graph.json'), 'utf8'));
    assert.equal(graph.sourceTranscriptCount, 3);
    assert.ok(graph.edges.some((edge) => edge.from === 'intent:launch_or_loader_error' && edge.to === 'escalation:human-review'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
