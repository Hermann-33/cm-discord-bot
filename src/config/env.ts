import { z } from "zod";

const idPattern = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const snowflakePattern = /^\d{5,32}$/;
const standardBase64Pattern = /^[A-Za-z0-9+/]+={0,2}$/;

const trimmedRequiredString = z.string().transform((value) => value.trim()).pipe(z.string().min(1));
const snowflake = trimmedRequiredString.pipe(z.string().regex(snowflakePattern));
const integrationId = trimmedRequiredString.pipe(z.string().regex(idPattern));

const optionalSnowflake = z.preprocess((value) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}, z.string().regex(snowflakePattern).optional());

const optionalSnowflakeList = z.preprocess((value) => {
  if (typeof value !== "string") return undefined;
  const ids = value.split(",").map((item) => item.trim()).filter(Boolean);
  return ids.length === 0 ? undefined : ids;
}, z.array(z.string().regex(snowflakePattern)).min(1).max(100)
  .refine((ids) => new Set(ids).size === ids.length, "Duplicate IDs are not allowed")
  .optional());

function isOriginOnlyHttps(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function isCanonicalSecret(value: string): boolean {
  if (!standardBase64Pattern.test(value)) return false;
  const decoded = Buffer.from(value, "base64");
  return decoded.length >= 32 && decoded.toString("base64") === value;
}

const timeoutSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.coerce.number().int().min(1_000).max(15_000).default(5_000)
);

const envSchema = z.object({
  DISCORD_BOT_TOKEN: trimmedRequiredString,
  DISCORD_CLIENT_ID: snowflake,
  DISCORD_GUILD_ID: snowflake,
  DISCORD_LEADERBOARD_CHANNEL_ID: snowflake,
  DISCORD_COMMAND_CHANNEL_ID: snowflake,
  DISCORD_AURA_COMMAND_BLOCKED_CHANNEL_ID: snowflake,
  DISCORD_LEADERBOARD_MESSAGE_ID: optionalSnowflake,
  BOT_ADMIN_USER_IDS: optionalSnowflakeList,
  BOT_ADMIN_COMMAND_CHANNEL_ID: optionalSnowflake,
  BOT_AUDIT_LOG_CHANNEL_ID: optionalSnowflake,
  CM_INTERNAL_INTEGRATIONS_API_ORIGIN: trimmedRequiredString.refine(isOriginOnlyHttps),
  CM_INTERNAL_INTEGRATIONS_API_CLIENT_ID: integrationId,
  CM_INTERNAL_INTEGRATIONS_API_KEY_ID: integrationId,
  CM_INTERNAL_INTEGRATIONS_API_HMAC_SECRET_BASE64: z.string().refine(isCanonicalSecret),
  CM_INTERNAL_INTEGRATIONS_API_TIMEOUT_MS: timeoutSchema
});

export type InternalApiConfig = {
  origin: string;
  clientId: string;
  keyId: string;
  hmacSecret: Buffer;
  timeoutMs: number;
};

export type AppConfig = {
  discordBotToken: string;
  discordClientId: string;
  discordGuildId: string;
  discordLeaderboardChannelId: string;
  discordCommandChannelId: string;
  discordAuraCommandBlockedChannelId: string;
  discordLeaderboardMessageId?: string;
  botAdminUserIds: readonly string[];
  botAdminCommandChannelId?: string;
  botAuditLogChannelId?: string;
  internalApi: InternalApiConfig;
};

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(environment);

  if (!parsed.success) {
    const invalidKeys = [
      ...new Set(parsed.error.issues.map((issue) => issue.path.join(".") || "unknown"))
    ];
    throw new Error(`Missing or invalid environment variables: ${invalidKeys.join(", ")}`);
  }

  return {
    discordBotToken: parsed.data.DISCORD_BOT_TOKEN,
    discordClientId: parsed.data.DISCORD_CLIENT_ID,
    discordGuildId: parsed.data.DISCORD_GUILD_ID,
    discordLeaderboardChannelId: parsed.data.DISCORD_LEADERBOARD_CHANNEL_ID,
    discordCommandChannelId: parsed.data.DISCORD_COMMAND_CHANNEL_ID,
    discordAuraCommandBlockedChannelId: parsed.data.DISCORD_AURA_COMMAND_BLOCKED_CHANNEL_ID,
    discordLeaderboardMessageId: parsed.data.DISCORD_LEADERBOARD_MESSAGE_ID,
    botAdminUserIds: parsed.data.BOT_ADMIN_USER_IDS ?? [],
    botAdminCommandChannelId: parsed.data.BOT_ADMIN_COMMAND_CHANNEL_ID,
    botAuditLogChannelId: parsed.data.BOT_AUDIT_LOG_CHANNEL_ID,
    internalApi: {
      origin: new URL(parsed.data.CM_INTERNAL_INTEGRATIONS_API_ORIGIN).origin,
      clientId: parsed.data.CM_INTERNAL_INTEGRATIONS_API_CLIENT_ID,
      keyId: parsed.data.CM_INTERNAL_INTEGRATIONS_API_KEY_ID,
      hmacSecret: Buffer.from(
        parsed.data.CM_INTERNAL_INTEGRATIONS_API_HMAC_SECRET_BASE64,
        "base64"
      ),
      timeoutMs: parsed.data.CM_INTERNAL_INTEGRATIONS_API_TIMEOUT_MS
    }
  };
}
