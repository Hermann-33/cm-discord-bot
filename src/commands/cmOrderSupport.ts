import type { InternalApiClient } from "../api/client";
import type { OrderFulfillmentData } from "../api/schemas";

export async function fetchOptionalOrderFulfillment(
  api: InternalApiClient,
  orderId: string
): Promise<OrderFulfillmentData | null> {
  try {
    const fulfillment = await api.fetchOrderFulfillment(orderId);
    return fulfillment.order.orderId === orderId ? fulfillment : null;
  } catch {
    return null;
  }
}
