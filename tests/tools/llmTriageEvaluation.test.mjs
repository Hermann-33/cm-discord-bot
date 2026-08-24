import assert from 'node:assert/strict';
import test from 'node:test';
import { assessGoldRepresentability } from '../../tools/ticket-transcript-exporter/build-llm-triage-benchmark.mjs';
import { assertIndependentDevelopmentRows, evaluateGroqLlmTriage, evaluateLlmTriageRows, evaluateOpenRouterLlmTriage, triageOutputToPrediction } from '../../tools/ticket-transcript-exporter/evaluate-llm-triage.mjs';

const input = {
  state: { resolvedEntities: [], questionsAsked: [], activeCaseId: null },
  allowed: {
    entityIds: [],
    caseIds: ['case.loader.connection'],
    cases: [{ id: 'case.loader.connection', displayName: 'Loader connection failure', family: 'technical.loader', scope: { games: [], vendors: [], products: [], variants: [], accountModels: [], accountListings: [] } }],
    familyIds: ['technical.loader'],
    clarificationIds: ['clarify.loader.failure_stage'],
    clarifications: [{ id: 'clarify.loader.failure_stage', question: 'What happens when it opens?', distinguishesCases: ['case.loader.connection'], distinguishesFamilies: ['technical.loader'] }],
    dynamicLookupIds: [],
    dynamicLookups: [],
    policyIds: [],
    policies: []
  },
  restricted: false
};

const observations = { explicitEntities: [], supportSurface: 'loader', knownFacts: [], missingFacts: ['failure_stage'] };
const gold = {
  action: 'ask_clarification',
  inferability: 'family_only',
  primaryDecision: 'family_scoped_clarification',
  observableCaseIds: ['case.loader.connection'],
  observableFamilyIds: ['technical.loader'],
  clarificationId: 'clarify.loader.failure_stage',
  lookupIds: [],
  policyIds: []
};

const row = (id, plannerTokenEstimate = 100) => ({
  id,
  sourceTranscriptIds: [],
  plannerTokenEstimate,
  input,
  gold
});

const retainedHostedRow = (overrides = {}) => ({
  ...row('hosted.row'),
  goldLabelMethod: 'independent_semantic_review_first_turn_decision',
  benchmarkAdjudication: { disposition: 'retain', category: 'not_flagged' },
  benchmarkEligibility: { eligible: true, reasons: [] },
  ...overrides
});

test('maps structured triage actions to conversational-safety decisions', () => {
  assert.equal(triageOutputToPrediction({ nextAction: 'answer_case', caseIds: ['case.loader.connection'] }).primaryDecision, 'direct_static_case');
  assert.equal(triageOutputToPrediction({ nextAction: 'ask_clarification', clarificationId: 'clarify.support_surface' }).primaryDecision, 'generic_clarification');
  assert.equal(triageOutputToPrediction({ nextAction: 'ask_clarification', clarificationId: 'clarify.loader.failure_stage' }).primaryDecision, 'family_scoped_clarification');
});

test('evaluates a valid LLM clarification as optimal', async () => {
  const provider = async () => JSON.stringify({ observations, nextAction: 'ask_clarification', caseIds: [], clarificationId: 'clarify.loader.failure_stage', dynamicLookupIds: [], policyIds: [], confidence: 0.9, reasonCode: 'insufficient_context' });
  const result = await evaluateLlmTriageRows([row('row.1')], { provider, model: 'mock' });
  assert.equal(result.summary.records, 1);
  assert.equal(result.summary.requestedRecords, 1);
  assert.equal(result.summary.structuredOutputAcceptanceRate, 1);
  assert.equal(result.summary.exactOptimalActionRate, 1);
  assert.equal(result.summary.counts.optimal, 1);
  assert.equal(result.summary.safeProgressOrBetterRate, 1);
  assert.equal(result.summary.unsafeRate, 0);
  assert.equal(result.summary.fallbackRate, 0);
});

