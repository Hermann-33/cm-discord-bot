import "dotenv/config";
import {
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder
} from "discord.js";
import { loadConfig } from "../config/env";
import { logger, sanitizeError } from "../logger/logger";

async function registerCommands(): Promise<void> {
  const config = loadConfig();
  const discordRest = new REST({ version: "10" }).setToken(config.discordBotToken);

  const refreshLeaderboardCommand = new SlashCommandBuilder()
    .setName("refresh-leaderboard")
    .setDescription("Force refresh the Aura leaderboard message.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON();

  await discordRest.post(
    Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId),
    {
      body: refreshLeaderboardCommand
    }
  );

  logger.info("registered refresh leaderboard command");
}

registerCommands().catch((error: unknown) => {
  logger.error("sanitized command registration failure", sanitizeError(error));
  process.exit(1);
});
