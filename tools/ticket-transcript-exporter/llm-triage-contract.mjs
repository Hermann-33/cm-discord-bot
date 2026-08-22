const NEXT_ACTIONS = new Set([
  'answer_case',
  'ask_clarification',
  'request_dynamic_lookup',
  'request_policy_route',
  'request_attachment',
  'restricted_escalation',
  'support_operation',
  'human_escalation',
  'multi_intent_route'
]);

const SCOPE_FIELDS = {
  games: 'game.',
  vendors: 'vendor.',
  products: 'product.',
  variants: 'variant.',
  accountModels: 'account_model.',
  accountListings: 'account_listing.'
};

const unique = (values) => [...new Set((values ?? []).filter(Boolean))];
const stringArray = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string');
const byId = (values) => new Map((values ?? []).map((item) => [item.id, item]));

function compactCase(record) {
  return {
    id: record.id,
    displayName: record.displayName,
    family: record.family,
    scope: record.scope,
    ask: record.ask ?? [],
    policies: record.policies ?? [],
    dynamic: (record.dynamic ?? []).map((item) => typeof item === 'string' ? item : item?.id).filter(Boolean),
    escalationIds: record.escalationIds ?? []
  };
}

function compactClarification(record) {
  return {
    id: record.id,
    question: record.question,
    scope: record.scope ?? {},
    setsContext: record.setsContext ?? null,
    distinguishesCases: record.distinguishesCases ?? [],
    distinguishesFamilies: record.distinguishesFamilies ?? [],
    liveLookupCanReplace: record.liveLookupCanReplace ?? []
  };
}

function lookupResolved(state, id) {
  const value = state.dynamicLookupResults?.[id];
  if (value === undefined || value === null) return false;
  if (typeof value !== 'object') return true;
  return !['requested','pending','unknown'].includes(String(value.status ?? '').toLowerCase());
}

function clarificationAlreadyKnown(state, item) {
  const fields = Array.isArray(item.setsContext) ? item.setsContext : item.setsContext ? [item.setsContext] : [];
  if (fields.length > 0 && fields.every((field) => state.knownContext?.[field] !== undefined)) return true;
  if ((item.liveLookupCanReplace ?? []).some((id) => lookupResolved(state, id))) return true;
  return false;
}

export function buildLlmTriageInput({
  customerText,
  state = {},
  resolvedEntities = state.resolvedEntities ?? [],
  candidateCases = [],
  candidateFamilies = state.candidateFamilyIds ?? [],
  clarifications = [],
  dynamicLookups = [],
  policies = [],
  restricted = false,
  maxCases = 8,
  maxClarifications = 6
}) {
  const cases = candidateCases.slice(0, maxCases).map(compactCase);
  const familyIds = unique([...candidateFamilies, ...cases.map((item) => item.family)]);
  const candidateCaseIds = new Set(cases.map((item) => item.id));
  const clarificationRows = clarifications
    .filter((item) => {
      const caseHit = (item.distinguishesCases ?? []).some((id) => candidateCaseIds.has(id));
      const familyHit = (item.distinguishesFamilies ?? []).some((id) => familyIds.includes(id));
      return caseHit || familyHit || item.id === 'clarify.support_surface';
    })
    .filter((item) => !(state.questionsAsked ?? []).includes(item.id))
    .filter((item) => !clarificationAlreadyKnown(state, item))
    .slice(0, maxClarifications)
    .map(compactClarification);

  return {
    schemaVersion: 1,
    instruction: 'Choose only the safest next support action. Never infer missing facts. Ask a canonical clarification when information is insufficient. Use only IDs supplied in this input.',
    customerText: String(customerText ?? ''),
    state: {
      resolvedEntities: unique(resolvedEntities),
      activeCaseId: state.activeCaseId ?? null,
      candidateCaseIds: unique(state.candidateCaseIds ?? []),
      candidateFamilyIds: unique(state.candidateFamilyIds ?? []),
      knownContext: state.knownContext ?? {},
      unknownContext: unique(state.unknownContext ?? []),
      pendingClarificationId: state.pendingClarificationId ?? null,
      pendingDiagnosticId: state.pendingDiagnosticId ?? null,
      questionsAsked: unique(state.questionsAsked ?? []),
      diagnosticsAsked: unique(state.diagnosticsAsked ?? []),
      proceduresAttempted: unique(state.proceduresAttempted ?? []),
      procedureOutcomes: state.procedureOutcomes ?? {},
      dynamicLookupResults: state.dynamicLookupResults ?? {}
    },
    allowed: {
      entityIds: unique(resolvedEntities),
      caseIds: cases.map((item) => item.id),
      cases,
      familyIds,
      clarifications: clarificationRows,
      clarificationIds: clarificationRows.map((item) => item.id),
      dynamicLookups: (dynamicLookups ?? []).map((item) => ({ id: item.id, purpose: item.purpose ?? item.description ?? null })),
      dynamicLookupIds: (dynamicLookups ?? []).map((item) => item.id),
      policies: (policies ?? []).map((item) => ({ id: item.id, displayName: item.displayName ?? item.name ?? item.id })),
      policyIds: (policies ?? []).map((item) => item.id)
    },
    restricted
  };
}

