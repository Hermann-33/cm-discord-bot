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
import type { AppConfig } from "../config/env";
import { postRefundAudit } from "../discord/adminAudit";
import { logger } from "../logger";
import { confirmRefund, handleRefundModal, showRefundModal, type RefundDependencies } from "./cmRefund";
import { CmSessionStore } from "./cmSessions";
import { authorize, parseNonNegativeInteger, rejectUnauthorized, requireSession, safeApiMessage } from "./cmSupport";
import {
  buildBlockedPanel,
  buildNoticePanel,
  buildOrdersPanel,
  buildUserPanel,
  panelPayload
} from "./cmUi";
import { openFulfillment, openOrder, refreshSelectedOrder, refreshUserPanel } from "./cmUserActions";

export type CmAdminControllerDependencies = RefundDependencies;

const productionDependencies: CmAdminControllerDependencies = {
  nowMs: Date.now,
  idempotencyKey: randomUUID,
  postRefundAudit
};

export function buildCmCommand() {
  return new SlashCommandBuilder()
    .setName("cm")
    .setDescription("Private Cheater's Market admin controls")
    .addSubcommand((subcommand) => subcommand
      .setName("user")
      .setDescription("Open private controls for a CM user")
      .addStringOption((option) => option
        .setName("email")
        .setDescription("Exact CM account email")
        .setRequired(true)
        .setMaxLength(320)));
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

    if (interaction.options.getSubcommand() !== "user") return;
    const email = interaction.options.getString("email", true).trim();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const overview = await this.api.fetchUserOverview({ kind: "email", value: email }, 10);
      const session = this.sessions.create(interaction.user.id, overview);
      await interaction.editReply(panelPayload(buildUserPanel(session.id, overview)));
    } catch (error) {
      logger.warn("CM admin user lookup failed", { code: isInternalApiError(error) ? error.code : "UNKNOWN" });
      await interaction.editReply(panelPayload(buildNoticePanel(null, "User Lookup Failed", safeApiMessage(error))));
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

    if (domain === "user" && action === "home") {
      await refreshUserPanel(interaction, session, this.api);
      return;
    }
    if (domain === "user" && action === "orders") {
      const page = parseNonNegativeInteger(parts[4]) ?? 0;
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
    if (domain === "block") {
      const blockedAction = action ?? "operation";
      const returnTo = blockedAction === "manual" ? "order" : "user";
      const message = blockedAction === "manual"
        ? "The current CM Internal Integrations API exposes fulfillment diagnostics but no manual-fulfillment mutation. No order change was made."
        : blockedAction === "aura"
          ? "Aura adjustment execution is intentionally blocked until the ADR-0004 backend confirmation contract is resolved. No Aura change was made."
          : "Wallet adjustment is intentionally blocked until the Aura mutation path and stricter wallet controls are proven. No wallet change was made.";
      await interaction.update(panelPayload(buildBlockedPanel(
        session.id,
        `${blockedAction === "manual" ? "Manual Fulfillment" : blockedAction === "aura" ? "Aura Adjustment" : "Wallet Adjustment"} Unavailable`,
        message,
        returnTo
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
    if (parts[1] !== "refund" || parts[2] !== "modal") return;
    const session = await requireSession(interaction, this.sessions, parts[3] ?? "");
    if (!session) return;
    await handleRefundModal(interaction, session, this.api, this.dependencies);
  }
}
