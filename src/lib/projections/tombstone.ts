/**
 * Tombstone handler — removes inventory and unit projection rows and enqueues
 * a cache invalidation to notify downstream caches.
 *
 * Handles four tombstone reasons:
 *   TOMBSTONE   — inventory archived/deleted
 *   SUPPRESSION — moderator suppressed the inventory
 *   PAUSE       — host or moderator paused the inventory
 *   ARCHIVE     — inventory archived (graceful retirement)
 *
 * Each reason results in the same fan-out:
 *   1. DELETE from inventory_search_projection (if inventoryId supplied)
 *   2. Regroup unit_public_projection (may delete unit row if no more visible inventory)
 *   3. INSERT into cache_invalidations
 *   4. Append CACHE_INVALIDATE outbox event (priority=10) for downstream cache clearing
 */

import { randomUUID } from "crypto";
import type { TransactionClient } from "@/lib/db/with-actor";
import { features } from "@/lib/env";
import { appendOutboxEvent } from "@/lib/outbox/append";
import { rebuildUnitPublicProjection } from "@/lib/projections/unit-projection";
import { currentProjectionEpoch } from "@/lib/projections/epoch";
import { tombstoneSemanticProjectionRows } from "@/lib/projections/semantic";

export type TombstoneReason = "TOMBSTONE" | "SUPPRESSION" | "PAUSE" | "ARCHIVE";

export interface TombstoneInput {
  unitId: string;
  inventoryId: string | null;
  reason: TombstoneReason;
  unitIdentityEpoch: number;
  sourceVersion: bigint;
}

/**
 * Execute the tombstone fan-out for a suppressed/archived/paused inventory.
 *
 * @returns deletedInventoryRows  Number of inventory_search_projection rows deleted (0 or 1)
 * @returns unitRowDeleted        Whether the unit_public_projection row was also deleted
 * @returns cacheInvalidationId   ID of the newly inserted cache_invalidations row
 */
export async function handleTombstone(
  tx: TransactionClient,
  input: TombstoneInput
): Promise<{
  deletedInventoryRows: number;
  unitRowDeleted: boolean;
  cacheInvalidationId: string;
  deletedSemanticRows: number;
}> {
  const { unitId, inventoryId, reason, unitIdentityEpoch, sourceVersion } = input;

  // 1. Delete from inventory_search_projection
  let deletedInventoryRows = 0;
  if (inventoryId) {
    deletedInventoryRows = await tx.$executeRaw`
      DELETE FROM inventory_search_projection
      WHERE inventory_id = ${inventoryId}
    `;
  }

  // Phase 03 dark semantic projection fan-out. Gated so Phase 02 fixtures that
  // do not have the semantic table continue to exercise the older slice.
  const deletedSemanticRows = features.phase03SemanticProjectionWrites
    ? await tombstoneSemanticProjectionRows(tx, { unitId, inventoryId })
    : 0;

  // 2. Regroup unit_public_projection (will DELETE if no visible inventory left)
  const unitResult = await rebuildUnitPublicProjection(tx, unitId, unitIdentityEpoch);

  // 3. Insert cache_invalidations row
  const cacheInvalidationId = randomUUID();
  const projectionEpoch = currentProjectionEpoch();

  await tx.$executeRaw`
    INSERT INTO cache_invalidations (id, unit_id, projection_epoch, unit_identity_epoch, reason, enqueued_at)
    VALUES (
      ${cacheInvalidationId},
      ${unitId},
      ${projectionEpoch}::BIGINT,
      ${unitIdentityEpoch},
      ${reason},
      NOW()
    )
  `;

  // 4. Enqueue CACHE_INVALIDATE outbox event (priority=10, cache_invalidate lane)
  await appendOutboxEvent(tx, {
    aggregateType: "PHYSICAL_UNIT",
    aggregateId: unitId,
    kind: "CACHE_INVALIDATE",
    payload: {
      unitId,
      cacheInvalidationId,
      reason,
      unitIdentityEpoch,
    },
    sourceVersion,
    unitIdentityEpoch,
    priority: 10,
  });

  return {
    deletedInventoryRows,
    unitRowDeleted: unitResult.deleted,
    cacheInvalidationId,
    deletedSemanticRows,
  };
}
