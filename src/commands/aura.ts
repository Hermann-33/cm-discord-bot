import { EmbedBuilder, type Message } from "discord.js";
import { isInternalApiError } from "../api/errors";
import type { AppConfig } from "../config/env";
import { safeAllowedMentions } from "../discord/safeMessages";
import { AURA_EMOJI, CM_GREEN, formatAuraLabel, sanitizeDisplayName } from "../leaderboard/format";
import type { AuraBalance, AuraReadClient } from "../leaderboard/types";
import { logger, sanitizeError } from "../logger";

export const AURA_NOT_LINKED_MESSAGE =
  "No linked Cheater's Market account was found for your Discord user. Link Discord in your dashboard, then try again.";
export const AURA_UNAVAILABLE_MESSAGE = "Aura is unavailable right now. Please try again later.";

export function normalizeAuraCommand(content: string): string {
  return content.trim().replace(/\s+/g, " ").toLowerCase();
}

export function isAuraCommand(content: string): boolean {
  return normalizeAuraCommand(content) === "cm aura";
}

async function replySafely(message: Message, content: string): Promise<void> {
  await message.reply({ content, allowedMentions: safeAllowedMentions });
}

async function replyWithFallbackLogging(message: Message, content: string): Promise<void> {
  try {
    await replySafely(message, content);
  } catch (error) {
    logger.error("sanitized command reply failure", sanitizeError(error));
  }
}

export function buildAuraBalanceEmbed(aura: AuraBalance): EmbedBuilder {
  const displayName = sanitizeDisplayName(aura.displayName);
  return new EmbedBuilder()
    .setTitle(`${displayName}'s Aura`)
    .setDescription("Your linked Cheater's Market Aura balance.")
    .setColor(CM_GREEN)
    .addFields(
      {
        name: "Available",
        value: `${AURA_EMOJI} ${formatAuraLabel(aura.availableAura)}`,
        inline: true
      },
      {
        name: "Lifetime Earned",
        value: `${AURA_EMOJI} ${formatAuraLabel(aura.lifetimeAura)}`,
        inline: true
      }
    )
    .setFooter({ text: "Cheater's Market Aura" });
}

async function replyNotLinked(message: Message): Promise<void> {
  try {
    await replySafely(message, AURA_NOT_LINKED_MESSAGE);
  } catch (error) {
    logger.error("sanitized command failure", sanitizeError(error));
    await replyWithFallbackLogging(message, AURA_UNAVAILABLE_MESSAGE);
  }
}

export async function handleAuraCommand(
  message: Message,
  config: AppConfig,
  auraClient: AuraReadClient
): Promise<void> {
  if (message.author.bot) return;
  if (!isAuraCommand(message.content)) return;
  if (message.guildId !== config.discordGuildId) return;
  if (message.channelId === config.discordAuraCommandBlockedChannelId) return;

  try {
    const aura = await auraClient.lookupAuraByDiscordId(message.author.id);
    if (!aura) {
      await replySafely(message, AURA_UNAVAILABLE_MESSAGE);
      return;
    }

    await message.reply({
      embeds: [buildAuraBalanceEmbed(aura)],
      allowedMentions: safeAllowedMentions
    });
  } catch (error) {
    if (isInternalApiError(error, "NOT_FOUND")) {
      await replyNotLinked(message);
      return;
    }

    logger.error("sanitized command failure", sanitizeError(error));
    await replyWithFallbackLogging(message, AURA_UNAVAILABLE_MESSAGE);
  }
}
