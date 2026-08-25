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

const unique = (values) => [...new Set((values ?? []).filter(Boolean))];

export function buildTriageOutputSchema(input) {
  const allowedLookupIds = new Set(input?.allowed?.dynamicLookupIds ?? []);
  const deterministicLookupIds = unique(input?.allowed?.deterministicDynamicLookupIds ?? [])
    .filter((id) => allowedLookupIds.has(id));
  if (deterministicLookupIds.length > 0) {
    return {
      ...TRIAGE_OUTPUT_SCHEMA,
      properties: {
        ...TRIAGE_OUTPUT_SCHEMA.properties,
        nextAction: { type: 'string', enum: ['request_dynamic_lookup'] },
        clarificationId: { type: 'null' },
        dynamicLookupIds: { type: 'array', items: { type: 'string', enum: deterministicLookupIds } }
      }
    };
  }

  const allowedClarificationIds = new Set(input?.allowed?.clarificationIds ?? []);
  const deterministicClarificationIds = unique(input?.allowed?.deterministicClarificationIds ?? [])
    .filter((id) => allowedClarificationIds.has(id));
  if (deterministicClarificationIds.length > 0) {
    return {
      ...TRIAGE_OUTPUT_SCHEMA,
      properties: {
        ...TRIAGE_OUTPUT_SCHEMA.properties,
        nextAction: { type: 'string', enum: ['ask_clarification'] },
        clarificationId: { type: 'string', enum: deterministicClarificationIds }
      }
    };
  }

  const allowedCaseIds = new Set(input?.allowed?.caseIds ?? []);
  const deterministicCaseIds = unique(input?.allowed?.deterministicCaseIds ?? [])
    .filter((id) => allowedCaseIds.has(id));
  if (deterministicCaseIds.length > 0) {
    return {
      ...TRIAGE_OUTPUT_SCHEMA,
      properties: {
        ...TRIAGE_OUTPUT_SCHEMA.properties,
        nextAction: { type: 'string', enum: ['answer_case'] },
        caseIds: { type: 'array', minItems: 1, items: { type: 'string', enum: deterministicCaseIds } },
        clarificationId: { type: 'null' },
        dynamicLookupIds: { type: 'array', maxItems: 0, items: { type: 'string' } },
        policyIds: { type: 'array', maxItems: 0, items: { type: 'string' } }
      }
    };
  }

  return TRIAGE_OUTPUT_SCHEMA;
}

export function buildTriageMessages(input) {
  const system = [
    'You are a constrained support triage planner choosing only the safest next action.',
    'Never infer facts that are not in customer text or session state.',
    'Privacy placeholders such as [order identifier omitted] mean a sensitive value was present and redacted; they are not entity IDs and do not prove the value is missing.',
    'If allowed.deterministicDynamicLookupIds is non-empty, choose request_dynamic_lookup using only those IDs.',
    'If allowed.deterministicClarificationIds is non-empty, choose ask_clarification using only those IDs.',
    'If allowed.deterministicCaseIds is non-empty, choose answer_case using only those IDs.',
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
