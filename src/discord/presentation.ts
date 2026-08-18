import type { UserOverviewData } from "../api/schemas";

const discordSnowflakePattern = /^\d{5,32}$/;

export function escapeDiscordText(value: string | null | undefined, maxLength = 500): string {
  if (!value) return "—";
  return value
    .replace(/\\/g, "\\\\")
    .replace(/([`*_{}\[\]()<>#+\-.!|])/g, "\\$1")
    .replace(/@/g, "@\u200b")
    .slice(0, maxLength);
}

export function formatDiscordTimestamp(
  value: string | null | undefined,
  style: "f" | "R"
): string {
  if (!value) return "—";
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return "—";
  return `<t:${Math.floor(milliseconds / 1_000)}:${style}>`;
}

export function formatDiscordTimestampPair(value: string | null | undefined): string {
  if (!value) return "—";
  const absolute = formatDiscordTimestamp(value, "f");
  if (absolute === "—") return absolute;
  return `${absolute} · ${formatDiscordTimestamp(value, "R")}`;
}

export function discordUserMention(userId: string | null | undefined): string {
  if (!userId || !discordSnowflakePattern.test(userId)) return "—";
  return `<@${userId}>`;
}

export function findDiscordIdentity(overview: UserOverviewData) {
  return overview.identity.externalIdentities.find((identity) => identity.provider === "discord") ?? null;
}

export function formatDiscordIdentity(overview: UserOverviewData): string {
  const identity = findDiscordIdentity(overview);
  if (!identity) return "Status: **Not linked**";

  const lines = [
    "Status: **Linked**",
    `User: ${discordUserMention(identity.externalUserId)}`
  ];
  if (identity.username) lines.push(`Username: ${escapeDiscordText(identity.username)}`);
  if (identity.displayName) lines.push(`Display name: ${escapeDiscordText(identity.displayName)}`);
  lines.push(`Linked: ${formatDiscordTimestampPair(identity.linkedAt)}`);
  return lines.join("\n");
}
