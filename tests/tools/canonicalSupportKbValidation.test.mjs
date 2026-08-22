import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  parseArgs,
  scanPrivacy,
  validateCanonicalSupportKb,
  validateFactDispositions,
  validateWikilinks
} from '../../tools/ticket-transcript-exporter/validate-canonical-support-kb.mjs';

test('canonical KB validator requires data directory', () => {
  assert.throws(() => parseArgs([]), /--data-dir is required/);
  const parsed = parseArgs(['--data-dir', '.', '--expected-facts', '2']);
  assert.equal(parsed.expectedFacts, 2);
});

test('fact disposition validation requires exact unique coverage and valid dispositions', () => {
  const result = validateFactDispositions([
    {
      original_fact_id: 'fact-a',
      disposition: 'canonical',
      canonical_target_ids: ['canonical-a'],
      reason: 'retained'
    },
    {
      original_fact_id: 'fact-b',
      disposition: 'merged_duplicate',
      canonical_target_ids: ['canonical-a'],
      reason: 'same subject/relation/object/conditions/scope'
    }
  ], 2);

  assert.equal(result.ok, true);
  assert.equal(result.recordCount, 2);
  assert.equal(result.uniqueOriginalFactIds, 2);

  const invalid = validateFactDispositions([
    {
      original_fact_id: 'fact-a',
      disposition: 'canonical',
      canonical_target_ids: [],
      reason: 'retained'
    },
    {
      original_fact_id: 'fact-a',
      disposition: 'invented',
      canonical_target_ids: [],
      reason: ''
    }
  ], 2);

  assert.equal(invalid.ok, false);
  assert.ok(invalid.issues.some((issue) => issue.includes('duplicate original fact id')));
  assert.ok(invalid.issues.some((issue) => issue.includes('invalid disposition')));
});

test('wikilink validation accepts unique basename links and rejects missing links', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cm-canonical-links-'));
  try {
    await mkdir(join(root, 'Cases'), { recursive: true });
    await mkdir(join(root, 'Procedures'), { recursive: true });
    await writeFile(join(root, 'Cases', 'Case A.md'), '# Case A\n\n[[Procedure A]]\n');
    await writeFile(join(root, 'Procedures', 'Procedure A.md'), '# Procedure A\n');

    const valid = await validateWikilinks(root);
    assert.equal(valid.ok, true);
    assert.equal(valid.wikilinks, 1);

    await writeFile(join(root, 'Cases', 'Case B.md'), '# Case B\n\n[[Missing Procedure]]\n');
    const invalid = await validateWikilinks(root);
    assert.equal(invalid.ok, false);
    assert.ok(invalid.issues.some((issue) => issue.includes('broken wikilink')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('privacy scan detects obvious email and URL leakage in derived artifacts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cm-canonical-privacy-'));
  try {
    await writeFile(join(root, 'sample.json'), JSON.stringify({
      email: 'customer@example.com',
      url: 'https://example.com/private/path'
    }));
    const findings = await scanPrivacy(root);
    assert.ok(findings.some((finding) => finding.type === 'email'));
    assert.ok(findings.some((finding) => finding.type === 'raw-url'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('full validator accepts a minimal synthetic canonical/runtime pack', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cm-canonical-validator-'));
  try {
    const canonical = join(root, 'knowledge-canonical');
    const audit = join(canonical, 'Audit');
    const cases = join(canonical, 'Cases');
    const runtime = join(root, 'runtime-kb');
    await mkdir(audit, { recursive: true });
    await mkdir(cases, { recursive: true });
    await mkdir(runtime, { recursive: true });

    await writeFile(join(audit, 'fact-disposition.jsonl'), [
      JSON.stringify({ original_fact_id: 'fact-a', disposition: 'canonical', canonical_target_ids: ['fact.a'], reason: 'retained' }),
      JSON.stringify({ original_fact_id: 'fact-b', disposition: 'linked_related', canonical_target_ids: ['fact.a'], reason: 'related but distinct' })
    ].join('\n'));
    await writeFile(join(cases, 'Case A.md'), '# Case A\n');

    for (const file of [
      'manifest.json',
      'catalog.json',
      'aliases.json',
      'product-profiles.json',
      'procedures.json',
      'policies.json',
      'routing.json',
      'dynamic-lookups.json',
      'escalations.json',
      'restricted-topics.json'
    ]) {
      await writeFile(join(runtime, file), '{}');
    }
    await writeFile(join(runtime, 'cases.jsonl'), JSON.stringify({ id: 'case.synthetic' }));

    const result = await validateCanonicalSupportKb({ dataDir: root, expectedFacts: 2 });
    assert.equal(result.ok, true, JSON.stringify(result, null, 2));
    assert.equal(result.runtime.caseCount, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
