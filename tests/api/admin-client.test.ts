import assert from "node:assert/strict";
import test from "node:test";
import { InternalApiClient, INTERNAL_API_PATHS, type InternalApiClientDependencies } from "../../src/api/client";
import { isInternalApiError } from "../../src/api/errors";
import type { InternalApiConfig } from "../../src/config/env";

const REQUEST_ID = "550e8400-e29b-41d4-a716-446655440000";
const USER_ID = "550e8400-e29b-41d4-a716-446655440001";
const ORDER_ID = "550e8400-e29b-41d4-a716-446655440002";
const TX_ID = "550e8400-e29b-41d4-a716-446655440003";
const AUDIT_ID = "550e8400-e29b-41d4-a716-446655440004";
const IDEMPOTENCY_ID = "550e8400-e29b-41d4-a716-446655440005";
const PURCHASE_INTENT_ID = "550e8400-e29b-41d4-a716-446655440010";

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

function orderDetailsData() {
  return {
    order: {
      orderId: ORDER_ID,
      publicRef: "CM-TEST",
      purchaseKind: "product",
      productSlug: "product",
      licenseOptionId: null,
      accountSlug: null,
      accountVariantId: null,
      accountName: null,
      accountVariantLabel: null,
      accountGameName: null,
      quantity: 1,
      amountCents: 1000,
      currency: "USD",
      status: "paid",
      createdAt: "2026-08-10T00:00:00.000Z",
      userId: USER_ID,
      customerEmail: "user@example.com",
      payment: { method: "wallet", provider: null },
      fulfillmentSummary: {
        linkedLicenseCount: 1,
        accountDeliveryCount: 0,
        productDeliveryCount: 0,
        quantityRequested: 1,
        quantityDelivered: 1,
        manualRequired: false
      }
    }
  };
}

function fulfillmentData() {
  return {
    order: {
      orderId: ORDER_ID,
      publicRef: "CM-TEST",
      purchaseKind: "product",
      status: "paid"
    },
    linkedLicenseCount: 1,
    fulfillments: [{
      kind: "product",
      deliveryId: "550e8400-e29b-41d4-a716-446655440006",
      providerCode: "provider",
      status: "delivered",
      quantityRequested: 1,
      quantityDelivered: 1,
      failureCode: null,
      userMessage: null,
      manualRequiredAt: null,
      createdAt: "2026-08-10T00:00:00.000Z",
      updatedAt: "2026-08-10T00:00:00.000Z"
    }],
    support: {
      productTypeLabel: "7 Days",
      productDurationDays: 7,
      maskedMaterials: [{ kind: "license_key", maskedValue: "ABCD-****-WXYZ" }],
      manualRequired: false
    }
  };
}

