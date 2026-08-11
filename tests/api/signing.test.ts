import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  buildCanonicalRequest,
  createSignedHeaders,
  signInternalApiRequest,
  type CanonicalRequestInput
} from "../../src/api/signing";

const secret = Buffer.from("0123456789abcdef0123456789abcdef", "utf8");
const baseInput: CanonicalRequestInput = {
  clientId: "terminal-example",
  keyId: "terminal-example-2026-08",
  timestamp: "1767225600000",
  nonce: "123e4567-e89b-42d3-a456-426614174000",
  method: "POST",
  pathname: "/api/internal/integrations/v1/aura/leaderboards",
  rawBody: Buffer.from('{"limit":10}', "utf8")
};

const expectedSignature = "d1e309d347d2da9f8e1e1e41e66e114a8ab34a6449586f66b0a1fe0a86264de8";

test("matches the authoritative eight-line signing vector", () => {
  const canonical = buildCanonicalRequest(baseInput);
  assert.equal(
    canonical,
    "cm-integrations-v1\nterminal-example\nterminal-example-2026-08\n1767225600000\n123e4567-e89b-42d3-a456-426614174000\nPOST\n/api/internal/integrations/v1/aura/leaderboards\nca502dec04523cdc33afece69a9b600d5b9bd022d453791cc693b6b372f808ad"
  );
  assert.equal(canonical.endsWith("\n"), false);
  assert.equal(signInternalApiRequest(secret, baseInput), expectedSignature);
});

for (const [label, mutation] of [
  ["path", { pathname: "/api/internal/integrations/v1/aura/lookup" }],
  ["method", { method: "GET" }],
  ["body", { rawBody: Buffer.from('{"limit":9}', "utf8") }],
  ["timestamp", { timestamp: "1767225600001" }],
  ["nonce", { nonce: "123e4567-e89b-42d3-a456-426614174001" }],
  ["client identity", { clientId: "discord-bot" }],
  ["key identity", { keyId: "terminal-example-2026-09" }]
] as const) {
  test(`${label} change invalidates the signature`, () => {
    assert.notEqual(
      signInternalApiRequest(secret, { ...baseInput, ...mutation }),
      expectedSignature
    );
  });
}

test("creates exactly the documented authentication headers", () => {
  const headers = createSignedHeaders(secret, baseInput);
  assert.deepEqual(headers, {
    "Content-Type": "application/json",
    "X-CM-Client-Id": "terminal-example",
    "X-CM-Key-Id": "terminal-example-2026-08",
    "X-CM-Timestamp": "1767225600000",
    "X-CM-Nonce": "123e4567-e89b-42d3-a456-426614174000",
    "X-CM-Signature": expectedSignature
  });
});

test("Node generates unique canonical lowercase UUIDv4 nonces", () => {
  const nonces = Array.from({ length: 32 }, () => randomUUID());
  assert.equal(new Set(nonces).size, nonces.length);
  for (const nonce of nonces) {
    assert.match(
      nonce,
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
    );
  }
});
