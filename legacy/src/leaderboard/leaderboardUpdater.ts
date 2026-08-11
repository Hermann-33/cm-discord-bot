import type { Client } from "discord.js";
import type { AppConfig } from "../config/env";
import {
  createLeaderboardMessage,
  editLeaderboardMessage,
  fetchLeaderboardChannel,
  fetchLeaderboardMessage
} from "../discord/leaderboardMessage";
import { logger, sanitizeError } from "../logger/logger";
import {
  buildLeaderboardCreatePayload,
  buildLeaderboardEditPayload
} from "./leaderboardEmbeds";
import type { AuraReadClient, LeaderboardFetchContext } from "./types";

const UPDATE_INTERVAL_MS = 5 * 60 * 1000;

export type LeaderboardRefreshResult = "refreshed" | "already-running" | "failed";

export class LeaderboardUpdater {
  private interval: NodeJS.Timeout | undefined;
  private isUpdating = false;

  constructor(
    private readonly config: AppConfig,
    private readonly discordClient: Client,
    private readonly leaderboardClient: AuraReadClient
  ) {}

  async start(): Promise<"running" | "bootstrap-complete"> {
    if (!this.config.discordLeaderboardMessageId) {
      await this.createInitialMessageAndExit();
      return "bootstrap-complete";
    }

    await this.refreshNow({ failOnError: true });

    this.interval = setInterval(() => {
      void this.refreshNow({ failOnError: false });
    }, UPDATE_INTERVAL_MS);

    return "running";
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  private async createInitialMessageAndExit(): Promise<void> {
    const rows = await this.leaderboardClient.fetchLeaderboards();
    const messagePayload = buildLeaderboardCreatePayload(rows);
    const channel = await fetchLeaderboardChannel(
      this.discordClient,
      this.config.discordLeaderboardChannelId
    );
    const message = await createLeaderboardMessage(channel, messagePayload);

    logger.info("leaderboard message created", {
      messageId: message.id
    });
    logger.info("add leaderboard message id to env before starting the update loop");
  }

  async refreshNow(options: {
    failOnError: boolean;
    context?: LeaderboardFetchContext;
  }): Promise<LeaderboardRefreshResult> {
    if (this.isUpdating) {
      logger.warn("update skipped due to overlap");
      return "already-running";
    }

    this.isUpdating = true;

    try {
      const rows = await this.leaderboardClient.fetchLeaderboards(options.context);
      const messagePayload = buildLeaderboardEditPayload(rows);
      const channel = await fetchLeaderboardChannel(
        this.discordClient,
        this.config.discordLeaderboardChannelId
      );
      const message = await fetchLeaderboardMessage(
        channel,
        this.config.discordLeaderboardMessageId as string
      );

      await editLeaderboardMessage(message, messagePayload);
      logger.info("leaderboard message edited");
      return "refreshed";
    } catch (error) {
      if (options.failOnError) {
        throw error;
      }

      logger.error("sanitized update failure", sanitizeError(error));
      return "failed";
    } finally {
      this.isUpdating = false;
    }
  }
}
