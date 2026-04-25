import { z } from "zod";
import type { TransactionClient } from "@/lib/db/with-actor";
import { recordAuditEvent } from "@/lib/audit/events";
import { appendOutboxEvent } from "@/lib/outbox/append";
import {
  acquireXactLock,
  identityMutationLockKey,
} from "@/lib/identity/advisory-locks";

export type IdentityMutationKind =
  | "MERGE"
  | "SPLIT"
  | "CANONICALIZER_UPGRADE"
  | "MANUAL_MODERATION";

export interface IdentityMutationInput {
  kind: IdentityMutationKind;
  fromUnitIds: string[];
  toUnitIds: string[];
  reasonCode: string;
  operatorId: string | null;
}

export interface IdentityMutationResult {
  mutationId: string;
  resultingEpoch: number;
  affectedUnitIds: string[];
}

const ALLOWED_REASON_CODES = [
  "operator_duplicate",
  "operator_split",
  "operator_reconcile",
  "canonicalizer_upgrade",
  "manual_moderation",
  "moderation_review",
  "system_reconcile",
] as const;

const IdentityMutationInputSchema = z.object({
  kind: z.enum([
    "MERGE",
    "SPLIT",
    "CANONICALIZER_UPGRADE",
    "MANUAL_MODERATION",
  ]),
  fromUnitIds: z.array(z.string().trim().min(1)).min(1),
  toUnitIds: z.array(z.string().trim().min(1)).min(1),
  reasonCode: z.enum(ALLOWED_REASON_CODES),
  operatorId: z.string().trim().min(1).nullable(),
}).superRefine((value, ctx) => {
  if (value.kind === "MERGE" && value.toUnitIds.length !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["toUnitIds"],
      message: "MERGE requires exactly one target unit id",
    });
  }

  if (value.kind === "SPLIT" && value.fromUnitIds.length !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["fromUnitIds"],
      message: "SPLIT requires exactly one source unit id",
    });
  }
});

function uniq(values: string[]): string[] {
  return Array.from(new Set(values));
}

function dedupeSupersedes(existing: string[], incoming: string[]): string[] {
  return uniq([...existing, ...incoming]);
}

export async function recordIdentityMutation(
  tx: TransactionClient,
  input: IdentityMutationInput
): Promise<IdentityMutationResult> {
  const parsed = IdentityMutationInputSchema.parse({
    ...input,
    fromUnitIds: uniq(input.fromUnitIds),
    toUnitIds: uniq(input.toUnitIds),
  });

  const affectedUnitIds = uniq([...parsed.fromUnitIds, ...parsed.toUnitIds]).sort();
  for (const unitId of affectedUnitIds) {
    await acquireXactLock(tx, identityMutationLockKey(unitId));
  }

  const units = await tx.physicalUnit.findMany({
    where: { id: { in: affectedUnitIds } },
    select: {
      id: true,
      unitIdentityEpoch: true,
      supersedesUnitIds: true,
    },
  });

  const foundIds = new Set(units.map((unit) => unit.id));
  for (const unitId of affectedUnitIds) {
    if (!foundIds.has(unitId)) {
      throw new Error(`Unknown physical unit: ${unitId}`);
    }
  }

  const resultingEpoch =
    Math.max(...units.map((unit) => unit.unitIdentityEpoch), 0) + 1;

  const mutation = await tx.identityMutation.create({
    data: {
      kind: parsed.kind,
      fromUnitIds: parsed.fromUnitIds,
      toUnitIds: parsed.toUnitIds,
      reasonCode: parsed.reasonCode,
      operatorId: parsed.operatorId,
      resultingEpoch,
    },
    select: { id: true },
  });

  const unitById = new Map(units.map((unit) => [unit.id, unit]));

  for (const unitId of affectedUnitIds) {
    const current = unitById.get(unitId);
    if (!current) {
      continue;
    }

    const data: {
      unitIdentityEpoch: number;
      sourceVersion: { increment: bigint };
      rowVersion: { increment: bigint };
      supersededByUnitId?: string | null;
      supersedesUnitIds?: string[];
    } = {
      unitIdentityEpoch: resultingEpoch,
      sourceVersion: { increment: BigInt(1) },
      rowVersion: { increment: BigInt(1) },
    };

    if (parsed.kind === "MERGE" && parsed.toUnitIds.length === 1) {
      if (parsed.fromUnitIds.includes(unitId)) {
        data.supersededByUnitId = parsed.toUnitIds[0];
      }
      if (parsed.toUnitIds.includes(unitId)) {
        data.supersedesUnitIds = dedupeSupersedes(
          current.supersedesUnitIds,
          parsed.fromUnitIds
        );
      }
    }

    if (parsed.kind === "SPLIT" && parsed.toUnitIds.includes(unitId)) {
      data.supersedesUnitIds = dedupeSupersedes(
        current.supersedesUnitIds,
        parsed.fromUnitIds
      );
    }

    await tx.physicalUnit.update({
      where: { id: unitId },
      data,
    });
  }

  await appendOutboxEvent(tx, {
    aggregateType: "IDENTITY_MUTATION",
    aggregateId: mutation.id,
    kind: "IDENTITY_MUTATION",
    payload: {
      kind: parsed.kind,
      fromUnitIds: parsed.fromUnitIds,
      toUnitIds: parsed.toUnitIds,
      reasonCode: parsed.reasonCode,
    },
    sourceVersion: BigInt(1),
    unitIdentityEpoch: resultingEpoch,
    priority: 0,
  });

  await recordAuditEvent(tx, {
    kind: "IDENTITY_MUTATION",
    actor: {
      role: parsed.operatorId ? "moderator" : "system",
      id: parsed.operatorId,
    },
    aggregateType: "identity_mutations",
    aggregateId: mutation.id,
    unitIdentityEpoch: resultingEpoch,
    details: {
      affectedUnitCount: affectedUnitIds.length,
      reasonCode: parsed.reasonCode,
    },
  });

  return {
    mutationId: mutation.id,
    resultingEpoch,
    affectedUnitIds,
  };
}
