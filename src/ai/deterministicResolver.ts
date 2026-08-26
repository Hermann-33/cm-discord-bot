import type { DeterministicSupportResolver, SupportConversationState, SupportTurnContext } from "./supportConversation";
import type { SupportRuntimePack, SupportRuntimeRecord } from "./runtimePack";
import type {
  SupportCaseScope,
  SupportTriageCase,
  SupportTriageClarification,
  SupportTriageInput,
  SupportTriageLookup,
  SupportTriagePolicy,
  TriageNextAction
} from "./supportTriage";
import { reviewFirstTurnObservability, type FirstTurnDecision, type RuntimeAliasRecord } from "./firstTurnRouter";

const unique = (values: readonly string[] = []) => [...new Set(values.filter(Boolean))];

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function recordObject(record: SupportRuntimeRecord): Record<string, unknown> {
  return record as unknown as Record<string, unknown>;
}

type CandidateCase = SupportTriageCase & { dynamic: string[] };

function runtimeCase(record: SupportRuntimeRecord): CandidateCase {
  const raw = recordObject(record);
  const scopeRaw = raw.scope && typeof raw.scope === "object" && !Array.isArray(raw.scope)
    ? raw.scope as Record<string, unknown>
    : {};
  const scope: SupportCaseScope = {
    games: stringArray(scopeRaw.games),
    vendors: stringArray(scopeRaw.vendors),
    products: stringArray(scopeRaw.products),
    variants: stringArray(scopeRaw.variants),
    accountModels: stringArray(scopeRaw.accountModels),
    accountListings: stringArray(scopeRaw.accountListings)
  };
  return {
    id: record.id,
    displayName: stringField(raw, "displayName") ?? record.id,
    family: stringField(raw, "family") ?? "support.unknown",
    scope,
    dynamic: stringArray(raw.dynamic).map((item) => typeof item === "string" ? item : "").filter(Boolean)
  };
}

function runtimeClarification(record: SupportRuntimeRecord): SupportTriageClarification {
  const raw = recordObject(record);
  return {
    id: record.id,
    question: stringField(raw, "question") ?? "Please clarify what you need help with.",
    distinguishesCases: stringArray(raw.distinguishesCases),
    distinguishesFamilies: stringArray(raw.distinguishesFamilies),
    setsContext: Array.isArray(raw.setsContext)
      ? stringArray(raw.setsContext)
      : typeof raw.setsContext === "string" ? raw.setsContext : null,
    liveLookupCanReplace: stringArray(raw.liveLookupCanReplace)
  };
}

function runtimePolicies(records: readonly SupportRuntimeRecord[]): SupportTriagePolicy[] {
  return records.map((record) => {
    const raw = recordObject(record);
    return { id: record.id, displayName: stringField(raw, "displayName") ?? stringField(raw, "name") ?? record.id };
  });
}

function runtimeLookups(runtime: SupportRuntimePack): SupportTriageLookup[] {
  const byId = new Map<string, SupportTriageLookup>();
  for (const record of runtime.dynamicLookups) {
    const raw = recordObject(record);
    const questionTypes = stringArray(raw.questionTypes);
    const operation = stringField(raw, "operation");
    byId.set(record.id, {
      id: record.id,
      purpose: [
        ...questionTypes,
        operation ? `operation:${operation}` : null,
        raw.neverInferFromHistory ? "current-state only" : null
      ].filter((item): item is string => Boolean(item)).join("; ") || null
    });
  }

  const approved = runtime.actionRouting.approvedLookups;
  if (Array.isArray(approved)) {
    for (const item of approved) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const row = item as Record<string, unknown>;
      const id = typeof row.id === "string" ? row.id : null;
      if (!id || byId.has(id)) continue;
      byId.set(id, { id, purpose: stringArray(row.useWhen).join("; ") || null });
    }
  }
  return [...byId.values()];
}

function scopeCompatible(caseRecord: CandidateCase, entityIds: readonly string[]): boolean {
  const groups: ReadonlyArray<[keyof SupportCaseScope, string]> = [
    ["games", "game."], ["vendors", "vendor."], ["products", "product."], ["variants", "variant."],
    ["accountModels", "account_model."], ["accountListings", "account_listing."]
  ];
  for (const [field, prefix] of groups) {
    const resolved = entityIds.filter((id) => id.startsWith(prefix));
    const scoped = caseRecord.scope?.[field] ?? [];
    if (resolved.length > 0 && scoped.length > 0 && !resolved.some((id) => scoped.includes(id))) return false;
  }
  return true;
}

function candidateCasesFor(
  baseline: FirstTurnDecision,
  previousState: SupportConversationState,
  cases: readonly CandidateCase[],
  maxCases: number
): CandidateCase[] {
  const ids = new Set(unique([...(previousState.candidateCaseIds ?? []), ...(baseline.observableCaseIds ?? [])]));
  const families = new Set(unique([...(previousState.candidateFamilyIds ?? []), ...(baseline.observableFamilyIds ?? [])]));
  const entities = unique([...(previousState.resolvedEntities ?? []), ...(baseline.observableEntityIds ?? [])]);

  for (const item of cases) {
    if (ids.size >= maxCases) break;
    if (families.has(item.family) && scopeCompatible(item, entities)) ids.add(item.id);
  }
  if (ids.size === 0 && entities.length > 0) {
    for (const item of cases) {
      if (ids.size >= maxCases) break;
      if (scopeCompatible(item, entities)) ids.add(item.id);
    }
  }
  return [...ids].map((id) => cases.find((item) => item.id === id)).filter((item): item is CandidateCase => Boolean(item)).slice(0, maxCases);
}

