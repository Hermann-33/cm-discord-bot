import { rankCases } from './evaluate-canonical-support-retrieval.mjs';
import { applyClarificationAnswer as recordClarificationAnswer, selectClarification } from './select-canonical-clarification.mjs';

const STATE_ARRAYS = [
  'resolvedEntities',
  'candidateEntities',
  'caseHistory',
  'candidateCaseIds',
  'candidateFamilyIds',
  'questionsAsked',
  'answersReceived',
  'unknownContext',
  'activeIntents',
  'diagnosticsAsked',
  'causesRuledOut',
  'proceduresAttempted',
  'escalationFlags'
];

const STATE_OBJECTS = [
  'knownContext',
  'diagnosticAnswers',
  'procedureOutcomes',
  'dynamicLookupResults',
  'policyState'
];

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalize(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9._+-]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function clone(value) {
  return structuredClone(value ?? {});
}

export function createSupportState(initial = {}) {
  const state = clone(initial);
  for (const key of STATE_ARRAYS) state[key] = unique(Array.isArray(state[key]) ? state[key] : []);
  for (const key of STATE_OBJECTS) state[key] = state[key] && typeof state[key] === 'object' && !Array.isArray(state[key]) ? state[key] : {};
  state.activeCaseId = typeof state.activeCaseId === 'string' ? state.activeCaseId : null;
  state.pendingDiagnosticId = typeof state.pendingDiagnosticId === 'string' ? state.pendingDiagnosticId : null;
  state.pendingClarificationId = typeof state.pendingClarificationId === 'string' ? state.pendingClarificationId : null;
  return state;
}

function entityKind(id) {
  return String(id).split('.').slice(0, id.startsWith('account_') ? 2 : 1).join('.');
}

function aliasIsNegated(text, alias) {
  const at = text.indexOf(alias);
  if (at < 0) return false;
  const prefix = text.slice(Math.max(0, at - 36), at);
  return /\b(?:not|isnt|arent|dont|do not|rather than|instead of)\b[^.?!]*$/.test(prefix);
}

function carryEntities(state, text, aliasEntries) {
  const explicit = [];
  const candidates = [];
  for (const entry of aliasEntries ?? []) {
    const alias = normalize(entry.alias);
    if (!alias || !(` ${text} `.includes(` ${alias} `)) || aliasIsNegated(text, alias)) continue;
    const targets = entry.targetIds ?? entry.targets ?? entry.target_ids ?? [];
    const ids = Array.isArray(targets) ? targets : [targets];
    if (ids.length === 1) explicit.push(ids[0]);
    else candidates.push(...ids);
  }
  if (explicit.length) {
    const kinds = new Set(explicit.map(entityKind));
    state.resolvedEntities = unique([...state.resolvedEntities.filter((id) => !kinds.has(entityKind(id))), ...explicit]);
  }
  if (candidates.length) state.candidateEntities = unique([...state.candidateEntities, ...candidates]);
}

function setDiagnosticAnswer(state, id, value) {
  if (!id) return;
  state.diagnosticAnswers[id] = value;
  state.diagnosticsAsked = unique([...state.diagnosticsAsked, id]);
  if (state.pendingDiagnosticId === id) state.pendingDiagnosticId = null;
}

