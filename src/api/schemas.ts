import { z } from "zod";

const requestIdSchema = z.string().uuid();
const timestampSchema = z.string().datetime({ offset: true });

export const leaderboardRequestSchema = z.object({
  limit: z.number().int().min(1).max(10)
}).strict();

export const externalIdentitySelectorSchema = z.object({
  kind: z.literal("external_identity"),
  provider: z.literal("discord"),
  externalUserId: z.string().regex(/^\d{5,32}$/)
}).strict();

export const auraLookupRequestSchema = z.object({
  selector: externalIdentitySelectorSchema
}).strict();

export const leaderboardResponseSchema = z.object({
  leaderboards: z.array(z.object({
    leaderboardType: z.enum(["lifetime", "available"]),
    rank: z.number().int().positive(),
    displayName: z.string().min(1).max(100),
    aura: z.number().int().nonnegative()
  }).strict()).max(20)
}).strict();

export const auraLookupResponseSchema = z.object({
  aura: z.object({
    displayName: z.string().min(1).max(100),
    availableAura: z.number().int().nonnegative(),
    lifetimeAura: z.number().int().nonnegative(),
    updatedAt: timestampSchema
  }).strict().nullable()
}).strict();

export const internalApiErrorCodeSchema = z.enum([
  "API_DISABLED",
  "AUTHENTICATION_FAILED",
  "REQUEST_EXPIRED",
  "REPLAY_DETECTED",
  "VALIDATION_FAILED",
  "REQUEST_TOO_LARGE",
  "OPERATION_FORBIDDEN",
  "IDENTITY_PROVIDER_UNSUPPORTED",
  "NOT_FOUND",
  "RATE_LIMITED",
  "DEPENDENCY_UNAVAILABLE",
  "INTERNAL_FAILURE"
]);

export const internalApiErrorEnvelopeSchema = z.object({
  ok: z.literal(false),
  requestId: requestIdSchema,
  error: z.object({
    code: internalApiErrorCodeSchema,
    message: z.string().min(1).max(200)
  }).strict()
}).strict();

export function successEnvelopeSchema<T extends z.ZodType>(dataSchema: T) {
  return z.object({
    ok: z.literal(true),
    requestId: requestIdSchema,
    data: dataSchema
  }).strict();
}

export type LeaderboardEntry = z.infer<typeof leaderboardResponseSchema>["leaderboards"][number];
export type AuraLookupData = z.infer<typeof auraLookupResponseSchema>["aura"];
export type InternalApiErrorCode = z.infer<typeof internalApiErrorCodeSchema>;
