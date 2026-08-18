import { randomUUID } from "node:crypto";
import {
  MessageFlags,
  SlashCommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Interaction,
  type ModalSubmitInteraction
} from "discord.js";
import { InternalApiClient } from "../api/client";
import { isInternalApiError } from "../api/errors";
import type { OrderLookupSelector, UserLookupSelector } from "../api/schemas";
import type { AppConfig } from "../config/env";
import { postAdjustmentAudit, postRefundAudit } from "../discord/adminAudit";
import { logger } from "../logger";
import {
  confirmAdjustment,
  handleAdjustmentModal,
  showAdjustmentModal,
  type AdjustmentDependencies
} from "./cmAdjustments";
import { confirmRefund, handleRefundModal, showRefundModal, type RefundDependencies } from "./cmRefund";
import { shareCurrentPanel } from "./cmShare";
import { CmSessionStore } from "./cmSessions";
import { authorize, parseNonNegativeInteger, rejectUnauthorized, requireSession, safeApiMessage } from "./cmSupport";
import {
  buildBlockedPanel,
  buildNoticePanel,
  buildOrderPanel,
  buildOrdersPanel,
  buildUserPanel,
  panelPayload
} from "./cmUi";
import { openFulfillment, openOrder, refreshSelectedOrder, refreshUserPanel } from "./cmUserActions";

export type CmAdminControllerDependencies = RefundDependencies & AdjustmentDependencies;

const productionDependencies: CmAdminControllerDependencies = {
  nowMs: Date.now,
  idempotencyKey: randomUUID,
  postRefundAudit,
  postAdjustmentAudit
};

function parseOrderSelector(value: string): OrderLookupSelector | null {
  const trimmed = value.trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)) {
    return { kind: "order_id", value: trimmed.toLowerCase() };
  }
  const publicRef = trimmed.toUpperCase();
  if (/^[A-Z0-9-]{1,64}$/.test(publicRef)) {
    return { kind: "public_ref", value: publicRef };
  }
  return null;
}

function parseUserSelector(interaction: ChatInputCommandInteraction): UserLookupSelector | null {
  const email = interaction.options.getString("email")?.trim() ?? "";
  const discordUser = interaction.options.getUser("discord_user");
  if ((email.length > 0) === Boolean(discordUser)) return null;
  if (discordUser) {
    return {
      kind: "external_identity",
      provider: "discord",
      externalUserId: discordUser.id
    };
  }
  return { kind: "email", value: email };
}

export function buildCmCommand() {
  return new SlashCommandBuilder()
    .setName("cm")
    .setDescription("Private Cheater's Market admin controls")
    .addSubcommand((subcommand) => subcommand
      .setName("user")
      .setDescription("Open private controls for a CM user")
      .addStringOption((option) => option
        .setName("email")
        .setDescription("Exact CM account email (use this or Discord user)")
        .setRequired(false)
        .setMaxLength(320))
      .addUserOption((option) => option
        .setName("discord_user")
        .setDescription("Linked Discord user (use this or email)")
        .setRequired(false)))
    .addSubcommand((subcommand) => subcommand
      .setName("order")
      .setDescription("Open private controls for a CM order")
      .addStringOption((option) => option
        .setName("reference")
        .setDescription("CM public reference or order UUID")
        .setRequired(true)
        .setMaxLength(128)));
}

export class CmAdminController {
  constructor(
    private readonly config: AppConfig,
    private readonly api: InternalApiClient,
    private readonly sessions = new CmSessionStore(),
    private readonly dependencies: CmAdminControllerDependencies = productionDependencies
  ) {}

  async handle(interaction: Interaction): Promise<boolean> {
    if (interaction.isChatInputCommand() && interaction.commandName === "cm") {
      await this.handleCommand(interaction);
      return true;
    }
    if (interaction.isButton() && interaction.customId.startsWith("cm:")) {
      await this.handleButton(interaction);
      return true;
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith("cm:")) {
      await this.handleModal(interaction);
      return true;
    }
    return false;
  }

  private async handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const authorization = authorize(interaction, this.config);
    if (!authorization.ok) {
      await rejectUnauthorized(interaction, authorization.message);
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "user") {
      const selector = parseUserSelector(interaction);
      if (!selector) {
        await rejectUnauthorized(interaction, "Provide exactly one user lookup: email or Discord user.");
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const overview = await this.api.fetchUserOverview(selector, 10);
        const session = this.sessions.create(interaction.user.id, overview);
        await interaction.editReply(panelPayload(buildUserPanel(session.id, overview)));
      } catch (error) {
        logger.warn("CM admin user lookup failed", { code: isInternalApiError(error) ? error.code : "UNKNOWN" });
        await interaction.editReply(panelPayload(buildNoticePanel(null, "User Lookup Failed", safeApiMessage(error))));
      }
      return;
    }