function purchaseIntentData() {
  return {
    purchaseIntent: {
      purchaseIntentId: PURCHASE_INTENT_ID,
      publicRef: "CM-PENDING",
      userId: USER_ID,
      purchaseKind: "product",
      productSlug: "product",
      licenseOptionId: "7-day",
      accountSlug: null,
      accountVariantId: null,
      accountName: null,
      accountVariantLabel: null,
      accountGameName: null,
      quantity: 1,
      amountCents: 1000,
      currency: "USD",
      paymentMethod: "crypto",
      paymentProvider: "oxapay",
      status: "pending",
      providerStatus: "waiting",
      orderId: null,
      expiresAt: "2026-08-10T01:00:00.000Z",
      createdAt: "2026-08-10T00:00:00.000Z"
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

function auraAdjustmentResult() {
  return {
    adjustment: {
      userId: USER_ID,
      deltaAura: 250,
      availableAura: 750,
      pendingAura: 0,
      lifetimeEarnedAura: 1000,
      lifetimeRedeemedAura: 500,
      transactionId: TX_ID,
      auditEventId: AUDIT_ID,
      createdAt: "2026-08-10T00:00:00.000Z",
      idempotentReplay: false
    }
  };
}

function walletAdjustmentResult() {
  return {
    adjustment: {
      userId: USER_ID,
      deltaCents: -525,
      balanceCents: 1975,
      currency: "USD",
      transactionId: TX_ID,
      auditEventId: AUDIT_ID,
      createdAt: "2026-08-10T00:00:00.000Z",
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

test("order details accepts a public CM reference selector", async () => {
  let capturedUrl = "";
  let capturedBody = "";
  const fetchMock = (async (url: unknown, init?: RequestInit) => {
    capturedUrl = String(url);
    capturedBody = String(init?.body);
    return success(orderDetailsData());
  }) as typeof fetch;

  const client = new InternalApiClient(config, dependencies(fetchMock));
  const order = await client.fetchOrderDetails({ kind: "public_ref", value: "CM-TEST" });
  assert.equal(capturedUrl, `https://example.test${INTERNAL_API_PATHS.orderDetails}`);
  assert.deepEqual(JSON.parse(capturedBody), { selector: { kind: "public_ref", value: "CM-TEST" } });
  assert.equal(order.userId, USER_ID);
});

test("purchase intent lookup uses the documented pending-purchase path and selector", async () => {
  let capturedUrl = "";
  let capturedBody = "";
  const fetchMock = (async (url: unknown, init?: RequestInit) => {
    capturedUrl = String(url);
    capturedBody = String(init?.body);
    return success(purchaseIntentData());
  }) as typeof fetch;

  const client = new InternalApiClient(config, dependencies(fetchMock));
  const purchase = await client.fetchPurchaseIntent({ kind: "public_ref", value: "CM-PENDING" });
  assert.equal(capturedUrl, `https://example.test${INTERNAL_API_PATHS.purchaseIntentLookup}`);
  assert.deepEqual(JSON.parse(capturedBody), { selector: { kind: "public_ref", value: "CM-PENDING" } });
  assert.equal(purchase.purchaseIntentId, PURCHASE_INTENT_ID);
  assert.equal(purchase.status, "pending");
  assert.equal(purchase.orderId, null);
});

test("order fulfillment accepts human-readable type and masked support material", async () => {
  let capturedUrl = "";
  const fetchMock = (async (url: unknown) => {
    capturedUrl = String(url);
    return success(fulfillmentData());
  }) as typeof fetch;

  const client = new InternalApiClient(config, dependencies(fetchMock));
  const fulfillment = await client.fetchOrderFulfillment(ORDER_ID);
  assert.equal(capturedUrl, `https://example.test${INTERNAL_API_PATHS.orderFulfillment}`);
  assert.equal(fulfillment.support?.productTypeLabel, "7 Days");
  assert.deepEqual(fulfillment.support?.maskedMaterials, [
    { kind: "license_key", maskedValue: "ABCD-****-WXYZ" }
  ]);
});

test("order fulfillment remains compatible when website support enrichment is absent", async () => {
  const base = fulfillmentData();
  const { support: _support, ...withoutSupport } = base;
  const fetchMock = (async () => success(withoutSupport)) as typeof fetch;
  const client = new InternalApiClient(config, dependencies(fetchMock));

  const fulfillment = await client.fetchOrderFulfillment(ORDER_ID);
  assert.equal(fulfillment.support, undefined);
  assert.equal(fulfillment.fulfillments.length, 1);
});

test("order fulfillment rejects unexpected raw fulfillment material fields", async () => {
  const unsafe = fulfillmentData();
  const payload = {
    ...unsafe,
    support: {
      ...unsafe.support,
      maskedMaterials: [{
        kind: "license_key",
        maskedValue: "ABCD-****-WXYZ",
        rawValue: "FULL-SECRET-LICENSE-KEY"
      }]
    }
  };
  const fetchMock = (async () => success(payload)) as typeof fetch;
  const client = new InternalApiClient(config, dependencies(fetchMock));

  await assert.rejects(
    () => client.fetchOrderFulfillment(ORDER_ID),
    (error: unknown) => isInternalApiError(error) && error.code === "INVALID_RESPONSE"
  );
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

test("Aura adjustment uses stable idempotent body across dependency retry", async () => {
  const bodies: string[] = [];
  let calls = 0;
  const fetchMock = (async (url: unknown, init?: RequestInit) => {
    assert.equal(String(url), `https://example.test${INTERNAL_API_PATHS.userAuraAdjust}`);
    calls += 1;
    bodies.push(String(init?.body));
    if (calls === 1) {
      return new Response(JSON.stringify({
        ok: false,
        requestId: REQUEST_ID,
        error: { code: "DEPENDENCY_UNAVAILABLE", message: "retry" }
      }), { status: 503, headers: { "Content-Type": "application/json" } });
    }
    return success(auraAdjustmentResult());
  }) as typeof fetch;

  const client = new InternalApiClient(config, dependencies(fetchMock));
  const result = await client.executeAuraAdjustment({
    selector: { kind: "user_id", value: USER_ID },
    deltaAura: 250,
    reason: "Support correction",
    idempotencyKey: IDEMPOTENCY_ID,
    operator: { provider: "discord", externalUserId: "123456789012345681" }
  });
  assert.equal(result.availableAura, 750);
  assert.equal(calls, 2);
  assert.equal(bodies[0], bodies[1]);
  assert.deepEqual(JSON.parse(bodies[0]!), {
    selector: { kind: "user_id", value: USER_ID },
    deltaAura: 250,
    reason: "Support correction",
    idempotencyKey: IDEMPOTENCY_ID,
    operator: { provider: "discord", externalUserId: "123456789012345681" }
  });
});

test("wallet adjustment sends cents and strict audit context", async () => {
  let capturedBody = "";
  const fetchMock = (async (url: unknown, init?: RequestInit) => {
    assert.equal(String(url), `https://example.test${INTERNAL_API_PATHS.userWalletAdjust}`);
    capturedBody = String(init?.body);
    return success(walletAdjustmentResult());
  }) as typeof fetch;

  const client = new InternalApiClient(config, dependencies(fetchMock));
  const result = await client.executeWalletAdjustment({
    selector: { kind: "user_id", value: USER_ID },
    deltaCents: -525,
    reason: "Support correction",
    idempotencyKey: IDEMPOTENCY_ID,
    operator: { provider: "discord", externalUserId: "123456789012345681" }
  });
  assert.equal(result.balanceCents, 1975);
  assert.equal(JSON.parse(capturedBody).deltaCents, -525);
});
