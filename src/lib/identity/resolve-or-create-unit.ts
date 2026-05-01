import type { TransactionClient } from "@/lib/db/with-actor";
import { setActorContext } from "@/lib/db/with-actor";
import { appendOutboxEvent } from "@/lib/outbox/append";
import { recordAuditEvent } from "@/lib/audit/events";
import {
  acquireXactLock,
  canonicalUnitLockKey,
} from "@/lib/identity/advisory-locks";
import {
  canonicalizeAddress,
  type RawAddressInput,
} from "@/lib/identity/canonical-address";

export interface ResolveOrCreateUnitInput {
  address: RawAddressInput;
  actor: { role: "host" | "moderator" | "system"; id: string | null };
  requestId?: string;
}

export interface ResolveOrCreateUnitResult {
  unitId: string;
  unitIdentityEpoch: number;
  created: boolean;
  canonicalAddressHash: string;
  canonicalUnit: string;
  canonicalizerVersion: string;
  geocodeStatus: string;
  sourceVersion: bigint;
}

function formatGeocodeAddress(address: RawAddressInput): string {
  return [
    address.address,
    address.unit?.trim() ? address.unit.trim() : null,
    address.city,
    [address.state, address.zip].filter(Boolean).join(" "),
    address.country,
  ]
    .filter(
      (part): part is string =>
        typeof part === "string" && part.trim().length > 0
    )
    .map((part) => part.trim().replace(/\s+/g, " "))
    .join(", ");
}

async function enqueueGeocodeNeededIfAbsent(
  tx: TransactionClient,
  input: {
    unitId: string;
    address: string;
    canonicalAddressHash: string;
    sourceVersion: bigint;
    unitIdentityEpoch: number;
    requestId?: string;
  }
): Promise<void> {
  const activeRows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id
    FROM outbox_events
    WHERE aggregate_type = 'PHYSICAL_UNIT'
      AND aggregate_id = ${input.unitId}
      AND kind = 'GEOCODE_NEEDED'
      AND status IN ('PENDING', 'IN_FLIGHT')
    LIMIT 1
  `;

  if (activeRows.length > 0) {
    return;
  }

  await appendOutboxEvent(tx, {
    aggregateType: "PHYSICAL_UNIT",
    aggregateId: input.unitId,
    kind: "GEOCODE_NEEDED",
    payload: {
      address: input.address,
      canonicalAddressHash: input.canonicalAddressHash,
      requestId: input.requestId ?? null,
    },
    sourceVersion: input.sourceVersion,
    unitIdentityEpoch: input.unitIdentityEpoch,
    priority: 100,
  });
}

/**
 * Resolve or create the canonical physical_units row for the given address.
 *
 * Caller contract:
 *   This function MUST be called inside a `withActor()` transaction so that the
 *   `app.actor_role` and `app.actor_id` GUCs are set before the moderation-precedence
 *   trigger fires.
 *
 * Defensive behavior:
 *   Even when called directly (not via withActor), the local `setActorContext(tx, …)`
 *   calls below ensure `app.actor_role` is set for the duration of the transaction.
 *   `set_config(..., true)` is transaction-scoped and idempotent within a tx, so this
 *   is safe to do redundantly when withActor has already called it.
 */
export async function resolveOrCreateUnit(
  tx: TransactionClient,
  input: ResolveOrCreateUnitInput
): Promise<ResolveOrCreateUnitResult> {
  // Defensive guard: callers are expected to use withActor(), but keeping the
  // local set_config calls here preserves the actor context for direct tx users.
  await setActorContext(tx, input.actor);

  const canonical = canonicalizeAddress(input.address);
  await acquireXactLock(
    tx,
    canonicalUnitLockKey(canonical.canonicalAddressHash)
  );

  const unit = await tx.physicalUnit.upsert({
    where: {
      canonicalAddressHash_canonicalUnit: {
        canonicalAddressHash: canonical.canonicalAddressHash,
        canonicalUnit: canonical.canonicalUnit,
      },
    },
    create: {
      canonicalAddressHash: canonical.canonicalAddressHash,
      canonicalUnit: canonical.canonicalUnit,
      canonicalizerVersion: canonical.canonicalizerVersion,
    },
    update: {
      canonicalizerVersion: canonical.canonicalizerVersion,
      sourceVersion: { increment: BigInt(1) },
      rowVersion: { increment: BigInt(1) },
    },
    select: {
      id: true,
      unitIdentityEpoch: true,
      canonicalUnit: true,
      canonicalizerVersion: true,
      geocodeStatus: true,
      sourceVersion: true,
    },
  });

  // Prisma upsert does not expose Postgres xmax, so the created flag relies on
  // the invariant that inserts start at sourceVersion=1 and every update path
  // increments it before returning.
  const created = unit.sourceVersion === BigInt(1);

  await appendOutboxEvent(tx, {
    aggregateType: "PHYSICAL_UNIT",
    aggregateId: unit.id,
    kind: "UNIT_UPSERTED",
    payload: {
      canonicalAddressHash: canonical.canonicalAddressHash,
      canonicalUnit: canonical.canonicalUnit,
      created,
      requestId: input.requestId ?? null,
    },
    sourceVersion: unit.sourceVersion,
    unitIdentityEpoch: unit.unitIdentityEpoch,
  });

  const geocodeAddress = formatGeocodeAddress(input.address);
  if (unit.geocodeStatus !== "COMPLETE") {
    await enqueueGeocodeNeededIfAbsent(tx, {
      unitId: unit.id,
      address: geocodeAddress,
      canonicalAddressHash: canonical.canonicalAddressHash,
      sourceVersion: unit.sourceVersion,
      unitIdentityEpoch: unit.unitIdentityEpoch,
      requestId: input.requestId,
    });
  }

  await recordAuditEvent(tx, {
    kind: created ? "CANONICAL_UNIT_CREATED" : "CANONICAL_UNIT_RESOLVED",
    actor: input.actor,
    aggregateType: "physical_units",
    aggregateId: unit.id,
    requestId: input.requestId,
    unitIdentityEpoch: unit.unitIdentityEpoch,
    details: {
      created,
      canonicalizerVersion: canonical.canonicalizerVersion,
    },
  });

  return {
    unitId: unit.id,
    unitIdentityEpoch: unit.unitIdentityEpoch,
    created,
    canonicalAddressHash: canonical.canonicalAddressHash,
    canonicalUnit: unit.canonicalUnit,
    canonicalizerVersion: unit.canonicalizerVersion,
    geocodeStatus: unit.geocodeStatus,
    sourceVersion: unit.sourceVersion,
  };
}
