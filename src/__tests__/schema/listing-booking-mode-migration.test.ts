import fs from "fs";
import path from "path";

const MIGRATION_PATH = path.join(
  process.cwd(),
  "prisma/migrations/20260613000000_readd_listing_booking_mode/migration.sql"
);

describe("listing booking mode migration", () => {
  let migrationSql: string;

  beforeAll(() => {
    migrationSql = fs.readFileSync(MIGRATION_PATH, "utf-8");
  });

  it("backfills whole-unit mode from canonical inventory before roomType fallback", () => {
    expect(migrationSql).toMatch(
      /UPDATE\s+"Listing"\s+AS\s+listing[\s\S]*FROM\s+"listing_inventories"\s+AS\s+inventory[\s\S]*inventory\.unit_id\s*=\s*listing\."physical_unit_id"[\s\S]*inventory\.room_category\s*=\s*'ENTIRE_PLACE'[\s\S]*listing\."booking_mode"\s*<>\s*'WHOLE_UNIT'/
    );
    expect(migrationSql).toMatch(
      /UPDATE\s+"Listing"[\s\S]*SET\s+"booking_mode"\s*=\s*'WHOLE_UNIT'[\s\S]*WHERE\s+"roomType"\s*=\s*'Entire Place'/
    );

    const inventoryBackfillIndex = migrationSql.indexOf(
      'FROM "listing_inventories" AS inventory'
    );
    const roomTypeFallbackIndex = migrationSql.indexOf(
      `WHERE "roomType" = 'Entire Place'`
    );

    expect(inventoryBackfillIndex).toBeGreaterThan(-1);
    expect(roomTypeFallbackIndex).toBeGreaterThan(-1);
    expect(inventoryBackfillIndex).toBeLessThan(roomTypeFallbackIndex);
  });

  it("reconciles search docs after Listing backfills and marks dirty rows", () => {
    expect(migrationSql).toContain("WITH reconciled_search_docs AS");
    expect(migrationSql).toMatch(
      /UPDATE\s+listing_search_docs\s+AS\s+doc[\s\S]*SET\s+booking_mode\s*=\s*listing\."booking_mode"[\s\S]*doc_updated_at\s*=\s*NOW\(\)[\s\S]*doc\.booking_mode\s+IS\s+DISTINCT\s+FROM\s+listing\."booking_mode"/
    );
    expect(migrationSql).toMatch(
      /INSERT\s+INTO\s+listing_search_doc_dirty\s+\(listing_id,\s+reason,\s+marked_at\)[\s\S]*'booking_mode_backfill'[\s\S]*ON\s+CONFLICT\s+\(listing_id\)\s+DO\s+UPDATE\s+SET[\s\S]*reason\s*=\s*EXCLUDED\.reason[\s\S]*marked_at\s*=\s*EXCLUDED\.marked_at/
    );

    const inventoryBackfillIndex = migrationSql.indexOf(
      'FROM "listing_inventories" AS inventory'
    );
    const roomTypeFallbackIndex = migrationSql.indexOf(
      `WHERE "roomType" = 'Entire Place'`
    );
    const reconciliationIndex = migrationSql.indexOf(
      "WITH reconciled_search_docs AS"
    );

    expect(reconciliationIndex).toBeGreaterThan(inventoryBackfillIndex);
    expect(reconciliationIndex).toBeGreaterThan(roomTypeFallbackIndex);
  });
});
