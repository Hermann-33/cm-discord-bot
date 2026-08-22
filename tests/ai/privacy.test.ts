import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeSupportText, sanitizeTriagePlannerPayload } from "../../src/ai/privacy";

test("sanitizes common customer identifiers and secrets", () => {
  const text = sanitizeSupportText(
    "email Me@Example.com order 550e8400-e29b-41d4-a716-446655440000 CM-ORDER-12345 <@123456789012345678> https://example.com/x sk-or-v1-secretsecretsecret abcdefghijklmnopqrstuvwxyz123456"
  );

  assert.equal(text.includes("Me@Example.com"), false);
  assert.equal(text.includes("550e8400-e29b-41d4-a716-446655440000"), false);
  assert.equal(text.includes("CM-ORDER-12345"), false);
  assert.equal(text.includes("123456789012345678"), false);
  assert.equal(text.includes("https://example.com/x"), false);
  assert.equal(text.includes("sk-or-v1-secretsecretsecret"), false);
  assert.equal(text.includes("abcdefghijklmnopqrstuvwxyz123456"), false);
});

test("planner sanitizer preserves canonical IDs while omitting sensitive context", () => {
  const payload = sanitizeTriagePlannerPayload({
    customerText: "my account broke, email user@example.com",
    state: {
      resolvedEntities: ["account_model.nfa", "game.rust"],
      candidateCaseIds: ["case.nfa.invalid_first_use"],
      knownContext: {
        workedBefore: false,
        orderId: "550e8400-e29b-41d4-a716-446655440000",
        nested: { email: "user@example.com" }
      }
    },
    allowed: {
      caseIds: ["case.nfa.invalid_first_use"]
    }
  });

  assert.deepEqual(payload.state.resolvedEntities, ["account_model.nfa", "game.rust"]);
  assert.deepEqual(payload.state.candidateCaseIds, ["case.nfa.invalid_first_use"]);
  assert.equal(payload.state.knownContext.workedBefore, false);
  assert.equal(payload.state.knownContext.orderId, "[sensitive context omitted]");
  assert.equal(payload.state.knownContext.nested.email, "[sensitive context omitted]");
  assert.equal(payload.customerText.includes("user@example.com"), false);
});
