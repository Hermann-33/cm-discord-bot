import { z } from "zod";

const requestIdSchema = z.string().uuid();
const uuidSchema = z.string().uuid();
const timestampSchema = z.string().datetime({ offset: true });
const nullableTimestampSchema = timestampSchema.nullable();
const discordSnowflakeSchema = z.string().regex(/^\d{5,32}$/);

export const CM_ADJUSTMENT_REASON_MAX_LENGTH = 500;
export const CM_WALLET_DELTA_MAX_CENTS = 100_000_000;
export const CM_AURA_DELTA_MAX = 1_000_000_000;

export const leaderboardRequestSchema = z.object({
  limit: z.number().int().min(1).max(10)
}).strict();

const userIdSelectorSchema = z.object({
  kind: z.literal("user_id"),
  value: uuidSchema
}).strict();

const userEmailSelectorSchema = z.object({
  kind: z.literal("email"),
  value: z.string().email().max(320)
}).strict();

export const externalIdentitySelectorSchema = z.object({
  kind: z.literal("external_identity"),
  provider: z.literal("discord"),
  externalUserId: discordSnowflakeSchema
}).strict();

export const userLookupSelectorSchema = z.discriminatedUnion("kind", [
  userIdSelectorSchema,
  userEmailSelectorSchema,
  externalIdentitySelectorSchema
]);

const orderIdSelectorSchema = z.object({
  kind: z.literal("order_id"),
  value: uuidSchema
}).strict();

const orderPublicRefSelectorSchema = z.object({
  kind: z.literal("public_ref"),
  value: z.string().regex(/^[A-Z0-9-]{1,64}$/)
}).strict();

export const orderLookupSelectorSchema = z.discriminatedUnion("kind", [
  orderIdSelectorSchema,
  orderPublicRefSelectorSchema
]);

export const auraLookupRequestSchema = z.object({
  selector: externalIdentitySelectorSchema
}).strict();

export const userOverviewRequestSchema = z.object({
  selector: userLookupSelectorSchema,
  recentOrdersLimit: z.number().int().min(1).max(10)
}).strict();

export const orderDetailsRequestSchema = z.object({
  selector: orderLookupSelectorSchema
}).strict();

export const orderFulfillmentRequestSchema = orderDetailsRequestSchema;
export const orderRefundPreviewRequestSchema = orderDetailsRequestSchema;

const internalIntegrationOperatorSchema = z.object({
  provider: z.literal("discord"),
  externalUserId: discordSnowflakeSchema,
  username: z.string().trim().min(1).max(100).nullable().optional(),
  displayName: z.string().trim().min(1).max(100).nullable().optional()
}).strict();

const mutationReasonSchema = z.string().trim().min(1).max(CM_ADJUSTMENT_REASON_MAX_LENGTH);
const nonZeroBoundedInteger = (maximum: number) => z.number()
  .int()
  .min(-maximum)
  .max(maximum)
  .refine((value) => value !== 0);

export const auraAdjustmentRequestSchema = z.object({
  selector: userLookupSelectorSchema,
  deltaAura: nonZeroBoundedInteger(CM_AURA_DELTA_MAX),
  reason: mutationReasonSchema,
  idempotencyKey: uuidSchema,
  operator: internalIntegrationOperatorSchema.optional()
}).strict();

export const walletAdjustmentRequestSchema = z.object({
  selector: userLookupSelectorSchema,
  deltaCents: nonZeroBoundedInteger(CM_WALLET_DELTA_MAX_CENTS),
  reason: mutationReasonSchema,
  idempotencyKey: uuidSchema,
  operator: internalIntegrationOperatorSchema.optional()
}).strict();

