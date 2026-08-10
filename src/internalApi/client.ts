import { createHash, createHmac, randomUUID } from "node:crypto";
import type { z } from "zod";
import type { InternalApiConfig } from "../config/env";
import type { AuraReadClient, LeaderboardFetchContext, LeaderboardRow, UserAuraRow } from "../leaderboard/types";
import {
  auraLeaderboardsRequestSchema,
  auraLeaderboardsResponseSchema,
  auraUserRequestSchema,
  auraUserResponseSchema,
  internalApiErrorEnvelopeSchema,
  orderLookupRequestSchema,
  orderLookupResponseSchema,
  successEnvelopeSchema,
  userLookupRequestSchema,
  userLookupResponseSchema,
  type InternalApiErrorCode,
  type OrderLookupResponse,
  type OrderSelector,
  type UserLookupResponse,
  type UserSelector
} from "./schemas";

export const INTERNAL_API_PATHS = {
  leaderboards: "/api/internal/discord-bot/v1/aura/leaderboards",
  auraUser: "/api/internal/discord-bot/v1/aura/user",
  userLookup: "/api/internal/discord-bot/v1/users/lookup",
  orderLookup: "/api/internal/discord-bot/v1/orders/lookup"
} as const;

const MAX_RESPONSE_BYTES = 64 * 1024;
const RETRYABLE_STATUSES = new Set([502, 503, 504]);
type EnabledInternalApiConfig = Extract<InternalApiConfig, { enabled: true }>;

export type InternalApiClientDependencies = {
  fetch: typeof fetch;
  nowMs: () => number;
  nonce: () => string;
};

const productionDependencies: InternalApiClientDependencies = { fetch: globalThis.fetch, nowMs: Date.now, nonce: randomUUID };

export class InternalApiClientError extends Error {
  constructor(
    readonly code: InternalApiErrorCode | "NETWORK_FAILURE" | "REQUEST_TIMEOUT" | "INVALID_RESPONSE",
    readonly status?: number
  ) {
    super(safeErrorText(code));
    this.name = "InternalApiClientError";
  }
}

function safeErrorText(code: InternalApiClientError["code"]): string {
  switch (code) {
    case "NOT_FOUND": return "The requested record was not found.";
    case "ACTOR_FORBIDDEN":
    case "GUILD_FORBIDDEN": return "This operation is not authorized.";
    case "RATE_LIMITED": return "Too many requests.";
    case "REQUEST_TIMEOUT": return "The internal service timed out.";
    case "NETWORK_FAILURE": return "The internal service is unavailable.";
    default: return "The internal request could not be processed.";
  }
}

export function discordMessageForInternalApiError(error: unknown): string {
  if (!(error instanceof InternalApiClientError)) return "The internal service is unavailable right now. Please try again later.";
  switch (error.code) {
    case "NOT_FOUND": return "No matching record was found.";
    case "ACTOR_FORBIDDEN":
    case "GUILD_FORBIDDEN": return "You are not authorized to use this support command.";
    case "RATE_LIMITED": return "Too many requests. Please wait before trying again.";
    case "VALIDATION_FAILED": return "That lookup value is not valid.";
    default: return "The internal service is unavailable right now. Please try again later.";
  }
}

export function buildCanonicalRequest(timestamp: string, nonce: string, pathname: string, rawBody: Uint8Array): string {
  const bodyHash = createHash("sha256").update(rawBody).digest("hex");
  return `v1\n${timestamp}\n${nonce}\nPOST\n${pathname}\n${bodyHash}`;
}

export function signInternalApiRequest(secret: Uint8Array, timestamp: string, nonce: string, pathname: string, rawBody: Uint8Array): string {
  return createHmac("sha256", secret).update(buildCanonicalRequest(timestamp, nonce, pathname, rawBody), "utf8").digest("hex");
}

export function createSignedHeaders(keyId: string, secret: Uint8Array, timestamp: string, nonce: string, pathname: string, rawBody: Uint8Array): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-CM-Key-Id": keyId,
    "X-CM-Timestamp": timestamp,
    "X-CM-Nonce": nonce,
    "X-CM-Signature": signInternalApiRequest(secret, timestamp, nonce, pathname, rawBody)
  };
}

