import { z } from "zod";

export const OPENROUTER_DEFAULT_MODEL = "google/gemma-4-26b-a4b-it:free";
export const OPENROUTER_DEFAULT_MAX_TOKENS = 400;
export const OPENROUTER_DEFAULT_TIMEOUT_MS = 20_000;

export const TRIAGE_NEXT_ACTIONS = [
  "answer_case",
  "ask_clarification",
  "request_dynamic_lookup",
  "request_policy_route",
  "request_attachment",
  "restricted_escalation",
  "support_operation",
  "human_escalation",
  "multi_intent_route"
] as const;

export type TriageNextAction = (typeof TRIAGE_NEXT_ACTIONS)[number];

export type SupportCaseScope = {
  games?: readonly string[];
  vendors?: readonly string[];
  products?: readonly string[];
  variants?: readonly string[];
  accountModels?: readonly string[];
  accountListings?: readonly string[];
};

export type SupportTriageCase = {
  id: string;
  displayName: string;
  family: string;
  scope?: SupportCaseScope;
};

export type SupportTriageClarification = {
  id: string;
  question: string;
  distinguishesCases?: readonly string[];
  distinguishesFamilies?: readonly string[];
  setsContext?: string | readonly string[] | null;
  liveLookupCanReplace?: readonly string[];
};

export type SupportTriageLookup = {
  id: string;
  purpose?: string | null;
};

export type SupportTriagePolicy = {
  id: string;
  displayName?: string;
};

export type SupportTriageState = {
  resolvedEntities?: readonly string[];
  activeCaseId?: string | null;
  candidateCaseIds?: readonly string[];
  candidateFamilyIds?: readonly string[];
  candidateClarificationIds?: readonly string[];
  candidateStaticCaseIds?: readonly string[];
  knownContext?: Record<string, unknown>;
  unknownContext?: readonly string[];
  pendingClarificationId?: string | null;
  pendingDiagnosticId?: string | null;
  questionsAsked?: readonly string[];
  diagnosticsAsked?: readonly string[];
  proceduresAttempted?: readonly string[];
  procedureOutcomes?: Record<string, unknown>;
  dynamicLookupResults?: Record<string, unknown>;
  answersReceived?: Record<string, unknown>;
  policyState?: Record<string, unknown>;
  intents?: readonly string[];
};

export type SupportTriageInput = {
  customerText: string;
  state: SupportTriageState;
  allowed: {
    entityIds: readonly string[];
    caseIds: readonly string[];
    deterministicNextAction?: TriageNextAction;
    deterministicCaseIds?: readonly string[];
    cases: readonly SupportTriageCase[];
    familyIds: readonly string[];
    clarificationIds: readonly string[];
    deterministicClarificationIds?: readonly string[];
    clarifications: readonly SupportTriageClarification[];
    dynamicLookupIds: readonly string[];
    deterministicDynamicLookupIds?: readonly string[];
    dynamicLookups: readonly SupportTriageLookup[];
    policyIds: readonly string[];
    deterministicPolicyIds?: readonly string[];
    policies: readonly SupportTriagePolicy[];
  };
  restricted: boolean;
};

const observationsSchema = z.object({
  explicitEntities: z.array(z.string()),
  supportSurface: z.string().nullable(),
  knownFacts: z.array(z.string()),
  missingFacts: z.array(z.string())
}).strict();

export const triageDecisionSchema = z.object({
  observations: observationsSchema,
  nextAction: z.enum(TRIAGE_NEXT_ACTIONS),
  caseIds: z.array(z.string()),
  clarificationId: z.string().nullable(),
  dynamicLookupIds: z.array(z.string()),
  policyIds: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  reasonCode: z.string().min(1)
}).strict();

export type SupportTriageDecision = z.infer<typeof triageDecisionSchema>;

