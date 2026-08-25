import type { SupportRuntimePack } from "./runtimePack";
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
  else answer = customerText.trim() || null;
  if (answer === null) return { state, consumed: false };

  state.knownContext[pending.contextKey] = answer;
  state.answersReceived[pending.id] = answer;
  const contextKeys = pending.contextKeys?.length ? pending.contextKeys : [pending.contextKey];
  state.unknownContext = state.unknownContext.filter((item) => !contextKeys.includes(item));
  if (!state.questionsAsked.includes(pending.id)) state.questionsAsked.push(pending.id);
  state.pendingClarification = null;
  return { state, consumed: true };
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
    const context = await this.resolver.resolve({
      customerText,
      state: pending.state,
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
