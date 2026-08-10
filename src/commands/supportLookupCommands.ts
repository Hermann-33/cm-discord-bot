import {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction
} from "discord.js";
import type { AppConfig } from "../config/env";
import { safeAllowedMentions } from "../discord/leaderboardMessage";
import {
  InternalDiscordApiClient,
  discordMessageForInternalApiError
} from "../internalApi/client";
import type {
  OrderLookupResponse,
  OrderSelector,
  UserLookupResponse,
  UserSelector
} from "../internalApi/schemas";
import { logger, sanitizeError } from "../logger/logger";

export const SUPPORT_LOOKUP_COMMAND_NAME = "cm-support";

const USER_SELECTOR_CHOICES = [
  { name: "CM user ID", value: "user_id" },
  { name: "Email", value: "email" },
  { name: "Discord user ID", value: "discord_user_id" }
] as const;

const ORDER_SELECTOR_CHOICES = [
  { name: "Order ID", value: "order_id" },
  { name: "Public order reference", value: "public_ref" }
] as const;

export function buildSupportLookupCommand() {
  return new SlashCommandBuilder()
    .setName(SUPPORT_LOOKUP_COMMAND_NAME)
    .setDescription("Use limited Cheater's Market support lookups.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("user")
        .setDescription("Look up a limited user support record.")
        .addStringOption((option) =>
          option
            .setName("selector")
            .setDescription("The kind of exact user identifier.")
            .setRequired(true)
            .addChoices(...USER_SELECTOR_CHOICES)
        )
        .addStringOption((option) =>
          option.setName("value").setDescription("The exact user identifier.").setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("order")
        .setDescription("Look up a limited order support record.")
        .addStringOption((option) =>
          option
            .setName("selector")
            .setDescription("The kind of exact order identifier.")
            .setRequired(true)
            .addChoices(...ORDER_SELECTOR_CHOICES)
        )
        .addStringOption((option) =>
          option.setName("value").setDescription("The exact order identifier.").setRequired(true)
        )
    )
    .toJSON();
}

function hasSupportPermission(interaction: ChatInputCommandInteraction): boolean {
  return Boolean(
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
      interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
  );
}

function safeText(value: string | null): string {
  if (!value) return "Not available";
  return value.replace(/@/g, "@\u200b").replace(/[`*_~|>]/g, "\\$&").slice(0, 200);
}

function formatCents(value: number, currency: string): string {
  return `${currency.toUpperCase()} ${(value / 100).toFixed(2)}`;
}

function buildUserEmbed(data: UserLookupResponse): EmbedBuilder {
  const user = data.user;
  return new EmbedBuilder()
    .setTitle("CM user support record")
    .addFields(
      { name: "User ID", value: user.userId },
      { name: "Email", value: safeText(user.maskedEmail), inline: true },
      { name: "Orders", value: String(user.counts.orders), inline: true },
      { name: "Banned", value: user.isBanned ? "Yes" : "No", inline: true },
      {
        name: "Discord link",
        value: user.discordLink
          ? `${user.discordLink.discordUserId} (${safeText(user.discordLink.globalName ?? user.discordLink.username)})`
          : "Not linked"
      },
      {
        name: "Wallet",
        value: user.wallet
          ? formatCents(user.wallet.balanceCents, user.wallet.currency)
          : "Not available",
        inline: true
      },
      {
        name: "Aura",
        value: user.aura
          ? `${user.aura.availableAura} available / ${user.aura.lifetimeAura} lifetime`
          : "Not available",
        inline: true
      }
    );
}

function buildOrderEmbed(data: OrderLookupResponse): EmbedBuilder {
  const order = data.order;
  const item =
    order.purchaseKind === "product"
      ? order.productSlug ?? order.licenseOptionId
      : order.accountName ?? order.accountVariantLabel ?? order.accountSlug;
  return new EmbedBuilder()
    .setTitle("CM order support record")
    .addFields(
      { name: "Order ID", value: order.orderId },
      { name: "Public reference", value: safeText(order.publicRef), inline: true },
      { name: "Status", value: safeText(order.status), inline: true },
      { name: "Customer", value: safeText(order.maskedCustomerEmail), inline: true },
      { name: "Kind", value: order.purchaseKind, inline: true },
      { name: "Item", value: safeText(item), inline: true },
      { name: "Quantity", value: String(order.quantity), inline: true },
      { name: "Amount", value: formatCents(order.amountCents, order.currency), inline: true },
      {
        name: "Fulfillment rows",
        value: String(
          order.fulfillment.productDeliveries.length +
            order.fulfillment.accountDeliveries.length
        ),
        inline: true
      }
    );
}

async function replyEphemeral(
  interaction: ChatInputCommandInteraction,
  content: string
): Promise<void> {
  await interaction.reply({
    content,
    flags: MessageFlags.Ephemeral,
    allowedMentions: safeAllowedMentions
  });
}

function normalizeUserSelector(kind: string, value: string): UserSelector {
  const trimmed = value.trim();
  switch (kind) {
    case "user_id":
      return { kind, value: trimmed.toLowerCase() };
    case "email":
      return { kind, value: trimmed.toLowerCase() };
    case "discord_user_id":
      return { kind, value: trimmed };
    default:
      throw new Error("Invalid user selector kind");
  }
}

function normalizeOrderSelector(kind: string, value: string): OrderSelector {
  const trimmed = value.trim();
  switch (kind) {
    case "order_id":
      return { kind, value: trimmed.toLowerCase() };
    case "public_ref":
      return { kind, value: trimmed.toUpperCase() };
    default:
      throw new Error("Invalid order selector kind");
  }
}

export async function handleSupportLookupCommand(
  interaction: ChatInputCommandInteraction,
  config: AppConfig,
  client: InternalDiscordApiClient
): Promise<void> {
  if (interaction.commandName !== SUPPORT_LOOKUP_COMMAND_NAME) {
    return;
  }

  if (interaction.guildId !== config.discordGuildId) {
    await replyEphemeral(interaction, "This command is not available in this server.");
    return;
  }

  if (interaction.channelId !== config.discordCommandChannelId) {
    await replyEphemeral(interaction, "Use this command in the configured bot command channel.");
    return;
  }

  if (!hasSupportPermission(interaction)) {
    await replyEphemeral(interaction, "You do not have permission to use this support command.");
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const kind = interaction.options.getString("selector", true);
    const value = interaction.options.getString("value", true);
    const subcommand = interaction.options.getSubcommand(true);
    const data =
      subcommand === "user"
        ? await client.lookupUser(interaction.user.id, normalizeUserSelector(kind, value))
        : await client.lookupOrder(interaction.user.id, normalizeOrderSelector(kind, value));

    await interaction.editReply({
      embeds: [
        subcommand === "user"
          ? buildUserEmbed(data as UserLookupResponse)
          : buildOrderEmbed(data as OrderLookupResponse)
      ],
      allowedMentions: safeAllowedMentions
    });
  } catch (error) {
    logger.error("sanitized support lookup failure", sanitizeError(error));
    await interaction.editReply({
      content: discordMessageForInternalApiError(error),
      allowedMentions: safeAllowedMentions
    });
  }
}
