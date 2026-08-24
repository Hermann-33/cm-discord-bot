import { TRIAGE_NEXT_ACTIONS } from './llm-triage-contract.mjs';

export const TRIAGE_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['observations','nextAction','caseIds','clarificationId','dynamicLookupIds','policyIds','confidence','reasonCode'],
  properties: {
    observations: {
      type: 'object',
      additionalProperties: false,
      required: ['explicitEntities','supportSurface','knownFacts','missingFacts'],
      properties: {
        explicitEntities: { type: 'array', items: { type: 'string' } },
        supportSurface: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        knownFacts: { type: 'array', items: { type: 'string' } },
        missingFacts: { type: 'array', items: { type: 'string' } }
      }
    },
    nextAction: { type: 'string', enum: TRIAGE_NEXT_ACTIONS },
    caseIds: { type: 'array', items: { type: 'string' } },
    clarificationId: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    dynamicLookupIds: { type: 'array', items: { type: 'string' } },
    policyIds: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    reasonCode: { type: 'string' }
  }
});

export function buildTriageMessages(input) {
  const system = [
    'You are a constrained support triage planner choosing only the next support action.',
    'Never infer facts that are not in customer text or session state.',
    'Privacy placeholders such as [order identifier omitted] mean a sensitive value was present and redacted; they are not entity IDs and do not prove the value is missing.',
    'If allowed.deterministicDynamicLookupIds is non-empty, choose request_dynamic_lookup using only those IDs.',
    'If allowed.deterministicClarificationIds is non-empty, choose ask_clarification using only those IDs.',
    'Otherwise use only IDs supplied in allowed; never choose an action that requires an ID when that allowed ID list is empty.',
    'Do not invent business policy, live state, product scope, technical instructions, or canonical IDs.',
    'If restricted=true, do not choose answer_case.',
    'Return only one JSON object matching the required schema.'
  ].join(' ');
  const user = JSON.stringify(input);
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

export function estimatePlannerTokens(input) {
  const messages = buildTriageMessages(input);
  return Math.ceil(JSON.stringify(messages).length / 4);
}
