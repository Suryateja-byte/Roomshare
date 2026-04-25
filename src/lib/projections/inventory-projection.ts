/**
 * Inventory search projection builder.
 *
 * Rebuilds the `inventory_search_projection` row for a given listing inventory.
 * The UPSERT is idempotent and source_version-ordered: a stale event that arrives
 * after a newer one updates zero rows (detected by checking affected row count).
 */

import type { TransactionClient } from "@/lib/db/with-actor";
import { features } from "@/lib/env";
import { appendOutboxEvent } from "@/lib/outbox/append";
import type { PublishState } from "@/lib/projections/publish-states";
import { currentProjectionEpoch } from "@/lib/projections/epoch";

export interface InventoryProjectionInput {
  unitId: string;
  inventoryId: string;
  sourceVersion: bigint;
  unitIdentityEpoch: number;
}

export interface InventoryProjectionResult {
  updated: boolean;
  skippedStale: boolean;
  targetStatus: PublishState;
}

async function enqueueEmbedNeededIfAbsent(
  tx: TransactionClient,
  input: InventoryProjectionInput
): Promise<void> {
  const existingRows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id
    FROM outbox_events
    WHERE aggregate_type = 'LISTING_INVENTORY'
      AND aggregate_id = ${input.inventoryId}
      AND kind = 'EMBED_NEEDED'
      AND source_version = ${input.sourceVersion}::BIGINT
      AND status IN ('PENDING', 'IN_FLIGHT', 'COMPLETED')
    LIMIT 1
  `;

  if (existingRows.length > 0) {
    return;
  }

  await appendOutboxEvent(tx, {
    aggregateType: "LISTING_INVENTORY",
    aggregateId: input.inventoryId,
    kind: "EMBED_NEEDED",
    payload: { unitId: input.unitId },
    sourceVersion: input.sourceVersion,
    unitIdentityEpoch: input.unitIdentityEpoch,
    priority: 100,
  });
}

/**
 * Rebuild the inventory_search_projection row for the given inventory.
 *
 * 1. Fetches the current listing_inventories row (source of truth for fields).
 * 2. Fetches the corresponding physical_units row for geocode / location fields.
 * 3. UPSERTs into inventory_search_projection with the condition:
 *    `WHERE source_version <= EXCLUDED.source_version` (stale events → UPDATE 0).
 * 4. If the upsert updated a row and the inventory's publish_status was
 *    PENDING_PROJECTION or PENDING_EMBEDDING, transitions it to PUBLISHED and
 *    writes last_published_version.
 *
 * Returns `skippedStale=true` if source_version ordering caused no update.
 */
export async function rebuildInventorySearchProjection(
  tx: TransactionClient,
  input: InventoryProjectionInput
): Promise<InventoryProjectionResult> {
  const { unitId, inventoryId, sourceVersion, unitIdentityEpoch } = input;

  // Fetch source inventory row via raw SQL to capture availabilityRange (Unsupported Prisma type)
  const inventories = await tx.$queryRaw<
    {
      id: string;
      unit_id: string;
      unit_identity_epoch_written_at: number;
      room_category: string;
      capacity_guests: number | null;
      total_beds: number | null;
      open_beds: number | null;
      price: string;
      available_from: Date;
      available_until: Date | null;
      availability_range: string;
      lease_min_months: number | null;
      lease_max_months: number | null;
      lease_negotiable: boolean;
      gender_preference: string | null;
      household_gender: string | null;
      publish_status: string;
      source_version: bigint;
    }[]
  >`
    SELECT
      id, unit_id, unit_identity_epoch_written_at,
      room_category, capacity_guests, total_beds, open_beds,
      price::TEXT AS price,
      available_from, available_until,
      availability_range::TEXT AS availability_range,
      lease_min_months, lease_max_months, lease_negotiable,
      gender_preference, household_gender,
      publish_status, source_version
    FROM listing_inventories
    WHERE id = ${inventoryId}
      AND unit_id = ${unitId}
    LIMIT 1
  `;
  const inventory = inventories[0] ?? null;

  if (!inventory) {
    // Inventory deleted — treat as stale (tombstone handler covers actual deletion)
    return { updated: false, skippedStale: true, targetStatus: "ARCHIVED" };
  }

  // Fetch physical unit for location fields via raw SQL to avoid type issues
  const units = await tx.$queryRaw<
    { public_point: string | null; public_cell_id: string | null; public_area_name: string | null }[]
  >`
    SELECT public_point, public_cell_id, public_area_name
    FROM physical_units
    WHERE id = ${unitId}
    LIMIT 1
  `;
  const unit = units[0] ?? null;

  const projectionEpoch = currentProjectionEpoch();
  const phase03Enabled = features.phase03SemanticProjectionWrites;
  const projectionStatus: PublishState =
    inventory.publish_status === "PENDING_GEOCODE"
      ? "PENDING_GEOCODE"
      : inventory.publish_status === "PENDING_PROJECTION" ||
          inventory.publish_status === "PENDING_EMBEDDING"
        ? "PUBLISHED"
        : (inventory.publish_status as PublishState);
  const targetStatus: PublishState =
    phase03Enabled && inventory.publish_status === "PENDING_PROJECTION"
      ? "PENDING_EMBEDDING"
      : phase03Enabled && inventory.publish_status === "PENDING_EMBEDDING"
        ? "PENDING_EMBEDDING"
        : projectionStatus;

  // Raw UPSERT with source_version guard.
  // Prisma upsert cannot express the conditional WHERE clause on ON CONFLICT DO UPDATE.
  const updatedCount = await tx.$executeRaw`
    INSERT INTO inventory_search_projection (
      id, inventory_id, unit_id, unit_identity_epoch_written_at,
      room_category, capacity_guests, total_beds, open_beds,
      price, available_from, available_until, availability_range,
      lease_min_months, lease_max_months, lease_negotiable,
      gender_preference, household_gender,
      public_point, public_cell_id, public_area_name,
      publish_status, source_version, projection_epoch,
      created_at, updated_at
    )
    VALUES (
      ${inventoryId},
      ${inventoryId},
      ${unitId},
      ${unitIdentityEpoch},
      ${inventory.room_category},
      ${inventory.capacity_guests}::INTEGER,
      ${inventory.total_beds}::INTEGER,
      ${inventory.open_beds}::INTEGER,
      ${parseFloat(inventory.price)}::NUMERIC,
      ${inventory.available_from}::DATE,
      ${inventory.available_until ?? null}::DATE,
      ${inventory.availability_range}::TSTZRANGE,
      ${inventory.lease_min_months}::INTEGER,
      ${inventory.lease_max_months}::INTEGER,
      ${inventory.lease_negotiable},
      ${inventory.gender_preference ?? null},
      ${inventory.household_gender ?? null},
      ${unit?.public_point ?? null},
      ${unit?.public_cell_id ?? null},
      ${unit?.public_area_name ?? null},
      ${projectionStatus},
      ${sourceVersion}::BIGINT,
      ${projectionEpoch}::BIGINT,
      NOW(), NOW()
    )
    ON CONFLICT (inventory_id) DO UPDATE SET
      unit_id                         = EXCLUDED.unit_id,
      unit_identity_epoch_written_at  = EXCLUDED.unit_identity_epoch_written_at,
      room_category                   = EXCLUDED.room_category,
      capacity_guests                 = EXCLUDED.capacity_guests,
      total_beds                      = EXCLUDED.total_beds,
      open_beds                       = EXCLUDED.open_beds,
      price                           = EXCLUDED.price,
      available_from                  = EXCLUDED.available_from,
      available_until                 = EXCLUDED.available_until,
      availability_range              = EXCLUDED.availability_range,
      lease_min_months                = EXCLUDED.lease_min_months,
      lease_max_months                = EXCLUDED.lease_max_months,
      lease_negotiable                = EXCLUDED.lease_negotiable,
      gender_preference               = EXCLUDED.gender_preference,
      household_gender                = EXCLUDED.household_gender,
      public_point                    = EXCLUDED.public_point,
      public_cell_id                  = EXCLUDED.public_cell_id,
      public_area_name                = EXCLUDED.public_area_name,
      publish_status                  = EXCLUDED.publish_status,
      source_version                  = EXCLUDED.source_version,
      projection_epoch                = EXCLUDED.projection_epoch,
      updated_at                      = NOW()
    WHERE inventory_search_projection.source_version <= EXCLUDED.source_version
  `;

  const updated = updatedCount > 0;
  const skippedStale = !updated;

  if (updated && targetStatus === "PENDING_EMBEDDING") {
    await tx.$executeRaw`
      UPDATE listing_inventories
      SET publish_status = ${targetStatus},
          updated_at     = NOW()
      WHERE id = ${inventoryId}
    `;
    await enqueueEmbedNeededIfAbsent(tx, input);
  } else if (updated && (targetStatus === "PUBLISHED" || targetStatus === "STALE_PUBLISHED")) {
    // Record that this source_version was successfully published
    await tx.$executeRaw`
      UPDATE listing_inventories
      SET publish_status        = ${targetStatus},
          last_published_version = ${sourceVersion}::BIGINT,
          updated_at            = NOW()
      WHERE id = ${inventoryId}
    `;
  }

  return { updated, skippedStale, targetStatus };
}
