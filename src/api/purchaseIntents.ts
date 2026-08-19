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