export const TRIAGE_DECISION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "observations",
    "nextAction",
    "caseIds",
    "clarificationId",
    "dynamicLookupIds",
    "policyIds",
    "confidence",
    "reasonCode"
  ],
  properties: {
    observations: {
      type: "object",
      additionalProperties: false,
      required: ["explicitEntities", "supportSurface", "knownFacts", "missingFacts"],
      properties: {
        explicitEntities: { type: "array", items: { type: "string" }, uniqueItems: true },
        supportSurface: { type: ["string", "null"] },
        knownFacts: { type: "array", items: { type: "string" }, uniqueItems: true },
        missingFacts: { type: "array", items: { type: "string" }, uniqueItems: true }
      }
    },
    nextAction: { type: "string", enum: [...TRIAGE_NEXT_ACTIONS] },
    caseIds: { type: "array", items: { type: "string" }, uniqueItems: true },
    clarificationId: { type: ["string", "null"] },
    dynamicLookupIds: { type: "array", items: { type: "string" }, uniqueItems: true },
    policyIds: { type: "array", items: { type: "string" }, uniqueItems: true },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    reasonCode: { type: "string", minLength: 1 }
  }
} as const;

type JsonSchema = Record<string, unknown>;

function deterministicSubset(values: readonly string[] | undefined, allowed: readonly string[]): string[] {
  const allowedSet = new Set(allowed);
  return [...new Set(values ?? [])].filter((id) => allowedSet.has(id));
}

function allowedArraySchema(ids: readonly string[], required = false): JsonSchema {
  const values = unique(ids);
  if (values.length === 0) return { type: "array", maxItems: 0, items: { type: "string" } };
  return {
    type: "array",
    ...(required ? { minItems: 1 } : {}),
    items: { type: "string", enum: values }
  };
}

function allowedNullableIdSchema(ids: readonly string[], required = false): JsonSchema {
  const values = unique(ids);
  if (values.length === 0) return { type: "null" };
  if (required) return { type: "string", enum: values };
  return { type: ["string", "null"], enum: [...values, null] };
}

function constrainedBaseSchema(input: SupportTriageInput): JsonSchema {
  return {
    ...TRIAGE_DECISION_JSON_SCHEMA,
    properties: {
      ...TRIAGE_DECISION_JSON_SCHEMA.properties,
      observations: {
        ...TRIAGE_DECISION_JSON_SCHEMA.properties.observations,
        properties: {
          ...TRIAGE_DECISION_JSON_SCHEMA.properties.observations.properties,
          explicitEntities: allowedArraySchema(input.allowed.entityIds)
        }
      },
      caseIds: allowedArraySchema(input.allowed.caseIds),
      clarificationId: allowedNullableIdSchema(input.allowed.clarificationIds),
      dynamicLookupIds: allowedArraySchema(input.allowed.dynamicLookupIds),
      policyIds: allowedArraySchema(input.allowed.policyIds)
    }
  };
}

function deterministicNextAction(input: SupportTriageInput): TriageNextAction | undefined {
  if (input.restricted) return "restricted_escalation";
  if (input.allowed.deterministicNextAction) return input.allowed.deterministicNextAction;
  if (deterministicSubset(input.allowed.deterministicDynamicLookupIds, input.allowed.dynamicLookupIds).length > 0) return "request_dynamic_lookup";
  if (deterministicSubset(input.allowed.deterministicClarificationIds, input.allowed.clarificationIds).length > 0) return "ask_clarification";
  if (deterministicSubset(input.allowed.deterministicCaseIds, input.allowed.caseIds).length > 0) return "answer_case";
  return undefined;
}

