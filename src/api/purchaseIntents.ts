import { z } from "zod";

const uuidSchema = z.string().uuid();
const timestampSchema = z.string().datetime({ offset: true });
const nullableTimestampSchema = timestampSchema.nullable();

const purchaseIntentIdSelectorSchema = z.object({
  kind: z.literal("purchase_intent_id"),
  value: uuidSchema
}).strict();

const purchaseIntentPublicRefSelectorSchema = z.object({
  kind: z.literal("public_ref"),
  value: z.string().regex(/^[A-Z0-9-]{1,64}$/)
}).strict();

export const purchaseIntentLookupSelectorSchema = z.discriminatedUnion("kind", [
  purchaseIntentIdSelectorSchema,
  purchaseIntentPublicRefSelectorSchema
]);

export const purchaseIntentLookupRequestSchema = z.object({
  selector: purchaseIntentLookupSelectorSchema
}).strict();

const purchaseIntentOperatorSchema = z.object({
  provider: z.literal("discord"),
  externalUserId: z.string().regex(/^\d{17,20}$/),
  username: z.string().trim().min(1).max(100).nullable().optional(),
  displayName: z.string().trim().min(1).max(100).nullable().optional()
}).strict();

export const purchaseIntentProcessRequestSchema = z.object({
  selector: purchaseIntentLookupSelectorSchema,
  reason: z.string().trim().min(8).max(1_000),
  evidenceReference: z.string().trim().min(1).max(500).optional(),
  idempotencyKey: uuidSchema,
  operator: purchaseIntentOperatorSchema.optional()
}).strict();

/**
 * The process endpoint has a larger durable-processing DTO than the bot needs.
 * Consume only the documented stable fields and re-resolve canonical purchase/order
 * state through the strict lookup endpoints after processing.
 */
export const purchaseIntentProcessResponseSchema = z.object({
  processing: z.object({
    status: z.enum(["processed", "processing"])
  }).passthrough(),
  effectsStatus: z.enum(["not_applicable", "pending", "completed", "manual_review_required"]).optional(),
  idempotentReplay: z.boolean().optional()
}).passthrough();

export const purchaseIntentLookupResponseSchema = z.object({
  purchaseIntent: z.object({
    purchaseIntentId: uuidSchema,
    publicRef: z.string().min(1).max(128).nullable(),
    userId: uuidSchema,
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
    providerStatus: z.string().min(1).max(128).nullable(),
    orderId: uuidSchema.nullable(),
    expiresAt: nullableTimestampSchema,
    createdAt: timestampSchema
  }).strict()
}).strict();

export type PurchaseIntentLookupSelector = z.infer<typeof purchaseIntentLookupSelectorSchema>;
export type PurchaseIntentData = z.infer<typeof purchaseIntentLookupResponseSchema>["purchaseIntent"];
export type PurchaseIntentProcessInput = z.infer<typeof purchaseIntentProcessRequestSchema>;
export type PurchaseIntentProcessData = z.infer<typeof purchaseIntentProcessResponseSchema>;
