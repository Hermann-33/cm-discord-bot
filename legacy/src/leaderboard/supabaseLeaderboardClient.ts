import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { AuraReadClient, LeaderboardRow, UserAuraRow } from "./types";

const auraAmountSchema = z.union([
  z.number().int().nonnegative(),
  z.string().trim().regex(/^\d+$/)
]);

const leaderboardRowSchema = z.object({
  leaderboard_type: z.enum(["lifetime", "available"]),
  rank: z.coerce.number().int().positive(),
  discord_display_name: z.string(),
  aura: auraAmountSchema
});

const leaderboardRowsSchema = z.array(leaderboardRowSchema).max(20);

const userAuraRowSchema = z.object({
  discord_display_name: z.string(),
  available_aura: auraAmountSchema,
  lifetime_earned_aura: auraAmountSchema
});

const userAuraResponseSchema = z.union([
  userAuraRowSchema,
  z.array(userAuraRowSchema).max(1),
  z.null()
]);

export class SupabaseLeaderboardClient implements AuraReadClient {
  private readonly supabase: SupabaseClient;

  constructor(config: { url: string; serviceRoleKey: string }) {
    this.supabase = createClient(config.url, config.serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      },
      global: {
        headers: {
          "X-Client-Info": "cm-discord-aura-leaderboard/1.0.0"
        }
      }
    });
  }

  async fetchLeaderboards(): Promise<LeaderboardRow[]> {
    const { data, error } = await this.supabase.rpc("get_discord_aura_leaderboards", {
      p_limit: 10
    });

    if (error) {
      const code = typeof error.code === "string" ? error.code : "unknown";
      throw new Error(`Leaderboard RPC failed with code ${code}`);
    }

    const parsed = leaderboardRowsSchema.safeParse(data);

    if (!parsed.success) {
      throw new Error("Leaderboard RPC returned an invalid row shape");
    }

    return parsed.data;
  }

  async fetchUserAura(discordUserId: string): Promise<UserAuraRow | null> {
    const { data, error } = await this.supabase.rpc("get_discord_user_aura", {
      p_discord_user_id: discordUserId
    });

    if (error) {
      const code = typeof error.code === "string" ? error.code : "unknown";
      throw new Error(`User Aura RPC failed with code ${code}`);
    }

    const parsed = userAuraResponseSchema.safeParse(data);

    if (!parsed.success) {
      throw new Error("User Aura RPC returned an invalid row shape");
    }

    if (Array.isArray(parsed.data)) {
      return parsed.data[0] ?? null;
    }

    return parsed.data;
  }
}
