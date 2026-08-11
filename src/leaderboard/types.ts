export type LeaderboardType = "lifetime" | "available";

export type LeaderboardEntry = {
  leaderboardType: LeaderboardType;
  rank: number;
  displayName: string;
  aura: number;
};

export type AuraBalance = {
  displayName: string;
  availableAura: number;
  lifetimeAura: number;
  updatedAt: string;
};

export interface AuraReadClient {
  fetchLeaderboards(): Promise<LeaderboardEntry[]>;
  lookupAuraByDiscordId(discordUserId: string): Promise<AuraBalance | null>;
}
