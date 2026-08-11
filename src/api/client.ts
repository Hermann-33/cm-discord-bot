import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type { InternalApiConfig } from "../config/env";
import { InternalApiClientError } from "./errors";
import {
  auraLookupRequestSchema,
  auraLookupResponseSchema,
  internalApiErrorEnvelopeSchema,
  leaderboardRequestSchema,
  leaderboardResponseSchema,
  successEnvelopeSchema,
  type AuraLookupData,
  type InternalApiErrorCode,
  type LeaderboardEntry
} from "./schemas";
import { createSignedHeaders } from "./signing";

export const INTERNAL_API_PATHS = {
  leaderboards: "/api/internal/integrations/v1/aura/leaderboards",
  auraLookup: "/api/internal/integrations/v1/aura/lookup"
} as const;

const METHOD = "POST";
const MAX_RESPONSE_BYTES = 64 * 1024;

const expectedStatuses: Record<InternalApiErrorCode, readonly number[]> = {
  API_DISABLED: [404],
  AUTHENTICATION_FAILED: [401],
  REQUEST_EXPIRED: [401],
  REPLAY_DETECTED: [409],
  VALIDATION_FAILED: [400, 405, 415],
  REQUEST_TOO_LARGE: [413],
  OPERATION_FORBIDDEN: [403],
  IDENTITY_PROVIDER_UNSUPPORTED: [400],
  NOT_FOUND: [404],
  RATE_LIMITED: [429],
  DEPENDENCY_UNAVAILABLE: [503],
  INTERNAL_FAILURE: [500]
};

export type InternalApiClientDependencies = {
  fetch: typeof fetch;
  nowMs: () => number;
  nonce: () => string;
};

const productionDependencies: InternalApiClientDependencies = {
  fetch: globalThis.fetch,
  nowMs: Date.now,
  nonce: randomUUID
};

async function readResponseText(response: Response): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new InternalApiClientError("INVALID_RESPONSE", response.status);
  }

  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new InternalApiClientError("INVALID_RESPONSE", response.status);
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks).toString("utf8");
}

function hasJsonContentType(response: Response): boolean {
  const contentType = response.headers.get("content-type");
  return Boolean(contentType?.toLowerCase().startsWith("application/json"));
}

function statusMatchesError(code: InternalApiErrorCode, status: number): boolean {
  return expectedStatuses[code].includes(status);
}

export class InternalApiClient {
  constructor(
    private readonly config: InternalApiConfig,
    private readonly dependencies: InternalApiClientDependencies = productionDependencies
  ) {}

  async fetchLeaderboards(): Promise<LeaderboardEntry[]> {
    const data = await this.request(
      INTERNAL_API_PATHS.leaderboards,
      leaderboardRequestSchema,
      { limit: 10 },
      leaderboardResponseSchema
    );
    return data.leaderboards;
  }

  async lookupAuraByDiscordId(discordUserId: string): Promise<AuraLookupData> {
    const data = await this.request(
      INTERNAL_API_PATHS.auraLookup,
      auraLookupRequestSchema,
      {
        selector: {
          kind: "external_identity",
          provider: "discord",
          externalUserId: discordUserId
        }
      },
      auraLookupResponseSchema
    );
    return data.aura;
  }

  private async request<
    TRequestSchema extends z.ZodType,
    TResponseSchema extends z.ZodType
  >(
    pathname: string,
    requestSchema: TRequestSchema,
    body: unknown,
    responseSchema: TResponseSchema
  ): Promise<z.infer<TResponseSchema>> {
    const parsedRequest = requestSchema.safeParse(body);
    if (!parsedRequest.success) {
      throw new InternalApiClientError("INVALID_REQUEST");
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const rawBody = JSON.stringify(parsedRequest.data);
      const rawBodyBytes = Buffer.from(rawBody, "utf8");
      const timestamp = String(this.dependencies.nowMs());
      const nonce = this.dependencies.nonce();
      const headers = createSignedHeaders(this.config.hmacSecret, {
        clientId: this.config.clientId,
        keyId: this.config.keyId,
        timestamp,
        nonce,
        method: METHOD,
        pathname,
        rawBody: rawBodyBytes
      });

      const controller = new AbortController();
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, this.config.timeoutMs);

      let response: Response;
      let responseText: string;
      try {
        response = await this.dependencies.fetch(`${this.config.origin}${pathname}`, {
          method: METHOD,
          headers,
          body: rawBody,
          signal: controller.signal
        });

        if (attempt === 0 && response.status === 503) {
          await response.body?.cancel();
          continue;
        }

        if (!hasJsonContentType(response)) {
          await response.body?.cancel();
          throw new InternalApiClientError("INVALID_RESPONSE", response.status);
        }

        responseText = await readResponseText(response);
      } catch (error) {
        if (error instanceof InternalApiClientError) throw error;
        if (attempt === 0) continue;
        throw new InternalApiClientError(timedOut ? "REQUEST_TIMEOUT" : "NETWORK_FAILURE");
      } finally {
        clearTimeout(timeout);
      }

      let responseValue: unknown;
      try {
        responseValue = JSON.parse(responseText);
      } catch {
        throw new InternalApiClientError("INVALID_RESPONSE", response.status);
      }

      if (!response.ok) {
        const parsedError = internalApiErrorEnvelopeSchema.safeParse(responseValue);
        if (
          !parsedError.success ||
          !statusMatchesError(parsedError.data.error.code, response.status)
        ) {
          throw new InternalApiClientError("INVALID_RESPONSE", response.status);
        }
        throw new InternalApiClientError(parsedError.data.error.code, response.status);
      }

      const parsedSuccess = successEnvelopeSchema(responseSchema).safeParse(responseValue);
      if (!parsedSuccess.success) {
        throw new InternalApiClientError("INVALID_RESPONSE", response.status);
      }
      return (parsedSuccess.data as unknown as { data: z.infer<TResponseSchema> }).data;
    }

    throw new InternalApiClientError("NETWORK_FAILURE");
  }
}
