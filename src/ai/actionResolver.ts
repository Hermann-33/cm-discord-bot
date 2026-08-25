import type {
  DeterministicSupportActionResolver,
  GroundedSupportAction,
  PendingSupportClarification,
  SupportConversationState
} from "./supportConversation";
import type { SupportLiveLookupAdapter, SupportLookupContext, SupportLookupResolution } from "./supportLookup";
import type { SupportRuntimePack, SupportRuntimeRecord } from "./runtimePack";
import type { SupportTriageDecision } from "./supportTriage";

const SAFE_AUTONOMOUS_PROCEDURES = new Set([
  "procedure.system.reduce_resource_pressure",
  "procedure.loader.install_webview_runtime",
  "procedure.loader.restart_and_retry",
  "procedure.browser.clear_state"
]);

const RESTRICTED_CASE_IDS = new Set(["case.restricted.technical"]);

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function asObject(record: SupportRuntimeRecord): Record<string, unknown> {
  return record as unknown as Record<string, unknown>;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function safeText(value: unknown, fallback = "", max = 1500): string {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/[\u0000-\u001F\u007F]/gu, " ").replace(/\s+/gu, " ").trim();
  return cleaned ? cleaned.slice(0, max) : fallback;
}

function cloneState(state: SupportConversationState): SupportConversationState {
  return {
    ...state,
    resolvedEntities: [...state.resolvedEntities],
    candidateCaseIds: [...state.candidateCaseIds],
    candidateFamilyIds: [...state.candidateFamilyIds],
    knownContext: { ...state.knownContext },
    unknownContext: [...state.unknownContext],
    pendingClarification: state.pendingClarification ? { ...state.pendingClarification } : null,
    questionsAsked: [...state.questionsAsked],
    answersReceived: { ...state.answersReceived },
    diagnosticsAsked: [...state.diagnosticsAsked],
    proceduresAttempted: [...state.proceduresAttempted],
    procedureOutcomes: { ...state.procedureOutcomes },
    dynamicLookupResults: { ...state.dynamicLookupResults },
    policyState: { ...state.policyState },
    intents: [...state.intents]
  };
}

function findRecord(records: readonly SupportRuntimeRecord[], id: string): SupportRuntimeRecord | undefined {
  return records.find((record) => record.id === id);
}

function escalation(message = "A staff member needs to continue this support request.", ids: readonly string[] = []): GroundedSupportAction {
  return { kind: "escalation", canonicalIds: ids, customerMessage: message };
}

function clarificationPending(record: SupportRuntimeRecord): PendingSupportClarification {
  const raw = asObject(record);
  const keys = stringArray(raw.setsContext);
  const rawType = safeText(raw.answerType, "text", 32);
  const answerType: PendingSupportClarification["answerType"] =
    rawType === "boolean" || rawType === "enum" || rawType === "entity" || rawType === "selector"
      ? rawType
      : "text";
  return {
    id: record.id,
    contextKey: keys[0] ?? `clarification.${record.id}`,
    contextKeys: keys,
    answerType,
    options: stringArray(raw.options)
  };
}

function applyClarification(
  state: SupportConversationState,
  record: SupportRuntimeRecord
): { state: SupportConversationState; action: GroundedSupportAction } {
  const next = cloneState(state);
  const question = safeText(asObject(record).question, "Please clarify what you need help with.", 1000);
  const pending = clarificationPending(record);
  next.pendingClarification = pending;
  if (!next.questionsAsked.includes(record.id)) next.questionsAsked.push(record.id);
  for (const key of pending.contextKeys ?? [pending.contextKey]) {
    if (next.knownContext[key] === undefined && !next.unknownContext.includes(key)) next.unknownContext.push(key);
  }
  return {
    state: next,
    action: { kind: "clarification", canonicalIds: [record.id], customerMessage: question }
  };
}

function relevantProcedures(caseRecord: SupportRuntimeRecord, runtime: SupportRuntimePack): SupportRuntimeRecord[] {
  const raw = asObject(caseRecord);
  const flow = Array.isArray(raw.flow) ? raw.flow : [];
  const ids = flow.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const procedureId = (item as Record<string, unknown>).procedureId;
    return typeof procedureId === "string" ? [procedureId] : [];
  });
  return unique(ids)
    .filter((id) => SAFE_AUTONOMOUS_PROCEDURES.has(id))
    .map((id) => findRecord(runtime.procedures, id))
    .filter((item): item is SupportRuntimeRecord => Boolean(item))
    .filter((item) => asObject(item).restricted !== true);
}