export function buildSupportTriageJsonSchema(input: SupportTriageInput): JsonSchema {
  const base = constrainedBaseSchema(input);
  const nextAction = deterministicNextAction(input);
  const lookupIds = deterministicSubset(input.allowed.deterministicDynamicLookupIds, input.allowed.dynamicLookupIds);
  const clarificationIds = deterministicSubset(input.allowed.deterministicClarificationIds, input.allowed.clarificationIds);
  const caseIds = deterministicSubset(input.allowed.deterministicCaseIds, input.allowed.caseIds);
  const policyIds = deterministicSubset(input.allowed.deterministicPolicyIds, input.allowed.policyIds);
  if (!nextAction) return base;

  const emptyIds = allowedArraySchema([]);
  const properties = {
    ...(base.properties as Record<string, unknown>),
    nextAction: { type: "string", enum: [nextAction] },
    caseIds: emptyIds,
    clarificationId: { type: "null" },
    dynamicLookupIds: emptyIds,
    policyIds: emptyIds
  };

  if (nextAction === "request_dynamic_lookup") {
    return {
      ...base,
      properties: {
        ...properties,
        dynamicLookupIds: allowedArraySchema(lookupIds.length > 0 ? lookupIds : input.allowed.dynamicLookupIds, true)
      }
    };
  }

  if (nextAction === "ask_clarification") {
    return {
      ...base,
      properties: {
        ...properties,
        clarificationId: allowedNullableIdSchema(
          clarificationIds.length > 0 ? clarificationIds : input.allowed.clarificationIds,
          true
        )
      }
    };
  }

  if (nextAction === "answer_case") {
    return {
      ...base,
      properties: {
        ...properties,
        caseIds: allowedArraySchema(caseIds.length > 0 ? caseIds : input.allowed.caseIds, true)
      }
    };
  }

  if (nextAction === "request_policy_route") {
    return {
      ...base,
      properties: {
        ...properties,
        policyIds: allowedArraySchema(policyIds, policyIds.length > 0)
      }
    };
  }

  return { ...base, properties };
}

const SCOPE_PREFIXES: ReadonlyArray<[keyof SupportCaseScope, string]> = [
  ["games", "game."],
  ["vendors", "vendor."],
  ["products", "product."],
  ["variants", "variant."],
  ["accountModels", "account_model."],
  ["accountListings", "account_listing."]
];

function unique(values: readonly string[] | undefined): string[] {
  return [...new Set(values ?? [])];
}

function scopeConflicts(caseRecord: SupportTriageCase | undefined, resolvedEntities: readonly string[]): boolean {
  if (!caseRecord?.scope) return false;
  const resolved = new Set(resolvedEntities);
  for (const [field, prefix] of SCOPE_PREFIXES) {
    const scoped = caseRecord.scope[field] ?? [];
    if (scoped.length === 0) continue;
    const resolvedOfKind = [...resolved].filter((id) => id.startsWith(prefix));
    if (resolvedOfKind.length > 0 && !resolvedOfKind.some((id) => scoped.includes(id))) return true;
  }
  return false;
}

function lookupResolved(state: SupportTriageState, id: string): boolean {
  const value = state.dynamicLookupResults?.[id];
  if (value === undefined || value === null) return false;
  if (typeof value !== "object") return true;
  const status = String((value as Record<string, unknown>).status ?? "").toLowerCase();
  return !["requested", "pending", "unknown"].includes(status);
}

function clarificationAlreadyKnown(state: SupportTriageState, item: SupportTriageClarification | undefined): boolean {
  if (!item) return false;
  const fields = Array.isArray(item.setsContext) ? item.setsContext : item.setsContext ? [item.setsContext] : [];
  if (fields.length > 0 && fields.every((field) => state.knownContext?.[field] !== undefined)) return true;
  return (item.liveLookupCanReplace ?? []).some((id) => lookupResolved(state, id));
}

export type TriageValidationResult = { valid: boolean; errors: readonly string[] };