function lookupResolved(state: SupportConversationState, id: string): boolean {
  const value = state.dynamicLookupResults[id];
  if (value === undefined || value === null) return false;
  if (typeof value !== "object") return true;
  const status = String((value as Record<string, unknown>).status ?? "").toLowerCase();
  return !["requested", "pending", "unknown"].includes(status);
}

function clarificationAlreadyKnown(state: SupportConversationState, item: SupportTriageClarification): boolean {
  const fields = Array.isArray(item.setsContext) ? item.setsContext : item.setsContext ? [item.setsContext] : [];
  if (fields.length > 0 && fields.every((field) => state.knownContext[field] !== undefined)) return true;
  return (item.liveLookupCanReplace ?? []).some((id) => lookupResolved(state, id));
}

function compactCase(item: CandidateCase): SupportTriageCase {
  return { id: item.id, displayName: item.displayName, family: item.family, scope: item.scope };
}

function deterministicActionFor(
  baseline: FirstTurnDecision,
  hasContinuationCase: boolean,
  hasClarification: boolean
): TriageNextAction | undefined {
  if (hasContinuationCase) return "answer_case";
  switch (baseline.primaryDecision) {
    case "direct_static_case": return "answer_case";
    case "direct_dynamic_lookup": return "request_dynamic_lookup";
    case "direct_policy_route": return "request_policy_route";
    case "direct_attachment_route": return "request_attachment";
    case "direct_restricted_escalation": return "restricted_escalation";
    case "direct_support_operation": return "support_operation";
    case "human_escalation": return "human_escalation";
    case "multi_intent_route": return "multi_intent_route";
    default: return baseline.primaryDecision.endsWith("_clarification") && hasClarification
      ? "ask_clarification"
      : undefined;
  }
}

export class RuntimeDeterministicSupportResolver implements DeterministicSupportResolver {
  constructor(private readonly maxCases = 8, private readonly maxClarifications = 6) {}