function procedureSteps(record: SupportRuntimeRecord): string[] {
  const raw = asObject(record);
  if (!Array.isArray(raw.steps)) return [];
  return raw.steps.flatMap((step) => {
    if (!step || typeof step !== "object" || Array.isArray(step)) return [];
    const action = safeText((step as Record<string, unknown>).action, "", 500);
    return action ? [action] : [];
  });
}

function authoritativeCasePolicies(caseRecord: SupportRuntimeRecord, runtime: SupportRuntimePack): string[] {
  const ids = stringArray(asObject(caseRecord).policies);
  return ids.flatMap((id) => {
    const policy = findRecord(runtime.policies, id);
    if (!policy) return [];
    const raw = asObject(policy);
    const authority = safeText(raw.authority, "", 64);
    if (!new Set(["current_authoritative", "operator_approved"]).has(authority)) return [];
    const rule = safeText(raw.rule, "", 1000);
    return rule ? [rule] : [];
  });
}

function renderCase(
  state: SupportConversationState,
  decision: SupportTriageDecision,
  runtime: SupportRuntimePack
): { state: SupportConversationState; action: GroundedSupportAction } {
  const cases = decision.caseIds
    .map((id) => findRecord(runtime.cases, id))
    .filter((item): item is SupportRuntimeRecord => Boolean(item));
  if (cases.length === 0) return { state: cloneState(state), action: escalation() };

  if (cases.some((item) => RESTRICTED_CASE_IDS.has(item.id) || safeText(asObject(item).family).startsWith("restricted"))) {
    return {
      state: cloneState(state),
      action: escalation("This request needs a staff member to continue the technical support safely.", cases.map((item) => item.id))
    };
  }

  const next = cloneState(state);
  next.candidateCaseIds = unique(cases.map((item) => item.id));
  next.candidateFamilyIds = unique(cases.map((item) => safeText(asObject(item).family)).filter(Boolean));

  const names = cases.map((item) => safeText(asObject(item).displayName, item.id, 200));
  const policyRules = unique(cases.flatMap((item) => authoritativeCasePolicies(item, runtime)));
  const procedures = unique(cases.flatMap((item) => relevantProcedures(item, runtime).map((record) => record.id)))
    .map((id) => findRecord(runtime.procedures, id))
    .filter((item): item is SupportRuntimeRecord => Boolean(item));
  const steps = unique(procedures.flatMap(procedureSteps));

  const lines = [`Support path: ${names.join(" / ")}.`];
  if (policyRules.length > 0) lines.push(...policyRules);
  if (steps.length > 0) {
    lines.push("Safe next steps:");
    steps.forEach((step, index) => lines.push(`${index + 1}. ${step}`));
  }
  if (steps.length === 0 && policyRules.length === 0) {
    lines.push("If this still needs intervention, a staff member should continue from this support path.");
  }

  return {
    state: next,
    action: { kind: "case", canonicalIds: cases.map((item) => item.id), customerMessage: lines.join("\n") }
  };
}

function lookupResolved(state: SupportConversationState, id: string): boolean {
  const result = state.dynamicLookupResults[id];
  return Boolean(result && typeof result === "object" && (result as Record<string, unknown>).status === "resolved");
}