function scopeConflicts(caseRecord, resolvedEntities) {
  const entitySet = new Set(resolvedEntities ?? []);
  for (const [field, prefix] of Object.entries(SCOPE_FIELDS)) {
    const scoped = caseRecord?.scope?.[field] ?? [];
    if (scoped.length === 0) continue;
    const resolvedOfKind = [...entitySet].filter((id) => id.startsWith(prefix));
    if (resolvedOfKind.length > 0 && !resolvedOfKind.some((id) => scoped.includes(id))) return true;
  }
  return false;
}

function validateObservations(observations, input, errors) {
  if (!observations || typeof observations !== 'object' || Array.isArray(observations)) {
    errors.push('observations_invalid');
    return;
  }
  if (!stringArray(observations.explicitEntities ?? [])) errors.push('observation_entities_invalid');
  else {
    const allowed = new Set(input?.allowed?.entityIds ?? []);
    for (const id of observations.explicitEntities ?? []) if (!allowed.has(id)) errors.push(`ungrounded_observation_entity:${id}`);
  }
  if (observations.supportSurface !== null && observations.supportSurface !== undefined && typeof observations.supportSurface !== 'string') errors.push('support_surface_invalid');
  if (!stringArray(observations.knownFacts ?? [])) errors.push('known_facts_invalid');
  if (!stringArray(observations.missingFacts ?? [])) errors.push('missing_facts_invalid');
}

