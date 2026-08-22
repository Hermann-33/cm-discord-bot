import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { importSupportRuntimePack, PUBLIC_SUPPORT_RUNTIME_ARTIFACTS } from '../../tools/ticket-transcript-exporter/import-support-runtime-pack.mjs';

test('runtime importer copies only allowlisted sanitized fields', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'cm-support-runtime-'));
  const source = path.join(root, 'runtime-kb');
  const output = path.join(root, 'public');
  await mkdir(source);
  try {
    const arrays = new Set(['aliases.json','clarifications.json','dynamic-lookups.json','escalations.json','policies.json','procedures.json','product-profiles.json','restricted-topics.json']);
    for (const publicFile of PUBLIC_SUPPORT_RUNTIME_ARTIFACTS) {
      if (publicFile === 'cases.json') continue;
      const value = arrays.has(publicFile) ? [] : { schemaVersion: 1 };
      await writeFile(path.join(source, publicFile), `${JSON.stringify(value)}\n`);
    }
    await writeFile(path.join(source, 'cases.jsonl'), `${JSON.stringify({
      id: 'case.safe.example',
      displayName: 'Safe example',
      family: 'safe.family',
      match: { phrases: ['safe phrase'], context: ['raw historical evidence'] },
      provenance: { sampleTranscriptIds: ['private-ticket-id'], historicalFactIds: ['fact.0001'] }
    })}\n`);
    await writeFile(path.join(source, 'manifest.json'), JSON.stringify({ knowledgeVersion: 'test' }));

    await importSupportRuntimePack({ sourceDirectory: source, outputDirectory: output });
    const cases = JSON.parse(await readFile(path.join(output, 'cases.json'), 'utf8'));
    assert.deepEqual(cases[0].match, { phrases: ['safe phrase'] });
    assert.equal(Object.hasOwn(cases[0], 'provenance'), false);
    assert.equal(JSON.stringify(cases).includes('private-ticket-id'), false);
    assert.equal(JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8')).schemaVersion, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
