/**
 * Unit public projection builder.
 *
 * Rebuilds the `unit_public_projection` row for a given (unit_id, unit_identity_epoch)
 * pair by grouping current published `inventory_search_projection` rows.
 *
 * If matching_inventory_count = 0 (all inventory tombstoned or hidden), the row
 * is DELETEd so the unit disappears from public views.
 */

import type { TransactionClient } from "@/lib/db/with-actor";
import { currentProjectionEpoch } from "@/lib/projections/epoch";

export interface UnitProjectionResult {
  upserted: boolean;
  deleted: boolean;
  matchingInventoryCount: number;
  sourceVersion: bigint | null;
}

async function hasPhase04UnitProjectionColumns(
  tx: TransactionClient
): Promise<boolean> {
  const rows = await tx.$queryRaw<{ has_phase04_columns: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'unit_public_projection'
        AND column_name = 'representative_inventory_id'
    ) AS has_phase04_columns
  `;
  return Boolean(rows[0]?.has_phase04_columns);
}

/**
 * Rebuild (or delete) the unit_public_projection row for the given unit.
 *
 * Groups all `inventory_search_projection` rows in ('PUBLISHED', 'STALE_PUBLISHED')
 * status for this unit and epoch into a single summary row.
 *
 * On conflict (unit_id, unit_identity_epoch), updates only if the incoming
 * source_version is >= the stored one (GREATEST prevents regressing).
 */
export async function rebuildUnitPublicProjection(
  tx: TransactionClient,
  unitId: string,
  unitIdentityEpoch: number
): Promise<UnitProjectionResult> {
  // Aggregate published inventory rows for this unit+epoch
  const rows = await tx.$queryRaw<
      {
        from_price: string | null;
        room_categories: string[];
        earliest_available_from: Date | null;
        matching_inventory_count: number;
        representative_inventory_id: string | null;
        public_point: string | null;
        public_cell_id: string | null;
        public_area_name: string | null;
        source_version: bigint;
      }[]
  >`
    SELECT
      MIN(price)::TEXT                            AS from_price,
      array_agg(DISTINCT room_category ORDER BY room_category) AS room_categories,
      MIN(available_from)::TIMESTAMPTZ            AS earliest_available_from,
      COUNT(*)::INTEGER                           AS matching_inventory_count,
      (array_agg(inventory_id ORDER BY price ASC, available_from ASC, inventory_id ASC))[1]
                                                    AS representative_inventory_id,
      (array_agg(public_point ORDER BY price ASC, available_from ASC, inventory_id ASC)
        FILTER (WHERE public_point IS NOT NULL))[1] AS public_point,
      (array_agg(public_cell_id ORDER BY price ASC, available_from ASC, inventory_id ASC)
        FILTER (WHERE public_cell_id IS NOT NULL))[1] AS public_cell_id,
      (array_agg(public_area_name ORDER BY price ASC, available_from ASC, inventory_id ASC)
        FILTER (WHERE public_area_name IS NOT NULL))[1] AS public_area_name,
      MAX(source_version)                         AS source_version
    FROM inventory_search_projection
    WHERE unit_id = ${unitId}
      AND unit_identity_epoch_written_at = ${unitIdentityEpoch}
      AND publish_status IN ('PUBLISHED', 'STALE_PUBLISHED')
  `;

  const row = rows[0];
  const matchingInventoryCount = Number(row?.matching_inventory_count ?? 0);

  if (matchingInventoryCount === 0) {
    // No visible inventory — delete the unit projection row
    const deleted = await tx.$executeRaw`
      DELETE FROM unit_public_projection
      WHERE unit_id = ${unitId}
        AND unit_identity_epoch = ${unitIdentityEpoch}
    `;
    return {
      upserted: false,
      deleted: deleted > 0,
      matchingInventoryCount: 0,
      sourceVersion: null,
    };
  }

  const sourceVersion = BigInt(row!.source_version);
  const projectionEpoch = currentProjectionEpoch();
  const fromPrice = row?.from_price ? parseFloat(row.from_price) : null;
  const roomCategories = row?.room_categories ?? [];
  const earliestAvailableFrom = row?.earliest_available_from ?? null;
  const representativeInventoryId = row?.representative_inventory_id ?? null;
  const publicPoint = row?.public_point ?? null;
  const publicCellId = row?.public_cell_id ?? null;
  const publicAreaName = row?.public_area_name ?? null;
  const roomLabel =
    roomCategories.length > 0
      ? roomCategories
          .map((category) => category.replace(/_/g, " ").toLowerCase())
          .join(", ")
      : "available rooms";
  const displayTitle = publicAreaName
    ? `${roomLabel} in ${publicAreaName}`
    : roomLabel;
  const displaySubtitle =
    matchingInventoryCount === 1
      ? "1 matching inventory"
      : `${matchingInventoryCount} matching inventories`;

  const supportsPhase04Columns = await hasPhase04UnitProjectionColumns(tx);

  const upsertedCount = supportsPhase04Columns
    ? await tx.$executeRaw`
    INSERT INTO unit_public_projection (
      unit_id, unit_identity_epoch, representative_inventory_id, from_price,
      room_categories, earliest_available_from,
      matching_inventory_count, coarse_availability_badges,
      public_point, public_cell_id, public_area_name,
      display_title, display_subtitle, hero_image_url, payload_version,
      source_version, projection_epoch,
      created_at, updated_at
    )
    VALUES (
      ${unitId},
      ${unitIdentityEpoch},
      ${representativeInventoryId},
      ${fromPrice}::NUMERIC,
      ${roomCategories}::TEXT[],
      ${earliestAvailableFrom}::DATE,
      ${matchingInventoryCount},
      ARRAY[]::TEXT[],
      ${publicPoint},
      ${publicCellId},
      ${publicAreaName},
      ${displayTitle},
      ${displaySubtitle},
      ${null},
      'phase04.v1',
      ${sourceVersion}::BIGINT,
      ${projectionEpoch}::BIGINT,
      NOW(), NOW()
    )
    ON CONFLICT (unit_id, unit_identity_epoch) DO UPDATE SET
      representative_inventory_id = EXCLUDED.representative_inventory_id,
      from_price                  = EXCLUDED.from_price,
      room_categories             = EXCLUDED.room_categories,
      earliest_available_from     = EXCLUDED.earliest_available_from,
      matching_inventory_count    = EXCLUDED.matching_inventory_count,
      coarse_availability_badges  = EXCLUDED.coarse_availability_badges,
      public_point                = EXCLUDED.public_point,
      public_cell_id              = EXCLUDED.public_cell_id,
      public_area_name            = EXCLUDED.public_area_name,
      display_title               = EXCLUDED.display_title,
      display_subtitle            = EXCLUDED.display_subtitle,
      hero_image_url              = EXCLUDED.hero_image_url,
      payload_version             = EXCLUDED.payload_version,
      source_version              = GREATEST(unit_public_projection.source_version, EXCLUDED.source_version),
      projection_epoch            = EXCLUDED.projection_epoch,
      updated_at                  = NOW()
    WHERE unit_public_projection.source_version <= EXCLUDED.source_version
  `
    : await tx.$executeRaw`
    INSERT INTO unit_public_projection (
      unit_id, unit_identity_epoch, from_price, room_categories,
      earliest_available_from, matching_inventory_count,
      coarse_availability_badges, source_version, projection_epoch,
      created_at, updated_at
    )
    VALUES (
      ${unitId},
      ${unitIdentityEpoch},
      ${fromPrice}::NUMERIC,
      ${roomCategories}::TEXT[],
      ${earliestAvailableFrom}::DATE,
      ${matchingInventoryCount},
      ARRAY[]::TEXT[],
      ${sourceVersion}::BIGINT,
      ${projectionEpoch}::BIGINT,
      NOW(), NOW()
    )
    ON CONFLICT (unit_id, unit_identity_epoch) DO UPDATE SET
      from_price                  = EXCLUDED.from_price,
      room_categories             = EXCLUDED.room_categories,
      earliest_available_from     = EXCLUDED.earliest_available_from,
      matching_inventory_count    = EXCLUDED.matching_inventory_count,
      coarse_availability_badges  = EXCLUDED.coarse_availability_badges,
      source_version              = GREATEST(unit_public_projection.source_version, EXCLUDED.source_version),
      projection_epoch            = EXCLUDED.projection_epoch,
      updated_at                  = NOW()
    WHERE unit_public_projection.source_version <= EXCLUDED.source_version
  `;

  return {
    upserted: upsertedCount > 0,
    deleted: false,
    matchingInventoryCount,
    sourceVersion,
  };
}