export class InternalDiscordApiClient implements AuraReadClient {
  constructor(
    private readonly config: EnabledInternalApiConfig,
    private readonly guildId: string,
    private readonly dependencies: InternalApiClientDependencies = productionDependencies
  ) {}

  async fetchLeaderboards(context: LeaderboardFetchContext = { mode: "scheduled" }): Promise<LeaderboardRow[]> {
    const body = context.mode === "scheduled"
      ? { mode: "scheduled" as const, guildId: this.guildId, limit: 10 }
      : { mode: "manual" as const, guildId: this.guildId, actorDiscordUserId: context.actorDiscordUserId, eventId: context.eventId, source: context.source, limit: 10 };
    const data = await this.request(INTERNAL_API_PATHS.leaderboards, auraLeaderboardsRequestSchema.parse(body), auraLeaderboardsResponseSchema);
    return data.leaderboards.map((row) => ({ leaderboard_type: row.leaderboardType, rank: row.rank, discord_display_name: row.displayName, aura: row.aura }));
  }

  async fetchUserAura(discordUserId: string): Promise<UserAuraRow | null> {
    const body = auraUserRequestSchema.parse({ guildId: this.guildId, actorDiscordUserId: discordUserId });
    const data = await this.request(INTERNAL_API_PATHS.auraUser, body, auraUserResponseSchema);
    if (!data.linked) return null;
    return { discord_display_name: data.displayName, available_aura: data.availableAura, lifetime_earned_aura: data.lifetimeAura };
  }

  async lookupUser(actorDiscordUserId: string, selector: UserSelector): Promise<UserLookupResponse> {
    const body = userLookupRequestSchema.parse({ guildId: this.guildId, actorDiscordUserId, selector });
    return this.request(INTERNAL_API_PATHS.userLookup, body, userLookupResponseSchema);
  }

  async lookupOrder(actorDiscordUserId: string, selector: OrderSelector): Promise<OrderLookupResponse> {
    const body = orderLookupRequestSchema.parse({ guildId: this.guildId, actorDiscordUserId, selector });
    return this.request(INTERNAL_API_PATHS.orderLookup, body, orderLookupResponseSchema);
  }

  private async request<TSchema extends z.ZodType>(pathname: string, body: unknown, dataSchema: TSchema): Promise<z.infer<TSchema>> {
    const rawBody = JSON.stringify(body);
    const rawBodyBytes = Buffer.from(rawBody, "utf8");

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const timestamp = String(this.dependencies.nowMs());
      const nonce = this.dependencies.nonce();
      const headers = createSignedHeaders(this.config.keyId, this.config.hmacSecret, timestamp, nonce, pathname, rawBodyBytes);
      const controller = new AbortController();
      let timedOut = false;
      const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, this.config.timeoutMs);
      let response: Response;

      try {
        response = await this.dependencies.fetch(`${this.config.baseUrl}${pathname}`, { method: "POST", headers, body: rawBody, signal: controller.signal });
      } catch {
        if (attempt === 0) continue;
        throw new InternalApiClientError(timedOut ? "REQUEST_TIMEOUT" : "NETWORK_FAILURE");
      } finally {
        clearTimeout(timeout);
      }

      if (attempt === 0 && RETRYABLE_STATUSES.has(response.status)) {
        await response.body?.cancel();
        continue;
      }
      const responseText = await response.text();
      if (Buffer.byteLength(responseText, "utf8") > MAX_RESPONSE_BYTES) throw new InternalApiClientError("INVALID_RESPONSE", response.status);

      let responseValue: unknown;
      try { responseValue = JSON.parse(responseText); } catch { throw new InternalApiClientError("INVALID_RESPONSE", response.status); }

      if (!response.ok) {
        const parsedError = internalApiErrorEnvelopeSchema.safeParse(responseValue);
        if (!parsedError.success) throw new InternalApiClientError("INVALID_RESPONSE", response.status);
        throw new InternalApiClientError(parsedError.data.error.code, response.status);
      }

      const parsedSuccess = successEnvelopeSchema(dataSchema).safeParse(responseValue);
      if (!parsedSuccess.success) throw new InternalApiClientError("INVALID_RESPONSE", response.status);
      return (parsedSuccess.data as unknown as { data: z.infer<TSchema> }).data;
    }

    throw new InternalApiClientError("NETWORK_FAILURE");
  }
}
