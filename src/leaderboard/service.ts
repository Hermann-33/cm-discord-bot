import type { Client } from "discord.js";
import type { AppConfig } from "../config/env";
import {
  createLeaderboardMessage,
  editLeaderboardMessage,
  fetchLeaderboardChannel
} from "../discord/safeMessages";
import { logger, sanitizeError } from "../logger";
import { buildLeaderboardCreatePayload, buildLeaderboardEditPayload } from "./format";
import type { AuraReadClient } from "./types";

export type LeaderboardRefreshResult = "refreshed" | "already-running" | "failed";

export interface LeaderboardRefreshController {
  refreshNow(options: { failOnError: boolean }): Promise<LeaderboardRefreshResult>;
}

export class LeaderboardService implements LeaderboardRefreshController {
  private isRefreshing = false;

  constructor(
    private readonly config: AppConfig,
    private readonly discordClient: Client,
    private readonly auraClient: AuraReadClient
  ) {}

  async createInitialMessage(): Promise<void> {
    const rows = await this.auraClient.fetchLeaderboards();
    const channel = await fetchLeaderboardChannel(
      this.discordClient,
      this.config.discordLeaderboardChannelId
    );
    const message = await createLeaderboardMessage(
      channel,
      buildLeaderboardCreatePayload(rows)
    );

    logger.info("leaderboard message created", { messageId: message.id });
    logger.info("add leaderboard message id to env before starting the update loop");
  }

  async refreshNow(options: { failOnError: boolean }): Promise<LeaderboardRefreshResult> {
    if (this.isRefreshing) {
      logger.warn("update skipped due to overlap");
      return "already-running";
    }

    this.isRefreshing = true;
    try {
      const rows = await this.auraClient.fetchLeaderboards();
      const channel = await fetchLeaderboardChannel(
        this.discordClient,
        this.config.discordLeaderboardChannelId
      );
      await editLeaderboardMessage(
        channel,
        this.config.discordLeaderboardMessageId as string,
        buildLeaderboardEditPayload(rows)
      );
      logger.info("leaderboard message edited");
      return "refreshed";
    } catch (error) {
      if (options.failOnError) throw error;
      logger.error("sanitized update failure", sanitizeError(error));
      return "failed";
    } finally {
      this.isRefreshing = false;
    }
  }
}
