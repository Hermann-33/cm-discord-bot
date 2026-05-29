import { EmbedBuilder, type Message, type MessageMentionOptions } from "discord.js";
import type { AppConfig } from "../config/env";
import { logger, sanitizeError } from "../logger/logger";
import {
  AURA_EMOJI,
  CM_GREEN,
  formatAuraLabel,
  sanitizeDisplayName
} from "../leaderboard/leaderboardEmbeds";
import { SupabaseLeaderboardClient } from "../leaderboard/supabaseLeaderboardClient";
import type { UserAuraRow } from "../leaderboard/types";

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

async function replyWithEmbedSafely(message: Message, embed: EmbedBuilder): Promise<void> {
  await message.reply({
    embeds: [embed],
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

function buildAuraBalanceEmbed(userAura: UserAuraRow): EmbedBuilder {
  const displayName = sanitizeDisplayName(userAura.discord_display_name);

  return new EmbedBuilder()
    .setTitle(`${displayName}'s Aura`)
    .setDescription("Your linked Cheater's Market Aura balance.")
    .setColor(CM_GREEN)
    .addFields(
      {
        name: "Available",
        value: `${AURA_EMOJI} ${formatAuraLabel(userAura.available_aura)}`,
        inline: true
      },
      {
        name: "Lifetime Earned",
        value: `${AURA_EMOJI} ${formatAuraLabel(userAura.lifetime_earned_aura)}`,
        inline: true
      }
    )
    .setFooter({ text: "Cheater's Market Aura" });
}

export async function handleAuraCommand(
  message: Message,
  config: AppConfig,
  leaderboardClient: SupabaseLeaderboardClient
): Promise<void> {
  if (message.author.bot) {
    return;
  }

  if (!isAuraCommand(message.content)) {
    return;
  }

  if (message.guildId !== config.discordGuildId) {
    return;
  }

  if (message.channelId === config.discordAuraCommandBlockedChannelId) {
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

    await replyWithEmbedSafely(message, buildAuraBalanceEmbed(userAura));
  } catch (error) {
    logger.error("sanitized command failure", sanitizeError(error));
    await replyWithFallbackLogging(message, "Aura is unavailable right now. Please try again later.");
  }
}
