import fs from "fs";
import path from "path";

import {
  createPGlitePhase03Fixture,
  type Phase03Fixture,
} from "@/__tests__/utils/pglite-phase03";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../prisma/migrations");

const QUERY_SNAPSHOTS_MIGRATION = path.join(
  MIGRATIONS_DIR,
  "20260502040000_query_snapshots",
  "migration.sql"
);

const PHASE04_MIGRATION = path.join(
  MIGRATIONS_DIR,
  "20260504000000_phase04_projection_search_snapshots",
  "migration.sql"
);

export interface Phase04Fixture extends Phase03Fixture {
  insertPhase04UnitProjection(opts: {
    unitId: string;
    unitIdentityEpoch?: number;
    representativeInventoryId?: string | null;
    fromPrice?: number | null;
    roomCategories?: string[];
    earliestAvailableFrom?: string | null;
    matchingInventoryCount?: number;
    publicPoint?: string | null;
    publicCellId?: string | null;
    publicAreaName?: string | null;
    displayTitle?: string | null;
    displaySubtitle?: string | null;
    heroImageUrl?: string | null;
    sourceVersion?: bigint;
    projectionEpoch?: bigint;
  }): Promise<void>;
}

export async function createPGlitePhase04Fixture(): Promise<Phase04Fixture> {
  const base = await createPGlitePhase03Fixture();
  const pg = base.pg;
  const pgExec = (
    pg as unknown as { exec: (sql: string) => Promise<void> }
  ).exec.bind(pg);

  await pgExec(fs.readFileSync(QUERY_SNAPSHOTS_MIGRATION, "utf8"));
  await pgExec(fs.readFileSync(PHASE04_MIGRATION, "utf8"));

  const insertPhase04UnitProjection: Phase04Fixture["insertPhase04UnitProjection"] =
    async (opts) => {
      await pg.query(
        `INSERT INTO unit_public_projection (
           unit_id, unit_identity_epoch, representative_inventory_id,
           from_price, room_categories, earliest_available_from,
           matching_inventory_count, coarse_availability_badges,
           public_point, public_cell_id, public_area_name,
           display_title, display_subtitle, hero_image_url, payload_version,
           source_version, projection_epoch, created_at, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'phase04.v1',$15,$16,NOW(),NOW())
         ON CONFLICT (unit_id, unit_identity_epoch) DO UPDATE SET
           representative_inventory_id = EXCLUDED.representative_inventory_id,
           from_price = EXCLUDED.from_price,
           room_categories = EXCLUDED.room_categories,
           earliest_available_from = EXCLUDED.earliest_available_from,
           matching_inventory_count = EXCLUDED.matching_inventory_count,
           public_point = EXCLUDED.public_point,
           public_cell_id = EXCLUDED.public_cell_id,
           public_area_name = EXCLUDED.public_area_name,
           display_title = EXCLUDED.display_title,
           display_subtitle = EXCLUDED.display_subtitle,
           hero_image_url = EXCLUDED.hero_image_url,
           source_version = EXCLUDED.source_version,
           projection_epoch = EXCLUDED.projection_epoch,
           updated_at = NOW()`,
        [
          opts.unitId,
          opts.unitIdentityEpoch ?? 1,
          opts.representativeInventoryId ?? null,
          opts.fromPrice ?? null,
          opts.roomCategories ?? [],
          opts.earliestAvailableFrom ?? null,
          opts.matchingInventoryCount ?? 1,
          [],
          opts.publicPoint ?? null,
          opts.publicCellId ?? null,
          opts.publicAreaName ?? null,
          opts.displayTitle ?? null,
          opts.displaySubtitle ?? null,
          opts.heroImageUrl ?? null,
          Number(opts.sourceVersion ?? BigInt(1)),
          Number(opts.projectionEpoch ?? BigInt(1)),
        ]
      );
    };

  return {
    ...base,
    insertPhase04UnitProjection,
  };
}
