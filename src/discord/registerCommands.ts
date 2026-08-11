import "dotenv/config";
import { REST, Routes } from "discord.js";
import { buildRefreshLeaderboardCommand } from "../commands/refreshLeaderboard";
import { loadConfig } from "../config/env";
import { logger, sanitizeError } from "../logger";

async function registerCommands(): Promise<void> {
  const config = loadConfig();
  const discordRest = new REST({ version: "10" }).setToken(config.discordBotToken);

  await discordRest.put(
    Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId),
    { body: [buildRefreshLeaderboardCommand()] }
  );

  logger.info("registered Discord commands", { count: 1 });
}

registerCommands().catch((error: unknown) => {
  logger.error("sanitized command registration failure", sanitizeError(error));
  process.exit(1);
});