function interpretKnownContext(state, text) {
  if (/\bgraphics\b[^.?!]*(?:already\s+)?(?:low|lowest|minimum|min)\b/.test(text) || /\b(?:low|lowest|minimum|min|lowered)\b[^.?!]*\b(?:graphics|settings)\b/.test(text) || /\bgraphics\b[^.?!]*(?:arent|are not|not)\s+high\b/.test(text)) {
    state.knownContext.graphicsLevel = 'low';
    setDiagnosticAnswer(state, 'diagnostic.rust.graphics_level', 'low');
  } else if (/\bgraphics\b[^.?!]*\bhigh\b/.test(text) && !/\b(?:not|arent|are not)\s+high\b/.test(text)) {
    state.knownContext.graphicsLevel = 'high';
    setDiagnosticAnswer(state, 'diagnostic.rust.graphics_level', 'high');
  }

  if (/\b(?:dont|do not|not|never)\s+(?:use|have|run|enable)[^.?!]*\bvpn\b|\bno\s+vpn\b|\bwithout (?:(?:a|the) )?vpn\b|\bvpn\s+(?:is\s+)?off\b/.test(text)) state.knownContext.vpnActive = false;
  else if (/\b(?:use|used|using|have|running|enabled|turned on)[^.?!]*\bvpn\b|\bworked with (?:a )?vpn\b|\bvpn\s+(?:is\s+)?on\b/.test(text)) state.knownContext.vpnActive = true;

  if (/\b(?:disabled|turned off)[^.?!]*\bsecure boot\b|\bsecure boot\b[^.?!]*\b(?:disabled|off)\b/.test(text)) state.knownContext.secureBoot = false;
  else if (/\b(?:enabled|turned on)[^.?!]*\bsecure boot\b|\bsecure boot\b[^.?!]*\b(?:enabled|on)\b/.test(text)) state.knownContext.secureBoot = true;
  if (/\b(?:disabled|turned off)[^.?!]*\btpm\b|\btpm\b[^.?!]*\b(?:disabled|off)\b/.test(text)) state.knownContext.tpmEnabled = false;
  else if (/\b(?:enabled|turned on)[^.?!]*\btpm\b|\btpm\b[^.?!]*\b(?:enabled|on)\b/.test(text)) state.knownContext.tpmEnabled = true;

  if (/\b(?:didnt|did not|havent|have not|not)\s+(?:receive|received|get|got)[^.?!]*(?:order|delivery|key|account)\b|\b(?:order|delivery)\b[^.?!]*\b(?:missing|not received)\b/.test(text)) state.knownContext.fulfillmentReceived = false;
  else if (/\b(?:received|got)[^.?!]*(?:order|delivery|key|account)\b/.test(text) && !/\b(?:didnt|did not|havent|have not|not)\b/.test(text)) state.knownContext.fulfillmentReceived = true;

  if (/\bwebview\b[^.?!]*\b(?:already\s+)?(?:installed|present|on (?:the )?pc)\b|\b(?:installed|have|present)\b[^.?!]*\bwebview\b/.test(text)) {
    state.knownContext.webviewInstalled = true;
    setDiagnosticAnswer(state, 'diagnostic.loader.webview_present', true);
  } else if (/\bwebview\b[^.?!]*\b(?:not installed|missing|dont have|do not have)\b/.test(text)) {
    state.knownContext.webviewInstalled = false;
    setDiagnosticAnswer(state, 'diagnostic.loader.webview_present', false);
  }

  if (/\b(?:background apps?|other apps?|programs?)\b[^.?!]*\b(?:closed|already closed|off)\b/.test(text)) state.knownContext.backgroundAppsClosed = true;
}

function interpretPendingAnswer(state, text) {
  const id = state.pendingDiagnosticId;
  if (!id) return;
  const yes = /^(?:yes|yeah|yep|yup|correct|it is)\b/.test(text);
  const no = /^(?:no|nope|nah|it isnt|it is not)\b/.test(text);
  if (!yes && !no) return;
  setDiagnosticAnswer(state, id, yes);
  if (id === 'diagnostic.loader.webview_present') state.knownContext.webviewInstalled = yes;
  if (id === 'diagnostic.order.reference_available') state.knownContext.orderSelectorAvailable = yes;
  if (id === 'diagnostic.nfa.worked_before') state.knownContext.workedBefore = yes;
}

function clarificationOption(id, text) {
  if (/^(?:i dont know|dont know|not sure|idk|unsure)\b/.test(text)) return 'not_sure';
  const mappings = {
    'clarify.support_surface': [
      ['nfa_or_account', /\b(?:nfa|account|acc)\b/],
      ['loader_or_product', /\b(?:loader|product|cheat|spoofer)\b/],
      ['website_payment_or_order', /\b(?:website|site|payment|paid|order|delivery)\b/]
    ],
    'clarify.nfa.failure_stage': [
      ['never_worked', /\b(?:never worked|never|first time|from (?:the )?(?:start|beginning)|didnt work)\b/],
      ['worked_then_invalid', /\b(?:worked (?:before|yesterday|earlier)|used to work|then invalid|became invalid|stopped working)\b/],
      ['owner_or_session_conflict', /\b(?:owner|someone else|logged out|kicked|signed out)\b/],
      ['activation_or_token_issue', /\b(?:activate|activation|redeem|token)\b/]
    ],
    'clarify.loader.failure_stage': [
      ['closes_immediately', /\b(?:close|closes|closing|exit|exits|disappear)\b/],
      ['connection_failure', /\b(?:connect|connection|network|fetch)\b/],
      ['download_or_update_failure', /\b(?:download|update|updating)\b/],
      ['key_or_license_error', /\b(?:key|license)\b/]
    ],
    'clarify.payment_state': [
      ['declined', /\b(?:declined|rejected)\b/],
      ['pending', /\b(?:pending|processing|waiting)\b/],
      ['completed_missing', /\b(?:paid|completed|charged).*(?:nothing|missing|didnt receive|not received)|(?:nothing|missing).*(?:paid|charged)\b/],
      ['wallet_balance_issue', /\b(?:wallet|balance)\b/]
    ],
    'clarify.order.fulfillment_state': [
      ['current_status', /\b(?:status|where is|check)\b/],
      ['waiting_for_delivery', /\b(?:waiting|not received|didnt receive|nothing arrived|missing)\b/],
      ['wrong_delivery', /\b(?:wrong|different)\b/],
      ['refund_or_cancel', /\b(?:refund|cancel)\b/]
    ]
  };
  for (const [option, pattern] of mappings[id] ?? []) if (pattern.test(text)) return option;
  return null;
}

