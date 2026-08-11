import {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
  type MessageCreateOptions,
  type MessageEditOptions
} from "discord.js";
import type { LeaderboardEntry, LeaderboardType } from "./types";

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
  return characters.length <= maxLength
    ? name
    : `${characters.slice(0, maxLength - 1).join("")}\u2026`;
}

function escapeDiscordMarkdown(value: string): string {
  return value.replace(/([\\`*_{}[\]()#+\-.!|>~])/g, "\\$1");
}

export function sanitizeDisplayName(
  rawName: string,
  maxLength = MAX_DISPLAY_NAME_LENGTH
): string {
  const normalized = rawName.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  const fallbackName = normalized.length > 0 ? normalized : "Unknown Discord user";
  return escapeDiscordMarkdown(truncateName(fallbackName, maxLength)).replace(/@/g, "@\u200B");
}

export function formatAura(aura: number | string | null | undefined): string {
  if (aura === null || aura === undefined) return "0";
  if (typeof aura === "number") {
    return Number.isFinite(aura)
      ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(aura)
      : "0";
  }
  const normalized = aura.trim();
  return /^\d+$/.test(normalized)
    ? normalized.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
    : "0";
}

export function formatAuraLabel(aura: number | string | null | undefined): string {
  return `\`${formatAura(aura).padStart(AURA_LABEL_WIDTH, " ")}\``;
}

function formatLeaderboardRow(row: LeaderboardEntry): string {
  const rank = `\`${String(row.rank).padStart(RANK_LABEL_WIDTH, " ")}\``;
  const name = sanitizeDisplayName(row.displayName, LEADERBOARD_DISPLAY_NAME_LENGTH);
  const medal = medalByRank[row.rank] ? ` ${medalByRank[row.rank]}` : "";
  const formatted = `${rank} ${formatAuraLabel(row.aura)} ${name}${medal}`;
  return row.rank === 1 ? `### ${formatted}` : formatted;
}

function getRowsByType(
  rows: LeaderboardEntry[],
  leaderboardType: LeaderboardType
): LeaderboardEntry[] {
  return rows
    .filter((row) => row.leaderboardType === leaderboardType)
    .sort((left, right) => left.rank - right.rank)
    .slice(0, PAGE_SIZE);
}

function buildRowsText(rows: LeaderboardEntry[]): string {
  return rows.length === 0 ? "No linked users yet." : rows.map(formatLeaderboardRow).join("\n");
}

function buildBoard(
  rows: LeaderboardEntry[],
  leaderboardType: LeaderboardType,
  title: string,
  intro: string
): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(CM_GREEN)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${title}\n\n${intro}`),
      new TextDisplayBuilder().setContent(buildRowsText(getRowsByType(rows, leaderboardType)))
    );
}

function buildComponents(rows: LeaderboardEntry[], nowMs: number) {
  const updatedAtUnix = Math.floor(nowMs / 1_000);
  return [
    new TextDisplayBuilder().setContent(`## ${AURA_EMOJI} Cheater's Market Aura Leaderboard`),
    buildBoard(
      rows,
      "lifetime",
      "Top 10 Lifetime Aura Earned",
      "Top linked Discord users ranked by lifetime earned Aura."
    ),
    new SeparatorBuilder().setDivider(true),
    buildBoard(
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
  rows: LeaderboardEntry[],
  nowMs = Date.now()
): Omit<MessageCreateOptions, "allowedMentions"> {
  return {
    flags: MessageFlags.IsComponentsV2,
    components: buildComponents(rows, nowMs)
  };
}

export function buildLeaderboardEditPayload(
  rows: LeaderboardEntry[],
  nowMs = Date.now()
): Omit<MessageEditOptions, "allowedMentions"> {
  return {
    flags: MessageFlags.IsComponentsV2,
    components: buildComponents(rows, nowMs),
    content: null,
    embeds: []
  };
}
