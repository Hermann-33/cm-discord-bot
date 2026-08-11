import "dotenv/config";
import { Events } from "discord.js";
import { InternalApiClient } from "./api/client";
import { handleAuraCommand } from "./commands/aura";
import { handleRefreshLeaderboardCommand } from "./commands/refreshLeaderboard";
import { loadConfig, type AppConfig } from "./config/env";
import { createDiscordClient } from "./discord/client";
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
const leaderboardService = new LeaderboardService(config, discordClient, internalApiClient);
const leaderboardSchedule = new LeaderboardSchedule(
  leaderboardService,
  Boolean(config.discordLeaderboardMessageId)
);

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
  void handleAuraCommand(message, config, internalApiClient).catch((error: unknown) => {
    logger.error("sanitized command failure", sanitizeError(error));
  });
});

discordClient.on(Events.InteractionCreate, (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  void handleRefreshLeaderboardCommand(interaction, config, leaderboardService).catch(
    (error: unknown) => {
      logger.error("sanitized interaction failure", sanitizeError(error));
    }
  );
});

discordClient.login(config.discordBotToken).catch(async (error: unknown) => {
  logger.error("sanitized update failure", sanitizeError(error));
  await shutdown(1);
});