    if (subcommand === "order") {
      const selector = parseOrderSelector(interaction.options.getString("reference", true));
      if (!selector) {
        await rejectUnauthorized(interaction, "Order reference must be a CM public reference or a valid order UUID.");
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const order = await this.api.fetchOrderDetails(selector);
        const overview = await this.api.fetchUserOverview({ kind: "user_id", value: order.userId }, 10);
        if (overview.identity.userId !== order.userId) throw new Error("Order target mismatch");
        const session = this.sessions.create(interaction.user.id, overview);
        session.selectedOrder = order;
        session.shareView = { kind: "order" };
        await interaction.editReply(panelPayload(buildOrderPanel(session.id, order)));
      } catch (error) {
        logger.warn("CM admin order lookup failed", { code: isInternalApiError(error) ? error.code : "UNKNOWN" });
        await interaction.editReply(panelPayload(buildNoticePanel(null, "Order Lookup Failed", safeApiMessage(error))));
      }
    }
  }

  private async handleButton(interaction: ButtonInteraction): Promise<void> {
    const authorization = authorize(interaction, this.config);
    if (!authorization.ok) {
      await rejectUnauthorized(interaction, authorization.message);
      return;
    }

    const parts = interaction.customId.split(":");
    const domain = parts[1];
    const action = parts[2];
    const session = await requireSession(interaction, this.sessions, parts[3] ?? "");
    if (!session) return;

    if (domain === "share" && action === "current") {
      await shareCurrentPanel(interaction, session);
      return;
    }
    if (domain === "user" && action === "home") {
      session.adjustmentProposal = undefined;
      await refreshUserPanel(interaction, session, this.api);
      return;
    }
    if (domain === "user" && action === "orders") {
      const page = parseNonNegativeInteger(parts[4]) ?? 0;
      session.shareView = { kind: "orders", page };
      await interaction.update(panelPayload(buildOrdersPanel(session.id, session.overview, page)));
      return;
    }
    if (domain === "order" && action === "open") {
      const index = parseNonNegativeInteger(parts[4]);
      if (index === null) {
        await interaction.update(panelPayload(buildNoticePanel(session.id, "Invalid Order Selection", "The selected order index is invalid.", "user")));
        return;
      }
      await openOrder(interaction, session, index, this.api);
      return;
    }
    if (domain === "order" && (action === "back" || action === "refresh")) {
      await refreshSelectedOrder(interaction, session, this.api);
      return;
    }
    if (domain === "order" && action === "fulfillment") {
      await openFulfillment(interaction, session, this.api);
      return;
    }
    if (domain === "adjust" && (action === "aura" || action === "wallet")) {
      await showAdjustmentModal(interaction, session, action);
      return;
    }
    if (domain === "adjust" && action === "cancel") {
      session.adjustmentProposal = undefined;
      await refreshUserPanel(interaction, session, this.api);
      return;
    }
    if (domain === "adjust" && action === "confirm") {
      await confirmAdjustment(interaction, session, this.api, this.config, this.dependencies);
      return;
    }
    if (domain === "refund" && action === "start") {
      await showRefundModal(interaction, session);
      return;
    }
    if (domain === "refund" && action === "cancel") {
      session.refundProposal = undefined;
      await refreshSelectedOrder(interaction, session, this.api);
      return;
    }
    if (domain === "refund" && action === "confirm") {
      await confirmRefund(interaction, session, this.api, this.config, this.dependencies);
      return;
    }
    if (domain === "block" && action === "manual") {
      await interaction.update(panelPayload(buildBlockedPanel(
        session.id,
        "Manual Fulfillment Unavailable",
        "The current CM Internal Integrations API exposes fulfillment diagnostics but no manual-fulfillment mutation. No order change was made.",
        "order"
      )));
    }
  }

  private async handleModal(interaction: ModalSubmitInteraction): Promise<void> {
    const authorization = authorize(interaction, this.config);
    if (!authorization.ok) {
      await rejectUnauthorized(interaction, authorization.message);
      return;
    }
    const parts = interaction.customId.split(":");
    const domain = parts[1];
    const action = parts[2];
    const session = await requireSession(interaction, this.sessions, parts[3] ?? "");
    if (!session) return;

    if (domain === "refund" && action === "modal") {
      await handleRefundModal(interaction, session, this.api, this.dependencies);
      return;
    }
    if (domain === "adjust" && (action === "aura-modal" || action === "wallet-modal")) {
      await handleAdjustmentModal(
        interaction,
        session,
        this.api,
        action === "aura-modal" ? "aura" : "wallet",
        this.dependencies
      );
    }
  }
}
