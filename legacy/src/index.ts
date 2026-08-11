import { Events } from "discord.js";
import { handleAuraCommand } from "./commands/auraCommand";
import { handleRefreshLeaderboardCommand } from "./commands/refreshLeaderboardCommand";
import { loadConfig, type AppConfig } from "./config/env";
import { createDiscordClient } from "./discord/discordClient";
import { logger, sanitizeError } from "./logger/logger";
import { SupabaseLeaderboardClient } from "./leaderboard/supabaseLeaderboardClient";
import { LeaderboardUpdater } from "./leaderboard/leaderboardUpdater";
import { InternalDiscordApiClient } from "./internalApi/client";
import { handleSupportLookupCommand } from "./commands/supportLookupCommands";

let config: AppConfig;

try {
  logger.info("bot starting");
  config = loadConfig();
} catch (error) {
  logger.error("configuration validation failed", sanitizeError(error));
  process.exit(1);
}

const discordClient = createDiscordClient();
const internalApiClient = config.internalApi.enabled
  ? new InternalDiscordApiClient(config.internalApi, config.discordGuildId)
  : undefined;
const leaderboardClient = internalApiClient ?? new SupabaseLeaderboardClient(config.supabase!);
const leaderboardUpdater = new LeaderboardUpdater(config, discordClient, leaderboardClient);

let isShuttingDown = false;

async function shutdown(exitCode: number): Promise<void> {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  leaderboardUpdater.stop();
  discordClient.destroy();
  process.exit(exitCode);
}

process.once("SIGINT", () => {
  void shutdown(0);
});

process.once("SIGTERM", () => {
  void shutdown(0);
});

discordClient.once(Events.ClientReady, async () => {
  logger.info("Discord ready");

  try {
    const startResult = await leaderboardUpdater.start();

    if (startResult === "bootstrap-complete") {
      await shutdown(0);
    }
  } catch (error) {
    logger.error("sanitized update failure", sanitizeError(error));
    await shutdown(1);
  }
});

discordClient.on(Events.MessageCreate, (message) => {
  void handleAuraCommand(message, config, leaderboardClient).catch((error: unknown) => {
    logger.error("sanitized command failure", sanitizeError(error));
  });
});

discordClient.on(Events.InteractionCreate, (interaction) => {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  void handleRefreshLeaderboardCommand(interaction, config, leaderboardUpdater).catch(
    (error: unknown) => {
      logger.error("sanitized interaction failure", sanitizeError(error));
    }
  );

  if (internalApiClient) {
    void handleSupportLookupCommand(interaction, config, internalApiClient).catch(
      (error: unknown) => {
        logger.error("sanitized support interaction failure", sanitizeError(error));
      }
    );
  }
});

discordClient.login(config.discordBotToken).catch(async (error: unknown) => {
  logger.error("sanitized update failure", sanitizeError(error));
  await shutdown(1);
});
