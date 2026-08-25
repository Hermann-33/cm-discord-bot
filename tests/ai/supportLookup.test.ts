import assert from "node:assert/strict";
import test from "node:test";
import { InternalApiSupportLiveLookupAdapter, extractSupportLookupContext } from "../../src/ai/supportLookup";
import type { SupportRuntimePack, SupportRuntimeRecord } from "../../src/ai/runtimePack";

function record(id: string, extras: Record<string, unknown> = {}): SupportRuntimeRecord {
  return { id, ...extras } as SupportRuntimeRecord;
}

const runtime: SupportRuntimePack = {
  knowledgeVersion: "test",
  aliases: [], cases: [], clarifications: [], policies: [], procedures: [], escalations: [], restrictedTopics: [], productProfiles: [],
  catalog: {}, routing: {}, actionRouting: {},
  dynamicLookups: [
    record("dynamic.order.status", { operation: "orders.details.read" }),
    record("dynamic.fulfillment.status", { operation: "orders.fulfillment.read" }),
    record("dynamic.purchase_intent.status", { operation: "purchase-intents.lookup.read" }),
    record("dynamic.user.overview", { operation: "users.overview.read" }),
    record("dynamic.catalog.price", { operation: "catalog.current.read" })
  ]
};

function createClient() {
  const calls = { order: 0, fulfillment: 0, purchase: 0, user: 0, aura: 0 };
  const client = {
    async fetchOrderDetails(): Promise<any> {
      calls.order += 1;
      return {
        orderId: "11111111-1111-4111-8111-111111111111",
        publicRef: "CM-TEST-1234",
        userId: "22222222-2222-4222-8222-222222222222",
        customerEmail: "private@example.com",
        purchaseKind: "product",
        productSlug: "safe-product",
        licenseOptionId: "internal-option",
        accountSlug: null,
        accountVariantId: null,
        accountName: null,
        accountVariantLabel: null,
        accountGameName: null,
        quantity: 1,
        amountCents: 2500,
        currency: "USD",
        payment: { method: "card", provider: "private-provider" },
        status: "processing",
        createdAt: "2026-08-25T00:00:00Z",
        fulfillmentSummary: { linkedLicenseCount: 0, accountDeliveryCount: 0, productDeliveryCount: 1, quantityRequested: 1, quantityDelivered: 0, manualRequired: false }
      };
    },
    async fetchOrderFulfillment(): Promise<any> {
      calls.fulfillment += 1;
      return {
        order: { orderId: "11111111-1111-4111-8111-111111111111", publicRef: "CM-TEST-1234", purchaseKind: "product", status: "processing" },
        linkedLicenseCount: 0,
        fulfillments: [{
          kind: "product", deliveryId: "33333333-3333-4333-8333-333333333333", providerCode: "private-provider", status: "queued",
          quantityRequested: 1, quantityDelivered: 0, failureCode: null, userMessage: "Delivery is queued.", manualRequiredAt: null,
          createdAt: "2026-08-25T00:00:00Z", updatedAt: "2026-08-25T00:01:00Z"
        }],
        support: { productTypeLabel: "License", productDurationDays: 30, maskedMaterials: [{ kind: "license_key", maskedValue: "ABCD-****-WXYZ" }], manualRequired: false }
      };
    },
    async fetchPurchaseIntent(): Promise<any> {
      calls.purchase += 1;
      return {
        purchaseIntentId: "44444444-4444-4444-8444-444444444444", publicRef: "CM-TEST-1234", userId: "22222222-2222-4222-8222-222222222222",
        purchaseKind: "product", productSlug: "safe-product", licenseOptionId: "private-option", accountSlug: null, accountVariantId: null,
        accountName: null, accountVariantLabel: null, accountGameName: null, quantity: 1, amountCents: 2500, currency: "USD",
        paymentMethod: "card", paymentProvider: "private-provider", status: "pending", providerStatus: "processor-secret-state",
        orderId: null, expiresAt: null, createdAt: "2026-08-25T00:00:00Z"
      };
    },
    async fetchUserOverview(): Promise<any> {
      calls.user += 1;
      return {
        identity: { userId: "22222222-2222-4222-8222-222222222222", email: "private@example.com", createdAt: "2026-08-25T00:00:00Z", lastSignInAt: null, externalIdentities: [] },
        accountControl: { isBanned: false, banReason: null, bannedAt: null, unbannedAt: null, updatedAt: null },
        wallet: { balanceCents: 1250, currency: "USD", updatedAt: "2026-08-25T00:00:00Z" },
        aura: { availableAura: 42, pendingAura: 0, lifetimeEarnedAura: 100, lifetimeRedeemedAura: 58, updatedAt: "2026-08-25T00:00:00Z" },
        counts: { orders: 2, licenses: 1, accountDeliveries: 0 }, recentOrders: []
      };
    },
    async lookupAuraByDiscordId(): Promise<any> {
      calls.aura += 1;
      return { displayName: "Customer", availableAura: 42, lifetimeAura: 100, updatedAt: "2026-08-25T00:00:00Z" };
    }
  };
  return { client, calls };
}

