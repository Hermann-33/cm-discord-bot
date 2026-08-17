import type { AppConfig } from "../config/env";

export type AdminInteractionIdentity = {
  guildId: string | null;
  channelId: string | null;
  user: { id: string };
};

export type AdminAuthorizationResult =
  | { ok: true }
  | { ok: false; message: string };

export function authorizeAdminInteraction(
  interaction: AdminInteractionIdentity,
  config: AppConfig
): AdminAuthorizationResult {
  if (!interaction.guildId) {
    return { ok: false, message: "CM admin controls are not available in DMs." };
  }
  if (interaction.guildId !== config.discordGuildId) {
    return { ok: false, message: "CM admin controls are not available in this server." };
  }
  if (config.botAdminUserIds.length === 0) {
    return { ok: false, message: "CM admin controls are not configured." };
  }
  if (!config.botAdminUserIds.includes(interaction.user.id)) {
    return { ok: false, message: "You are not authorized to use CM admin controls." };
  }
  return { ok: true };
}
