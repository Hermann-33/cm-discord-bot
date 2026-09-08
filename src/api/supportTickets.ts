import { z } from "zod";

const discordSnowflakeSchema = z.string().regex(/^\d{5,32}$/);
const timestampSchema = z.string().datetime({ offset: true });
const uuidSchema = z.string().uuid();

const baseFields = {
  channelId: discordSnowflakeSchema,
  creatorDiscordId: discordSnowflakeSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema
};

export const supportTicketAccessSchema = z.discriminatedUnion("state", [
  z.object({
    ...baseFields,
    state: z.literal("locked"),
    verifiedAt: z.null(),
    verifiedUntil: z.null(),
    overrideAdminId: z.null(),
    overrideAt: z.null()
  }).strict(),
  z.object({
    ...baseFields,
    state: z.literal("verified"),
    verifiedAt: timestampSchema,
    verifiedUntil: timestampSchema,
    overrideAdminId: z.null(),
    overrideAt: z.null()
  }).strict(),
  z.object({
    ...baseFields,
    state: z.literal("admin_override"),
    verifiedAt: z.null(),
    verifiedUntil: z.null(),
    overrideAdminId: discordSnowflakeSchema,
    overrideAt: timestampSchema
  }).strict()
]);

export const supportTicketAccessReadRequestSchema = z.object({
  channelId: discordSnowflakeSchema
}).strict();

export const supportTicketVerifyRequestSchema = z.object({
  channelId: discordSnowflakeSchema,
  creatorDiscordId: discordSnowflakeSchema
}).strict();

export const supportTicketOverrideRequestSchema = z.object({
  channelId: discordSnowflakeSchema,
  creatorDiscordId: discordSnowflakeSchema,
  adminDiscordId: discordSnowflakeSchema,
  reason: z.string().trim().min(1).max(500),
  idempotencyKey: uuidSchema
}).strict();

export const supportTicketAccessReadResponseSchema = z.object({
  ticketAccess: supportTicketAccessSchema.nullable(),
  accessGranted: z.boolean()
}).strict();

export const supportTicketVerifyResponseSchema = z.object({
  verification: z.object({
    linked: z.boolean(),
    accessGranted: z.boolean(),
    ticketAccess: supportTicketAccessSchema
  }).strict()
}).strict().superRefine(({ verification }, context) => {
  const expectedGranted = verification.linked ||
    verification.ticketAccess.state === "admin_override";

  if (verification.accessGranted !== expectedGranted) {
    context.addIssue({
      code: "custom",
      path: ["verification", "accessGranted"],
      message: "Verification grant is inconsistent with link and ticket state."
    });
  }

  if (verification.ticketAccess.state === "verified" && !verification.linked) {
    context.addIssue({
      code: "custom",
      path: ["verification", "linked"],
      message: "Verified ticket state requires an active Discord link."
    });
  }

  if (verification.ticketAccess.state === "locked" && verification.linked) {
    context.addIssue({
      code: "custom",
      path: ["verification", "linked"],
      message: "Locked ticket state cannot report an active Discord link."
    });
  }
});

export const supportTicketOverrideResponseSchema = z.object({
  override: z.object({
    ticketAccess: supportTicketAccessSchema,
    idempotentReplay: z.boolean()
  }).strict()
}).strict().superRefine(({ override }, context) => {
  if (override.ticketAccess.state !== "admin_override") {
    context.addIssue({
      code: "custom",
      path: ["override", "ticketAccess", "state"],
      message: "Ticket override must return admin_override state."
    });
  }
});

export type SupportTicketAccess = z.infer<typeof supportTicketAccessSchema>;
export type SupportTicketAccessReadData = z.infer<typeof supportTicketAccessReadResponseSchema>;
export type SupportTicketVerifyData = z.infer<typeof supportTicketVerifyResponseSchema>["verification"];
export type SupportTicketOverrideData = z.infer<typeof supportTicketOverrideResponseSchema>["override"];
