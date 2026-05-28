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
import {
  buildPublicGeocodeFields,
  getPhysicalUnitGeocodePointStorage,
  type ProjectionCoordinates,
} from "@/lib/projections/public-geocode";

export interface ResolveOrCreateUnitInput {
  address: RawAddressInput;
  actor: { role: "host" | "moderator" | "system"; id: string | null };
  requestId?: string;
  trustedCoordinates?: ProjectionCoordinates;
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

  let effectiveUnit = unit;
  if (input.trustedCoordinates && unit.geocodeStatus !== "COMPLETE") {
    const publicGeocode = buildPublicGeocodeFields(input.trustedCoordinates);
    type UpdatedPhysicalUnitRow = {
      id: string;
      unitIdentityEpoch: number;
      canonicalUnit: string;
      canonicalizerVersion: string;
      geocodeStatus: string;
      sourceVersion: bigint;
    };
    const pointStorage = await getPhysicalUnitGeocodePointStorage(tx);
    const updatedRows =
      pointStorage === "geography"
        ? await tx.$queryRaw<UpdatedPhysicalUnitRow[]>`
            UPDATE physical_units
            SET geocode_status  = 'COMPLETE',
                exact_point     = ST_SetSRID(ST_GeomFromText(${publicGeocode.exactPointWkt}), 4326)::geography,
                public_point    = ST_SetSRID(ST_GeomFromText(${publicGeocode.publicPointWkt}), 4326)::geography,
                public_cell_id  = ${publicGeocode.publicCellId},
                source_version  = source_version + 1,
                row_version     = row_version + 1,
                updated_at      = NOW()
            WHERE id = ${unit.id}
              AND geocode_status <> 'COMPLETE'
            RETURNING
              id,
              unit_identity_epoch AS "unitIdentityEpoch",
              canonical_unit AS "canonicalUnit",
              canonicalizer_version AS "canonicalizerVersion",
              geocode_status AS "geocodeStatus",
              source_version AS "sourceVersion"
          `
        : await tx.$queryRaw<UpdatedPhysicalUnitRow[]>`
            UPDATE physical_units
            SET geocode_status  = 'COMPLETE',
                exact_point     = ${publicGeocode.exactPointWkt},
                public_point    = ${publicGeocode.publicPointWkt},
                public_cell_id  = ${publicGeocode.publicCellId},
                source_version  = source_version + 1,
                row_version     = row_version + 1,
                updated_at      = NOW()
            WHERE id = ${unit.id}
              AND geocode_status <> 'COMPLETE'
            RETURNING
              id,
              unit_identity_epoch AS "unitIdentityEpoch",
              canonical_unit AS "canonicalUnit",
              canonicalizer_version AS "canonicalizerVersion",
              geocode_status AS "geocodeStatus",
              source_version AS "sourceVersion"
          `;
    effectiveUnit = updatedRows[0] ?? unit;
  }

  await appendOutboxEvent(tx, {
    aggregateType: "PHYSICAL_UNIT",
    aggregateId: effectiveUnit.id,
    kind: "UNIT_UPSERTED",
    payload: {
      canonicalAddressHash: canonical.canonicalAddressHash,
      canonicalUnit: canonical.canonicalUnit,
      created,
      trustedCoordinates: Boolean(input.trustedCoordinates),
      requestId: input.requestId ?? null,
    },
    sourceVersion: effectiveUnit.sourceVersion,
    unitIdentityEpoch: effectiveUnit.unitIdentityEpoch,
  });

  const geocodeAddress = formatGeocodeAddress(input.address);
  if (effectiveUnit.geocodeStatus !== "COMPLETE") {
    await enqueueGeocodeNeededIfAbsent(tx, {
      unitId: effectiveUnit.id,
      address: geocodeAddress,
      canonicalAddressHash: canonical.canonicalAddressHash,
      sourceVersion: effectiveUnit.sourceVersion,
      unitIdentityEpoch: effectiveUnit.unitIdentityEpoch,
      requestId: input.requestId,
    });
  }

  await recordAuditEvent(tx, {
    kind: created ? "CANONICAL_UNIT_CREATED" : "CANONICAL_UNIT_RESOLVED",
    actor: input.actor,
    aggregateType: "physical_units",
    aggregateId: effectiveUnit.id,
    requestId: input.requestId,
    unitIdentityEpoch: effectiveUnit.unitIdentityEpoch,
    details: {
      created,
      canonicalizerVersion: canonical.canonicalizerVersion,
    },
  });

  return {
    unitId: effectiveUnit.id,
    unitIdentityEpoch: effectiveUnit.unitIdentityEpoch,
    created,
    canonicalAddressHash: canonical.canonicalAddressHash,
    canonicalUnit: effectiveUnit.canonicalUnit,
    canonicalizerVersion: effectiveUnit.canonicalizerVersion,
    geocodeStatus: effectiveUnit.geocodeStatus,
    sourceVersion: effectiveUnit.sourceVersion,
  };
}
