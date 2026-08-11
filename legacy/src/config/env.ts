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

const internalApiKeyIdPattern = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export type InternalApiConfig =
  | { enabled: false }
  | {
      enabled: true;
      baseUrl: string;
      keyId: string;
      hmacSecret: Buffer;
      timeoutMs: number;
    };

const envSchema = z.object({
  DISCORD_BOT_TOKEN: requiredString,
  DISCORD_LEADERBOARD_CHANNEL_ID: requiredString,
  DISCORD_LEADERBOARD_MESSAGE_ID: optionalMessageId,
  DISCORD_COMMAND_CHANNEL_ID: requiredString,
  DISCORD_AURA_COMMAND_BLOCKED_CHANNEL_ID: requiredString,
  DISCORD_CLIENT_ID: requiredString,
  DISCORD_GUILD_ID: requiredString,
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  CM_INTERNAL_API_ENABLED: z.enum(["true", "false"]).default("false"),
  CM_INTERNAL_API_BASE_URL: z.string().optional(),
  CM_INTERNAL_API_KEY_ID: z.string().optional(),
  CM_INTERNAL_API_HMAC_SECRET_BASE64: z.string().optional(),
  CM_INTERNAL_API_TIMEOUT_MS: z.string().optional()
});

export type AppConfig = {
  discordBotToken: string;
  discordLeaderboardChannelId: string;
  discordLeaderboardMessageId?: string;
  discordCommandChannelId: string;
  discordAuraCommandBlockedChannelId: string;
  discordClientId: string;
  discordGuildId: string;
  supabase?: {
    url: string;
    serviceRoleKey: string;
  };
  internalApi: InternalApiConfig;
};

function parseInternalApiConfig(data: z.infer<typeof envSchema>): InternalApiConfig {
  if (data.CM_INTERNAL_API_ENABLED !== "true") {
    return { enabled: false };
  }

  const baseUrlValue = data.CM_INTERNAL_API_BASE_URL?.trim();
  const keyId = data.CM_INTERNAL_API_KEY_ID?.trim();
  const secretValue = data.CM_INTERNAL_API_HMAC_SECRET_BASE64?.trim();
  const timeoutValue = data.CM_INTERNAL_API_TIMEOUT_MS?.trim() || "5000";
  const invalidKeys: string[] = [];

  let baseUrl: URL | undefined;

  try {
    baseUrl = baseUrlValue ? new URL(baseUrlValue) : undefined;
  } catch {
    invalidKeys.push("CM_INTERNAL_API_BASE_URL");
  }

  if (
    !baseUrl ||
    baseUrl.protocol !== "https:" ||
    baseUrl.username ||
    baseUrl.password ||
    baseUrl.pathname !== "/" ||
    baseUrl.search ||
    baseUrl.hash
  ) {
    if (!invalidKeys.includes("CM_INTERNAL_API_BASE_URL")) {
      invalidKeys.push("CM_INTERNAL_API_BASE_URL");
    }
  }

  if (!keyId || !internalApiKeyIdPattern.test(keyId)) {
    invalidKeys.push("CM_INTERNAL_API_KEY_ID");
  }

  let hmacSecret: Buffer | undefined;

  if (secretValue && /^[A-Za-z0-9+/]+={0,2}$/.test(secretValue)) {
    const decoded = Buffer.from(secretValue, "base64");
    if (decoded.length >= 32 && decoded.toString("base64") === secretValue) {
      hmacSecret = decoded;
    }
  }

  if (!hmacSecret) {
    invalidKeys.push("CM_INTERNAL_API_HMAC_SECRET_BASE64");
  }

  const timeoutMs = Number(timeoutValue);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 15_000) {
    invalidKeys.push("CM_INTERNAL_API_TIMEOUT_MS");
  }

  if (invalidKeys.length > 0) {
    throw new Error(
      `Missing or invalid environment variables: ${[...new Set(invalidKeys)].join(", ")}`
    );
  }

  return {
    enabled: true,
    baseUrl: baseUrl!.origin,
    keyId: keyId!,
    hmacSecret: hmacSecret!,
    timeoutMs
  };
}

export function loadConfig(): AppConfig {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const invalidKeys = [
      ...new Set(parsed.error.issues.map((issue) => issue.path.join(".") || "unknown"))
    ];

    throw new Error(`Missing or invalid environment variables: ${invalidKeys.join(", ")}`);
  }

  const internalApi = parseInternalApiConfig(parsed.data);
  let supabase: AppConfig["supabase"];

  if (!internalApi.enabled) {
    const supabaseUrl = parsed.data.SUPABASE_URL?.trim();
    const serviceRoleKey = parsed.data.SUPABASE_SERVICE_ROLE_KEY?.trim();
    let validSupabaseUrl = false;
    try {
      validSupabaseUrl = Boolean(supabaseUrl && new URL(supabaseUrl));
    } catch {
      validSupabaseUrl = false;
    }

    const invalidSupabaseKeys = [
      ...(!validSupabaseUrl ? ["SUPABASE_URL"] : []),
      ...(!serviceRoleKey ? ["SUPABASE_SERVICE_ROLE_KEY"] : [])
    ];
    if (invalidSupabaseKeys.length > 0) {
      throw new Error(`Missing or invalid environment variables: ${invalidSupabaseKeys.join(", ")}`);
    }
    supabase = { url: supabaseUrl!, serviceRoleKey: serviceRoleKey! };
  }

  return {
    discordBotToken: parsed.data.DISCORD_BOT_TOKEN,
    discordLeaderboardChannelId: parsed.data.DISCORD_LEADERBOARD_CHANNEL_ID,
    discordLeaderboardMessageId: parsed.data.DISCORD_LEADERBOARD_MESSAGE_ID,
    discordCommandChannelId: parsed.data.DISCORD_COMMAND_CHANNEL_ID,
    discordAuraCommandBlockedChannelId: parsed.data.DISCORD_AURA_COMMAND_BLOCKED_CHANNEL_ID,
    discordClientId: parsed.data.DISCORD_CLIENT_ID,
    discordGuildId: parsed.data.DISCORD_GUILD_ID,
    supabase,
    internalApi
  };
}
