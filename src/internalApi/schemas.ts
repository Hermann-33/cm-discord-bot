import { z } from "zod";

export const discordIdSchema = z.string().regex(/^\d{5,32}$/);
const uuidSchema = z.string().uuid();
const timestampSchema = z.string().datetime({ offset: true });
const nullableTimestampSchema = timestampSchema.nullable();

const scheduledLeaderboardRequestSchema = z.object({ mode: z.literal("scheduled"), guildId: discordIdSchema, limit: z.number().int().min(1).max(10) }).strict();
const manualLeaderboardRequestSchema = z.object({ mode: z.literal("manual"), guildId: discordIdSchema, actorDiscordUserId: discordIdSchema, eventId: discordIdSchema, source: z.enum(["message", "interaction"]), limit: z.number().int().min(1).max(10) }).strict();
export const auraLeaderboardsRequestSchema = z.discriminatedUnion("mode", [scheduledLeaderboardRequestSchema, manualLeaderboardRequestSchema]);
export const auraUserRequestSchema = z.object({ guildId: discordIdSchema, actorDiscordUserId: discordIdSchema }).strict();

const userIdSelectorSchema = z.object({ kind: z.literal("user_id"), value: uuidSchema }).strict();
const userEmailSelectorSchema = z.object({ kind: z.literal("email"), value: z.string().email().max(320) }).strict();
const userDiscordSelectorSchema = z.object({ kind: z.literal("discord_user_id"), value: discordIdSchema }).strict();
export const userSelectorSchema = z.discriminatedUnion("kind", [userIdSelectorSchema, userEmailSelectorSchema, userDiscordSelectorSchema]);
export const userLookupRequestSchema = z.object({ guildId: discordIdSchema, actorDiscordUserId: discordIdSchema, selector: userSelectorSchema }).strict();

const orderIdSelectorSchema = z.object({ kind: z.literal("order_id"), value: uuidSchema }).strict();
const orderPublicRefSelectorSchema = z.object({ kind: z.literal("public_ref"), value: z.string().regex(/^[A-Z0-9-]{1,64}$/) }).strict();
export const orderSelectorSchema = z.discriminatedUnion("kind", [orderIdSelectorSchema, orderPublicRefSelectorSchema]);
export const orderLookupRequestSchema = z.object({ guildId: discordIdSchema, actorDiscordUserId: discordIdSchema, selector: orderSelectorSchema }).strict();

export const auraLeaderboardsResponseSchema = z.object({
  leaderboards: z.array(z.object({ leaderboardType: z.enum(["lifetime", "available"]), rank: z.number().int().positive(), displayName: z.string().min(1).max(100), aura: z.number().int().nonnegative() }).strict()).max(20)
}).strict();

export const auraUserResponseSchema = z.discriminatedUnion("linked", [
  z.object({ linked: z.literal(true), displayName: z.string().min(1).max(100), availableAura: z.number().int().nonnegative(), lifetimeAura: z.number().int().nonnegative() }).strict(),
  z.object({ linked: z.literal(false) }).strict()
]);

const safeDiscordLinkSchema = z.object({ discordUserId: discordIdSchema, username: z.string().min(1).max(100).nullable(), globalName: z.string().min(1).max(100).nullable(), linkedAt: timestampSchema }).strict();
export const userLookupResponseSchema = z.object({
  user: z.object({
    userId: uuidSchema,
    maskedEmail: z.string().min(1).max(320).nullable(),
    createdAt: timestampSchema,
    lastSignInAt: nullableTimestampSchema,
    isBanned: z.boolean(),
    bannedAt: nullableTimestampSchema,
    discordLink: safeDiscordLinkSchema.nullable(),
    wallet: z.object({ balanceCents: z.number().int(), currency: z.string().min(1).max(12), updatedAt: timestampSchema }).strict().nullable(),
    aura: z.object({ availableAura: z.number().int().nonnegative(), lifetimeAura: z.number().int().nonnegative(), updatedAt: timestampSchema }).strict().nullable(),
    counts: z.object({ orders: z.number().int().nonnegative() }).strict()
  }).strict()
}).strict();

const fulfillmentStatusSchema = z.object({ status: z.string().min(1).max(64), quantityRequested: z.number().int().nonnegative(), quantityDelivered: z.number().int().nonnegative(), createdAt: timestampSchema }).strict();
export const orderLookupResponseSchema = z.object({
  order: z.object({
    orderId: uuidSchema,
    publicRef: z.string().min(1).max(128).nullable(),
    userId: uuidSchema,
    maskedCustomerEmail: z.string().min(1).max(320).nullable(),
    purchaseKind: z.enum(["product", "account"]),
    productSlug: z.string().min(1).max(160).nullable(),
    licenseOptionId: z.string().min(1).max(160).nullable(),
    accountSlug: z.string().min(1).max(160).nullable(),
    accountVariantId: z.string().min(1).max(160).nullable(),
    accountName: z.string().min(1).max(200).nullable(),
    accountVariantLabel: z.string().min(1).max(200).nullable(),
    accountGameName: z.string().min(1).max(200).nullable(),
    quantity: z.number().int().positive(),
    amountCents: z.number().int().nonnegative(),
    currency: z.string().min(1).max(12),
    paymentMethod: z.string().min(1).max(64).nullable(),
    paymentProvider: z.string().min(1).max(64).nullable(),
    status: z.string().min(1).max(64),
    createdAt: timestampSchema,
    fulfillment: z.object({ productDeliveries: z.array(fulfillmentStatusSchema).max(10), accountDeliveries: z.array(fulfillmentStatusSchema).max(10) }).strict()
  }).strict()
}).strict();

export const internalApiErrorCodeSchema = z.enum(["API_DISABLED", "AUTHENTICATION_FAILED", "REQUEST_EXPIRED", "REPLAY_DETECTED", "VALIDATION_FAILED", "REQUEST_TOO_LARGE", "GUILD_FORBIDDEN", "ACTOR_FORBIDDEN", "NOT_FOUND", "RATE_LIMITED", "DEPENDENCY_UNAVAILABLE", "INTERNAL_FAILURE"]);
export const internalApiErrorEnvelopeSchema = z.object({ ok: z.literal(false), requestId: z.string().min(1).max(128), error: z.object({ code: internalApiErrorCodeSchema, message: z.string().min(1).max(200) }).strict() }).strict();

export function successEnvelopeSchema<T extends z.ZodType>(dataSchema: T) {
  return z.object({ ok: z.literal(true), requestId: z.string().min(1).max(128), data: dataSchema }).strict();
}

export type UserSelector = z.infer<typeof userSelectorSchema>;
export type OrderSelector = z.infer<typeof orderSelectorSchema>;
export type UserLookupResponse = z.infer<typeof userLookupResponseSchema>;
export type OrderLookupResponse = z.infer<typeof orderLookupResponseSchema>;
export type InternalApiErrorCode = z.infer<typeof internalApiErrorCodeSchema>;
