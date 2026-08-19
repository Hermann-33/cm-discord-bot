import type { ButtonInteraction } from "discord.js";
import type { InternalApiClient } from "../api/client";
import { isInternalApiError } from "../api/errors";
import { fetchOptionalOrderFulfillment } from "./cmOrderSupport";
import type { CmAdminSession } from "./cmSessions";
import { safeApiMessage } from "./cmSupport";
import {
  buildNoticePanel,
  buildOrderPanel,
  buildPurchaseIntentPanel,
  panelPayload
} from "./cmUi";

export async function refreshSelectedPurchaseIntent(
  interaction: ButtonInteraction,
  session: CmAdminSession,
  api: InternalApiClient
): Promise<void> {
  const selected = session.selectedPurchaseIntent;
  if (!selected) {
    await interaction.update(panelPayload(buildNoticePanel(
      session.id,
      "No Pending Purchase Selected",
      "Run /cm order with the purchase reference again.",
      "user"
    )));
    return;
  }

  await interaction.deferUpdate();
  try {
    const purchase = await api.fetchPurchaseIntent({
      kind: "purchase_intent_id",
      value: selected.purchaseIntentId
    });
    if (purchase.userId !== session.overview.identity.userId) {
      throw new Error("Purchase target mismatch");
    }

    const overview = await api.fetchUserOverview({ kind: "user_id", value: purchase.userId }, 10);
    if (overview.identity.userId !== purchase.userId) throw new Error("Purchase owner mismatch");
    session.overview = overview;

    if (purchase.orderId) {
      try {
        const order = await api.fetchOrderDetails(purchase.orderId);
        if (order.userId !== purchase.userId) throw new Error("Order target mismatch");
        const fulfillment = await fetchOptionalOrderFulfillment(api, order.orderId);
        session.selectedOrder = order;
        session.selectedPurchaseIntent = undefined;
        session.refundProposal = undefined;
        session.shareView = { kind: "order" };
        await interaction.editReply(panelPayload(buildOrderPanel(
          session.id,
          order,
          overview,
          fulfillment
        )));
        return;
      } catch (error) {
        if (!isInternalApiError(error, "NOT_FOUND")) throw error;
      }
    }

    session.selectedOrder = undefined;
    session.selectedPurchaseIntent = purchase;
    session.refundProposal = undefined;
    session.shareView = { kind: "purchase-intent" };
    await interaction.editReply(panelPayload(buildPurchaseIntentPanel(session.id, purchase, overview)));
  } catch (error) {
    await interaction.editReply(panelPayload(buildNoticePanel(
      session.id,
      "Purchase Refresh Failed",
      safeApiMessage(error),
      "user"
    )));
  }
}