function renderPolicy(
  state: SupportConversationState,
  decision: SupportTriageDecision,
  runtime: SupportRuntimePack
): { state: SupportConversationState; action: GroundedSupportAction } {
  const policies = decision.policyIds
    .map((id) => findRecord(runtime.policies, id))
    .filter((item): item is SupportRuntimeRecord => Boolean(item));
  if (policies.length === 0) return { state: cloneState(state), action: escalation() };

  const rules: string[] = [];
  for (const policy of policies) {
    const raw = asObject(policy);
    const authority = safeText(raw.authority, "", 64);
    if (!new Set(["current_authoritative", "operator_approved"]).has(authority)) {
      return { state: cloneState(state), action: escalation("Current policy authority is not available for this request.", [policy.id]) };
    }
    const unresolved = stringArray(raw.dynamicRequirements).filter((id) => !lookupResolved(state, id));
    if (unresolved.length > 0) {
      return {
        state: cloneState(state),
        action: escalation("Current order or policy state must be verified before this policy can be applied.", [policy.id])
      };
    }
    const rule = safeText(raw.rule, "", 1000);
    if (rule) rules.push(rule);
  }

  const next = cloneState(state);
  for (const policy of policies) next.policyState[policy.id] = { status: "presented" };
  return {
    state: next,
    action: { kind: "policy", canonicalIds: policies.map((item) => item.id), customerMessage: unique(rules).join("\n") }
  };
}

function firstClarificationForLookup(results: readonly SupportLookupResolution[], runtime: SupportRuntimePack): SupportRuntimeRecord | null {
  for (const result of results) {
    if (result.status !== "needs_clarification" || !result.clarificationId) continue;
    const clarification = findRecord(runtime.clarifications, result.clarificationId);
    if (clarification) return clarification;
  }
  return null;
}

export class RuntimeDeterministicSupportActionResolver implements DeterministicSupportActionResolver {
  constructor(private readonly lookupAdapter?: SupportLiveLookupAdapter) {}

  async resolve(input: {
    decision: SupportTriageDecision;
    state: SupportConversationState;
    runtime: SupportRuntimePack;
    lookupContext: SupportLookupContext;
  }): Promise<{ state: SupportConversationState; action: GroundedSupportAction }> {
    if (input.decision.nextAction === "ask_clarification") {
      const id = input.decision.clarificationId;
      const record = id ? findRecord(input.runtime.clarifications, id) : undefined;
      if (!record || input.state.questionsAsked.includes(record.id)) {
        return { state: cloneState(input.state), action: escalation("A staff member needs to continue because the required clarification is unavailable or already answered.") };
      }
      return applyClarification(input.state, record);
    }

    if (input.decision.nextAction === "answer_case") return renderCase(input.state, input.decision, input.runtime);
    if (input.decision.nextAction === "request_policy_route") return renderPolicy(input.state, input.decision, input.runtime);

    if (input.decision.nextAction === "request_dynamic_lookup") {
      if (!this.lookupAdapter) {
        return { state: cloneState(input.state), action: escalation("Current account or order state cannot be verified automatically right now.", input.decision.dynamicLookupIds) };
      }
      const results = await this.lookupAdapter.resolveMany({
        lookupIds: input.decision.dynamicLookupIds,
        runtime: input.runtime,
        context: input.lookupContext
      });
      const clarification = firstClarificationForLookup(results, input.runtime);
      if (clarification) return applyClarification(input.state, clarification);

      const unresolved = results.filter((result) => result.status !== "resolved");
      if (unresolved.length > 0 || results.length === 0) {
        return {
          state: cloneState(input.state),
          action: escalation("Current account or order state could not be verified automatically. A staff member needs to continue.", unresolved.map((item) => item.lookupId))
        };
      }

      const next = cloneState(input.state);
      for (const result of results) {
        next.dynamicLookupResults[result.lookupId] = { status: "resolved", data: result.safeData ?? {} };
      }
      const messages = unique(results.map((item) => safeText(item.customerMessage, "", 1000)).filter(Boolean));
      return {
        state: next,
        action: {
          kind: "dynamic_lookup",
          canonicalIds: results.map((item) => item.lookupId),
          customerMessage: messages.join("\n") || "Current support state was verified."
        }
      };
    }

    if (input.decision.nextAction === "restricted_escalation") {
      return {
        state: cloneState(input.state),
        action: escalation("This technical request needs a staff member to continue. Ordinary error details are fine, but automated support will not provide bypass or evasion instructions.")
      };
    }

    if (input.decision.nextAction === "request_attachment") {
      return {
        state: cloneState(input.state),
        action: escalation("Please provide the relevant screenshot or attachment for staff review.", ["escalation.visual_required"])
      };
    }

    return { state: cloneState(input.state), action: escalation("A staff member needs to continue this support request.") };
  }
}
