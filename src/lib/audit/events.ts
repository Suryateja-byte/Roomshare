import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { TransactionClient } from "@/lib/db/with-actor";

const AuditEventKindSchema = z.enum([
  "CANONICAL_UNIT_RESOLVED",
  "CANONICAL_UNIT_CREATED",
  "IDENTITY_MUTATION",
  "MODERATION_LOCKED_REJECTED",
  "HOST_CLAIM_UPSERTED",
  "INVENTORY_UPSERTED",
  "REFUND_RECORDED",
  "DISPUTE_OPENED",
  "DISPUTE_RESOLVED",
  "ENTITLEMENT_FROZEN",
  "ENTITLEMENT_RESTORED",
  "ENTITLEMENT_REVOKED",
  "PAYMENT_AMOUNT_MISMATCH",
  "PAYMENT_FRAUD_FLAGGED",
  "EMERGENCY_GRANT",
  "FRAUD_AUDIT_SCHEDULED",
]);

const AuditAggregateTypeSchema = z.enum([
  "physical_units",
  "host_unit_claims",
  "listing_inventories",
  "identity_mutations",
  "payments",
  "refunds",
  "payment_disputes",
  "entitlement_grants",
  "stripe_events",
  "contact_consumption",
  "fraud_audit_jobs",
]);

const PII_BLOCKLIST =
  /^(email|phone|password|address|token|secret|streetAddress|postalAddress)$/i;

const AuditDetailsSchema = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
  .superRefine((details, ctx) => {
    for (const key of Object.keys(details)) {
      if (PII_BLOCKLIST.test(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `PII-like detail keys are not allowed: ${key}`,
        });
      }
    }
  });

const AuditEventInputSchema = z.object({
  kind: AuditEventKindSchema,
  actor: z.object({
    role: z.enum(["host", "moderator", "system"]),
    id: z.string().trim().min(1).nullable(),
  }),
  aggregateType: AuditAggregateTypeSchema,
  aggregateId: z.string().trim().min(1),
  details: AuditDetailsSchema.optional(),
  requestId: z.string().trim().min(1).optional(),
  unitIdentityEpoch: z.number().int().positive().optional(),
});

export type AuditEventKind = z.infer<typeof AuditEventKindSchema>;
export type AuditEventInput = z.infer<typeof AuditEventInputSchema>;

export async function recordAuditEvent(
  tx: TransactionClient,
  input: AuditEventInput
): Promise<{ auditEventId: string }> {
  const parsed = AuditEventInputSchema.parse(input);
  const created = await tx.auditEvent.create({
    data: {
      kind: parsed.kind,
      actorRole: parsed.actor.role,
      actorId: parsed.actor.id,
      aggregateType: parsed.aggregateType,
      aggregateId: parsed.aggregateId,
      details: (parsed.details ?? {}) as Prisma.InputJsonObject,
      requestId: parsed.requestId ?? null,
      unitIdentityEpoch: parsed.unitIdentityEpoch ?? null,
    },
    select: { id: true },
  });

  return { auditEventId: created.id };
}
