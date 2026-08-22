const CONTROL_ROUTES = new Set([
  'static_knowledge',
  'dynamic_lookup',
  'policy_decision',
  'clarification_required',
  'attachment_required',
  'restricted_escalation',
  'support_operations'
]);

export function classifyControlPlane(text) {
  const value = String(text ?? '').toLowerCase();
  const routes = new Set();
  if (/\b(order|payment|paid|pending|charged|deliver(?:y|ed)?|receive[ds]?|wallet|balance|aura|stock|restock|status|price)\b/u.test(value)) routes.add('dynamic_lookup');
  if (/\b(refund|cancel|replacement|replace|wrong delivery|wrong account|banned|warranty|expired|dispute)\b/u.test(value)) routes.add('policy_decision');
  if (/\b(screenshot|screen ?shot|video|image|picture|shows? this|this error)\b|\[attachment omitted\]/u.test(value)) routes.add('attachment_required');
  if (/\b(bypass|evad(?:e|ing)|unban|anti.?cheat|hwid|inject(?:ion)?|driver)\b/u.test(value)) routes.add('restricted_escalation');
  if (/\b(customer role|link discord|close ticket|dont close|support|admin)\b/u.test(value)) routes.add('support_operations');
  if (!value.trim() || /^(?:hi|hello|hey|yo|help|anyone)[!?., ]*$/u.test(value)) routes.add('clarification_required');
  if (routes.size === 0) routes.add('static_knowledge');
  return [...routes];
}

export function scopeSpecificity(scope = {}) {
  if (scope.variants?.length) return 7;
  if (scope.products?.length) return 6;
  if (scope.accountListings?.length && scope.games?.length) return 5;
  if (scope.accountModels?.length && scope.games?.length) return 4;
  if (scope.games?.length) return 3;
  if (scope.categories?.length) return 2;
  return scope.global ? 0 : 1;
}

function kind(value) {
  return String(value).split('.')[0];
}

function scopeValues(scope = {}) {
  return Object.values(scope).flatMap((value) => Array.isArray(value) ? value : []).filter((value) => typeof value === 'string');
}

export function isScopeCompatible(scope, resolvedEntities) {
  const scoped = scopeValues(scope);
  for (const entity of resolvedEntities) {
    const sameKind = scoped.filter((candidate) => kind(candidate) === kind(entity));
    if (sameKind.length > 0 && !sameKind.includes(entity)) return false;
  }
  return true;
}

export function normalizeClassFrequencyScore(score, classFrequency) {
  return Number(score) / Math.sqrt(Math.max(1, Number(classFrequency) || 1));
}

export function generateCandidateCases({ cases, resolvedEntities = [], exactCaseIds = [], controlRoutes = [], familyScores = [], globalFallbackCount = 2, limit = 15 }) {
  const exact = new Set(exactCaseIds);
  const family = new Map(familyScores.map((entry) => [entry.family, entry.score]));
  const control = new Set(controlRoutes.filter((route) => CONTROL_ROUTES.has(route)));
  const ranked = cases
    .filter((record) => isScopeCompatible(record.scope, resolvedEntities))
    .map((record) => {
      const values = new Set(scopeValues(record.scope));
      const entityOverlap = resolvedEntities.filter((entity) => values.has(entity)).length;
      let score = exact.has(record.id) ? 1_000_000 : 0;
      score += entityOverlap * 100_000 + (entityOverlap ? scopeSpecificity(record.scope) * 1_000 : 0);
      score += (family.get(record.family) ?? 0) * 100;
      if (control.has('dynamic_lookup') && record.dynamic?.length) score += 30;
      if (control.has('policy_decision') && (record.policies?.length || record.escalationIds?.length)) score += 25;
      if (control.has('attachment_required') && record.id.startsWith('case.attachment.')) score += 30;
      if (control.has('restricted_escalation') && record.id === 'case.restricted.technical') score += 50;
      return { id: record.id, score, specificity: scopeSpecificity(record.scope), global: record.scope?.global === true };
    })
    .sort((left, right) => right.score - left.score || right.specificity - left.specificity || left.id.localeCompare(right.id));
  const selected = ranked.filter((entry) => !entry.global).slice(0, Math.max(0, limit - globalFallbackCount));
  for (const fallback of ranked.filter((entry) => entry.global).slice(0, globalFallbackCount)) {
    if (selected.length >= limit) break;
    selected.push(fallback);
  }
  return selected.slice(0, limit);
}

export function confidenceDisposition({ top1, top2, familyConfidence, controlRoutes = [], thresholds }) {
  if (controlRoutes.includes('dynamic_lookup')) return 'dynamic_lookup';
  if (controlRoutes.includes('policy_decision')) return 'policy_route';
  if (controlRoutes.includes('restricted_escalation')) return 'restricted_escalation';
  if (controlRoutes.includes('attachment_required')) return 'attachment_required';
  const margin = top1 - top2;
  if (top1 >= thresholds.top1 && margin >= thresholds.margin && familyConfidence >= thresholds.family) return 'confident_case';
  if (top1 >= thresholds.multiCase && margin < thresholds.margin) return 'confident_multi_case';
  if (familyConfidence >= thresholds.clarificationFamily) return 'targeted_clarification';
  return 'human_escalation';
}
