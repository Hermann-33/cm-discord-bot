import {
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction
} from "discord.js";
import type { AppConfig } from "../config/env";
import { safeAllowedMentions } from "../discord/leaderboardMessage";
import { logger, sanitizeError } from "../logger/logger";
import { LeaderboardUpdater } from "../leaderboard/leaderboardUpdater";

const REFRESH_LEADERBOARD_COMMAND_NAME = "refresh-leaderboard";

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
  leaderboardUpdater: LeaderboardUpdater
): Promise<void> {
  if (interaction.commandName !== REFRESH_LEADERBOARD_COMMAND_NAME) {
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

  if (!hasRefreshPermission(interaction)) {
    await replyEphemeral(interaction, "You do not have permission to refresh the leaderboard.");
    return;
  }

  if (!config.discordLeaderboardMessageId) {
    await replyEphemeral(interaction, "Leaderboard message ID is not configured.");
    return;
  }

  await interaction.deferReply({
    flags: MessageFlags.Ephemeral
  });

  try {
    const refreshResult = await leaderboardUpdater.refreshNow({
      failOnError: true,
      context: {
        mode: "manual",
        actorDiscordUserId: interaction.user.id,
        eventId: interaction.id,
        source: "interaction"
      }
    });

    if (refreshResult === "already-running") {
      await interaction.editReply("Leaderboard refresh already in progress.");
      return;
    }

    await interaction.editReply("Leaderboard refreshed.");
  } catch (error) {
    logger.error("sanitized slash refresh failure", sanitizeError(error));
    await interaction.editReply("Leaderboard refresh failed. Check bot logs.");
  }
}
