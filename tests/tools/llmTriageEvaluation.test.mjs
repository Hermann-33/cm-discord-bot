import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateLlmTriageRows, evaluateOpenRouterLlmTriage, triageOutputToPrediction } from '../../tools/ticket-transcript-exporter/evaluate-llm-triage.mjs';

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

test('maps structured triage actions to conversational-safety decisions', () => {
  assert.equal(triageOutputToPrediction({ nextAction: 'answer_case', caseIds: ['case.loader.connection'] }).primaryDecision, 'direct_static_case');
  assert.equal(triageOutputToPrediction({ nextAction: 'ask_clarification', clarificationId: 'clarify.support_surface' }).primaryDecision, 'generic_clarification');
  assert.equal(triageOutputToPrediction({ nextAction: 'ask_clarification', clarificationId: 'clarify.loader.failure_stage' }).primaryDecision, 'family_scoped_clarification');
});

test('evaluates a valid LLM clarification as optimal', async () => {
  const rows = [{
    id: 'row.1',
    sourceTranscriptIds: ['private-audit-only'],
    plannerTokenEstimate: 100,
    input,
    gold: {
      action: 'ask_clarification',
      inferability: 'family_only',
      primaryDecision: 'family_scoped_clarification',
      observableCaseIds: ['case.loader.connection'],
      observableFamilyIds: ['technical.loader'],
      clarificationId: 'clarify.loader.failure_stage',
      lookupIds: [],
      policyIds: []
    }
  }];
  const provider = async () => JSON.stringify({ observations, nextAction: 'ask_clarification', caseIds: [], clarificationId: 'clarify.loader.failure_stage', dynamicLookupIds: [], policyIds: [], confidence: 0.9, reasonCode: 'insufficient_context' });
  const result = await evaluateLlmTriageRows(rows, { provider, model: 'mock' });
  assert.equal(result.summary.records, 1);
  assert.equal(result.summary.structuredOutputAcceptanceRate, 1);
  assert.equal(result.summary.exactOptimalActionRate, 1);
  assert.equal(result.summary.counts.optimal, 1);
  assert.equal(result.summary.safeProgressOrBetterRate, 1);
  assert.equal(result.summary.unsafeRate, 0);
  assert.equal(result.summary.fallbackRate, 0);
});

test('invalid model JSON uses canonical safe fallback and is tracked separately', async () => {
  const rows = [{
    id: 'row.2',
    sourceTranscriptIds: [],
    plannerTokenEstimate: 50,
    input,
    gold: {
      action: 'ask_clarification',
      inferability: 'family_only',
      primaryDecision: 'family_scoped_clarification',
      observableCaseIds: ['case.loader.connection'],
      observableFamilyIds: ['technical.loader'],
      clarificationId: 'clarify.loader.failure_stage',
      lookupIds: [],
      policyIds: []
    }
  }];
  const result = await evaluateLlmTriageRows(rows, { provider: async () => '{bad json', model: 'mock' });
  assert.equal(result.summary.structuredOutputAcceptanceRate, 0);
  assert.equal(result.results[0].accepted, false);
  assert.equal(result.results[0].effectiveOutput.nextAction, 'ask_clarification');
  assert.equal(result.summary.safeProgressOrBetterRate, 1);
  assert.equal(result.summary.fallbackRate, 1);
});

test('hosted benchmark refuses a new holdout input file before provider creation', async () => {
  await assert.rejects(
    evaluateOpenRouterLlmTriage({
      dataDir: '.',
      inputFile: 'new-final-holdout.jsonl',
      apiKey: 'test-api-key'
    }),
    /consumed development input set/
  );
});
