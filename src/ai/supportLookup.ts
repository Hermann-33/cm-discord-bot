import type { InternalApiClient } from "../api/client";
import type { PurchaseIntentLookupSelector } from "../api/purchaseIntents";
import type {
  AuraLookupData,
  OrderDetailsData,
  OrderFulfillmentData,
  OrderLookupSelector,
  UserOverviewData
} from "../api/schemas";
import type { SupportRuntimePack, SupportRuntimeRecord } from "./runtimePack";

export type SupportLookupContext = {
  discordUserId?: string;
  orderSelector?: OrderLookupSelector;
  purchaseSelector?: PurchaseIntentLookupSelector;
};

export type SafeSupportLookupData = Readonly<Record<string, string | number | boolean | null | readonly string[]>>;

export type SupportLookupResolution = {
  lookupId: string;
  status: "resolved" | "needs_clarification" | "unsupported" | "unavailable";
  safeData?: SafeSupportLookupData;
  customerMessage?: string;
  clarificationId?: string;
};

export interface SupportLiveLookupAdapter {
  resolveMany(input: {
    lookupIds: readonly string[];
    runtime: SupportRuntimePack;
    context: SupportLookupContext;
  }): Promise<readonly SupportLookupResolution[]>;
}

type SupportReadClient = Pick<
  InternalApiClient,
  "lookupAuraByDiscordId" | "fetchUserOverview" | "fetchOrderDetails" | "fetchOrderFulfillment" | "fetchPurchaseIntent"
>;

const OPERATION_ALIASES: Readonly<Record<string, string>> = {
  "orders.lookup.read": "orders.details.read",
  "purchase-intents.process.status.read": "purchase-intents.lookup.read"
};

const SUPPORTED_OPERATIONS = new Set([
  "aura.lookup.read",
  "users.overview.read",
  "orders.details.read",
  "orders.fulfillment.read",
  "purchase-intents.lookup.read"
]);

function recordObject(record: SupportRuntimeRecord): Record<string, unknown> {
  return record as unknown as Record<string, unknown>;
}

function cleanText(value: unknown, maximum = 500): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/[\u0000-\u001F\u007F]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (!cleaned) return null;
  return cleaned.slice(0, maximum);
}

function operationForLookup(id: string, runtime: SupportRuntimePack): string {
  const dynamic = runtime.dynamicLookups.find((item) => item.id === id);
  const rawOperation = dynamic ? cleanText(recordObject(dynamic).operation, 128) : id;
  const operation = rawOperation ?? id;
  return OPERATION_ALIASES[operation] ?? operation;
}

function purchaseSelectorFromContext(context: SupportLookupContext): PurchaseIntentLookupSelector | null {
  if (context.purchaseSelector) return context.purchaseSelector;
  if (context.orderSelector?.kind === "public_ref") {
    return { kind: "public_ref", value: context.orderSelector.value };
  }
  return null;
}

function safeOrderData(order: OrderDetailsData): { data: SafeSupportLookupData; message: string } {
  const data: SafeSupportLookupData = {
    kind: "order_status",
    status: cleanText(order.status, 64) ?? "unknown",
    purchaseKind: order.purchaseKind,
    quantity: order.quantity,
    amountCents: order.amountCents,
    currency: cleanText(order.currency, 12) ?? "",
    paymentMethod: cleanText(order.payment.method, 64)
  };
  return {
    data,
    message: `Current order status: ${data.status}.`
  };
}

function safeFulfillmentData(value: OrderFulfillmentData): { data: SafeSupportLookupData; message: string } {
  const statuses = [...new Set(value.fulfillments.map((item) => cleanText(item.status, 100)).filter((item): item is string => Boolean(item)))];
  const delivered = value.fulfillments.reduce((sum, item) => sum + item.quantityDelivered, 0);
  const requested = value.fulfillments.reduce((sum, item) => sum + item.quantityRequested, 0);
  const customerMessage = value.fulfillments.map((item) => cleanText(item.userMessage)).find(Boolean) ?? null;
  const data: SafeSupportLookupData = {
    kind: "fulfillment_status",
    orderStatus: cleanText(value.order.status, 64) ?? "unknown",
    fulfillmentStatuses: statuses,
    quantityDelivered: delivered,
    quantityRequested: requested,
    productType: cleanText(value.support?.productTypeLabel, 200),
    durationDays: value.support?.productDurationDays ?? null,
    manualRequired: value.support?.manualRequired ?? false,
    customerMessage
  };
  const progress = requested > 0 ? `${delivered}/${requested}` : String(delivered);
  const statusText = statuses.length > 0 ? statuses.join(", ") : "unknown";
  return {
    data,
    message: `Current delivery status: ${statusText}. Delivery progress: ${progress}.`
  };
}

function safePurchaseData(value: Awaited<ReturnType<SupportReadClient["fetchPurchaseIntent"]>>): { data: SafeSupportLookupData; message: string } {
  const status = cleanText(value.status, 64) ?? "unknown";
  const data: SafeSupportLookupData = {
    kind: "purchase_status",
    status,
    purchaseKind: value.purchaseKind,
    quantity: value.quantity,
    amountCents: value.amountCents,
    currency: cleanText(value.currency, 12) ?? "",
    paymentMethod: cleanText(value.paymentMethod, 64),
    hasOrder: Boolean(value.orderId)
  };
  return { data, message: `Current payment/purchase status: ${status}.` };
}