export const orderRefundExecuteRequestSchema = z.object({
  selector: orderLookupSelectorSchema,
  reason: z.string().trim().min(8).max(1_000),
  idempotencyKey: uuidSchema,
  operator: internalIntegrationOperatorSchema.optional()
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

const safeExternalIdentitySchema = z.object({
  provider: z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/),
  externalUserId: z.string().min(1).max(128).regex(/^\S+$/),
  username: z.string().min(1).max(100).nullable(),
  displayName: z.string().min(1).max(100).nullable(),
  linkedAt: timestampSchema
}).strict();

const staffOrderPreviewSchema = z.object({
  orderId: uuidSchema,
  publicRef: z.string().min(1).max(128).nullable(),
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
  fulfillment: z.object({
    linkedLicenseCount: z.number().int().nonnegative(),
    accountDeliveryCount: z.number().int().nonnegative(),
    productDeliveryCount: z.number().int().nonnegative(),
    quantityRequested: z.number().int().nonnegative(),
    quantityDelivered: z.number().int().nonnegative(),
    manualRequired: z.boolean()
  }).strict()
}).strict();

export const userOverviewResponseSchema = z.object({
  overview: z.object({
    identity: z.object({
      userId: uuidSchema,
      email: z.string().email().max(320).nullable(),
      createdAt: timestampSchema,
      lastSignInAt: nullableTimestampSchema,
      externalIdentities: z.array(safeExternalIdentitySchema).max(10)
    }).strict(),
    accountControl: z.object({
      isBanned: z.boolean(),
      banReason: z.string().min(1).max(2000).nullable(),
      bannedAt: nullableTimestampSchema,
      unbannedAt: nullableTimestampSchema,
      updatedAt: nullableTimestampSchema
    }).strict(),
    wallet: z.object({
      balanceCents: z.number().int(),
      currency: z.string().min(1).max(12),
      updatedAt: timestampSchema
    }).strict().nullable(),
    aura: z.object({
      availableAura: z.number().int().nonnegative(),
      pendingAura: z.number().int().nonnegative(),
      lifetimeEarnedAura: z.number().int().nonnegative(),
      lifetimeRedeemedAura: z.number().int().nonnegative(),
      updatedAt: timestampSchema
    }).strict().nullable(),
    counts: z.object({
      orders: z.number().int().nonnegative(),
      licenses: z.number().int().nonnegative(),
      accountDeliveries: z.number().int().nonnegative()
    }).strict(),
    recentOrders: z.array(staffOrderPreviewSchema).max(10)
  }).strict()
}).strict();

const staffOrderBaseSchema = staffOrderPreviewSchema.omit({ fulfillment: true }).extend({
  userId: uuidSchema,
  customerEmail: z.string().email().max(320).nullable(),
  payment: z.object({
    method: z.string().min(1).max(64).nullable(),
    provider: z.string().min(1).max(64).nullable()
  }).strict(),
  fulfillmentSummary: staffOrderPreviewSchema.shape.fulfillment
}).omit({ paymentMethod: true, paymentProvider: true }).strict();

export const orderDetailsResponseSchema = z.object({
  order: staffOrderBaseSchema
}).strict();

const productFulfillmentSchema = z.object({
  kind: z.literal("product"),
  deliveryId: uuidSchema,
  providerCode: z.string().min(1).max(100),
  status: z.string().min(1).max(100),
  quantityRequested: z.number().int().nonnegative(),
  quantityDelivered: z.number().int().nonnegative(),
  failureCode: z.string().min(1).max(200).nullable(),
  userMessage: z.string().min(1).max(2000).nullable(),
  manualRequiredAt: nullableTimestampSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema
}).strict();

const accountFulfillmentSchema = z.object({
  kind: z.literal("account"),
  deliveryId: uuidSchema,
  providerCode: z.string().min(1).max(100),
  deliveryKind: z.string().min(1).max(100),
  status: z.string().min(1).max(100),
  quantityRequested: z.number().int().nonnegative(),
  quantityDelivered: z.number().int().nonnegative(),
  failureCode: z.string().min(1).max(200).nullable(),
  userMessage: z.string().min(1).max(2000).nullable(),
  manualRequiredAt: nullableTimestampSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema
}).strict();

const maskedFulfillmentMaterialSchema = z.object({
  kind: z.enum(["license_key", "account_token"]),
  maskedValue: z.string().min(1).max(256)
}).strict();

const orderFulfillmentSupportSchema = z.object({
  productTypeLabel: z.string().min(1).max(200).nullable(),
  productDurationDays: z.number().int().positive().nullable(),
  maskedMaterials: z.array(maskedFulfillmentMaterialSchema).max(10),
  manualRequired: z.boolean()
}).strict();

export const orderFulfillmentResponseSchema = z.object({
  order: z.object({
    orderId: uuidSchema,
    publicRef: z.string().min(1).max(128).nullable(),
    purchaseKind: z.enum(["product", "account"]),
    status: z.string().min(1).max(64)
  }).strict(),
  linkedLicenseCount: z.number().int().nonnegative(),
  fulfillments: z.array(z.discriminatedUnion("kind", [
    productFulfillmentSchema,
    accountFulfillmentSchema
  ])).max(10),
  support: orderFulfillmentSupportSchema.optional()
}).strict();

export const orderRefundPreviewResponseSchema = z.object({
  refundPreview: z.object({
    status: z.literal("eligible"),
    orderId: uuidSchema,
    publicRef: z.string().min(1).max(128).nullable(),
    userId: uuidSchema,
    purchaseKind: z.enum(["product", "account"]),
    productSlug: z.string().min(1).max(160).nullable(),
    accountSlug: z.string().min(1).max(160).nullable(),
    currency: z.string().min(1).max(12),
    grossRefundCents: z.number().int().nonnegative(),
    finalWalletCreditCents: z.number().int().nonnegative(),
    auraAwarded: z.number().int().nonnegative(),
    auraRecovered: z.number().int().nonnegative(),
    auraRecoveredAvailable: z.number().int().nonnegative(),
    auraRecoveredPending: z.number().int().nonnegative(),
    auraUnrecoverable: z.number().int().nonnegative(),
    auraConvertible: z.number().int().nonnegative(),
    auraDeductionCents: z.number().int().nonnegative(),
    auraResidual: z.number().int().nonnegative()
  }).strict()
}).strict();

export const orderRefundExecuteResponseSchema = z.object({
  refund: z.object({
    status: z.literal("refunded"),
    orderId: uuidSchema,
    publicRef: z.string().min(1).max(128).nullable(),
    userId: uuidSchema,
    purchaseKind: z.enum(["product", "account"]),
    productSlug: z.string().min(1).max(160).nullable(),
    accountSlug: z.string().min(1).max(160).nullable(),
    currency: z.string().min(1).max(12),
    grossRefundCents: z.number().int().nonnegative(),
    finalWalletCreditCents: z.number().int().nonnegative(),
    auraAwarded: z.number().int().nonnegative(),
    auraRecovered: z.number().int().nonnegative(),
    auraRecoveredAvailable: z.number().int().nonnegative(),
    auraRecoveredPending: z.number().int().nonnegative(),
    auraUnrecoverable: z.number().int().nonnegative(),
    auraConvertible: z.number().int().nonnegative(),
    auraDeductionCents: z.number().int().nonnegative(),
    auraResidual: z.number().int().nonnegative(),
    walletTransactionId: uuidSchema,
    auraTransactionIds: z.array(uuidSchema).max(2),
    auditEventId: uuidSchema,
    refundedAt: timestampSchema,
    idempotentReplay: z.boolean()
  }).strict()
}).strict();

export const walletAdjustmentResponseSchema = z.object({
  adjustment: z.object({
    userId: uuidSchema,
    deltaCents: z.number().int(),
    balanceCents: z.number().int().nonnegative(),
    currency: z.string().min(1).max(12),
    transactionId: uuidSchema,
    auditEventId: uuidSchema,
    createdAt: timestampSchema,
    idempotentReplay: z.boolean()
  }).strict()
}).strict();

export const auraAdjustmentResponseSchema = z.object({
  adjustment: z.object({
    userId: uuidSchema,
    deltaAura: z.number().int(),
    availableAura: z.number().int().nonnegative(),
    pendingAura: z.number().int().nonnegative(),
    lifetimeEarnedAura: z.number().int().nonnegative(),
    lifetimeRedeemedAura: z.number().int().nonnegative(),
    transactionId: uuidSchema,
    auditEventId: uuidSchema,
    createdAt: timestampSchema,
    idempotentReplay: z.boolean()
  }).strict()
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
  "REFUND_NOT_ELIGIBLE",
  "ALREADY_REFUNDED",
  "REFUND_STATE_INVALID",
  "IDEMPOTENCY_CONFLICT",
  "INVALID_ADJUSTMENT",
  "INSUFFICIENT_BALANCE",
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
export type UserLookupSelector = z.infer<typeof userLookupSelectorSchema>;
export type OrderLookupSelector = z.infer<typeof orderLookupSelectorSchema>;
export type UserOverviewData = z.infer<typeof userOverviewResponseSchema>["overview"];
export type RecentOrderData = UserOverviewData["recentOrders"][number];
export type OrderDetailsData = z.infer<typeof orderDetailsResponseSchema>["order"];
export type OrderFulfillmentData = z.infer<typeof orderFulfillmentResponseSchema>;
export type OrderRefundPreviewData = z.infer<typeof orderRefundPreviewResponseSchema>["refundPreview"];
export type OrderRefundExecuteData = z.infer<typeof orderRefundExecuteResponseSchema>["refund"];
export type WalletAdjustmentData = z.infer<typeof walletAdjustmentResponseSchema>["adjustment"];
export type AuraAdjustmentData = z.infer<typeof auraAdjustmentResponseSchema>["adjustment"];
export type InternalIntegrationOperator = z.infer<typeof internalIntegrationOperatorSchema>;
export type InternalApiErrorCode = z.infer<typeof internalApiErrorCodeSchema>;
