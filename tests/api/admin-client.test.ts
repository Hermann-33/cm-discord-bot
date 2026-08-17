import assert from "node:assert/strict";
import test from "node:test";
import { InternalApiClient, INTERNAL_API_PATHS, type InternalApiClientDependencies } from "../../src/api/client";
import type { InternalApiConfig } from "../../src/config/env";

const REQUEST_ID = "550e8400-e29b-41d4-a716-446655440000";
const USER_ID = "550e8400-e29b-41d4-a716-446655440001";
const ORDER_ID = "550e8400-e29b-41d4-a716-446655440002";
const TX_ID = "550e8400-e29b-41d4-a716-446655440003";
const AUDIT_ID = "550e8400-e29b-41d4-a716-446655440004";
const IDEMPOTENCY_ID = "550e8400-e29b-41d4-a716-446655440005";

const config: InternalApiConfig = {
  origin: "https://example.test",
  clientId: "cm-discord-bot",
  keyId: "cm-discord-bot-2026-08",
  hmacSecret: Buffer.from("0123456789abcdef0123456789abcdef"),
  timeoutMs: 50
};

function success(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, requestId: REQUEST_ID, data }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

function dependencies(fetchImpl: typeof fetch): InternalApiClientDependencies {
  let now = 1767225600000;
  let nonce = 0;
  return {
    fetch: fetchImpl,
    nowMs: () => now++,
    nonce: () => `123e4567-e89b-42d3-a456-42661417400${nonce++}`
  };
}

function overviewData() {
  return {
    overview: {
      identity: {
        userId: USER_ID,
        email: "user@example.com",
        createdAt: "2026-08-10T00:00:00.000Z",
        lastSignInAt: null,
        externalIdentities: []
      },
      accountControl: {
        isBanned: false,
        banReason: null,
        bannedAt: null,
        unbannedAt: null,
        updatedAt: null
      },
      wallet: null,
      aura: null,
      counts: { orders: 0, licenses: 0, accountDeliveries: 0 },
      recentOrders: []
    }
  };
}

function refundResult() {
  return {
    refund: {
      status: "refunded",
      orderId: ORDER_ID,
      publicRef: "CM-TEST",
      userId: USER_ID,
      purchaseKind: "product",
      productSlug: "product",
      accountSlug: null,
      currency: "USD",
      grossRefundCents: 1000,
      finalWalletCreditCents: 1000,
      auraAwarded: 0,
      auraRecovered: 0,
      auraRecoveredAvailable: 0,
      auraRecoveredPending: 0,
      auraUnrecoverable: 0,
      auraConvertible: 0,
      auraDeductionCents: 0,
      auraResidual: 0,
      walletTransactionId: TX_ID,
      auraTransactionIds: [],
      auditEventId: AUDIT_ID,
      refundedAt: "2026-08-10T00:00:00.000Z",
      idempotentReplay: false
    }
  };
}

test("user overview uses the exact documented path and recent-order limit", async () => {
  let capturedUrl = "";
  let capturedBody = "";
  const fetchMock = (async (url: unknown, init?: RequestInit) => {
    capturedUrl = String(url);
    capturedBody = String(init?.body);
    return success(overviewData());
  }) as typeof fetch;

  const client = new InternalApiClient(config, dependencies(fetchMock));
  const overview = await client.fetchUserOverview({ kind: "email", value: "user@example.com" }, 10);
  assert.equal(capturedUrl, `https://example.test${INTERNAL_API_PATHS.userOverview}`);
  assert.deepEqual(JSON.parse(capturedBody), {
    selector: { kind: "email", value: "user@example.com" },
    recentOrdersLimit: 10
  });
  assert.equal(overview.identity.userId, USER_ID);
});

test("refund execute preserves logical body/idempotency while transport signing changes on retry", async () => {
  const bodies: string[] = [];
  const headers: Headers[] = [];
  let calls = 0;
  const fetchMock = (async (url: unknown, init?: RequestInit) => {
    assert.equal(String(url), `https://example.test${INTERNAL_API_PATHS.orderRefundExecute}`);
    calls += 1;
    bodies.push(String(init?.body));
    headers.push(new Headers(init?.headers));
    if (calls === 1) {
      return new Response(JSON.stringify({
        ok: false,
        requestId: REQUEST_ID,
        error: { code: "DEPENDENCY_UNAVAILABLE", message: "retry" }
      }), {
        status: 503,
        headers: { "Content-Type": "application/json" }
      });
    }
    return success(refundResult());
  }) as typeof fetch;

  const client = new InternalApiClient(config, dependencies(fetchMock));
  const result = await client.executeOrderRefund({
    orderId: ORDER_ID,
    reason: "Customer approved refund.",
    idempotencyKey: IDEMPOTENCY_ID,
    operator: {
      provider: "discord",
      externalUserId: "123456789012345681",
      username: "admin",
      displayName: "Admin"
    }
  });

  assert.equal(result.status, "refunded");
  assert.equal(calls, 2);
  assert.equal(bodies[0], bodies[1]);
  assert.equal(JSON.parse(bodies[0]!).idempotencyKey, IDEMPOTENCY_ID);
  assert.notEqual(headers[0]?.get("x-cm-timestamp"), headers[1]?.get("x-cm-timestamp"));
  assert.notEqual(headers[0]?.get("x-cm-nonce"), headers[1]?.get("x-cm-nonce"));
  assert.notEqual(headers[0]?.get("x-cm-signature"), headers[1]?.get("x-cm-signature"));
});
