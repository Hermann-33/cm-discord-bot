import type { ButtonInteraction } from "discord.js";
import type { InternalApiClient } from "../api/client";
import type { CmAdminSession } from "./cmSessions";
import { safeApiMessage } from "./cmSupport";
import {
  buildFulfillmentPanel,
  buildNoticePanel,
  buildOrderPanel,
  buildUserPanel,
  panelPayload
} from "./cmUi";

export async function refreshUserPanel(
  interaction: ButtonInteraction,
  session: CmAdminSession,
  api: InternalApiClient
): Promise<void> {
  await interaction.deferUpdate();
  try {
    session.overview = await api.fetchUserOverview(
      { kind: "user_id", value: session.overview.identity.userId },
      10
    );
    session.shareView = { kind: "user" };
    await interaction.editReply(panelPayload(buildUserPanel(session.id, session.overview)));
  } catch (error) {
    await interaction.editReply(panelPayload(buildNoticePanel(
      session.id,
      "User Refresh Failed",
      safeApiMessage(error),
      "user"
    )));
  }
}

export async function openOrder(
  interaction: ButtonInteraction,
  session: CmAdminSession,
  index: number,
  api: InternalApiClient
): Promise<void> {
  const summary = session.overview.recentOrders[index];
  if (!summary) {
    await interaction.update(panelPayload(buildNoticePanel(
      session.id,
      "Order Not Available",
      "That order is outside the recent-order set currently held by this private session.",
      "user"
    )));
    return;
  }

  await interaction.deferUpdate();
  try {
    const order = await api.fetchOrderDetails(summary.orderId);
    if (order.userId !== session.overview.identity.userId) throw new Error("Order target mismatch");
    const fulfillment = await api.fetchOrderFulfillment(order.orderId);
    if (fulfillment.order.orderId !== order.orderId) throw new Error("Fulfillment target mismatch");
    session.selectedOrder = order;
    session.refundProposal = undefined;
    session.shareView = { kind: "order" };
    await interaction.editReply(panelPayload(buildOrderPanel(
      session.id,
      order,
      session.overview,
      fulfillment
    )));
  } catch (error) {
    await interaction.editReply(panelPayload(buildNoticePanel(
      session.id,
      "Order Open Failed",
      safeApiMessage(error),
      "user"
    )));
  }
}

export async function refreshSelectedOrder(
  interaction: ButtonInteraction,
  session: CmAdminSession,
  api: InternalApiClient
): Promise<void> {
  if (!session.selectedOrder) {
    await interaction.update(panelPayload(buildNoticePanel(
      session.id,
      "No Order Selected",
      "Open an order from the recent-order list first.",
      "user"
    )));
    return;
  }

  await interaction.deferUpdate();
  try {
    const order = await api.fetchOrderDetails(session.selectedOrder.orderId);
    if (order.userId !== session.overview.identity.userId) throw new Error("Order target mismatch");
    const fulfillment = await api.fetchOrderFulfillment(order.orderId);
    if (fulfillment.order.orderId !== order.orderId) throw new Error("Fulfillment target mismatch");
    session.selectedOrder = order;
    session.refundProposal = undefined;
    session.shareView = { kind: "order" };
    await interaction.editReply(panelPayload(buildOrderPanel(
      session.id,
      order,
      session.overview,
      fulfillment
    )));
  } catch (error) {
    await interaction.editReply(panelPayload(buildNoticePanel(
      session.id,
      "Order Refresh Failed",
      safeApiMessage(error),
      "user"
    )));
  }
}

export async function openFulfillment(
  interaction: ButtonInteraction,
  session: CmAdminSession,
  api: InternalApiClient
): Promise<void> {
  if (!session.selectedOrder) {
    await interaction.update(panelPayload(buildNoticePanel(
      session.id,
      "No Order Selected",
      "Open an order before viewing fulfillment diagnostics.",
      "user"
    )));
    return;
  }

  await interaction.deferUpdate();
  try {
    const fulfillment = await api.fetchOrderFulfillment(session.selectedOrder.orderId);
    if (fulfillment.order.orderId !== session.selectedOrder.orderId) throw new Error("Fulfillment target mismatch");
    session.shareView = { kind: "fulfillment", data: fulfillment };
    await interaction.editReply(panelPayload(buildFulfillmentPanel(session.id, fulfillment)));
  } catch (error) {
    await interaction.editReply(panelPayload(buildNoticePanel(
      session.id,
      "Fulfillment Lookup Failed",
      safeApiMessage(error),
      "order"
    )));
  }
}
