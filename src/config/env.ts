import "dotenv/config";
import { z } from "zod";

const requiredString = z.string().trim().min(1);

const optionalMessageId = z.preprocess((value) => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().optional());

const envSchema = z.object({
  DISCORD_BOT_TOKEN: requiredString,
  DISCORD_LEADERBOARD_CHANNEL_ID: requiredString,
  DISCORD_LEADERBOARD_MESSAGE_ID: optionalMessageId,
  DISCORD_COMMAND_CHANNEL_ID: requiredString,
  DISCORD_CLIENT_ID: requiredString,
  DISCORD_GUILD_ID: requiredString,
  SUPABASE_URL: requiredString.url(),
  SUPABASE_SERVICE_ROLE_KEY: requiredString
});

export type AppConfig = {
  discordBotToken: string;
  discordLeaderboardChannelId: string;
  discordLeaderboardMessageId?: string;
  discordCommandChannelId: string;
  discordClientId: string;
  discordGuildId: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
};

export function loadConfig(): AppConfig {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const invalidKeys = [
      ...new Set(parsed.error.issues.map((issue) => issue.path.join(".") || "unknown"))
    ];

    throw new Error(`Missing or invalid environment variables: ${invalidKeys.join(", ")}`);
  }

  return {
    discordBotToken: parsed.data.DISCORD_BOT_TOKEN,
    discordLeaderboardChannelId: parsed.data.DISCORD_LEADERBOARD_CHANNEL_ID,
    discordLeaderboardMessageId: parsed.data.DISCORD_LEADERBOARD_MESSAGE_ID,
    discordCommandChannelId: parsed.data.DISCORD_COMMAND_CHANNEL_ID,
    discordClientId: parsed.data.DISCORD_CLIENT_ID,
    discordGuildId: parsed.data.DISCORD_GUILD_ID,
    supabaseUrl: parsed.data.SUPABASE_URL,
    supabaseServiceRoleKey: parsed.data.SUPABASE_SERVICE_ROLE_KEY
  };
}
