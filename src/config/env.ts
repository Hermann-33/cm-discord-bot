import { z } from "zod";

const idPattern = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const snowflakePattern = /^\d{5,32}$/;
const standardBase64Pattern = /^[A-Za-z0-9+/]+={0,2}$/;
const hostedModelPattern = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i;
const OPENROUTER_DEFAULT_MODEL = "google/gemma-4-26b-a4b-it:free";
const GROQ_DEFAULT_MODEL = "openai/gpt-oss-120b";

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

const booleanFlag = z.preprocess((value) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length === 0 ? undefined : trimmed;
}, z.enum(["true", "false"]).default("false")).transform((value) => value === "true");

const optionalOpenRouterApiKey = z.preprocess((value) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}, z.string().min(20).max(512).regex(/^sk-or-/).optional());

const optionalGroqApiKey = z.preprocess((value) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}, z.string().min(20).max(512).regex(/^gsk_/).optional());

const openRouterModel = z.preprocess((value) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}, z.string().regex(hostedModelPattern).default(OPENROUTER_DEFAULT_MODEL));

const groqModel = z.preprocess((value) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}, z.string().regex(hostedModelPattern).default(GROQ_DEFAULT_MODEL));

const groqReasoningEffort = z.preprocess((value) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length === 0 ? undefined : trimmed;
}, z.enum(["low", "medium", "high"]).default("low"));

const openRouterDataCollection = z.preprocess((value) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length === 0 ? undefined : trimmed;
}, z.enum(["allow", "deny"]).default("allow"));

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

const optionalCanonicalSecret = z.preprocess((value) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}, z.string().refine(isCanonicalSecret).optional());

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
  BOT_AUDIT_LOG_CHANNEL_ID: optionalSnowflake,
  CM_INTERNAL_INTEGRATIONS_API_ORIGIN: trimmedRequiredString.refine(isOriginOnlyHttps),
  CM_INTERNAL_INTEGRATIONS_API_CLIENT_ID: integrationId,
  CM_INTERNAL_INTEGRATIONS_API_KEY_ID: integrationId,
  CM_INTERNAL_INTEGRATIONS_API_HMAC_SECRET_BASE64: z.string().refine(isCanonicalSecret),
  CM_INTERNAL_INTEGRATIONS_API_TIMEOUT_MS: timeoutSchema,
  AI_SUPPORT_ENABLED: booleanFlag,
  AI_SUPPORT_SHADOW_ENABLED: booleanFlag,
  AI_SUPPORT_SHADOW_COHORT_DIR: z.preprocess((value) => {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }, z.string().max(1024).optional()),
  AI_SUPPORT_SHADOW_PSEUDONYM_SECRET_BASE64: optionalCanonicalSecret,
  AI_SUPPORT_CHANNEL_IDS: optionalSnowflakeList,
  AI_SUPPORT_CATEGORY_IDS: optionalSnowflakeList,
  GROQ_API_KEY: optionalGroqApiKey,
  GROQ_MODEL: groqModel,
  GROQ_REASONING_EFFORT: groqReasoningEffort,
  OPENROUTER_API_KEY: optionalOpenRouterApiKey,
  OPENROUTER_MODEL: openRouterModel,
  OPENROUTER_DATA_COLLECTION: openRouterDataCollection
}).superRefine((data, context) => {
  if (!data.AI_SUPPORT_ENABLED && !data.AI_SUPPORT_SHADOW_ENABLED) return;
  if (!data.GROQ_API_KEY) {
    context.addIssue({
      code: "custom",
      path: ["GROQ_API_KEY"],
      message: "Groq is required when AI support is enabled"
    });
  }
  const allowedSurfaces = (data.AI_SUPPORT_CHANNEL_IDS?.length ?? 0) + (data.AI_SUPPORT_CATEGORY_IDS?.length ?? 0);
  if (allowedSurfaces === 0) {
    context.addIssue({
      code: "custom",
      path: ["AI_SUPPORT_CHANNEL_IDS"],
      message: "At least one AI support channel or category allowlist entry is required"
    });
  }
  if (data.AI_SUPPORT_SHADOW_ENABLED && !data.AI_SUPPORT_ENABLED && !data.AI_SUPPORT_SHADOW_COHORT_DIR) {
    context.addIssue({
      code: "custom",
      path: ["AI_SUPPORT_SHADOW_COHORT_DIR"],
      message: "A cohort directory is required when AI support shadow mode is enabled"
    });
  }
  if (data.AI_SUPPORT_SHADOW_ENABLED && !data.AI_SUPPORT_ENABLED && !data.AI_SUPPORT_SHADOW_PSEUDONYM_SECRET_BASE64) {
    context.addIssue({
      code: "custom",
      path: ["AI_SUPPORT_SHADOW_PSEUDONYM_SECRET_BASE64"],
      message: "A dedicated pseudonym secret is required when AI support shadow mode is enabled"
    });
  }
});

export type InternalApiConfig = {
  origin: string;
  clientId: string;
  keyId: string;
  hmacSecret: Buffer;
  timeoutMs: number;
};

export type GroqConfig = {
  origin: "https://api.groq.com";
  apiKey: string;
  model: string;
  reasoningEffort: "low" | "medium" | "high";
  timeoutMs: number;
  maxCompletionTokens: number;
};

export type OpenRouterConfig = {
  origin: "https://openrouter.ai";
  apiKey: string;
  model: string;
  dataCollection: "allow" | "deny";
  timeoutMs: number;
  maxTokens: number;
};

export type AiSupportConfig = {
  enabled: boolean;
  shadowEnabled: boolean;
  shadowCohortDir?: string;
  shadowPseudonymSecret?: Buffer;
  channelIds: readonly string[];
  categoryIds: readonly string[];
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
  botAuditLogChannelId?: string;
  internalApi: InternalApiConfig;
  aiSupport: AiSupportConfig;
  groq?: GroqConfig;
  openRouter?: OpenRouterConfig;
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
    },
    aiSupport: {
      enabled: parsed.data.AI_SUPPORT_ENABLED,
      shadowEnabled: parsed.data.AI_SUPPORT_SHADOW_ENABLED,
      shadowCohortDir: parsed.data.AI_SUPPORT_SHADOW_COHORT_DIR,
      shadowPseudonymSecret: parsed.data.AI_SUPPORT_SHADOW_PSEUDONYM_SECRET_BASE64
        ? Buffer.from(parsed.data.AI_SUPPORT_SHADOW_PSEUDONYM_SECRET_BASE64, "base64")
        : undefined,
      channelIds: parsed.data.AI_SUPPORT_CHANNEL_IDS ?? [],
      categoryIds: parsed.data.AI_SUPPORT_CATEGORY_IDS ?? []
    },
    groq: parsed.data.GROQ_API_KEY
      ? {
          origin: "https://api.groq.com",
          apiKey: parsed.data.GROQ_API_KEY,
          model: parsed.data.GROQ_MODEL,
          reasoningEffort: parsed.data.GROQ_REASONING_EFFORT,
          timeoutMs: 20_000,
          maxCompletionTokens: 400
        }
      : undefined,
    openRouter: parsed.data.OPENROUTER_API_KEY
      ? {
          origin: "https://openrouter.ai",
          apiKey: parsed.data.OPENROUTER_API_KEY,
          model: parsed.data.OPENROUTER_MODEL,
          dataCollection: parsed.data.OPENROUTER_DATA_COLLECTION,
          timeoutMs: 20_000,
          maxTokens: 400
        }
      : undefined
  };
}
