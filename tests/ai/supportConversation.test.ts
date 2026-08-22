import assert from "node:assert/strict";
import test from "node:test";
import {
  applyPendingClarificationAnswer,
  createSupportConversationState
} from "../../src/ai/supportConversation";

test("short answer is consumed against the pending clarification", () => {
  const state = createSupportConversationState({
    unknownContext: ["workedBefore"],
    pendingClarification: {
      id: "clarify.nfa.worked_before",
      contextKey: "workedBefore",
      answerType: "boolean"
    }
  });

  const result = applyPendingClarificationAnswer(state, "no");
  assert.equal(result.consumed, true);
  assert.equal(result.state.knownContext.workedBefore, false);
  assert.equal(result.state.answersReceived["clarify.nfa.worked_before"], false);
  assert.deepEqual(result.state.unknownContext, []);
  assert.equal(result.state.pendingClarification, null);
});

test("unrecognized short answer leaves pending clarification intact", () => {
  const state = createSupportConversationState({
    pendingClarification: {
      id: "clarify.nfa.worked_before",
      contextKey: "workedBefore",
      answerType: "boolean"
    }
  });
  const result = applyPendingClarificationAnswer(state, "maybe later");
  assert.equal(result.consumed, false);
  assert.notEqual(result.state.pendingClarification, null);
});
