import "dotenv/config";
import { REST, Routes } from "discord.js";
import { buildSupportLookupCommand } from "../commands/supportLookupCommands";
import { loadConfig } from "../config/env";
import { logger, sanitizeError } from "../logger/logger";

async function registerInternalApiCommands(): Promise<void> {
  const config = loadConfig();

  if (!config.internalApi.enabled) {
    throw new Error("Internal API command registration is disabled");
  }

  const discordRest = new REST({ version: "10" }).setToken(config.discordBotToken);
  await discordRest.post(
    Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId),
    { body: buildSupportLookupCommand() }
  );
  logger.info("registered internal API support command");
}

registerInternalApiCommands().catch((error: unknown) => {
  logger.error("sanitized internal API command registration failure", sanitizeError(error));
  process.exit(1);
});
