import { logger, sanitizeError } from "../logger";
import type { LeaderboardRefreshController } from "../leaderboard/service";

export const LEADERBOARD_UPDATE_INTERVAL_MS = 5 * 60 * 1_000;

type ScheduleService = LeaderboardRefreshController & {
  createInitialMessage(): Promise<void>;
};

export type TimerFunctions = {
  setInterval(callback: () => void, delayMs: number): NodeJS.Timeout;
  clearInterval(handle: NodeJS.Timeout): void;
};

const productionTimers: TimerFunctions = {
  setInterval: (callback, delayMs) => setInterval(callback, delayMs),
  clearInterval: (handle) => clearInterval(handle)
};

export class LeaderboardSchedule {
  private interval: NodeJS.Timeout | undefined;

  constructor(
    private readonly service: ScheduleService,
    private readonly hasConfiguredMessage: boolean,
    private readonly timers: TimerFunctions = productionTimers
  ) {}

  async start(): Promise<"running" | "bootstrap-complete"> {
    if (!this.hasConfiguredMessage) {
      await this.service.createInitialMessage();
      return "bootstrap-complete";
    }

    await this.service.refreshNow({ failOnError: true });
    this.interval = this.timers.setInterval(() => {
      void this.runScheduledRefresh();
    }, LEADERBOARD_UPDATE_INTERVAL_MS);
    return "running";
  }

  async runScheduledRefresh(): Promise<void> {
    try {
      await this.service.refreshNow({ failOnError: false });
    } catch (error) {
      logger.error("sanitized update failure", sanitizeError(error));
    }
  }

  stop(): void {
    if (!this.interval) return;
    this.timers.clearInterval(this.interval);
    this.interval = undefined;
  }
}
