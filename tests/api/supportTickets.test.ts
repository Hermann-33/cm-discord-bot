import assert from "node:assert/strict";
import test from "node:test";
import { InternalApiClient, INTERNAL_API_PATHS, type InternalApiClientDependencies } from "../../src/api/client";
import { InternalApiClientError } from "../../src/api/errors";
import type { InternalApiConfig } from "../../src/config/env";

const REQUEST_ID = "550e8400-e29b-41d4-a716-446655440000";
const CHANNEL_ID = "1545695443160137789";
const CREATOR_ID = "123456789012345682";
const ADMIN_ID = "123456789012345681";
const IDEMPOTENCY_KEY = "11111111-1111-4111-8111-111111111111";

const config: InternalApiConfig = {
  origin: "https://example.test",
  clientId: "cm-discord-bot",
  keyId: "cm-discord-bot-2026-09",
  hmacSecret: Buffer.from("0123456789abcdef0123456789abcdef"),
  timeoutMs: 50
};

function success(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, requestId: REQUEST_ID, data }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

function failure(code: string, status: number): Response {
  return new Response(JSON.stringify({
    ok: false,
    requestId: REQUEST_ID,
    error: { code, message: "safe generic message" }
  }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function deps(fetchImpl: typeof fetch): InternalApiClientDependencies {
  return {
    fetch: fetchImpl,
    nowMs: () => 1788825600000,
    nonce: () => "123e4567-e89b-42d3-a456-426614174000"
  };
}

const verified = {
  channelId: CHANNEL_ID,
  creatorDiscordId: CREATOR_ID,
  state: "verified",
  verifiedAt: "2026-09-08T00:00:00.000Z",
  verifiedUntil: "2026-09-08T08:00:00.000Z",
  overrideAdminId: null,
  overrideAt: null,
  createdAt: "2026-09-08T00:00:00.000Z",
  updatedAt: "2026-09-08T00:00:00.000Z"
};

test("support ticket recovery read uses the exact closed endpoint and DTO", async () => {
  let body = "";
  const fetchMock = (async (url: unknown, init?: RequestInit) => {
    assert.equal(String(url), `https://example.test${INTERNAL_API_PATHS.supportTicketAccessRead}`);
    body = String(init?.body);
    return success({ ticketAccess: verified, accessGranted: true });
  }) as typeof fetch;

  const client = new InternalApiClient(config, deps(fetchMock));
  const result = await client.readSupportTicketAccess(CHANNEL_ID);

  assert.deepEqual(JSON.parse(body), { channelId: CHANNEL_ID });
  assert.equal(result.ticketAccess?.state, "verified");
  assert.equal(result.accessGranted, true);
});

test("support ticket verification sends only channel and creator and accepts a renewed lease", async () => {
  let body = "";
  const fetchMock = (async (url: unknown, init?: RequestInit) => {
    assert.equal(String(url), `https://example.test${INTERNAL_API_PATHS.supportTicketVerify}`);
    body = String(init?.body);
    return success({
      verification: {
        linked: true,
        accessGranted: true,
        ticketAccess: verified
      }
    });
  }) as typeof fetch;

  const client = new InternalApiClient(config, deps(fetchMock));
  const result = await client.verifySupportTicketAccess(CHANNEL_ID, CREATOR_ID);

  assert.deepEqual(JSON.parse(body), {
    channelId: CHANNEL_ID,
    creatorDiscordId: CREATOR_ID
  });
  assert.equal(result.linked, true);
  assert.equal(result.ticketAccess.verifiedUntil, "2026-09-08T08:00:00.000Z");
});

test("ticket override uses request-bound idempotency and returns only safe override data", async () => {
  let body = "";
  const fetchMock = (async (url: unknown, init?: RequestInit) => {
    assert.equal(String(url), `https://example.test${INTERNAL_API_PATHS.supportTicketOverride}`);
    body = String(init?.body);
    return success({
      override: {
        ticketAccess: {
          ...verified,
          state: "admin_override",
          verifiedAt: null,
          verifiedUntil: null,
          overrideAdminId: ADMIN_ID,
          overrideAt: "2026-09-08T01:00:00.000Z",
          updatedAt: "2026-09-08T01:00:00.000Z"
        },
        idempotentReplay: false
      }
    });
  }) as typeof fetch;

  const client = new InternalApiClient(config, deps(fetchMock));
  const result = await client.overrideSupportTicketAccess({
    channelId: CHANNEL_ID,
    creatorDiscordId: CREATOR_ID,
    adminDiscordId: ADMIN_ID,
    reason: "Manual support ticket access override.",
    idempotencyKey: IDEMPOTENCY_KEY
  });

  assert.deepEqual(JSON.parse(body), {
    channelId: CHANNEL_ID,
    creatorDiscordId: CREATOR_ID,
    adminDiscordId: ADMIN_ID,
    reason: "Manual support ticket access override.",
    idempotencyKey: IDEMPOTENCY_KEY
  });
  assert.equal(result.ticketAccess.state, "admin_override");
  assert.equal(result.idempotentReplay, false);
});

test("support ticket DTO rejects unexpected stored audit fields", async () => {
  const fetchMock = (async () => success({
    ticketAccess: {
      ...verified,
      overrideReason: "must not escape"
    },
    accessGranted: true
  })) as typeof fetch;

  const client = new InternalApiClient(config, deps(fetchMock));
  await assert.rejects(
    () => client.readSupportTicketAccess(CHANNEL_ID),
    (error) => error instanceof InternalApiClientError && error.code === "INVALID_RESPONSE"
  );
});

test("ticket creator mismatch is mapped only with HTTP 409", async () => {
  const fetchMock = (async () => failure("TICKET_CREATOR_MISMATCH", 409)) as typeof fetch;
  const client = new InternalApiClient(config, deps(fetchMock));

  await assert.rejects(
    () => client.verifySupportTicketAccess(CHANNEL_ID, CREATOR_ID),
    (error) => error instanceof InternalApiClientError &&
      error.code === "TICKET_CREATOR_MISMATCH" &&
      error.status === 409
  );
});