test('invalid model JSON uses canonical safe fallback and is tracked separately', async () => {
  const result = await evaluateLlmTriageRows([row('row.2', 50)], { provider: async () => '{bad json', model: 'mock' });
  assert.equal(result.summary.structuredOutputAcceptanceRate, 0);
  assert.equal(result.results[0].accepted, false);
  assert.equal(result.results[0].effectiveOutput.nextAction, 'ask_clarification');
  assert.equal(result.summary.safeProgressOrBetterRate, 1);
  assert.equal(result.summary.fallbackRate, 1);
});

test('rate-limited hosted evaluation stops after the first 429 instead of consuming more requests', async () => {
  let calls = 0;
  const provider = async () => {
    calls += 1;
    throw new Error('Groq triage provider returned HTTP 429');
  };
  const result = await evaluateLlmTriageRows(
    [row('row.1'), row('row.2'), row('row.3')],
    { provider, model: 'mock', stopOnRateLimit: true }
  );
  assert.equal(calls, 1);
  assert.equal(result.summary.records, 1);
  assert.equal(result.summary.requestedRecords, 3);
  assert.deepEqual(result.summary.stoppedEarly, { reason: 'provider_rate_limit', afterRecords: 1 });
});

test('legacy media family name is representable when the canonical media case is available', () => {
  const triageInput = {
    allowed: {
      caseIds: ['case.media.application'],
      familyIds: ['business.application'],
      clarificationIds: [],
      dynamicLookupIds: [],
      policyIds: []
    }
  };
  const result = assessGoldRepresentability({
    action: 'answer_case',
    observableCaseIds: ['case.media.application'],
    observableFamilyIds: ['business.media'],
    lookupIds: [],
    policyIds: []
  }, triageInput);
  assert.deepEqual(result, { eligible: true, reasons: [] });
});

test('runtime dynamic lookup IDs are valid hosted-planner actions when supplied by the benchmark input', () => {
  const triageInput = {
    allowed: {
      caseIds: ['case.catalog.availability_status'],
      familyIds: ['catalog.dynamic'],
      clarificationIds: [],
      dynamicLookupIds: ['dynamic.catalog.product_status'],
      policyIds: []
    }
  };
  const result = assessGoldRepresentability({
    action: 'request_dynamic_lookup',
    observableCaseIds: ['case.catalog.availability_status'],
    observableFamilyIds: ['catalog.dynamic'],
    lookupIds: ['dynamic.catalog.product_status'],
    policyIds: []
  }, triageInput);
  assert.deepEqual(result, { eligible: true, reasons: [] });
});

test('hosted benchmark guard requires retained adjudicated representable rows', () => {
  assert.doesNotThrow(() => assertIndependentDevelopmentRows([retainedHostedRow()]));
  assert.throws(
    () => assertIndependentDevelopmentRows([retainedHostedRow({ benchmarkAdjudication: undefined })]),
    /adjudicated retained development inputs/
  );
  assert.throws(
    () => assertIndependentDevelopmentRows([retainedHostedRow({ benchmarkAdjudication: { disposition: 'exclude' } })]),
    /adjudicated retained development inputs/
  );
  assert.throws(
    () => assertIndependentDevelopmentRows([retainedHostedRow({ benchmarkEligibility: { eligible: false, reasons: ['x'] } })]),
    /planner-representable gold/
  );
});

test('hosted benchmarks refuse a new holdout input file before provider creation', async () => {
  await assert.rejects(
    evaluateOpenRouterLlmTriage({
      dataDir: '.',
      inputFile: 'new-final-holdout.jsonl',
      apiKey: 'test-api-key'
    }),
    /consumed development inputs/
  );
  await assert.rejects(
    evaluateGroqLlmTriage({
      dataDir: '.',
      inputFile: 'new-final-holdout.jsonl',
      model: 'openai/gpt-oss-120b',
      apiKey: 'gsk_test_key_12345678901234567890'
    }),
    /consumed development inputs/
  );
});