function interpretPendingClarification(state, text, clarifications) {
  if (!state.pendingClarificationId) return false;
  const clarification = (clarifications ?? []).find((item) => item.id === state.pendingClarificationId);
  if (!clarification) return false;
  const option = clarificationOption(clarification.id, text);
  if (!option) return false;
  Object.assign(state, recordClarificationAnswer(state, clarification, option, text));
  return true;
}

function caseById(runtimeCases, id) {
  return (runtimeCases ?? []).find((item) => item.id === id);
}

function firstProcedure(activeCase) {
  return activeCase?.flow?.find((step) => step.procedureId)?.procedureId ?? null;
}

function markProcedure(state, procedureId, outcome = undefined) {
  if (!procedureId) return;
  state.proceduresAttempted = unique([...state.proceduresAttempted, procedureId]);
  if (outcome) state.procedureOutcomes[procedureId] = outcome;
}

function transitionTarget(activeCase, outcome) {
  const direct = outcome === 'success' ? activeCase?.onSuccessCaseId : activeCase?.onFailureCaseId;
  if (direct) return direct;
  for (const step of activeCase?.flow ?? []) {
    const target = outcome === 'success' ? step.onSuccess : step.onFailure;
    if (typeof target === 'string' && target.startsWith('case.')) return target;
  }
  return null;
}

function activateCase(state, targetId) {
  if (state.activeCaseId && state.activeCaseId !== targetId) state.caseHistory = unique([...state.caseHistory, state.activeCaseId]);
  state.activeCaseId = targetId;
}

function applicableNextAction(state, activeCase) {
  const diagnosticId = (activeCase?.ask ?? []).find((id) => !state.diagnosticsAsked.includes(id) && state.diagnosticAnswers[id] === undefined);
  if (diagnosticId) return { askDiagnosticId: diagnosticId };
  const procedureId = (activeCase?.flow ?? []).map((step) => step.procedureId).find((id) => id && !state.proceduresAttempted.includes(id) && state.procedureOutcomes[id] !== 'failure');
  if (procedureId) return { recommendProcedureId: procedureId };
  const dynamicLookupId = activeCase?.dynamic?.[0];
  if (dynamicLookupId) return { requestDynamicLookupId: dynamicLookupId };
  const escalationId = activeCase?.escalationIds?.[0];
  if (escalationId) return { escalationId };
  return null;
}

export function applyAssistantAction(inputState, action = {}) {
  const state = createSupportState(inputState);
  if (action.askDiagnosticId) {
    state.pendingDiagnosticId = action.askDiagnosticId;
    state.diagnosticsAsked = unique([...state.diagnosticsAsked, action.askDiagnosticId]);
  }
  if (action.askClarificationId) {
    state.pendingClarificationId = action.askClarificationId;
    state.questionsAsked = unique([...state.questionsAsked, action.askClarificationId]);
  }
  if (action.recommendProcedureId) state.knownContext.pendingProcedureId = action.recommendProcedureId;
  if (action.requestDynamicLookupId) state.dynamicLookupResults[action.requestDynamicLookupId] = { status: 'requested' };
  return state;
}

export function statefulQuery(state, customerText) {
  const tags = [];
  for (const id of state.resolvedEntities) tags.push(`[entity=${id}]`);
  if (state.activeCaseId) tags.push(`[active_case=${state.activeCaseId}]`);
  for (const [key, value] of Object.entries(state.knownContext)) if (['string', 'number', 'boolean'].includes(typeof value)) tags.push(`[${key}=${value}]`);
  for (const [id, outcome] of Object.entries(state.procedureOutcomes)) tags.push(`[procedure=${id}:${outcome}]`);
  return `${tags.join(' ')} ${customerText}`.trim();
}

