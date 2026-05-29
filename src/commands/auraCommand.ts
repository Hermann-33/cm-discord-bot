import type { Message, MessageMentionOptions } from "discord.js";
import type { AppConfig } from "../config/env";
import { logger, sanitizeError } from "../logger/logger";
import { formatAura, sanitizeDisplayName } from "../leaderboard/leaderboardEmbeds";
import { SupabaseLeaderboardClient } from "../leaderboard/supabaseLeaderboardClient";

const commandAllowedMentions: MessageMentionOptions = {
  parse: [],
  repliedUser: false
};

function normalizeCommand(content: string): string {
  return content.trim().replace(/\s+/g, " ").toLowerCase();
}

function isAuraCommand(content: string): boolean {
  return normalizeCommand(content) === "cm aura";
}

async function replySafely(message: Message, content: string): Promise<void> {
  await message.reply({
    content,
    allowedMentions: commandAllowedMentions
  });
}

async function replyWithFallbackLogging(message: Message, content: string): Promise<void> {
  try {
    await replySafely(message, content);
  } catch (error) {
    logger.error("sanitized command reply failure", sanitizeError(error));
  }
}

export async function handleAuraCommand(
  message: Message,
  config: AppConfig,
  leaderboardClient: SupabaseLeaderboardClient
): Promise<void> {
  if (message.author.bot) {
    return;
  }

  if (message.channelId !== config.discordCommandChannelId) {
    return;
  }

  if (!isAuraCommand(message.content)) {
    return;
  }

  try {
    const userAura = await leaderboardClient.fetchUserAura(message.author.id);

    if (!userAura) {
      await replySafely(
        message,
        "No linked Cheater's Market account was found for your Discord user. Link Discord in your dashboard, then try again."
      );
      return;
    }

    const displayName = sanitizeDisplayName(userAura.discord_display_name);
    await replySafely(
      message,
      `**${displayName}**\nAvailable Aura: \`${formatAura(
        userAura.available_aura
      )}\`\nLifetime Aura Earned: \`${formatAura(userAura.lifetime_earned_aura)}\``
    );
  } catch (error) {
    logger.error("sanitized command failure", sanitizeError(error));
    await replyWithFallbackLogging(message, "Aura is unavailable right now. Please try again later.");
  }
}
