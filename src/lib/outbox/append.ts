import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { TransactionClient } from "@/lib/db/with-actor";

const OutboxAggregateTypeSchema = z.enum([
  "PHYSICAL_UNIT",
  "LISTING_INVENTORY",
  "HOST_UNIT_CLAIM",
  "IDENTITY_MUTATION",
  "PAYMENT",
  "SAVED_SEARCH",
  "ALERT_DELIVERY",
]);

const OutboxKindSchema = z.enum([
  "UNIT_UPSERTED",
  "INVENTORY_UPSERTED",
  "IDENTITY_MUTATION",
  "TOMBSTONE",
  // Phase 02 additions
  "CACHE_INVALIDATE",
  "SUPPRESSION",
  "PAUSE",
  "GEOCODE_NEEDED",
  "EMBED_NEEDED",
  "PAYMENT_WEBHOOK",
  "ALERT_MATCH",
  "ALERT_DELIVER",
]);

const AppendOutboxInputSchema = z.object({
  aggregateType: OutboxAggregateTypeSchema,
  aggregateId: z.string().trim().min(1),
  kind: OutboxKindSchema,
  payload: z.record(z.string(), z.unknown()),
  sourceVersion: z.bigint(),
  unitIdentityEpoch: z.number().int().positive(),
  priority: z.number().int().min(0).max(32767).optional(),
});

export type OutboxAggregateType = z.infer<typeof OutboxAggregateTypeSchema>;
export type OutboxKind = z.infer<typeof OutboxKindSchema>;
export type AppendOutboxInput = z.infer<typeof AppendOutboxInputSchema>;

export async function appendOutboxEvent(
  tx: TransactionClient,
  input: AppendOutboxInput
): Promise<{ outboxEventId: string }> {
  const parsed = AppendOutboxInputSchema.parse(input);
  const created = await tx.outboxEvent.create({
    data: {
      aggregateType: parsed.aggregateType,
      aggregateId: parsed.aggregateId,
      kind: parsed.kind,
      payload: parsed.payload as Prisma.InputJsonObject,
      sourceVersion: parsed.sourceVersion,
      unitIdentityEpoch: parsed.unitIdentityEpoch,
      priority: parsed.priority ?? 100,
    },
    select: { id: true },
  });

  return { outboxEventId: created.id };
}
