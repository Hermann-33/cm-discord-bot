import {
  createSupportConversationState,
  type PendingSupportClarification,
  type SupportConversationState
} from "./supportConversation";

export const AI_SUPPORT_STATE_TTL_MS = 30 * 60 * 1000;
export const AI_SUPPORT_MAX_CONVERSATIONS = 500;

const MAX_STATE_ARRAY_ITEMS = 32;
const MAX_PENDING_LOOKUPS = 8;
const MAX_CONTEXT_ENTRIES = 32;
const MAX_VALUE_ARRAY_ITEMS = 16;
const MAX_VALUE_OBJECT_ENTRIES = 16;
const MAX_VALUE_STRING_LENGTH = 500;

export type SupportConversationKey = {
  guildId: string;
  channelId: string;
  userId: string;
};

type StoredSupportConversation = {
  state: SupportConversationState;
  createdAtMs: number;
  touchedAtMs: number;
};

export type SupportConversationStateStoreDependencies = {
  nowMs: () => number;
};

const productionDependencies: SupportConversationStateStoreDependencies = {
  nowMs: Date.now
};

function keyString(key: SupportConversationKey): string {
  return `${key.guildId}:${key.channelId}:${key.userId}`;
}

function boundedValue(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return value.slice(0, MAX_VALUE_STRING_LENGTH);
  if (typeof value === "number" || typeof value === "boolean" || value === null || value === undefined) return value;
  if (depth >= 2) return "[bounded]";
  if (Array.isArray(value)) return value.slice(-MAX_VALUE_ARRAY_ITEMS).map((item) => boundedValue(item, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(-MAX_VALUE_OBJECT_ENTRIES)
        .map(([key, item]) => [key.slice(0, 128), boundedValue(item, depth + 1)])
    );
  }
  return String(value).slice(0, MAX_VALUE_STRING_LENGTH);
}

function boundedObject(source: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(source)
      .slice(-MAX_CONTEXT_ENTRIES)
      .map(([key, value]) => [key.slice(0, 128), boundedValue(value)])
  );
}

function boundedStrings(values: readonly string[], max = MAX_STATE_ARRAY_ITEMS): string[] {
  return [...new Set(values.filter(Boolean).map((value) => value.slice(0, 160)))].slice(-max);
}

function boundedPending(value: PendingSupportClarification | null): PendingSupportClarification | null {
  if (!value) return null;
  return {
    id: value.id.slice(0, 160),
    contextKey: value.contextKey.slice(0, 128),
    contextKeys: value.contextKeys ? boundedStrings(value.contextKeys, 8) : undefined,
    answerType: value.answerType,
    options: value.options ? boundedStrings(value.options, 16) : undefined
  };
}

export function boundSupportConversationState(input: SupportConversationState): SupportConversationState {
  return createSupportConversationState({
    resolvedEntities: boundedStrings(input.resolvedEntities),
    candidateCaseIds: boundedStrings(input.candidateCaseIds),
    candidateFamilyIds: boundedStrings(input.candidateFamilyIds),
    knownContext: boundedObject(input.knownContext),
    unknownContext: boundedStrings(input.unknownContext),
    pendingClarification: boundedPending(input.pendingClarification),
    pendingLookupIds: boundedStrings(input.pendingLookupIds, MAX_PENDING_LOOKUPS),
    pendingProcedureId: input.pendingProcedureId?.slice(0, 160) ?? null,
    continuationCaseId: input.continuationCaseId?.slice(0, 160) ?? null,
    questionsAsked: boundedStrings(input.questionsAsked),
    answersReceived: boundedObject(input.answersReceived),
    diagnosticsAsked: boundedStrings(input.diagnosticsAsked),
    proceduresAttempted: boundedStrings(input.proceduresAttempted),
    procedureOutcomes: boundedObject(input.procedureOutcomes),
    dynamicLookupResults: boundedObject(input.dynamicLookupResults),
    policyState: boundedObject(input.policyState),
    intents: boundedStrings(input.intents)
  });
}

export class SupportConversationStateStore {
  private readonly conversations = new Map<string, StoredSupportConversation>();

  constructor(
    private readonly ttlMs = AI_SUPPORT_STATE_TTL_MS,
    private readonly maxConversations = AI_SUPPORT_MAX_CONVERSATIONS,
    private readonly dependencies: SupportConversationStateStoreDependencies = productionDependencies
  ) {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error("AI support state TTL must be positive");
    if (!Number.isInteger(maxConversations) || maxConversations <= 0) throw new Error("AI support state capacity must be positive");
  }

  get(key: SupportConversationKey): SupportConversationState | null {
    this.sweep();
    const stored = this.conversations.get(keyString(key));
    if (!stored) return null;
    stored.touchedAtMs = this.dependencies.nowMs();
    return createSupportConversationState(stored.state);
  }

  getOrCreate(key: SupportConversationKey): SupportConversationState {
    return this.get(key) ?? createSupportConversationState();
  }

  set(key: SupportConversationKey, inputState: SupportConversationState): SupportConversationState {
    this.sweep();
    const id = keyString(key);
    const now = this.dependencies.nowMs();
    const existing = this.conversations.get(id);
    if (!existing && this.conversations.size >= this.maxConversations) this.evictOldest();

    const state = boundSupportConversationState(inputState);
    this.conversations.set(id, {
      state,
      createdAtMs: existing?.createdAtMs ?? now,
      touchedAtMs: now
    });
    return createSupportConversationState(state);
  }

  delete(key: SupportConversationKey): void {
    this.conversations.delete(keyString(key));
  }

  sweep(): void {
    const now = this.dependencies.nowMs();
    for (const [id, stored] of this.conversations) {
      if (now - stored.touchedAtMs > this.ttlMs) this.conversations.delete(id);
    }
  }

  size(): number {
    this.sweep();
    return this.conversations.size;
  }

  private evictOldest(): void {
    let oldestId: string | null = null;
    let oldestTouched = Number.POSITIVE_INFINITY;
    for (const [id, stored] of this.conversations) {
      if (stored.touchedAtMs < oldestTouched) {
        oldestTouched = stored.touchedAtMs;
        oldestId = id;
      }
    }
    if (oldestId) this.conversations.delete(oldestId);
  }
}