export function resolveSupportTurn({ state: inputState = {}, customerText, runtimeCases = [], aliasEntries = [], runtimeClarifications = [], retrievalMethod = 'hybrid' }) {
  const state = createSupportState(inputState);
  const text = normalize(customerText);
  carryEntities(state, text, aliasEntries);
  interpretPendingAnswer(state, text);
  const answeredClarification = interpretPendingClarification(state, text, runtimeClarifications);
  interpretKnownContext(state, text);

  let activeCase = caseById(runtimeCases, state.activeCaseId);
  if (answeredClarification && state.candidateCaseIds.length === 1) {
    activateCase(state, state.candidateCaseIds[0]);
    activeCase = caseById(runtimeCases, state.activeCaseId);
  }
  const persists = /\b(?:still|everything is the same|everything(?:'s| is)? same|same error|same issue|same crash|same problem|didnt work|did not work|wont open|will not open|keeps? (?:crashing|closing|happening))\b/.test(text);
  const succeeded = /\b(?:worked|fixed|resolved|all good|that did it)\b/.test(text) && !persists;
  const alreadyTried = /\b(?:already (?:did|done|tried|installed|closed|lowered|sent)|tried (?:it|that|this)|did that already)\b/.test(text);
  let procedureId = state.knownContext.pendingProcedureId ?? firstProcedure(activeCase);

  if (state.activeCaseId === 'case.rust.nfa.server_load_crash' && state.knownContext.graphicsLevel === 'low' && (state.knownContext.backgroundAppsClosed || alreadyTried) && persists) {
    procedureId = 'procedure.system.reduce_resource_pressure';
    markProcedure(state, procedureId, 'failure');
    const targetId = 'case.rust.nfa.server_load_crash.continue';
    activateCase(state, targetId);
    return { state, action: { transitionToCaseId: targetId, escalateIfUnresolved: true }, usedRetrieval: false, transitionPriority: 'deterministic_active_case_transition' };
  }

  if (activeCase?.id === 'case.loader.closes_runtime' && state.knownContext.webviewInstalled === true) {
    procedureId = 'procedure.loader.install_webview_runtime';
    markProcedure(state, procedureId, 'not_applicable_already_present');
    state.escalationFlags = unique([...state.escalationFlags, 'escalation.known_flow_exhausted']);
    return { state, action: { escalationId: 'escalation.known_flow_exhausted' }, usedRetrieval: false, transitionPriority: 'deterministic_active_case_transition' };
  }

  const mentionsSentSelector = /\b(?:already (?:sent|provided|gave)|sent (?:it|the order|the reference)|gave (?:it|the order|the reference)|provided (?:it|the order|the reference))\b[^.?!]*(?:above|before|previous|earlier|reference|order|id)?/.test(text) || /\border (?:id|reference)\b[^.?!]*\b(?:above|already|earlier|previous)\b/.test(text);
  if (activeCase && activeCase.family?.startsWith('commerce.order') && mentionsSentSelector && (state.knownContext.orderSelector || state.knownContext.orderReference)) {
    const lookupId = activeCase.dynamic?.[0] ?? 'dynamic.order.status';
    state.knownContext.orderSelectorAvailable = true;
    state.dynamicLookupResults[lookupId] = { status: 'requested', selectorKnown: true };
    if (state.pendingDiagnosticId === 'diagnostic.order.reference_available') state.pendingDiagnosticId = null;
    return { state, action: { requestDynamicLookupId: lookupId, useKnownSelector: true }, usedRetrieval: false, transitionPriority: 'deterministic_active_case_transition' };
  }

  if (procedureId && (alreadyTried || persists || succeeded)) {
    const outcome = succeeded ? 'success' : persists ? 'failure' : undefined;
    markProcedure(state, procedureId, outcome);
    const targetId = outcome ? transitionTarget(activeCase, outcome) : null;
    if (targetId && caseById(runtimeCases, targetId)) {
      activateCase(state, targetId);
      return { state, action: { transitionToCaseId: targetId }, usedRetrieval: false, transitionPriority: 'explicit_case_edge' };
    }
    if (outcome === 'failure') {
      state.escalationFlags = unique([...state.escalationFlags, 'escalation.known_flow_exhausted']);
      return { state, action: { escalationId: 'escalation.known_flow_exhausted' }, usedRetrieval: false, transitionPriority: 'active_flow_exhausted' };
    }
  }

  if (activeCase) {
    const action = applicableNextAction(state, activeCase);
    if (action) return { state, action, usedRetrieval: false, transitionPriority: 'active_case_continuity' };
  }

  if (!activeCase && runtimeClarifications.length) {
    const next = selectClarification({ clarifications: runtimeClarifications, candidateCaseIds: state.candidateCaseIds, candidateFamilyIds: state.candidateFamilyIds, state });
    if (next) return { state, action: { askClarificationId: next.id }, usedRetrieval: false, transitionPriority: answeredClarification ? 'progressive_clarification' : 'information_sufficiency_clarification', candidateReduction: next.expectedCaseReduction };
  }

  const ranked = rankCases(statefulQuery(state, customerText), runtimeCases, aliasEntries, 5, retrievalMethod, { state });
  const targetId = ranked.results[0]?.id;
  if (targetId) {
    activateCase(state, targetId);
    activeCase = caseById(runtimeCases, targetId);
  }
  return { state, action: applicableNextAction(state, activeCase), usedRetrieval: true, transitionPriority: targetId ? 'scoped_retrieval' : 'global_fallback', candidates: ranked.results.map((item) => item.id) };
}
