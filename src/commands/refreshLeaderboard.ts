import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction
} from "discord.js";
import type { AppConfig } from "../config/env";
import { safeAllowedMentions } from "../discord/safeMessages";
import type { LeaderboardRefreshController } from "../leaderboard/service";
import { logger, sanitizeError } from "../logger";

export const REFRESH_LEADERBOARD_COMMAND_NAME = "refresh-leaderboard";

export function buildRefreshLeaderboardCommand() {
  return new SlashCommandBuilder()
    .setName(REFRESH_LEADERBOARD_COMMAND_NAME)
    .setDescription("Force refresh the Aura leaderboard message.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON();
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

function hasRefreshPermission(interaction: ChatInputCommandInteraction): boolean {
  return Boolean(
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
      interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
  );
}

export async function handleRefreshLeaderboardCommand(
  interaction: ChatInputCommandInteraction,
  config: AppConfig,
  leaderboard: LeaderboardRefreshController
): Promise<void> {
  if (interaction.commandName !== REFRESH_LEADERBOARD_COMMAND_NAME) return;

  if (interaction.guildId !== config.discordGuildId) {
    await replyEphemeral(interaction, "This command is not available in this server.");
    return;
  }

  if (interaction.channelId !== config.discordCommandChannelId) {
    await replyEphemeral(interaction, "Use this command in the configured bot command channel.");
    return;
  }

  if (!hasRefreshPermission(interaction)) {
    await replyEphemeral(interaction, "You do not have permission to refresh the leaderboard.");
    return;
  }

  if (!config.discordLeaderboardMessageId) {
    await replyEphemeral(interaction, "Leaderboard message ID is not configured.");
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const result = await leaderboard.refreshNow({ failOnError: true });
    if (result === "already-running") {
      await interaction.editReply("Leaderboard refresh already in progress.");
      return;
    }
    await interaction.editReply("Leaderboard refreshed.");
  } catch (error) {
    logger.error("sanitized slash refresh failure", sanitizeError(error));
    await interaction.editReply("Leaderboard refresh failed. Check bot logs.");
  }
}
