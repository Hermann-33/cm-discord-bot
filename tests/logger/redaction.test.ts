import assert from "node:assert/strict";
import test from "node:test";
import { InternalApiClient, type InternalApiClientDependencies } from "../../src/api/client";
import type { InternalApiConfig } from "../../src/config/env";
import { logger, sanitizeError } from "../../src/logger";

const selector = "123456789012345678";
const nonce = "123e4567-e89b-42d3-a456-426614174000";
const secret = Buffer.from("0123456789abcdef0123456789abcdef");
const config: InternalApiConfig = {
  origin: "https://example.test",
  clientId: "cm-discord-bot",
  keyId: "cm-discord-bot-2026-08",
  hmacSecret: secret,
  timeoutMs: 50
};

test("API errors and structured logs exclude all signed/request-sensitive material", async () => {
  let signature = "";
  const dependencies: InternalApiClientDependencies = {
    nowMs: () => 1767225600000,
    nonce: () => nonce,
    fetch: (async (_url: unknown, init?: RequestInit) => {
      signature = new Headers(init?.headers).get("x-cm-signature") ?? "";
      return new Response(JSON.stringify({
        ok: false,
        requestId: "550e8400-e29b-41d4-a716-446655440000",
        error: { code: "AUTHENTICATION_FAILED", message: "sensitive server detail" }
      }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }) as typeof fetch
  };

  let caught: unknown;
  try {
    await new InternalApiClient(config, dependencies).lookupAuraByDiscordId(selector);
  } catch (error) {
    caught = error;
  }

  assert.match(signature, /^[a-f0-9]{64}$/);

  let logged = "";
  const originalError = console.error;
  console.error = (value?: unknown) => { logged += String(value); };
  try {
    logger.error("sanitized API failure", sanitizeError(caught));
  } finally {
    console.error = originalError;
  }

  const serialized = JSON.stringify({ caught, log: logged });
  for (const forbidden of [
    secret.toString("base64"),
    signature,
    nonce,
    selector,
    `\"externalUserId\":\"${selector}\"`,
    "sensitive server detail"
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("logger collapses control whitespace and bounds error strings", () => {
  const meta = sanitizeError(new Error(`line one\nline two\t${"x".repeat(400)}`));
  const message = String(meta.errorMessage);
  assert.equal(message.includes("\n"), false);
  assert.equal(message.includes("\t"), false);
  assert.equal(message.length <= 243, true);
});