  resolve(input: {
    customerText: string;
    state: SupportConversationState;
    runtime: SupportRuntimePack;
    pendingAnswerConsumed: boolean;
  }): SupportTurnContext {
    const aliases = input.runtime.aliases as readonly RuntimeAliasRecord[];
    const baseline = reviewFirstTurnObservability(input.customerText, aliases);
    const allCases = input.runtime.cases.map(runtimeCase);
    const allClarifications = input.runtime.clarifications.map(runtimeClarification);
    const allLookups = runtimeLookups(input.runtime);
    const allPolicies = runtimePolicies(input.runtime.policies);

    const resolvedEntities = unique([...input.state.resolvedEntities, ...baseline.observableEntityIds]);
    const baselineCandidateCaseIds = unique([...input.state.candidateCaseIds, ...baseline.observableCaseIds]);
    const baselineFamilyIds = unique([...input.state.candidateFamilyIds, ...baseline.observableFamilyIds]);
    const candidates = candidateCasesFor(baseline, input.state, allCases, this.maxCases);

    const candidateDynamicLookupIds = unique([...(baseline.lookupIds ?? []), ...(baseline.dynamicLookupIds ?? [])]);
    let candidateClarificationIds = unique([
      ...(baseline.deterministicClarificationIds ?? []),
      ...(baseline.primaryDecision.endsWith("_clarification") && baseline.clarificationId ? [baseline.clarificationId] : [])
    ]);
    if (input.pendingAnswerConsumed && candidateClarificationIds.includes("clarify.support_surface")) {
      candidateClarificationIds = [];
    }
    const continuationCaseId = input.state.continuationCaseId && allCases.some((item) => item.id === input.state.continuationCaseId)
      ? input.state.continuationCaseId
      : null;
    const candidateStaticCaseIds = continuationCaseId
      ? [continuationCaseId]
      : baseline.primaryDecision === "direct_static_case"
        ? unique(baseline.observableCaseIds)
        : [];

    const deterministicLookupIds = new Set(candidateDynamicLookupIds);
    const deterministicClarificationIdSet = new Set(candidateClarificationIds);
    const deterministicCaseIdSet = new Set(candidateStaticCaseIds);
    const hasDeterministicLookupRoute = deterministicLookupIds.size > 0;
    const hasDeterministicClarificationRoute = !hasDeterministicLookupRoute && deterministicClarificationIdSet.size > 0;
    const hasDeterministicCaseRoute = !hasDeterministicLookupRoute && !hasDeterministicClarificationRoute && deterministicCaseIdSet.size > 0;
    const supportSurfaceOnly = hasDeterministicClarificationRoute && deterministicClarificationIdSet.has("clarify.support_surface");

    const selectedCases = (supportSurfaceOnly
      ? []
      : candidates.filter((item) => !hasDeterministicCaseRoute || deterministicCaseIdSet.has(item.id)).slice(0, this.maxCases));
    const familyIds = unique([...(supportSurfaceOnly ? [] : baselineFamilyIds), ...selectedCases.map((item) => item.family)]);
    const selectedCaseIds = new Set(selectedCases.map((item) => item.id));
    const hasScopedCandidates = selectedCaseIds.size > 0 || familyIds.length > 0;

    const clarificationRows = (hasDeterministicLookupRoute || hasDeterministicCaseRoute ? [] : allClarifications)
      .filter((item) => {
        if (hasDeterministicClarificationRoute) return deterministicClarificationIdSet.has(item.id);
        const caseHit = (item.distinguishesCases ?? []).some((id) => selectedCaseIds.has(id));
        const familyHit = (item.distinguishesFamilies ?? []).some((id) => familyIds.includes(id));
        const genericFallback = item.id === "clarify.support_surface" && !hasScopedCandidates;
        if (item.id === "clarify.order_selector" && !familyIds.some((id) => id === "commerce.order" || id === "commerce.fulfillment")) return false;
        return caseHit || familyHit || genericFallback;
      })
      .filter((item) => !input.state.questionsAsked.includes(item.id))
      .filter((item) => !clarificationAlreadyKnown(input.state, item))
      .sort((a, b) => Number(a.id === "clarify.support_surface") - Number(b.id === "clarify.support_surface"))
      .slice(0, this.maxClarifications)
      .map((item) => item.id === "clarify.support_surface" && hasScopedCandidates
        ? { ...item, liveLookupCanReplace: [] }
        : item);

    const relevantLookupIds = hasDeterministicLookupRoute
      ? deterministicLookupIds
      : hasDeterministicClarificationRoute || hasDeterministicCaseRoute
        ? new Set<string>()
        : new Set(unique([
          ...selectedCases.flatMap((item) => item.dynamic),
          ...clarificationRows.flatMap((item) => item.liveLookupCanReplace ?? [])
        ]));
    const dynamicLookupRows = allLookups.filter((item) => relevantLookupIds.has(item.id));
    const deterministicDynamicLookupIds = dynamicLookupRows.filter((item) => deterministicLookupIds.has(item.id)).map((item) => item.id);
    const deterministicClarificationIds = clarificationRows.filter((item) => deterministicClarificationIdSet.has(item.id)).map((item) => item.id);
    const deterministicCaseIds = selectedCases.filter((item) => deterministicCaseIdSet.has(item.id)).map((item) => item.id);
    const deterministicPolicyIds = unique(baseline.policyIds ?? []).filter((id) => allPolicies.some((item) => item.id === id));
    const deterministicNextAction = deterministicActionFor(baseline, Boolean(continuationCaseId), clarificationRows.length > 0);

    const nextState: SupportConversationState = {
      ...input.state,
      resolvedEntities,
      candidateCaseIds: unique([...baselineCandidateCaseIds, ...selectedCases.map((item) => item.id)]),
      candidateFamilyIds: familyIds.length > 0 ? familyIds : baselineFamilyIds
    };

    const plannerState = {
      resolvedEntities,
      activeCaseId: continuationCaseId ?? (input.state.candidateCaseIds.length === 1 ? input.state.candidateCaseIds[0] : null),
      candidateCaseIds: nextState.candidateCaseIds,
      candidateFamilyIds: nextState.candidateFamilyIds,
      candidateClarificationIds,
      candidateStaticCaseIds,
      knownContext: input.state.knownContext,
      unknownContext: input.state.unknownContext,
      pendingClarificationId: input.state.pendingClarification?.id ?? null,
      pendingDiagnosticId: null,
      questionsAsked: input.state.questionsAsked,
      diagnosticsAsked: input.state.diagnosticsAsked,
      proceduresAttempted: input.state.proceduresAttempted,
      procedureOutcomes: input.state.procedureOutcomes,
      dynamicLookupResults: input.state.dynamicLookupResults,
      answersReceived: input.state.answersReceived,
      policyState: input.state.policyState,
      intents: input.state.intents
    };

    const triageInput: SupportTriageInput = {
      customerText: input.customerText,
      state: plannerState,
      allowed: {
        entityIds: resolvedEntities,
        caseIds: selectedCases.map((item) => item.id),
        deterministicNextAction,
        deterministicCaseIds,
        cases: selectedCases.map(compactCase),
        familyIds,
        clarificationIds: clarificationRows.map((item) => item.id),
        deterministicClarificationIds,
        clarifications: clarificationRows,
        dynamicLookupIds: dynamicLookupRows.map((item) => item.id),
        deterministicDynamicLookupIds,
        dynamicLookups: dynamicLookupRows,
        policyIds: allPolicies.map((item) => item.id),
        deterministicPolicyIds,
        policies: allPolicies
      },
      restricted: baseline.primaryDecision === "direct_restricted_escalation" || nextState.candidateCaseIds.includes("case.restricted.technical")
    };

    return { state: nextState, input: triageInput };
  }
}