export function validateSupportTriageDecision(
  decision: SupportTriageDecision,
  input: SupportTriageInput,
  directCaseConfidence = 0.8
): TriageValidationResult {
  const errors: string[] = [];
  const allowedCases = new Set(input.allowed.caseIds);
  const deterministicCases = new Set(input.allowed.deterministicCaseIds ?? []);
  const allowedClarifications = new Set(input.allowed.clarificationIds);
  const deterministicClarifications = new Set(input.allowed.deterministicClarificationIds ?? []);
  const allowedLookups = new Set(input.allowed.dynamicLookupIds);
  const deterministicLookups = new Set(input.allowed.deterministicDynamicLookupIds ?? []);
  const allowedPolicies = new Set(input.allowed.policyIds);
  const deterministicPolicies = new Set(input.allowed.deterministicPolicyIds ?? []);
  const allowedEntities = new Set(input.allowed.entityIds);
  const cases = new Map(input.allowed.cases.map((item) => [item.id, item] as const));
  const clarifications = new Map(input.allowed.clarifications.map((item) => [item.id, item] as const));

  for (const id of decision.caseIds) if (!allowedCases.has(id)) errors.push(`unknown_case:${id}`);
  for (const id of decision.dynamicLookupIds) if (!allowedLookups.has(id)) errors.push(`unknown_lookup:${id}`);
  for (const id of decision.policyIds) if (!allowedPolicies.has(id)) errors.push(`unknown_policy:${id}`);
  if (decision.clarificationId && !allowedClarifications.has(decision.clarificationId)) errors.push(`unknown_clarification:${decision.clarificationId}`);
  for (const id of decision.observations.explicitEntities) if (!allowedEntities.has(id)) errors.push(`ungrounded_observation_entity:${id}`);

  const requiredNextAction = deterministicNextAction(input);
  if (requiredNextAction && decision.nextAction !== requiredNextAction) {
    errors.push("deterministic_next_action_mismatch");
  }

  if (deterministicLookups.size > 0 && (
    decision.nextAction !== "request_dynamic_lookup" ||
    decision.dynamicLookupIds.length === 0 ||
    decision.dynamicLookupIds.some((id) => !deterministicLookups.has(id))
  )) errors.push("deterministic_lookup_route_mismatch");

  if (deterministicClarifications.size > 0 && (
    decision.nextAction !== "ask_clarification" ||
    !decision.clarificationId ||
    !deterministicClarifications.has(decision.clarificationId)
  )) errors.push("deterministic_clarification_route_mismatch");

  if (deterministicCases.size > 0 && (
    decision.nextAction !== "answer_case" ||
    decision.caseIds.length === 0 ||
    !decision.caseIds.some((id) => deterministicCases.has(id))
  )) errors.push("deterministic_case_route_mismatch");

  if (requiredNextAction === "request_policy_route" && (
    decision.policyIds.some((id) => !deterministicPolicies.has(id)) ||
    (deterministicPolicies.size > 0 && [...deterministicPolicies].some((id) => !decision.policyIds.includes(id)))
  )) errors.push("deterministic_policy_route_mismatch");

  const hasCaseIds = decision.caseIds.length > 0;
  const hasClarification = decision.clarificationId !== null;
  const hasLookupIds = decision.dynamicLookupIds.length > 0;
  const hasPolicyIds = decision.policyIds.length > 0;
  if (decision.nextAction === "answer_case" && (hasClarification || hasLookupIds || hasPolicyIds)) errors.push("answer_case_irrelevant_ids");
  if (decision.nextAction === "ask_clarification" && (hasCaseIds || hasLookupIds || hasPolicyIds)) errors.push("clarification_irrelevant_ids");
  if (decision.nextAction === "request_dynamic_lookup" && (hasCaseIds || hasClarification || hasPolicyIds)) errors.push("lookup_irrelevant_ids");
  if (decision.nextAction === "request_policy_route" && (hasCaseIds || hasClarification || hasLookupIds)) errors.push("policy_irrelevant_ids");
  if (["request_attachment", "restricted_escalation", "support_operation", "human_escalation", "multi_intent_route"].includes(decision.nextAction) &&
    (hasCaseIds || hasClarification || hasLookupIds || hasPolicyIds)) errors.push("control_action_irrelevant_ids");

  if (input.restricted && decision.nextAction !== "restricted_escalation") errors.push("restricted_route_mismatch");
  if (input.restricted && decision.nextAction === "answer_case") errors.push("restricted_autonomous_answer");
  if (decision.nextAction === "answer_case" && decision.caseIds.length === 0) errors.push("answer_without_case");
  if (decision.nextAction === "answer_case" && decision.confidence < directCaseConfidence) errors.push("low_confidence_direct_case");
  if (decision.nextAction === "ask_clarification" && !decision.clarificationId) errors.push("clarification_without_id");
  if (decision.nextAction === "request_dynamic_lookup" && decision.dynamicLookupIds.length === 0) errors.push("lookup_without_id");
  if (decision.nextAction === "request_policy_route" && decision.policyIds.length === 0 && requiredNextAction !== "request_policy_route") errors.push("policy_route_without_id");

  const asked = new Set(input.state.questionsAsked ?? []);
  if (decision.clarificationId && asked.has(decision.clarificationId)) errors.push("repeated_clarification");
  if (decision.clarificationId && clarificationAlreadyKnown(input.state, clarifications.get(decision.clarificationId))) errors.push("clarification_answer_already_known");

  const resolvedEntities = unique(input.state.resolvedEntities);
  for (const id of decision.caseIds) if (scopeConflicts(cases.get(id), resolvedEntities)) errors.push(`scope_conflict:${id}`);

  return { valid: errors.length === 0, errors: unique(errors) };
}