test("support lookup context extracts local selectors without relying on planner text", () => {
  assert.deepEqual(extractSupportLookupContext("status for CM-TEST-1234", "123456789012345678"), {
    discordUserId: "123456789012345678",
    orderSelector: { kind: "public_ref", value: "CM-TEST-1234" },
    purchaseSelector: { kind: "public_ref", value: "CM-TEST-1234" }
  });
});

test("order and fulfillment lookups use approved reads and persist only customer-safe projections", async () => {
  const { client, calls } = createClient();
  const adapter = new InternalApiSupportLiveLookupAdapter(client as any);
  const results = await adapter.resolveMany({
    lookupIds: ["orders.lookup.read", "orders.details.read", "dynamic.fulfillment.status"],
    runtime,
    context: { orderSelector: { kind: "public_ref", value: "CM-TEST-1234" } }
  });
  assert.equal(calls.order, 1);
  assert.equal(calls.fulfillment, 1);
  assert.equal(results.every((item) => item.status === "resolved"), true);
  const serialized = JSON.stringify(results);
  assert.doesNotMatch(serialized, /private@example\.com|private-provider|ABCD-\*\*\*\*-WXYZ|11111111-1111/i);
  assert.match(serialized, /processing|queued|License/);
});

test("purchase process status abstraction collapses only to the existing purchase-intent read", async () => {
  const { client, calls } = createClient();
  const adapter = new InternalApiSupportLiveLookupAdapter(client as any);
  const [result] = await adapter.resolveMany({
    lookupIds: ["purchase-intents.process.status.read"],
    runtime,
    context: { purchaseSelector: { kind: "public_ref", value: "CM-TEST-1234" } }
  });
  assert.equal(calls.purchase, 1);
  assert.equal(result.status, "resolved");
  const serialized = JSON.stringify(result);
  assert.match(serialized, /pending/);
  assert.doesNotMatch(serialized, /processor-secret-state|private-provider|44444444-4444/);
});

test("unsupported catalog lookup fails closed without inventing or calling an API operation", async () => {
  const { client, calls } = createClient();
  const adapter = new InternalApiSupportLiveLookupAdapter(client as any);
  const [result] = await adapter.resolveMany({ lookupIds: ["dynamic.catalog.price"], runtime, context: {} });
  assert.deepEqual(result, { lookupId: "dynamic.catalog.price", status: "unsupported" });
  assert.deepEqual(calls, { order: 0, fulfillment: 0, purchase: 0, user: 0, aura: 0 });
});

test("missing order selector asks canonical selector clarification instead of guessing", async () => {
  const { client } = createClient();
  const adapter = new InternalApiSupportLiveLookupAdapter(client as any);
  const [result] = await adapter.resolveMany({ lookupIds: ["dynamic.order.status"], runtime, context: {} });
  assert.deepEqual(result, { lookupId: "dynamic.order.status", status: "needs_clarification", clarificationId: "clarify.order_selector" });
});

test("user overview and Aura responses exclude identity and email fields", async () => {
  const { client } = createClient();
  const adapter = new InternalApiSupportLiveLookupAdapter(client as any);
  const results = await adapter.resolveMany({
    lookupIds: ["dynamic.user.overview", "aura.lookup.read"], runtime,
    context: { discordUserId: "123456789012345678" }
  });
  const serialized = JSON.stringify(results);
  assert.doesNotMatch(serialized, /private@example\.com|22222222-2222|123456789012345678/);
  assert.match(serialized, /availableAura|walletBalanceCents/);
});
