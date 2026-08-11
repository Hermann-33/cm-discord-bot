export type AuraAmount = number | string;

export type LeaderboardType = "lifetime" | "available";

export type LeaderboardRow = {
  leaderboard_type: LeaderboardType;
  rank: number;
  discord_display_name: string;
  aura: AuraAmount;
};

export type UserAuraRow = {
  discord_display_name: string;
  available_aura: AuraAmount;
  lifetime_earned_aura: AuraAmount;
};

export type LeaderboardFetchContext =
  | { mode: "scheduled" }
  | {
      mode: "manual";
      actorDiscordUserId: string;
      eventId: string;
      source: "interaction" | "message";
    };

export interface AuraReadClient {
  fetchLeaderboards(context?: LeaderboardFetchContext): Promise<LeaderboardRow[]>;
  fetchUserAura(discordUserId: string): Promise<UserAuraRow | null>;
}