function fallbackObservations(): SupportTriageDecision["observations"] {
  return { explicitEntities: [], supportSurface: null, knownFacts: [], missingFacts: [] };
}

export function chooseSupportTriageFallback(input: SupportTriageInput): SupportTriageDecision {
  const nextAction = deterministicNextAction(input);
  const deterministicLookups = deterministicSubset(
    input.allowed.deterministicDynamicLookupIds,
    input.allowed.dynamicLookupIds
  );
  if (nextAction === "request_dynamic_lookup" && deterministicLookups.length > 0) {
    return {
      observations: fallbackObservations(), nextAction: "request_dynamic_lookup", caseIds: [],
      clarificationId: null, dynamicLookupIds: deterministicLookups, policyIds: [], confidence: 1,
      reasonCode: "deterministic_lookup_route"
    };
  }

  const deterministicClarification = deterministicSubset(
    input.allowed.deterministicClarificationIds,
    input.allowed.clarificationIds
  )[0];
  if (nextAction === "ask_clarification" && deterministicClarification) {
    return {
      observations: fallbackObservations(), nextAction: "ask_clarification", caseIds: [],
      clarificationId: deterministicClarification, dynamicLookupIds: [], policyIds: [], confidence: 1,
      reasonCode: "deterministic_clarification_route"
    };
  }

  const deterministicCases = deterministicSubset(input.allowed.deterministicCaseIds, input.allowed.caseIds);
  if (nextAction === "answer_case" && deterministicCases.length > 0) {
    return {
      observations: fallbackObservations(), nextAction: "answer_case", caseIds: deterministicCases,
      clarificationId: null, dynamicLookupIds: [], policyIds: [], confidence: 1,
      reasonCode: "deterministic_case_route"
    };
  }

  if (nextAction === "request_policy_route" || [
    "request_attachment", "restricted_escalation", "support_operation", "human_escalation", "multi_intent_route"
  ].includes(nextAction ?? "")) {
    const policyIds = deterministicSubset(input.allowed.deterministicPolicyIds, input.allowed.policyIds);
    return {
      observations: fallbackObservations(), nextAction: nextAction as TriageNextAction, caseIds: [], clarificationId: null,
      dynamicLookupIds: [], policyIds: nextAction === "request_policy_route" ? policyIds : [], confidence: 1,
      reasonCode: `deterministic_${nextAction}`
    };
  }

  const activeCaseId = input.state.activeCaseId;
  if (!input.restricted && activeCaseId && input.allowed.caseIds.includes(activeCaseId)) {
    return {
      observations: fallbackObservations(), nextAction: "answer_case", caseIds: [activeCaseId],
      clarificationId: null, dynamicLookupIds: [], policyIds: [], confidence: 1,
      reasonCode: "existing_active_case"
    };
  }

  const asked = new Set(input.state.questionsAsked ?? []);
  const clarification = input.allowed.clarifications.find((item) => !asked.has(item.id) && !clarificationAlreadyKnown(input.state, item));
  if (clarification) {
    return {
      observations: fallbackObservations(), nextAction: "ask_clarification", caseIds: [],
      clarificationId: clarification.id, dynamicLookupIds: [], policyIds: [], confidence: 1,
      reasonCode: "safe_canonical_clarification"
    };
  }

  return {
    observations: fallbackObservations(), nextAction: "human_escalation", caseIds: [], clarificationId: null,
    dynamicLookupIds: [], policyIds: [], confidence: 1, reasonCode: "no_safe_machine_action"
  };
}
