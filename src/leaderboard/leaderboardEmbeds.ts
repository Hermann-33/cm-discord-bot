import {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
  type MessageCreateOptions,
  type MessageEditOptions
} from "discord.js";
import type { AuraAmount, LeaderboardRow, LeaderboardType } from "./types";

const PAGE_SIZE = 10;
const MAX_DISPLAY_NAME_LENGTH = 30;
const LEADERBOARD_DISPLAY_NAME_LENGTH = 18;
const RANK_LABEL_WIDTH = 2;
const AURA_LABEL_WIDTH = 9;
export const CM_GREEN = 0x22c55e;
export const AURA_EMOJI = "<:aura:1509816131282669688>";

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

export function sanitizeDisplayName(
  rawName: string,
  maxLength = MAX_DISPLAY_NAME_LENGTH
): string {
  const normalized = rawName
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const fallbackName = normalized.length > 0 ? normalized : "Unknown Discord user";
  const truncated = truncateName(fallbackName, maxLength);

  return escapeDiscordMarkdown(truncated).replace(/@/g, "@\u200B");
}

function formatRankLabel(rank: number): string {
  return `\`${String(rank).padStart(RANK_LABEL_WIDTH, " ")}\``;
}

function formatRankSuffix(rank: number): string {
  const medal = medalByRank[rank];
  return medal ? ` ${medal}` : "";
}

export function formatAura(aura: AuraAmount | null | undefined): string {
  if (aura === null || aura === undefined) {
    return "0";
  }

  if (typeof aura === "number") {
    return Number.isFinite(aura)
      ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(aura)
      : "0";
  }

  const normalized = aura.trim();

  if (!/^\d+$/.test(normalized)) {
    return "0";
  }

  return normalized.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatAuraLabel(aura: AuraAmount | null | undefined): string {
  return `\`${formatAura(aura).padStart(AURA_LABEL_WIDTH, " ")}\``;
}

function formatLeaderboardUserName(row: LeaderboardRow): string {
  return sanitizeDisplayName(row.discord_display_name, LEADERBOARD_DISPLAY_NAME_LENGTH);
}

function formatLeaderboardRow(row: LeaderboardRow): string {
  const formattedRow = `${formatRankLabel(row.rank)} ${formatAuraLabel(
    row.aura
  )} ${formatLeaderboardUserName(row)}${formatRankSuffix(row.rank)}`;

  return row.rank === 1 ? `### ${formattedRow}` : formattedRow;
}

function buildLeaderboardRowsText(rows: LeaderboardRow[]): string {
  if (rows.length === 0) {
    return "No linked users yet.";
  }

  return rows.map(formatLeaderboardRow).join("\n");
}

function getRowsByType(rows: LeaderboardRow[], leaderboardType: LeaderboardType): LeaderboardRow[] {
  return rows
    .filter((row) => row.leaderboard_type === leaderboardType)
    .sort((left, right) => left.rank - right.rank)
    .slice(0, PAGE_SIZE);
}

function buildLeaderboardBoard(
  rows: LeaderboardRow[],
  leaderboardType: LeaderboardType,
  title: string,
  intro: string
): ContainerBuilder {
  const leaderboardRows = getRowsByType(rows, leaderboardType);

  return new ContainerBuilder()
    .setAccentColor(CM_GREEN)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${title}\n\n${intro}`),
      new TextDisplayBuilder().setContent(buildLeaderboardRowsText(leaderboardRows))
    );
}

function buildLeaderboardComponents(rows: LeaderboardRow[]) {
  const updatedAtUnix = Math.floor(Date.now() / 1000);

  return [
    new TextDisplayBuilder().setContent(
      `## ${AURA_EMOJI} Cheater's Market Aura Leaderboard`
    ),
    buildLeaderboardBoard(
      rows,
      "lifetime",
      "Top 10 Lifetime Aura Earned",
      "Top linked Discord users ranked by lifetime earned Aura."
    ),
    new SeparatorBuilder().setDivider(true),
    buildLeaderboardBoard(
      rows,
      "available",
      "Top 10 Available Aura",
      "Top linked Discord users ranked by available Aura balance."
    ),
    new TextDisplayBuilder().setContent(
      `-# Updated <t:${updatedAtUnix}:R> \u2022 Updates every 5 minutes`
    )
  ];
}

export function buildLeaderboardCreatePayload(
  rows: LeaderboardRow[]
): Omit<MessageCreateOptions, "allowedMentions"> {
  return {
    flags: MessageFlags.IsComponentsV2,
    components: buildLeaderboardComponents(rows)
  };
}

export function buildLeaderboardEditPayload(
  rows: LeaderboardRow[]
): Omit<MessageEditOptions, "allowedMentions"> {
  return {
    flags: MessageFlags.IsComponentsV2,
    components: buildLeaderboardComponents(rows),
    content: null,
    embeds: []
  };
}
