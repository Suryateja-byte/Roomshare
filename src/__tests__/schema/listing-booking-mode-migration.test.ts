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
      /UPDATE\s+"Listing"\s+AS\s+listing[\s\S]*FROM\s+"listing_inventories"\s+AS\s+inventory[\s\S]*inventory\.listing_id\s*=\s*listing\.id[\s\S]*inventory\.room_category\s*=\s*'ENTIRE_PLACE'[\s\S]*listing\."booking_mode"\s*<>\s*'WHOLE_UNIT'/
    );
    expect(migrationSql).toMatch(
      /UPDATE\s+"Listing"[\s\S]*SET\s+"booking_mode"\s*=\s*'WHOLE_UNIT'[\s\S]*WHERE\s+"roomType"\s*=\s*'Entire Place'/
    );

    const inventoryBackfillIndex = migrationSql.indexOf(
      'FROM "listing_inventories" AS inventory'
    );
    const roomTypeFallbackIndex = migrationSql.indexOf(
      'WHERE "roomType" = \'Entire Place\''
    );

    expect(inventoryBackfillIndex).toBeGreaterThan(-1);
    expect(roomTypeFallbackIndex).toBeGreaterThan(-1);
    expect(inventoryBackfillIndex).toBeLessThan(roomTypeFallbackIndex);
  });
});
