import assert from "node:assert/strict";
import test from "node:test";
import { createSupportConversationState } from "../../src/ai/supportConversation";
import {
  SupportConversationStateStore,
  boundSupportConversationState
} from "../../src/ai/supportStateStore";

const key = (channelId: string, userId = "200000000000000001") => ({
  guildId: "100000000000000001",
  channelId,
  userId
});

test("conversation store isolates state by exact guild/channel/customer key", () => {
  const store = new SupportConversationStateStore();
  store.set(key("300000000000000001"), createSupportConversationState({ candidateFamilyIds: ["commerce.order"] }));
  store.set(key("300000000000000002"), createSupportConversationState({ candidateFamilyIds: ["accounts.nfa"] }));

  assert.deepEqual(store.get(key("300000000000000001"))?.candidateFamilyIds, ["commerce.order"]);
  assert.deepEqual(store.get(key("300000000000000002"))?.candidateFamilyIds, ["accounts.nfa"]);
  assert.equal(store.get(key("300000000000000001", "200000000000000002")), null);
});

test("conversation store expires inactive state and restart semantics are in-memory only", () => {
  let now = 1_000;
  const store = new SupportConversationStateStore(100, 10, { nowMs: () => now });
  store.set(key("300000000000000001"), createSupportConversationState({ candidateCaseIds: ["case.order.status"] }));
  now = 1_101;
  assert.equal(store.get(key("300000000000000001")), null);

  const restarted = new SupportConversationStateStore(100, 10, { nowMs: () => now });
  assert.equal(restarted.get(key("300000000000000001")), null);
});

test("conversation store evicts the least recently touched conversation at capacity", () => {
  let now = 1_000;
  const store = new SupportConversationStateStore(10_000, 2, { nowMs: () => now });
  const first = key("300000000000000001");
  const second = key("300000000000000002");
  const third = key("300000000000000003");
  store.set(first, createSupportConversationState({ candidateFamilyIds: ["one"] }));
  now += 1;
  store.set(second, createSupportConversationState({ candidateFamilyIds: ["two"] }));
  now += 1;
  assert.ok(store.get(first));
  now += 1;
  store.set(third, createSupportConversationState({ candidateFamilyIds: ["three"] }));

  assert.ok(store.get(first));
  assert.equal(store.get(second), null);
  assert.ok(store.get(third));
});

test("bounded state caps arrays, maps, nested values and customer text", () => {
  const longText = "x".repeat(5_000);
  const state = createSupportConversationState({
    candidateCaseIds: Array.from({ length: 100 }, (_, index) => `case.test.${index}`),
    pendingLookupIds: Array.from({ length: 20 }, (_, index) => `dynamic.test.${index}`),
    knownContext: Object.fromEntries(Array.from({ length: 100 }, (_, index) => [`key${index}`, longText])),
    answersReceived: { test: longText },
    pendingClarification: {
      id: "clarify.test",
      contextKey: "test",
      answerType: "enum",
      options: Array.from({ length: 30 }, (_, index) => `option_${index}`)
    }
  });

  const bounded = boundSupportConversationState(state);
  assert.equal(bounded.candidateCaseIds.length, 32);
  assert.equal(bounded.pendingLookupIds.length, 8);
  assert.equal(Object.keys(bounded.knownContext).length, 32);
  assert.equal(String(Object.values(bounded.knownContext)[0]).length <= 500, true);
  assert.equal(String(bounded.answersReceived.test).length, 500);
  assert.equal(bounded.pendingClarification?.options?.length, 16);
});
