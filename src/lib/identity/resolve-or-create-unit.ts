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

  // Phase 02 addition: on new unit creation, enqueue GEOCODE_NEEDED so the
  // geocode worker resolves lat/lng and transitions inventories from
  // PENDING_GEOCODE → PENDING_PROJECTION. This is additive — Phase 01 tests
  // still pass because UNIT_UPSERTED is always appended first.
  if (created) {
    const fullAddress = [
      canonical.canonicalAddressHash,
      canonical.canonicalUnit !== "_none_" ? canonical.canonicalUnit : null,
    ]
      .filter(Boolean)
      .join(" ");
    await appendOutboxEvent(tx, {
      aggregateType: "PHYSICAL_UNIT",
      aggregateId: unit.id,
      kind: "GEOCODE_NEEDED",
      payload: {
        address: fullAddress,
        canonicalAddressHash: canonical.canonicalAddressHash,
        requestId: input.requestId ?? null,
      },
      sourceVersion: unit.sourceVersion,
      unitIdentityEpoch: unit.unitIdentityEpoch,
      priority: 100,
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
  };
}
