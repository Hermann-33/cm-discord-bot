const unique = (values) => [...new Set((values ?? []).filter(Boolean))];

function answered(clarification, state) {
  const known = state.knownContext ?? {};
  return clarification.setsContext.length > 0 && clarification.setsContext.some((key) => known[key] !== undefined);
}

function suppliedByLookup(clarification, state) {
  const results = state.dynamicLookupResults ?? {};
  return clarification.liveLookupCanReplace.some((id) => results[id]?.status === 'complete' || results[id]?.status === 'available');
}

function relevant(clarification, cases, families) {
  const caseSet = new Set(cases);
  const familySet = new Set(families);
  const caseHits = clarification.distinguishesCases.filter((id) => caseSet.has(id)).length;
  const familyHits = clarification.distinguishesFamilies.filter((id) => familySet.has(id)).length;
  return { caseHits, familyHits, total: caseHits + familyHits };
}

function expectedCaseReduction(clarification, cases) {
  const universe = new Set(cases);
  if (universe.size <= 1) return 0;
  const partitions = Object.values(clarification.increasesCases ?? {})
    .map((ids) => unique(ids).filter((id) => universe.has(id)))
    .filter((ids) => ids.length > 0);
  if (partitions.length === 0) {
    const covered = clarification.distinguishesCases.filter((id) => universe.has(id)).length;
    return covered >= 2 ? Math.min(universe.size - 1, covered - 1) : 0;
  }
  const assigned = new Set(partitions.flat());
  const sizes = partitions.map((ids) => ids.length);
  const remainder = cases.filter((id) => !assigned.has(id)).length;
  if (remainder) sizes.push(remainder);
  const expectedRemaining = sizes.reduce((sum, size) => sum + (size * size) / universe.size, 0);
  return Math.max(0, universe.size - expectedRemaining);
}

export function rankClarifications({ clarifications, candidateCaseIds = [], candidateFamilyIds = [], state = {} }) {
  const asked = new Set(state.questionsAsked ?? []);
  const candidates = unique(candidateCaseIds);
  const families = unique(candidateFamilyIds);
  return clarifications
    .filter((item) => !asked.has(item.id) && !answered(item, state) && !suppliedByLookup(item, state))
    .map((item) => {
      const hits = relevant(item, candidates, families);
      const reduction = expectedCaseReduction(item, candidates);
      const broadSurfaceBonus = item.id === 'clarify.support_surface' && candidates.length === 0 && families.length === 0 ? 3 : 0;
      const score = reduction * 4 + hits.caseHits * 1.5 + hits.familyHits * 2 + broadSurfaceBonus - (item.effort ?? 1) * 0.25;
      return { id: item.id, score, expectedCaseReduction: reduction, relevantCaseCount: hits.caseHits, relevantFamilyCount: hits.familyHits, clarification: item };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

export function selectClarification(input) {
  return rankClarifications(input)[0] ?? null;
}

export function applyClarificationQuestion(inputState, clarification) {
  const state = structuredClone(inputState ?? {});
  state.questionsAsked = unique([...(state.questionsAsked ?? []), clarification.id]);
  state.pendingClarificationId = clarification.id;
  state.unknownContext = unique([...(state.unknownContext ?? []), ...clarification.setsContext.filter((key) => state.knownContext?.[key] === undefined)]);
  return state;
}

export function applyClarificationAnswer(inputState, clarification, option, rawAnswer = option) {
  const state = structuredClone(inputState ?? {});
  state.knownContext ??= {};
  state.answersReceived = [...(state.answersReceived ?? []), { clarificationId: clarification.id, option, rawAnswer }];
  if (option === 'not_sure' || option === 'different_issue') {
    state.knownContext[`${clarification.id}.answer`] = option;
  } else {
    for (const key of clarification.setsContext) state.knownContext[key] = option;
    const narrowed = clarification.increasesCases?.[option];
    if (narrowed?.length) state.candidateCaseIds = unique(narrowed);
    const ruledOut = new Set(clarification.rulesOutCases?.[option] ?? []);
    if (ruledOut.size) state.candidateCaseIds = unique((state.candidateCaseIds ?? []).filter((id) => !ruledOut.has(id)));
  }
  state.unknownContext = unique((state.unknownContext ?? []).filter((key) => !clarification.setsContext.includes(key)));
  state.pendingClarificationId = null;
  return state;
}
