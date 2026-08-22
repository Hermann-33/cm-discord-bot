import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export async function freezeActionRouter(dataDir) {
  const v3 = JSON.parse(await readFile(path.join(dataDir, 'knowledge-canonical', 'Audit', 'router-v3-holdout-manifest.json'), 'utf8'));
  const config = {
    schemaVersion: 1,
    status: 'frozen_before_v3_semantic_review_and_single_run',
    method: 'deterministic_observability_control_plane_plus_targeted_clarification',
    informationSufficiencyRequiredBeforeExactCase: true,
    decisionPriority: ['multi_intent','restricted_boundary','policy_route','support_operation','attachment_route','approved_dynamic_lookup','high_precision_exact_case','family_clarification','entity_clarification','generic_clarification'],
    features: ['explicit_entities','control_plane_signals','word_boundaries','negation_safe_state','canonical_case_scope','candidate_case_set','candidate_family_set','known_context','approved_lookup_availability'],
    clarificationSelection: { method: 'deterministic_expected_candidate_reduction', repeatKnownQuestion: false, askKnownContext: false, askLookupAvailableContext: false, effortPenalty: 0.25 },
    sparseBenchmark: { selectedForFinalRouter: false, reason: 'Combined word+character LinearSVC reached only 0.664 DEV action accuracy.' },
    weakHistoricalLabels: { treatedAsGold: false, permittedUse: 'none_in_frozen_router' },
    exactCaseThreshold: 'explicit_case_defining_state_only',
    v3SelectionHash: v3.selectionHash,
    v3SelectedCount: v3.selectedCount,
    noFurtherTuningAgainstV3: true
  };
  const hash = createHash('sha256').update(canonical(config)).digest('hex');
  const output = { ...config, configSha256: hash };
  await writeFile(path.join(dataDir, 'knowledge-canonical', 'Audit', 'action-router-final-config.json'), `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  return output;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf('--data-dir');
  if (index < 0 || !process.argv[index + 1]) throw new Error('--data-dir is required');
  console.log(JSON.stringify(await freezeActionRouter(path.resolve(process.argv[index + 1])), null, 2));
}
