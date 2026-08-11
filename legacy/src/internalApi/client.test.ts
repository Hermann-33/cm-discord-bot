import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { sanitizeError } from "../logger/logger";
import {
  INTERNAL_API_PATHS,
  InternalApiClientError,
  InternalDiscordApiClient,
  buildCanonicalRequest,
  createSignedHeaders,
  discordMessageForInternalApiError,
  signInternalApiRequest,
  type InternalApiClientDependencies
} from "./client";

const TEST_SECRET_TEXT = "0123456789abcdef0123456789abcdef";
const TEST_SECRET = Buffer.from(TEST_SECRET_TEXT, "utf8");
const TEST_CONFIG = {
  enabled: true as const,
  baseUrl: "https://example.test",
  keyId: "current-2026-01",
  hmacSecret: TEST_SECRET,
  timeoutMs: 50
};
const GUILD_ID = "987654321098765432";
const ACTOR_ID = "123456789012345678";

function success(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, requestId: "request-test", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

function dependencies(
  fetchImpl: typeof fetch,
  timestamps = [1767225600000],
  nonces = ["123e4567-e89b-42d3-a456-426614174000"]
): InternalApiClientDependencies {
  let timeIndex = 0;
  let nonceIndex = 0;
  return {
    fetch: fetchImpl,
    nowMs: () => timestamps[Math.min(timeIndex++, timestamps.length - 1)]!,
    nonce: () => nonces[Math.min(nonceIndex++, nonces.length - 1)]!
  };
}

test("matches the documented scheduled leaderboard signing vector exactly", () => {
  const timestamp = "1767225600000";
  const nonce = "123e4567-e89b-42d3-a456-426614174000";
  const rawBody = Buffer.from(
    '{"mode":"scheduled","guildId":"987654321098765432","limit":10}',
    "utf8"
  );
  const canonical = buildCanonicalRequest(
    timestamp,
    nonce,
    INTERNAL_API_PATHS.leaderboards,
    rawBody
  );

  assert.equal(
    canonical,
    "v1\n1767225600000\n123e4567-e89b-42d3-a456-426614174000\nPOST\n/api/internal/discord-bot/v1/aura/leaderboards\n09289a81deadab062f9a9d5cd34b021cc761a850cfa357b3c9ef2271f8f0565d"
  );
  assert.equal(canonical.endsWith("\n"), false);
  assert.equal(
    signInternalApiRequest(
      TEST_SECRET,
      timestamp,
      nonce,
      INTERNAL_API_PATHS.leaderboards,
      rawBody
    ),
    "b4fb2c73207c0e2e599b8cd93bd6698ca7f8f4a13c35dc35875447d799b01352"
  );
});

test("matches the documented self-service Aura signing vector exactly", () => {
  const rawBody = Buffer.from(
    '{"guildId":"987654321098765432","actorDiscordUserId":"123456789012345678"}',
    "utf8"
  );
  assert.equal(
    signInternalApiRequest(
      TEST_SECRET,
      "1767225600000",
      "123e4567-e89b-42d3-a456-426614174001",
      INTERNAL_API_PATHS.auraUser,
      rawBody
    ),
    "c18f01856f0086b7ad5fad4bbaa166aa11c40887f76370d09d54e563610bd735"
  );
});

test("signs exact raw bytes and exact pathname", () => {
  const compact = Buffer.from('{"a":1}', "utf8");
  const spaced = Buffer.from('{"a": 1}', "utf8");
  const first = signInternalApiRequest(TEST_SECRET, "1", randomUUID(), "/one", compact);
  const nonce = "123e4567-e89b-42d3-a456-426614174000";
  assert.notEqual(
    signInternalApiRequest(TEST_SECRET, "1", nonce, "/one", compact),
    signInternalApiRequest(TEST_SECRET, "1", nonce, "/one", spaced)
  );
  assert.notEqual(
    signInternalApiRequest(TEST_SECRET, "1", nonce, "/one", compact),
    signInternalApiRequest(TEST_SECRET, "1", nonce, "/two", compact)
  );
  assert.match(first, /^[a-f0-9]{64}$/);
});

test("constructs only the documented signing headers", () => {
  const rawBody = Buffer.from("{}", "utf8");
  const headers = createSignedHeaders(
    "key-a",
    TEST_SECRET,
    "1767225600000",
    "123e4567-e89b-42d3-a456-426614174000",
    "/path",
    rawBody
  );
  assert.deepEqual(Object.keys(headers), [
    "Content-Type",
    "X-CM-Key-Id",
    "X-CM-Timestamp",
    "X-CM-Nonce",
    "X-CM-Signature"
  ]);
  assert.equal(headers["Content-Type"], "application/json");
  assert.equal(headers["X-CM-Key-Id"], "key-a");
  assert.equal(headers["X-CM-Timestamp"], "1767225600000");
  assert.match(headers["X-CM-Signature"]!, /^[a-f0-9]{64}$/);
});

test("Node secure UUID generation produces unique lowercase UUIDv4 nonces", () => {
  const values = Array.from({ length: 32 }, () => randomUUID());
  assert.equal(new Set(values).size, values.length);
  for (const value of values) {
    assert.match(value, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  }
});

test("scheduled leaderboard construction is actorless", async () => {
  let capturedBody = "";
  const fetchMock = (async (_url: unknown, init?: RequestInit) => {
    capturedBody = String(init?.body);
    return success({ leaderboards: [] });
  }) as typeof fetch;
  const client = new InternalDiscordApiClient(TEST_CONFIG, GUILD_ID, dependencies(fetchMock));
  await client.fetchLeaderboards();
  assert.equal(capturedBody, `{"mode":"scheduled","guildId":"${GUILD_ID}","limit":10}`);
  assert.equal(capturedBody.includes("actor"), false);
});

test("manual leaderboard construction carries only documented actor context", async () => {
  let capturedBody = "";
  const fetchMock = (async (_url: unknown, init?: RequestInit) => {
    capturedBody = String(init?.body);
    return success({ leaderboards: [] });
  }) as typeof fetch;
  const client = new InternalDiscordApiClient(TEST_CONFIG, GUILD_ID, dependencies(fetchMock));
  await client.fetchLeaderboards({
    mode: "manual",
    actorDiscordUserId: ACTOR_ID,
    eventId: "234567890123456789",
    source: "interaction"
  });
  assert.deepEqual(JSON.parse(capturedBody), {
    mode: "manual",
    guildId: GUILD_ID,
    actorDiscordUserId: ACTOR_ID,
    eventId: "234567890123456789",
    source: "interaction",
    limit: 10
  });
});

test("self-service Aura binds the actor and exposes no target field", async () => {
  let capturedBody = "";
  const fetchMock = (async (_url: unknown, init?: RequestInit) => {
    capturedBody = String(init?.body);
    return success({ linked: false });
  }) as typeof fetch;
  const client = new InternalDiscordApiClient(TEST_CONFIG, GUILD_ID, dependencies(fetchMock));
  assert.equal(await client.fetchUserAura(ACTOR_ID), null);
  assert.deepEqual(JSON.parse(capturedBody), {
    guildId: GUILD_ID,
    actorDiscordUserId: ACTOR_ID
  });
  assert.equal(capturedBody.includes("target"), false);
});

test("admin user and order lookups carry the invoking actor and exact selector", async () => {
  const bodies: unknown[] = [];
  const fetchMock = (async (url: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    if (String(url).endsWith(INTERNAL_API_PATHS.userLookup)) {
      return success({ user: sampleUser() });
    }
    return success({ order: sampleOrder() });
  }) as typeof fetch;
  const client = new InternalDiscordApiClient(TEST_CONFIG, GUILD_ID, dependencies(fetchMock));
  await client.lookupUser(ACTOR_ID, { kind: "discord_user_id", value: ACTOR_ID });
  await client.lookupOrder(ACTOR_ID, {
    kind: "order_id",
    value: "550e8400-e29b-41d4-a716-446655440000"
  });
  assert.deepEqual(bodies[0], {
    guildId: GUILD_ID,
    actorDiscordUserId: ACTOR_ID,
    selector: { kind: "discord_user_id", value: ACTOR_ID }
  });
  assert.equal((bodies[1] as { actorDiscordUserId: string }).actorDiscordUserId, ACTOR_ID);
});

test("strictly parses all four documented response DTOs", async () => {
  const fetchMock = (async (url: unknown) => {
    const pathname = new URL(String(url)).pathname;
    if (pathname === INTERNAL_API_PATHS.leaderboards) {
      return success({ leaderboards: [{ leaderboardType: "available", rank: 1, displayName: "User", aura: 9 }] });
    }
    if (pathname === INTERNAL_API_PATHS.auraUser) {
      return success({ linked: true, displayName: "User", availableAura: 9, lifetimeAura: 10 });
    }
    if (pathname === INTERNAL_API_PATHS.userLookup) return success({ user: sampleUser() });
    return success({ order: sampleOrder() });
  }) as typeof fetch;
  const client = new InternalDiscordApiClient(TEST_CONFIG, GUILD_ID, dependencies(fetchMock));
  assert.equal((await client.fetchLeaderboards())[0]?.aura, 9);
  assert.equal((await client.fetchUserAura(ACTOR_ID))?.lifetime_earned_aura, 10);
  assert.equal((await client.lookupUser(ACTOR_ID, { kind: "discord_user_id", value: ACTOR_ID })).user.maskedEmail, "u***@example.test");
  assert.equal((await client.lookupOrder(ACTOR_ID, { kind: "public_ref", value: "CM-1" })).order.publicRef, "CM-1");
});

test("rejects response DTOs containing unknown fields", async () => {
  const fetchMock = (async () => success({ linked: false, secret: "not-allowed" })) as typeof fetch;
  const client = new InternalDiscordApiClient(TEST_CONFIG, GUILD_ID, dependencies(fetchMock));
  await assert.rejects(() => client.fetchUserAura(ACTOR_ID), (error) => error instanceof InternalApiClientError && error.code === "INVALID_RESPONSE");
});

test("maps stable API error codes without trusting server messages", async () => {
  const fetchMock = (async () => new Response(JSON.stringify({ ok: false, requestId: "r", error: { code: "ACTOR_FORBIDDEN", message: "sensitive provider detail" } }), { status: 403 })) as typeof fetch;
  const client = new InternalDiscordApiClient(TEST_CONFIG, GUILD_ID, dependencies(fetchMock));
  let caught: unknown;
  try { await client.fetchUserAura(ACTOR_ID); } catch (error) { caught = error; }
  assert.equal(discordMessageForInternalApiError(caught), "You are not authorized to use this support command.");
  assert.equal(JSON.stringify(caught).includes("sensitive provider detail"), false);
});

test("times out finite requests and reports a safe local error", async () => {
  const fetchMock = ((_url: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  })) as typeof fetch;
  const client = new InternalDiscordApiClient({ ...TEST_CONFIG, timeoutMs: 5 }, GUILD_ID, dependencies(fetchMock, [1, 2], [randomUUID(), randomUUID()]));
  await assert.rejects(() => client.fetchLeaderboards(), (error) => error instanceof InternalApiClientError && error.code === "REQUEST_TIMEOUT");
});

test("retries network failures once and reports a safe failure", async () => {
  let calls = 0;
  const fetchMock = (async () => { calls += 1; throw new Error("socket detail"); }) as typeof fetch;
  const client = new InternalDiscordApiClient(TEST_CONFIG, GUILD_ID, dependencies(fetchMock, [1, 2], [randomUUID(), randomUUID()]));
  await assert.rejects(() => client.fetchLeaderboards(), (error) => error instanceof InternalApiClientError && error.code === "NETWORK_FAILURE");
  assert.equal(calls, 2);
});

test("retryable failures are re-signed with a fresh timestamp and nonce", async () => {
  const headers: Headers[] = [];
  let calls = 0;
  const fetchMock = (async (_url: unknown, init?: RequestInit) => {
    calls += 1;
    headers.push(new Headers(init?.headers));
    return calls === 1 ? new Response("unavailable", { status: 503 }) : success({ leaderboards: [] });
  }) as typeof fetch;
  const client = new InternalDiscordApiClient(TEST_CONFIG, GUILD_ID, dependencies(fetchMock, [1767225600000, 1767225600001], ["123e4567-e89b-42d3-a456-426614174000", "123e4567-e89b-42d3-a456-426614174001"]));
  await client.fetchLeaderboards();
  assert.equal(calls, 2);
  assert.notEqual(headers[0]!.get("x-cm-nonce"), headers[1]!.get("x-cm-nonce"));
  assert.notEqual(headers[0]!.get("x-cm-timestamp"), headers[1]!.get("x-cm-timestamp"));
  assert.notEqual(headers[0]!.get("x-cm-signature"), headers[1]!.get("x-cm-signature"));
});

test("stable client errors are not retried", async () => {
  let calls = 0;
  const fetchMock = (async () => {
    calls += 1;
    return new Response(
      JSON.stringify({
        ok: false,
        requestId: "r",
        error: { code: "RATE_LIMITED", message: "Too many requests." }
      }),
      { status: 429 }
    );
  }) as typeof fetch;
  const client = new InternalDiscordApiClient(TEST_CONFIG, GUILD_ID, dependencies(fetchMock));
  await assert.rejects(
    () => client.fetchLeaderboards(),
    (error) => error instanceof InternalApiClientError && error.code === "RATE_LIMITED"
  );
  assert.equal(calls, 1);
});

test("client errors and sanitized logs exclude secret and request data", async () => {
  const sensitiveSelector = "customer@example.test";
  const secretText = TEST_SECRET.toString("base64");
  const fetchMock = (async () => new Response("bad gateway", { status: 502 })) as typeof fetch;
  const client = new InternalDiscordApiClient(TEST_CONFIG, GUILD_ID, dependencies(fetchMock, [1, 2], [randomUUID(), randomUUID()]));
  let caught: unknown;
  try { await client.lookupUser(ACTOR_ID, { kind: "email", value: sensitiveSelector }); } catch (error) { caught = error; }
  const serialized = JSON.stringify({ error: caught, log: sanitizeError(caught) });
  assert.equal(serialized.includes(secretText), false);
  assert.equal(serialized.includes(sensitiveSelector), false);
  assert.equal(serialized.includes("bad gateway"), false);
});

function sampleUser() {
  return {
    userId: "550e8400-e29b-41d4-a716-446655440000",
    maskedEmail: "u***@example.test",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastSignInAt: null,
    isBanned: false,
    bannedAt: null,
    discordLink: null,
    wallet: null,
    aura: null,
    counts: { orders: 1 }
  };
}

function sampleOrder() {
  return {
    orderId: "550e8400-e29b-41d4-a716-446655440000",
    publicRef: "CM-1",
    userId: "550e8400-e29b-41d4-a716-446655440001",
    maskedCustomerEmail: "u***@example.test",
    purchaseKind: "product",
    productSlug: "example",
    licenseOptionId: "one-day",
    accountSlug: null,
    accountVariantId: null,
    accountName: null,
    accountVariantLabel: null,
    accountGameName: null,
    quantity: 1,
    amountCents: 1000,
    currency: "USD",
    paymentMethod: "card",
    paymentProvider: "provider",
    status: "paid",
    createdAt: "2026-01-01T00:00:00.000Z",
    fulfillment: { productDeliveries: [], accountDeliveries: [] }
  };
}
