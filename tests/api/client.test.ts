import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { InternalApiClient, INTERNAL_API_PATHS, type InternalApiClientDependencies } from "../../src/api/client";
import { InternalApiClientError } from "../../src/api/errors";
import type { InternalApiConfig } from "../../src/config/env";

const REQUEST_ID = "550e8400-e29b-41d4-a716-446655440000";
const DISCORD_ID = "123456789012345678";
const config: InternalApiConfig = {
  origin: "https://example.test",
  clientId: "cm-discord-bot",
  keyId: "cm-discord-bot-2026-08",
  hmacSecret: Buffer.from("0123456789abcdef0123456789abcdef"),
  timeoutMs: 50
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function success(data: unknown): Response {
  return jsonResponse({ ok: true, requestId: REQUEST_ID, data });
}

function failure(code: string, status: number, message = "The request could not be processed.") {
  return jsonResponse({
    ok: false,
    requestId: REQUEST_ID,
    error: { code, message }
  }, status);
}

function dependencies(
  fetchImpl: typeof fetch,
  timestamps = [1767225600000],
  nonces = ["123e4567-e89b-42d3-a456-426614174000"]
): InternalApiClientDependencies {
  let timestampIndex = 0;
  let nonceIndex = 0;
  return {
    fetch: fetchImpl,
    nowMs: () => timestamps[Math.min(timestampIndex++, timestamps.length - 1)]!,
    nonce: () => nonces[Math.min(nonceIndex++, nonces.length - 1)]!
  };
}

test("parses leaderboard success and sends only the exact documented request", async () => {
  let capturedUrl = "";
  let capturedBody = "";
  let capturedHeaders = new Headers();
  const fetchMock = (async (url: unknown, init?: RequestInit) => {
    capturedUrl = String(url);
    capturedBody = String(init?.body);
    capturedHeaders = new Headers(init?.headers);
    return success({
      leaderboards: [
        { leaderboardType: "lifetime", rank: 1, displayName: "Example", aura: 250 }
      ]
    });
  }) as typeof fetch;

  const client = new InternalApiClient(config, dependencies(fetchMock));
  const rows = await client.fetchLeaderboards();

  assert.equal(capturedUrl, `https://example.test${INTERNAL_API_PATHS.leaderboards}`);
  assert.equal(capturedBody, '{"limit":10}');
  assert.equal(capturedHeaders.get("x-cm-client-id"), "cm-discord-bot");
  assert.equal(capturedHeaders.get("x-cm-key-id"), "cm-discord-bot-2026-08");
  assert.equal(rows[0]?.displayName, "Example");
});

test("parses Aura success with the privacy-aware generic displayName", async () => {
  let capturedBody = "";
  const fetchMock = (async (url: unknown, init?: RequestInit) => {
    assert.equal(String(url), `https://example.test${INTERNAL_API_PATHS.auraLookup}`);
    capturedBody = String(init?.body);
    return success({
      aura: {
        displayName: "Anonymous",
        availableAura: 123,
        lifetimeAura: 456,
        updatedAt: "2026-08-10T00:00:00.000Z"
      }
    });
  }) as typeof fetch;

  const client = new InternalApiClient(config, dependencies(fetchMock));
  const aura = await client.lookupAuraByDiscordId(DISCORD_ID);
  assert.equal(aura?.displayName, "Anonymous");
  assert.deepEqual(JSON.parse(capturedBody), {
    selector: {
      kind: "external_identity",
      provider: "discord",
      externalUserId: DISCORD_ID
    }
  });
});

test("accepts a resolved user with null Aura", async () => {
  const fetchMock = (async () => success({ aura: null })) as typeof fetch;
  const client = new InternalApiClient(config, dependencies(fetchMock));
  assert.equal(await client.lookupAuraByDiscordId(DISCORD_ID), null);
});

test("maps HTTP 404 NOT_FOUND without trusting the server message", async () => {
  const fetchMock = (async () => failure("NOT_FOUND", 404, "sensitive provider detail")) as typeof fetch;
  const client = new InternalApiClient(config, dependencies(fetchMock));
  let caught: unknown;
  try {
    await client.lookupAuraByDiscordId(DISCORD_ID);
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof InternalApiClientError);
  assert.equal(caught.code, "NOT_FOUND");
  assert.equal(caught.message.includes("sensitive provider detail"), false);
});

test("rejects malformed JSON responses", async () => {
  const fetchMock = (async () => new Response("not-json", {
    status: 200,
    headers: { "Content-Type": "application/json" }
  })) as typeof fetch;
  const client = new InternalApiClient(config, dependencies(fetchMock));
  await assert.rejects(
    () => client.fetchLeaderboards(),
    (error) => error instanceof InternalApiClientError && error.code === "INVALID_RESPONSE"
  );
});

test("rejects non-JSON content types", async () => {
  const fetchMock = (async () => new Response("{}", {
    status: 200,
    headers: { "Content-Type": "text/plain" }
  })) as typeof fetch;
  const client = new InternalApiClient(config, dependencies(fetchMock));
  await assert.rejects(
    () => client.fetchLeaderboards(),
    (error) => error instanceof InternalApiClientError && error.code === "INVALID_RESPONSE"
  );
});

test("rejects strict response DTOs with unexpected fields", async () => {
  const fetchMock = (async () => success({
    aura: {
      displayName: "Example",
      availableAura: 1,
      lifetimeAura: 2,
      updatedAt: "2026-08-10T00:00:00.000Z",
      futureSecret: "not-allowed"
    }
  })) as typeof fetch;
  const client = new InternalApiClient(config, dependencies(fetchMock));
  await assert.rejects(
    () => client.lookupAuraByDiscordId(DISCORD_ID),
    (error) => error instanceof InternalApiClientError && error.code === "INVALID_RESPONSE"
  );
});

test("rejects oversized responses before retaining their body", async () => {
  const fetchMock = (async () => new Response("{}", {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Length": String(65 * 1024)
    }
  })) as typeof fetch;
  const client = new InternalApiClient(config, dependencies(fetchMock));
  await assert.rejects(
    () => client.fetchLeaderboards(),
    (error) => error instanceof InternalApiClientError && error.code === "INVALID_RESPONSE"
  );
});