export function validateLlmTriageOutput(output, input, options = {}) {
  const errors = [];
  const directCaseConfidence = options.directCaseConfidence ?? 0.8;
  if (!output || typeof output !== 'object' || Array.isArray(output)) return { valid: false, errors: ['output_not_object'] };
  validateObservations(output.observations, input, errors);
  if (!NEXT_ACTIONS.has(output.nextAction)) errors.push('unknown_next_action');
  if (!stringArray(output.caseIds ?? [])) errors.push('case_ids_not_string_array');
  if (!stringArray(output.dynamicLookupIds ?? [])) errors.push('dynamic_lookup_ids_not_string_array');
  if (!stringArray(output.policyIds ?? [])) errors.push('policy_ids_not_string_array');
  if (output.clarificationId !== null && output.clarificationId !== undefined && typeof output.clarificationId !== 'string') errors.push('clarification_id_invalid');
  if (typeof output.confidence !== 'number' || output.confidence < 0 || output.confidence > 1) errors.push('confidence_invalid');
  if (typeof output.reasonCode !== 'string' || !output.reasonCode.trim()) errors.push('reason_code_invalid');

  const allowedCases = new Set(input?.allowed?.caseIds ?? []);
  const allowedClarifications = new Set(input?.allowed?.clarificationIds ?? []);
  const allowedLookups = new Set(input?.allowed?.dynamicLookupIds ?? []);
  const allowedPolicies = new Set(input?.allowed?.policyIds ?? []);
  for (const id of output.caseIds ?? []) if (!allowedCases.has(id)) errors.push(`unknown_case:${id}`);
  for (const id of output.dynamicLookupIds ?? []) if (!allowedLookups.has(id)) errors.push(`unknown_lookup:${id}`);
  for (const id of output.policyIds ?? []) if (!allowedPolicies.has(id)) errors.push(`unknown_policy:${id}`);
  if (output.clarificationId && !allowedClarifications.has(output.clarificationId)) errors.push(`unknown_clarification:${output.clarificationId}`);

  if (input?.restricted && output.nextAction === 'answer_case') errors.push('restricted_autonomous_answer');
  if (output.nextAction === 'answer_case' && (output.caseIds ?? []).length === 0) errors.push('answer_without_case');
  if (output.nextAction === 'ask_clarification' && !output.clarificationId) errors.push('clarification_without_id');
  if (output.nextAction === 'request_dynamic_lookup' && (output.dynamicLookupIds ?? []).length === 0) errors.push('lookup_without_id');
  if (output.nextAction === 'request_policy_route' && (output.policyIds ?? []).length === 0) errors.push('policy_route_without_id');
  if (output.nextAction === 'answer_case' && output.confidence < directCaseConfidence) errors.push('low_confidence_direct_case');

  const asked = new Set(input?.state?.questionsAsked ?? []);
  if (output.clarificationId && asked.has(output.clarificationId)) errors.push('repeated_clarification');

  const caseIndex = byId(input?.allowed?.cases ?? []);
  for (const id of output.caseIds ?? []) {
    if (scopeConflicts(caseIndex.get(id), input?.state?.resolvedEntities ?? [])) errors.push(`scope_conflict:${id}`);
  }

  return { valid: errors.length === 0, errors: unique(errors) };
}

function fallbackObservations() {
  return { explicitEntities: [], supportSurface: null, knownFacts: [], missingFacts: [] };
}

export function chooseSafeTriageFallback(input) {
  const activeCaseId = input?.state?.activeCaseId;
  if (activeCaseId && (input?.allowed?.caseIds ?? []).includes(activeCaseId)) {
    return { observations: fallbackObservations(), nextAction: 'answer_case', caseIds: [activeCaseId], clarificationId: null, dynamicLookupIds: [], policyIds: [], confidence: 1, reasonCode: 'existing_active_case' };
  }
  const clarification = (input?.allowed?.clarifications ?? []).find((item) => !(input?.state?.questionsAsked ?? []).includes(item.id));
  if (clarification) {
    return { observations: fallbackObservations(), nextAction: 'ask_clarification', caseIds: [], clarificationId: clarification.id, dynamicLookupIds: [], policyIds: [], confidence: 1, reasonCode: 'safe_canonical_clarification' };
  }
  return { observations: fallbackObservations(), nextAction: 'human_escalation', caseIds: [], clarificationId: null, dynamicLookupIds: [], policyIds: [], confidence: 1, reasonCode: 'no_safe_machine_action' };
}

export async function runLlmTriage({ provider, input, validatorOptions }) {
  if (typeof provider !== 'function') throw new TypeError('provider must be an async function');
  let raw;
  try {
    raw = await provider(input);
  } catch (error) {
    return { accepted: false, output: chooseSafeTriageFallback(input), errors: [`provider_error:${error?.message ?? String(error)}`] };
  }
  let parsed = raw;
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw); }
    catch { return { accepted: false, output: chooseSafeTriageFallback(input), errors: ['invalid_json'] }; }
  }
  const validation = validateLlmTriageOutput(parsed, input, validatorOptions);
  if (!validation.valid) return { accepted: false, output: chooseSafeTriageFallback(input), errors: validation.errors, rejectedOutput: parsed };
  return { accepted: true, output: parsed, errors: [] };
}

export const TRIAGE_NEXT_ACTIONS = Object.freeze([...NEXT_ACTIONS]);
