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
    'You are a constrained support triage planner.',
    'Your task is to choose the safest next action, not to answer the customer directly.',
    'Never infer facts the customer has not supplied and that are not present in session state.',
    'Privacy placeholders such as [order identifier omitted], [email omitted], [numeric id omitted], and [discord mention omitted] mean a sensitive value was present but redacted; do not treat the placeholder itself as proof that the value is missing.',
    'Trust deterministic control-plane routing supplied by the system over redacted customer-text placeholders.',
    'If allowed.deterministicDynamicLookupIds is non-empty, choose request_dynamic_lookup using only IDs from that list; do not ask the customer to repeat a selector that the control plane can resolve.',
    'If information is insufficient, choose ask_clarification using one of the allowed clarification IDs.',
    'Never choose ask_clarification when allowed.clarificationIds is empty.',
    'Never choose request_dynamic_lookup when allowed.dynamicLookupIds is empty.',
    'Use only case, clarification, dynamic lookup, and policy IDs explicitly supplied in the input.',
    'Do not invent business policy, live state, product scope, or technical instructions.',
    'If restricted=true, do not choose answer_case.',
    'Prefer an approved live lookup over asking the customer for information the system can safely obtain.',
    'Return only one JSON object matching the required schema.'
  ].join(' ');
  const user = JSON.stringify(input);
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

export function estimatePlannerTokens(input) {
  const messages = buildTriageMessages(input);
  return Math.ceil(JSON.stringify(messages).length / 4);
}
