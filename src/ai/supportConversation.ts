import type { SupportRuntimePack, SupportRuntimeRecord } from "./runtimePack";
import type { SupportLookupContext } from "./supportLookup";
import type { SupportTriageDecision, SupportTriageInput } from "./supportTriage";

export type PendingSupportClarification = {
  id: string;
  contextKey: string;
  contextKeys?: readonly string[];
  answerType: "boolean" | "text" | "enum" | "entity" | "selector";
  options?: readonly string[];
};

export type SupportConversationState = {
  resolvedEntities: string[];
  candidateCaseIds: string[];
  candidateFamilyIds: string[];
  knownContext: Record<string, unknown>;
  unknownContext: string[];
  pendingClarification: PendingSupportClarification | null;
  pendingLookupIds: string[];
  pendingProcedureId: string | null;
  continuationCaseId: string | null;
  questionsAsked: string[];
  answersReceived: Record<string, unknown>;
  diagnosticsAsked: string[];
  proceduresAttempted: string[];
  procedureOutcomes: Record<string, unknown>;
  dynamicLookupResults: Record<string, unknown>;
  policyState: Record<string, unknown>;
  intents: string[];
};

export function createSupportConversationState(
  initial: Partial<SupportConversationState> = {}
): SupportConversationState {
  return {
    resolvedEntities: [...(initial.resolvedEntities ?? [])],
    candidateCaseIds: [...(initial.candidateCaseIds ?? [])],
    candidateFamilyIds: [...(initial.candidateFamilyIds ?? [])],
    knownContext: { ...(initial.knownContext ?? {}) },
    unknownContext: [...(initial.unknownContext ?? [])],
    pendingClarification: initial.pendingClarification ?? null,
    pendingLookupIds: [...(initial.pendingLookupIds ?? [])],
    pendingProcedureId: initial.pendingProcedureId ?? null,
    continuationCaseId: initial.continuationCaseId ?? null,
    questionsAsked: [...(initial.questionsAsked ?? [])],
    answersReceived: { ...(initial.answersReceived ?? {}) },
    diagnosticsAsked: [...(initial.diagnosticsAsked ?? [])],
    proceduresAttempted: [...(initial.proceduresAttempted ?? [])],
    procedureOutcomes: { ...(initial.procedureOutcomes ?? {}) },
    dynamicLookupResults: { ...(initial.dynamicLookupResults ?? {}) },
    policyState: { ...(initial.policyState ?? {}) },
    intents: [...(initial.intents ?? [])]
  };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function parseBooleanAnswer(value: string): boolean | null {
  const normalized = value.trim().toLowerCase().replace(/[.!?]+$/u, "");
  if (["yes", "y", "yeah", "yep", "true"].includes(normalized)) return true;
  if (["no", "n", "nope", "nah", "false"].includes(normalized)) return false;
  return null;
}

function normalizedWords(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/gu, " ")
    .replace(/[^a-z0-9\s]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function parseEnumAnswer(value: string, options: readonly string[]): string | null {
  const normalized = normalizedWords(value);
  if (!normalized) return null;
  for (const option of options) {
    const optionWords = normalizedWords(option);
    if (normalized === optionWords || normalized.includes(optionWords) || optionWords.includes(normalized)) return option;
  }
  return null;
}

function applyClarificationContext(
  state: SupportConversationState,
  pending: PendingSupportClarification,
  answer: unknown
): void {
  const keys = pending.contextKeys?.length ? [...pending.contextKeys] : [pending.contextKey];

  if (pending.answerType === "selector") {
    for (const key of keys) state.knownContext[key] = true;
    return;
  }

  state.knownContext[pending.contextKey] = answer;
  if (typeof answer !== "string") return;

  if (pending.id === "clarify.nfa.failure_stage") {
    state.knownContext.nfaFailureStage = answer;
    if (answer === "never_worked") {
      state.knownContext.workedBefore = false;
      state.knownContext.ownerSessionConflict = false;
    } else if (answer === "worked_then_invalid") {
      state.knownContext.workedBefore = true;
      state.knownContext.ownerSessionConflict = false;
    } else if (answer === "owner_or_session_conflict") {
      state.knownContext.ownerSessionConflict = true;
    }
  }

  if (pending.id === "clarify.order.fulfillment_state") {
    state.knownContext.orderQuestionType = answer;
    if (answer !== "current_status") state.knownContext.deliveryState = answer;
  }
}

export function applyPendingClarificationAnswer(
  inputState: SupportConversationState,
  customerText: string
): { state: SupportConversationState; consumed: boolean } {
  const state = createSupportConversationState(inputState);
  const pending = state.pendingClarification;
  if (!pending) return { state, consumed: false };

  let answer: unknown = null;
  if (pending.answerType === "boolean") answer = parseBooleanAnswer(customerText);
  else if (pending.answerType === "enum") answer = parseEnumAnswer(customerText, pending.options ?? []);
  else answer = customerText.trim().slice(0, 500) || null;
  if (answer === null) return { state, consumed: false };

  applyClarificationContext(state, pending, answer);
  state.answersReceived[pending.id] = pending.answerType === "selector" ? "selector_supplied" : answer;
  const contextKeys = pending.contextKeys?.length ? pending.contextKeys : [pending.contextKey];
  state.unknownContext = state.unknownContext.filter((item) => !contextKeys.includes(item));
  if (!state.questionsAsked.includes(pending.id)) state.questionsAsked.push(pending.id);
  state.pendingClarification = null;
  return { state, consumed: true };
}

function recordObject(record: SupportRuntimeRecord): Record<string, unknown> {
  return record as unknown as Record<string, unknown>;
}

function stringField(record: SupportRuntimeRecord | undefined, key: string): string | null {
  if (!record) return null;
  const value = recordObject(record)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function ordinaryContextFromText(state: SupportConversationState, customerText: string): void {
  const text = normalizedWords(customerText);
  const resourceProcedurePending = state.pendingProcedureId === "procedure.system.reduce_resource_pressure";

  if (
    /\bgraphics\b.*\b(?:low|lowest|minimum|min)\b/u.test(text) ||
    /\b(?:low|lowest|minimum|min|lowered)\b.*\b(?:graphics|settings)\b/u.test(text) ||
    (resourceProcedurePending && /^(?:already )?(?:low|lowest|minimum|min)$/u.test(text))
  ) {
    state.knownContext.graphicsLevel = "low";
  } else if (/\bgraphics\b.*\bhigh\b/u.test(text) && !/\b(?:not|isnt|arent)\s+high\b/u.test(text)) {
    state.knownContext.graphicsLevel = "high";
  }

  if (/\b(?:background apps?|other apps?|programs?)\b.*\b(?:closed|already closed|off)\b/u.test(text)) {
    state.knownContext.backgroundAppsClosed = true;
  }
}

function procedureOutcomeFromText(state: SupportConversationState, customerText: string): "success" | "failure" | null {
  if (!state.pendingProcedureId) return null;
  const text = normalizedWords(customerText);
  const persists = /\b(?:still|same error|same issue|same crash|same problem|didnt work|did not work|doesnt work|does not work|wont open|will not open|keeps crashing|keeps closing|keeps happening)\b/u.test(text);
  const succeeded = /\b(?:worked|fixed|resolved|all good|that did it)\b/u.test(text) &&
    !persists &&
    !/\b(?:never|not|didnt|did not)\s+worked\b/u.test(text);
  if (succeeded) return "success";
  if (persists) return "failure";

  if (state.pendingProcedureId === "procedure.system.reduce_resource_pressure") {
    if (state.knownContext.graphicsLevel === "low" && /\b(?:already|still|graphics|settings|low|lowest|minimum|min)\b/u.test(text)) return "failure";
    if (state.knownContext.backgroundAppsClosed === true) return "failure";
  }
  return null;
}

function failureTransition(
  state: SupportConversationState,
  runtime: SupportRuntimePack,
  procedureId: string
): string | null {
  const activeCaseId = state.candidateCaseIds.length === 1 ? state.candidateCaseIds[0] : null;
  if (!activeCaseId) return null;
  const activeCase = runtime.cases.find((record) => record.id === activeCaseId);
  if (!activeCase) return null;
  const direct = stringField(activeCase, "onFailureCaseId");
  if (direct?.startsWith("case.")) return direct;

  const flow = recordObject(activeCase).flow;
  if (!Array.isArray(flow)) return null;
  for (const step of flow) {
    if (!step || typeof step !== "object" || Array.isArray(step)) continue;
    const row = step as Record<string, unknown>;
    if (row.procedureId !== procedureId) continue;
    if (typeof row.onFailure === "string" && row.onFailure.startsWith("case.")) return row.onFailure;
  }
  return null;
}

export type SupportContinuationResult = {
  state: SupportConversationState;
  resolvedProcedureId: string | null;
  failedProcedureId: string | null;
};

export function applyConversationContinuation(
  inputState: SupportConversationState,
  customerText: string,
  runtime: SupportRuntimePack
): SupportContinuationResult {
  const state = createSupportConversationState(inputState);
  ordinaryContextFromText(state, customerText);
  const pendingProcedureId = state.pendingProcedureId;
  const outcome = procedureOutcomeFromText(state, customerText);
  if (!pendingProcedureId || !outcome) {
    return { state, resolvedProcedureId: null, failedProcedureId: null };
  }

  state.proceduresAttempted = unique([...state.proceduresAttempted, pendingProcedureId]);
  state.procedureOutcomes[pendingProcedureId] = outcome;
  state.pendingProcedureId = null;

  if (outcome === "success") {
    state.knownContext.lastProcedureOutcome = "success";
    return { state, resolvedProcedureId: pendingProcedureId, failedProcedureId: null };
  }

  state.knownContext.lastProcedureOutcome = "failure";
  const target = failureTransition(state, runtime, pendingProcedureId);
  if (target) {
    const targetCase = runtime.cases.find((record) => record.id === target);
    state.candidateCaseIds = [target];
    const family = stringField(targetCase, "family");
    if (family) state.candidateFamilyIds = [family];
    state.continuationCaseId = target;
  }
  return { state, resolvedProcedureId: null, failedProcedureId: pendingProcedureId };
}

export type SupportTurnContext = {
  state: SupportConversationState;
  input: SupportTriageInput;
};

export interface DeterministicSupportResolver {
  resolve(input: {
    customerText: string;
    state: SupportConversationState;
    runtime: SupportRuntimePack;
    pendingAnswerConsumed: boolean;
  }): Promise<SupportTurnContext> | SupportTurnContext;
}

export type SupportTriagePlannerResult = {
  accepted: boolean;
  decision: SupportTriageDecision;
  validationErrors: readonly string[];
  fallbackUsed: boolean;
  model: string;
  requestId?: string;
};

export interface SupportTriagePlanner {
  triage(input: SupportTriageInput): Promise<SupportTriagePlannerResult>;
}

export type GroundedSupportAction = {
  kind: "case" | "clarification" | "dynamic_lookup" | "policy" | "escalation" | "other";
  canonicalIds: readonly string[];
  customerMessage: string;
};

export interface DeterministicSupportActionResolver {
  resolve(input: {
    decision: SupportTriageDecision;
    state: SupportConversationState;
    runtime: SupportRuntimePack;
    lookupContext: SupportLookupContext;
  }): Promise<{ state: SupportConversationState; action: GroundedSupportAction }> |
    { state: SupportConversationState; action: GroundedSupportAction };
}

function deterministicDecision(
  nextAction: SupportTriageDecision["nextAction"],
  values: {
    caseIds?: readonly string[];
    clarificationId?: string | null;
    dynamicLookupIds?: readonly string[];
    policyIds?: readonly string[];
  },
  reasonCode: string
): SupportTriageDecision {
  return {
    observations: {
      explicitEntities: [],
      supportSurface: null,
      knownFacts: [],
      missingFacts: []
    },
    nextAction,
    caseIds: [...(values.caseIds ?? [])],
    clarificationId: values.clarificationId ?? null,
    dynamicLookupIds: [...(values.dynamicLookupIds ?? [])],
    policyIds: [...(values.policyIds ?? [])],
    confidence: 1,
    reasonCode
  };
}

function deterministicPlannerResult(decision: SupportTriageDecision): SupportTriagePlannerResult {
  return {
    accepted: true,
    decision,
    validationErrors: [],
    fallbackUsed: false,
    model: "deterministic-continuation"
  };
}

export class SupportConversationService {
  constructor(
    private readonly runtime: SupportRuntimePack,
    private readonly resolver: DeterministicSupportResolver,
    private readonly planner: SupportTriagePlanner,
    private readonly actionResolver: DeterministicSupportActionResolver
  ) {}

  async prepareTurn(
    customerText: string,
    inputState: SupportConversationState,
    lookupContext: SupportLookupContext = {}
  ): Promise<{
    state: SupportConversationState;
    action: GroundedSupportAction;
    planner: SupportTriagePlannerResult;
  }> {
    const pending = applyPendingClarificationAnswer(inputState, customerText);
    const continuation = applyConversationContinuation(pending.state, customerText, this.runtime);

    if (continuation.resolvedProcedureId) {
      const decision = deterministicDecision("support_operation", {}, "procedure_resolved");
      return {
        state: continuation.state,
        action: {
          kind: "other",
          canonicalIds: [continuation.resolvedProcedureId],
          customerMessage: "That step resolved the issue. No further automated action is needed."
        },
        planner: deterministicPlannerResult(decision)
      };
    }

    if (pending.consumed && continuation.state.pendingLookupIds.length > 0) {
      const lookupIds = [...continuation.state.pendingLookupIds];
      const state = createSupportConversationState({ ...continuation.state, pendingLookupIds: [] });
      const decision = deterministicDecision(
        "request_dynamic_lookup",
        { dynamicLookupIds: lookupIds },
        "pending_lookup_resumed_after_clarification"
      );
      const resolved = await this.actionResolver.resolve({
        decision,
        state,
        runtime: this.runtime,
        lookupContext
      });
      return { ...resolved, planner: deterministicPlannerResult(decision) };
    }

    const context = await this.resolver.resolve({
      customerText,
      state: continuation.state,
      runtime: this.runtime,
      pendingAnswerConsumed: pending.consumed
    });
    const planner = await this.planner.triage(context.input);
    const resolved = await this.actionResolver.resolve({
      decision: planner.decision,
      state: context.state,
      runtime: this.runtime,
      lookupContext
    });
    return { ...resolved, planner };
  }
}