for (const [code, status] of [
  ["AUTHENTICATION_FAILED", 401],
  ["OPERATION_FORBIDDEN", 403],
  ["RATE_LIMITED", 429],
  ["REPLAY_DETECTED", 409],
  ["IDENTITY_PROVIDER_UNSUPPORTED", 400]
] as const) {
  test(`maps ${code} deterministically without retry`, async () => {
    let calls = 0;
    const fetchMock = (async () => {
      calls += 1;
      return failure(code, status);
    }) as typeof fetch;
    const client = new InternalApiClient(config, dependencies(fetchMock));
    await assert.rejects(
      () => client.lookupAuraByDiscordId(DISCORD_ID),
      (error) => error instanceof InternalApiClientError && error.code === code
    );
    assert.equal(calls, 1);
  });
}

test("rejects mismatched HTTP status and stable error code", async () => {
  const fetchMock = (async () => failure("NOT_FOUND", 401)) as typeof fetch;
  const client = new InternalApiClient(config, dependencies(fetchMock));
  await assert.rejects(
    () => client.lookupAuraByDiscordId(DISCORD_ID),
    (error) => error instanceof InternalApiClientError && error.code === "INVALID_RESPONSE"
  );
});

test("retries HTTP 503 once with fresh timestamp, nonce, and signature", async () => {
  const headers: Headers[] = [];
  let calls = 0;
  const fetchMock = (async (_url: unknown, init?: RequestInit) => {
    calls += 1;
    headers.push(new Headers(init?.headers));
    return calls === 1
      ? failure("DEPENDENCY_UNAVAILABLE", 503)
      : success({ leaderboards: [] });
  }) as typeof fetch;
  const client = new InternalApiClient(config, dependencies(
    fetchMock,
    [1767225600000, 1767225600001],
    ["123e4567-e89b-42d3-a456-426614174000", "123e4567-e89b-42d3-a456-426614174001"]
  ));

  await client.fetchLeaderboards();
  assert.equal(calls, 2);
  assert.notEqual(headers[0]?.get("x-cm-timestamp"), headers[1]?.get("x-cm-timestamp"));
  assert.notEqual(headers[0]?.get("x-cm-nonce"), headers[1]?.get("x-cm-nonce"));
  assert.notEqual(headers[0]?.get("x-cm-signature"), headers[1]?.get("x-cm-signature"));
});

test("does not retry HTTP 502 or 504", async () => {
  for (const status of [502, 504]) {
    let calls = 0;
    const fetchMock = (async () => {
      calls += 1;
      return jsonResponse({ ok: false }, status);
    }) as typeof fetch;
    const client = new InternalApiClient(config, dependencies(fetchMock));
    await assert.rejects(() => client.fetchLeaderboards(), InternalApiClientError);
    assert.equal(calls, 1);
  }
});

test("retries a transport failure once with fresh signed material", async () => {
  const headers: Headers[] = [];
  let calls = 0;
  const fetchMock = (async (_url: unknown, init?: RequestInit) => {
    calls += 1;
    headers.push(new Headers(init?.headers));
    if (calls === 1) throw new Error("socket detail");
    return success({ leaderboards: [] });
  }) as typeof fetch;
  const client = new InternalApiClient(config, dependencies(
    fetchMock,
    [1767225600000, 1767225600001],
    [randomUUID(), randomUUID()]
  ));
  await client.fetchLeaderboards();
  assert.equal(calls, 2);
  assert.notEqual(headers[0]?.get("x-cm-signature"), headers[1]?.get("x-cm-signature"));
});

test("times out finite requests and returns a safe local error", async () => {
  const fetchMock = ((_url: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  })) as typeof fetch;
  const client = new InternalApiClient(
    { ...config, timeoutMs: 5 },
    dependencies(fetchMock, [1, 2], [randomUUID(), randomUUID()])
  );
  await assert.rejects(
    () => client.fetchLeaderboards(),
    (error) => error instanceof InternalApiClientError && error.code === "REQUEST_TIMEOUT"
  );
});

test("timeout covers stalled response body consumption", async () => {
  const fetchMock = (async (_url: unknown, init?: RequestInit) => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        init?.signal?.addEventListener(
          "abort",
          () => controller.error(new Error("aborted body")),
          { once: true }
        );
      }
    });
    return new Response(body, {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;
  const client = new InternalApiClient(
    { ...config, timeoutMs: 5 },
    dependencies(fetchMock, [1, 2], [randomUUID(), randomUUID()])
  );
  await assert.rejects(
    () => client.fetchLeaderboards(),
    (error) => error instanceof InternalApiClientError && error.code === "REQUEST_TIMEOUT"
  );
});