function safeUserData(value: UserOverviewData): { data: SafeSupportLookupData; message: string } {
  const data: SafeSupportLookupData = {
    kind: "user_overview",
    walletBalanceCents: value.wallet?.balanceCents ?? null,
    walletCurrency: cleanText(value.wallet?.currency, 12),
    availableAura: value.aura?.availableAura ?? null,
    lifetimeAura: value.aura?.lifetimeEarnedAura ?? null,
    orderCount: value.counts.orders,
    licenseCount: value.counts.licenses,
    accountDeliveryCount: value.counts.accountDeliveries
  };
  const parts: string[] = [];
  if (typeof data.availableAura === "number") parts.push(`available Aura ${data.availableAura}`);
  if (typeof data.walletBalanceCents === "number" && typeof data.walletCurrency === "string" && data.walletCurrency) {
    parts.push(`wallet ${data.walletBalanceCents} ${data.walletCurrency} cents`);
  }
  return { data, message: parts.length > 0 ? `Current account summary: ${parts.join("; ")}.` : "Current account state was found." };
}

function safeAuraData(value: AuraLookupData): { data: SafeSupportLookupData; message: string } {
  if (!value) {
    return { data: { kind: "aura", linked: false }, message: "No linked Aura account was found for this Discord user." };
  }
  const data: SafeSupportLookupData = {
    kind: "aura",
    linked: true,
    availableAura: value.availableAura,
    lifetimeAura: value.lifetimeAura
  };
  return { data, message: `Current Aura: ${value.availableAura} available, ${value.lifetimeAura} lifetime.` };
}

export function extractSupportLookupContext(customerText: string, discordUserId?: string): SupportLookupContext {
  const result: SupportLookupContext = discordUserId ? { discordUserId } : {};
  const uuid = customerText.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/iu)?.[0];
  if (uuid) {
    result.orderSelector = { kind: "order_id", value: uuid.toLowerCase() };
    result.purchaseSelector = { kind: "purchase_intent_id", value: uuid.toLowerCase() };
    return result;
  }

  const publicRef = customerText.match(/\bCM-[A-Z0-9-]{4,60}\b/iu)?.[0];
  if (publicRef) {
    const normalized = publicRef.toUpperCase();
    result.orderSelector = { kind: "public_ref", value: normalized };
    result.purchaseSelector = { kind: "public_ref", value: normalized };
  }
  return result;
}

export class InternalApiSupportLiveLookupAdapter implements SupportLiveLookupAdapter {
  constructor(private readonly client: SupportReadClient) {}

  async resolveMany(input: {
    lookupIds: readonly string[];
    runtime: SupportRuntimePack;
    context: SupportLookupContext;
  }): Promise<readonly SupportLookupResolution[]> {
    let orderDetailsPromise: Promise<OrderDetailsData> | null = null;
    const getOrder = (): Promise<OrderDetailsData> | null => {
      if (!input.context.orderSelector) return null;
      orderDetailsPromise ??= this.client.fetchOrderDetails(input.context.orderSelector);
      return orderDetailsPromise;
    };

    const cache = new Map<string, Promise<Omit<SupportLookupResolution, "lookupId">>>();
    const execute = (operation: string): Promise<Omit<SupportLookupResolution, "lookupId">> => {
      const existing = cache.get(operation);
      if (existing) return existing;
      const promise = this.executeOperation(operation, input.context, getOrder);
      cache.set(operation, promise);
      return promise;
    };

    const results: SupportLookupResolution[] = [];
    for (const lookupId of [...new Set(input.lookupIds)]) {
      const operation = operationForLookup(lookupId, input.runtime);
      if (!SUPPORTED_OPERATIONS.has(operation)) {
        results.push({ lookupId, status: "unsupported" });
        continue;
      }
      const result = await execute(operation);
      results.push({ lookupId, ...result });
    }
    return results;
  }

  private async executeOperation(
    operation: string,
    context: SupportLookupContext,
    getOrder: () => Promise<OrderDetailsData> | null
  ): Promise<Omit<SupportLookupResolution, "lookupId">> {
    try {
      if (operation === "orders.details.read") {
        const pending = getOrder();
        if (!pending) return { status: "needs_clarification", clarificationId: "clarify.order_selector" };
        const safe = safeOrderData(await pending);
        return { status: "resolved", safeData: safe.data, customerMessage: safe.message };
      }

      if (operation === "orders.fulfillment.read") {
        const pending = getOrder();
        if (!pending) return { status: "needs_clarification", clarificationId: "clarify.order_selector" };
        const order = await pending;
        const safe = safeFulfillmentData(await this.client.fetchOrderFulfillment(order.orderId));
        return { status: "resolved", safeData: safe.data, customerMessage: safe.message };
      }

      if (operation === "purchase-intents.lookup.read") {
        const selector = purchaseSelectorFromContext(context);
        if (!selector) return { status: "needs_clarification", clarificationId: "clarify.order_selector" };
        const safe = safePurchaseData(await this.client.fetchPurchaseIntent(selector));
        return { status: "resolved", safeData: safe.data, customerMessage: safe.message };
      }

      if (operation === "users.overview.read") {
        if (!context.discordUserId) return { status: "unavailable" };
        const safe = safeUserData(await this.client.fetchUserOverview({
          kind: "external_identity",
          provider: "discord",
          externalUserId: context.discordUserId
        }));
        return { status: "resolved", safeData: safe.data, customerMessage: safe.message };
      }

      if (operation === "aura.lookup.read") {
        if (!context.discordUserId) return { status: "unavailable" };
        const safe = safeAuraData(await this.client.lookupAuraByDiscordId(context.discordUserId));
        return { status: "resolved", safeData: safe.data, customerMessage: safe.message };
      }

      return { status: "unsupported" };
    } catch {
      return { status: "unavailable" };
    }
  }
}
