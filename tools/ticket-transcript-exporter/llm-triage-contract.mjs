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
  if (!item) return false;
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
  candidateDynamicLookupIds = state.candidateDynamicLookupIds ?? [],
  candidateClarificationIds = state.candidateClarificationIds ?? [],
  candidateStaticCaseIds = state.candidateStaticCaseIds ?? [],
  clarifications = [],
  dynamicLookups = [],
  policies = [],
  restricted = false,
  maxCases = 8,
  maxClarifications = 6
}) {
  const deterministicLookupIds = new Set(unique(candidateDynamicLookupIds));
  const deterministicClarificationIdSet = new Set(unique(candidateClarificationIds));
  const deterministicCaseIdSet = new Set(unique(candidateStaticCaseIds));
  const hasDeterministicLookupRoute = deterministicLookupIds.size > 0;
  const hasDeterministicClarificationRoute = !hasDeterministicLookupRoute && deterministicClarificationIdSet.size > 0;
  const hasDeterministicCaseRoute = !hasDeterministicLookupRoute && !hasDeterministicClarificationRoute && deterministicCaseIdSet.size > 0;
  const supportSurfaceOnly = hasDeterministicClarificationRoute && deterministicClarificationIdSet.has('clarify.support_surface');
  const cases = (supportSurfaceOnly
    ? []
    : candidateCases.filter((item) => !hasDeterministicCaseRoute || deterministicCaseIdSet.has(item.id)).slice(0, maxCases)
  ).map(compactCase);
  const familyIds = unique([...(supportSurfaceOnly ? [] : candidateFamilies), ...cases.map((item) => item.family)]);
  const candidateCaseIds = new Set(cases.map((item) => item.id));
  const hasScopedCandidates = candidateCaseIds.size > 0 || familyIds.length > 0;

  const clarificationRows = (hasDeterministicLookupRoute || hasDeterministicCaseRoute ? [] : clarifications)
    .filter((item) => {
      if (hasDeterministicClarificationRoute) return deterministicClarificationIdSet.has(item.id);
      const caseHit = (item.distinguishesCases ?? []).some((id) => candidateCaseIds.has(id));
      const familyHit = (item.distinguishesFamilies ?? []).some((id) => familyIds.includes(id));
      const genericFallback = item.id === 'clarify.support_surface' && !hasScopedCandidates;
      if (item.id === 'clarify.order_selector' && !familyIds.some((id) => id === 'commerce.order' || id === 'commerce.fulfillment')) return false;
      return caseHit || familyHit || genericFallback;
    })
    .filter((item) => !(state.questionsAsked ?? []).includes(item.id))
    .filter((item) => !clarificationAlreadyKnown(state, item))
    .sort((a, b) => Number(a.id === 'clarify.support_surface') - Number(b.id === 'clarify.support_surface'))
    .slice(0, maxClarifications)
    .map((item) => compactClarification(
      item.id === 'clarify.support_surface' && hasScopedCandidates
        ? { ...item, liveLookupCanReplace: [] }
        : item
    ));

  const relevantLookupIds = hasDeterministicLookupRoute
    ? deterministicLookupIds
    : hasDeterministicClarificationRoute || hasDeterministicCaseRoute
      ? new Set()
      : new Set(unique([
        ...cases.flatMap((item) => item.dynamic ?? []),
        ...clarificationRows.flatMap((item) => item.liveLookupCanReplace ?? [])
      ]));
  const dynamicLookupRows = (dynamicLookups ?? [])
    .filter((item) => relevantLookupIds.has(item.id))
    .map((item) => ({ id: item.id, operation: item.operation ?? null, purpose: item.purpose ?? item.description ?? null }));
  const deterministicDynamicLookupIds = dynamicLookupRows
    .filter((item) => deterministicLookupIds.has(item.id))
    .map((item) => item.id);
  const deterministicClarificationIds = clarificationRows
    .filter((item) => deterministicClarificationIdSet.has(item.id))
    .map((item) => item.id);

  return {
    schemaVersion: 1,
    instruction: 'Choose only the safest next support action. Never infer missing facts. Respect deterministic lookup or clarification routes when supplied. Use only IDs supplied in this input.',
    customerText: String(customerText ?? ''),
    state: {
      resolvedEntities: unique(resolvedEntities),
      activeCaseId: state.activeCaseId ?? null,
      candidateCaseIds: unique(state.candidateCaseIds ?? []),
      candidateFamilyIds: unique(state.candidateFamilyIds ?? []),
      candidateClarificationIds: unique(candidateClarificationIds),
      candidateStaticCaseIds: unique(candidateStaticCaseIds),
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
      deterministicCaseIds: cases.filter((item) => deterministicCaseIdSet.has(item.id)).map((item) => item.id),
      cases,
      familyIds,
      clarifications: clarificationRows,
      clarificationIds: clarificationRows.map((item) => item.id),
      deterministicClarificationIds,
      dynamicLookups: dynamicLookupRows,
      dynamicLookupIds: dynamicLookupRows.map((item) => item.id),
      deterministicDynamicLookupIds,
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
  const deterministicCases = new Set(input?.allowed?.deterministicCaseIds ?? []);
  const allowedClarifications = new Set(input?.allowed?.clarificationIds ?? []);
  const deterministicClarifications = new Set(input?.allowed?.deterministicClarificationIds ?? []);
  const allowedLookups = new Set(input?.allowed?.dynamicLookupIds ?? []);
  const allowedPolicies = new Set(input?.allowed?.policyIds ?? []);
  const clarificationById = byId(input?.allowed?.clarifications ?? []);
  for (const id of output.caseIds ?? []) if (!allowedCases.has(id)) errors.push(`unknown_case:${id}`);
  for (const id of output.dynamicLookupIds ?? []) if (!allowedLookups.has(id)) errors.push(`unknown_lookup:${id}`);
  for (const id of output.policyIds ?? []) if (!allowedPolicies.has(id)) errors.push(`unknown_policy:${id}`);
  if (output.clarificationId && !allowedClarifications.has(output.clarificationId)) errors.push(`unknown_clarification:${output.clarificationId}`);

  if (deterministicClarifications.size > 0 && (output.nextAction !== 'ask_clarification' || !deterministicClarifications.has(output.clarificationId))) errors.push('deterministic_clarification_route_mismatch');
  if (deterministicCases.size > 0 && (output.nextAction !== 'answer_case' || !(output.caseIds ?? []).some((id) => deterministicCases.has(id)))) errors.push('deterministic_case_route_mismatch');
  if (input?.restricted && output.nextAction === 'answer_case') errors.push('restricted_autonomous_answer');
  if (output.nextAction === 'answer_case' && (output.caseIds ?? []).length === 0) errors.push('answer_without_case');
  if (output.nextAction === 'ask_clarification' && !output.clarificationId) errors.push('clarification_without_id');
  if (output.nextAction === 'request_dynamic_lookup' && (output.dynamicLookupIds ?? []).length === 0) errors.push('lookup_without_id');
  if (output.nextAction === 'request_policy_route' && (output.policyIds ?? []).length === 0) errors.push('policy_route_without_id');
  if (output.nextAction === 'answer_case' && output.confidence < directCaseConfidence) errors.push('low_confidence_direct_case');

  const asked = new Set(input?.state?.questionsAsked ?? []);
  if (output.clarificationId && asked.has(output.clarificationId)) errors.push('repeated_clarification');
  if (output.clarificationId && clarificationAlreadyKnown(input?.state ?? {}, clarificationById.get(output.clarificationId))) errors.push('clarification_answer_already_known');

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
  const allowedLookupIds = new Set(input?.allowed?.dynamicLookupIds ?? []);
  const deterministicLookupIds = unique(input?.allowed?.deterministicDynamicLookupIds ?? [])
    .filter((id) => allowedLookupIds.has(id));
  if (deterministicLookupIds.length > 0) {
    return { observations: fallbackObservations(), nextAction: 'request_dynamic_lookup', caseIds: [], clarificationId: null, dynamicLookupIds: deterministicLookupIds, policyIds: [], confidence: 1, reasonCode: 'deterministic_lookup_route' };
  }
  const allowedClarificationIds = new Set(input?.allowed?.clarificationIds ?? []);
  const deterministicClarificationId = unique(input?.allowed?.deterministicClarificationIds ?? [])
    .find((id) => allowedClarificationIds.has(id));
  if (deterministicClarificationId) {
    return { observations: fallbackObservations(), nextAction: 'ask_clarification', caseIds: [], clarificationId: deterministicClarificationId, dynamicLookupIds: [], policyIds: [], confidence: 1, reasonCode: 'deterministic_clarification_route' };
  }
  const allowedCaseIds = new Set(input?.allowed?.caseIds ?? []);
  const deterministicCaseIds = unique(input?.allowed?.deterministicCaseIds ?? [])
    .filter((id) => allowedCaseIds.has(id));
  if (deterministicCaseIds.length > 0) {
    return { observations: fallbackObservations(), nextAction: 'answer_case', caseIds: deterministicCaseIds, clarificationId: null, dynamicLookupIds: [], policyIds: [], confidence: 1, reasonCode: 'deterministic_case_route' };
  }
  const activeCaseId = input?.state?.activeCaseId;
  if (!input?.restricted && activeCaseId && (input?.allowed?.caseIds ?? []).includes(activeCaseId)) {
    return { observations: fallbackObservations(), nextAction: 'answer_case', caseIds: [activeCaseId], clarificationId: null, dynamicLookupIds: [], policyIds: [], confidence: 1, reasonCode: 'existing_active_case' };
  }
  const clarification = (input?.allowed?.clarifications ?? []).find((item) =>
    !(input?.state?.questionsAsked ?? []).includes(item.id) &&
    !clarificationAlreadyKnown(input?.state ?? {}, item)
  );
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
