import { EmbedBuilder } from "discord.js";
import type { AuraAmount, LeaderboardRow, LeaderboardType } from "./types";

const PAGE_SIZE = 10;
const MAX_DISPLAY_NAME_LENGTH = 30;
const CM_GREEN = 0x22c55e;

const medalByRank: Record<number, string> = {
  1: "\u{1F947}",
  2: "\u{1F948}",
  3: "\u{1F949}"
};

function truncateName(name: string, maxLength = MAX_DISPLAY_NAME_LENGTH): string {
  const characters = Array.from(name);

  if (characters.length <= maxLength) {
    return name;
  }

  return `${characters.slice(0, maxLength - 1).join("")}\u2026`;
}

function escapeDiscordMarkdown(value: string): string {
  return value.replace(/([\\`*_{}[\]()#+\-.!|>~])/g, "\\$1");
}

export function sanitizeDisplayName(rawName: string): string {
  const normalized = rawName
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const fallbackName = normalized.length > 0 ? normalized : "Unknown Discord user";
  const truncated = truncateName(fallbackName);

  return escapeDiscordMarkdown(truncated).replace(/@/g, "@\u200B");
}

function formatRankLabel(rank: number): string {
  return medalByRank[rank] ?? `**${rank}.**`;
}

export function formatAura(aura: AuraAmount): string {
  if (typeof aura === "number") {
    return new Intl.NumberFormat("en-US").format(aura);
  }

  return aura.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatLeaderboardLine(row: LeaderboardRow): string {
  const displayName = sanitizeDisplayName(row.discord_display_name);
  return `${formatRankLabel(row.rank)} **${displayName}** \u2014 **${formatAura(row.aura)}**`;
}

function buildLeaderboardDescription(rows: LeaderboardRow[], intro: string): string {
  if (rows.length === 0) {
    return `${intro}\n\nNo linked Discord users with Aura yet.`;
  }

  return `${intro}\n\n${rows.map(formatLeaderboardLine).join("\n")}`;
}

function getRowsByType(rows: LeaderboardRow[], leaderboardType: LeaderboardType): LeaderboardRow[] {
  return rows
    .filter((row) => row.leaderboard_type === leaderboardType)
    .sort((left, right) => left.rank - right.rank)
    .slice(0, PAGE_SIZE);
}

function buildLeaderboardEmbed(
  rows: LeaderboardRow[],
  leaderboardType: LeaderboardType,
  title: string,
  intro: string
): EmbedBuilder {
  const leaderboardRows = getRowsByType(rows, leaderboardType);

  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(buildLeaderboardDescription(leaderboardRows, intro))
    .setColor(CM_GREEN)
    .setFooter({ text: "Cheater's Market Aura \u2022 Updates every 5 minutes" })
    .setTimestamp(new Date());
}

export function buildLeaderboardEmbeds(rows: LeaderboardRow[]): EmbedBuilder[] {
  return [
    buildLeaderboardEmbed(
      rows,
      "lifetime",
      "Top 10 Lifetime Aura Earned",
      "Top linked Discord users ranked by lifetime earned Aura."
    ),
    buildLeaderboardEmbed(
      rows,
      "available",
      "Top 10 Available Aura",
      "Top linked Discord users ranked by available Aura balance."
    )
  ];
}
