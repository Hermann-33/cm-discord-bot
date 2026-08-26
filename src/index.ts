import "dotenv/config";
import { Events } from "discord.js";
import { InternalApiClient } from "./api/client";
import { GroqTriageClient } from "./ai/groqClient";
import { RuntimeDeterministicSupportActionResolver } from "./ai/actionResolver";
import { RuntimeDeterministicSupportResolver } from "./ai/deterministicResolver";
import { loadBundledSupportRuntimePack } from "./ai/runtimePack";
import { SupportConversationService } from "./ai/supportConversation";
import { InternalApiSupportLiveLookupAdapter } from "./ai/supportLookup";
import { SupportConversationStateStore } from "./ai/supportStateStore";
import { ShadowCohortRecorder } from "./ai/shadowValidation";
import { handleAuraCommand } from "./commands/aura";
import { CmAdminController } from "./commands/cm";
import { handleRefreshLeaderboardCommand } from "./commands/refreshLeaderboard";
import { loadConfig, type AppConfig } from "./config/env";
import { createDiscordClient } from "./discord/client";
import { SupportAiMessageController } from "./discord/supportAi";
import { LeaderboardService } from "./leaderboard/service";
import { logger, sanitizeError } from "./logger";
import { LeaderboardSchedule } from "./scheduler/leaderboardSchedule";
import { createShutdownHandler } from "./scheduler/shutdown";

let config: AppConfig;

try {
  logger.info("bot starting");
  config = loadConfig();
} catch (error) {
  logger.error("configuration validation failed", sanitizeError(error));
  process.exit(1);
}

const discordClient = createDiscordClient();
const internalApiClient = new InternalApiClient(config.internalApi);
const cmAdminController = new CmAdminController(config, internalApiClient);
const leaderboardService = new LeaderboardService(config, discordClient, internalApiClient);
const leaderboardSchedule = new LeaderboardSchedule(
  leaderboardService,
  Boolean(config.discordLeaderboardMessageId)
);

async function initializeSupportAi(): Promise<SupportAiMessageController | null> {
  if (config.aiSupport.enabled || config.aiSupport.shadowEnabled) {
    try {
      if (!config.groq) throw new Error("AI support enabled without Groq configuration");
      const runtime = loadBundledSupportRuntimePack();
      const service = new SupportConversationService(
        runtime,
        new RuntimeDeterministicSupportResolver(),
        new GroqTriageClient(config.groq),
        new RuntimeDeterministicSupportActionResolver(new InternalApiSupportLiveLookupAdapter(internalApiClient))
      );
      const shadowRecorder = !config.aiSupport.enabled && config.aiSupport.shadowEnabled
        ? await ShadowCohortRecorder.open({
            rootDir: config.aiSupport.shadowCohortDir!,
            pseudonymKey: config.aiSupport.shadowPseudonymSecret!,
            runtimeKnowledgeVersion: runtime.knowledgeVersion,
            model: config.groq.model,
            reasoningEffort: config.groq.reasoningEffort,
            maxCompletionTokens: config.groq.maxCompletionTokens
          })
        : undefined;
      const supportAiController = new SupportAiMessageController(
        config,
        service,
        new SupportConversationStateStore(),
        shadowRecorder
      );
      logger.info("AI support initialized", {
        knowledgeVersion: runtime.knowledgeVersion,
        mode: shadowRecorder ? "shadow" : "customer_visible"
      });
      return supportAiController;
    } catch (error) {
      const errorName = error instanceof Error
        ? error.name.replace(/[^A-Za-z0-9_.-]/gu, "").slice(0, 64) || "Error"
        : "UnknownError";
      logger.error("AI support initialization failed", { errorName });
      return null;
    }
  }
  return null;
}

const supportAiControllerPromise = initializeSupportAi();

const shutdown = createShutdownHandler(
  leaderboardSchedule,
  discordClient,
  (exitCode) => process.exit(exitCode)
);

process.once("SIGINT", () => {
  void shutdown(0);
});

process.once("SIGTERM", () => {
  void shutdown(0);
});

discordClient.once(Events.ClientReady, async () => {
  logger.info("Discord ready");

  try {
    const startResult = await leaderboardSchedule.start();
    if (startResult === "bootstrap-complete") {
      await shutdown(0);
    }
  } catch (error) {
    logger.error("sanitized update failure", sanitizeError(error));
    await shutdown(1);
  }
});

discordClient.on(Events.MessageCreate, (message) => {
  void (async () => {
    await handleAuraCommand(message, config, internalApiClient);
    const supportAiController = await supportAiControllerPromise;
    if (supportAiController) await supportAiController.handle(message);
  })().catch((error: unknown) => {
    logger.error("sanitized message handler failure", sanitizeError(error));
  });
});

discordClient.on(Events.InteractionCreate, (interaction) => {
  void (async () => {
    if (await cmAdminController.handle(interaction)) return;
    if (!interaction.isChatInputCommand()) return;
    await handleRefreshLeaderboardCommand(interaction, config, leaderboardService);
  })().catch((error: unknown) => {
    logger.error("sanitized interaction failure", sanitizeError(error));
  });
});

discordClient.login(config.discordBotToken).catch(async (error: unknown) => {
  logger.error("sanitized update failure", sanitizeError(error));
  await shutdown(1);
});
