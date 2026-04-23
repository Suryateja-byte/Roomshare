/**
 * @jest-environment node
 */
/**
 * Phase 02 — schema integration test.
 *
 * Verifies that the four Phase 02 migration files:
 *   1. Create the two new projection tables with correct columns and indexes.
 *   2. Add four nullable geocode columns to physical_units.
 *   3. Add the publish_status CHECK constraint to listing_inventories.
 *   4. Add the backlog-age partial index to cache_invalidations.
 *
 * Uses the Phase 02 PGlite fixture (which extends Phase 01 and applies Phase 02
 * migrations on top). The DO $$ PostGIS guard means exact_point and public_point
 * are TEXT NULL in this environment, not GEOGRAPHY — that's expected.
 */

import { createPGlitePhase02Fixture, type Phase02Fixture } from "@/__tests__/utils/pglite-phase02";

let fixture: Phase02Fixture;

beforeAll(async () => {
  fixture = await createPGlitePhase02Fixture();
}, 30_000);

afterAll(async () => {
  await fixture.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// inventory_search_projection
// ─────────────────────────────────────────────────────────────────────────────

describe("inventory_search_projection table", () => {
  it("exists with expected columns", async () => {
    const rows = await fixture.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'inventory_search_projection'
      ORDER BY ordinal_position
    `);

    const names = rows.map((r: Record<string, unknown>) => r.column_name as string);
    expect(names).toContain("id");
    expect(names).toContain("inventory_id");
    expect(names).toContain("unit_id");
    expect(names).toContain("unit_identity_epoch_written_at");
    expect(names).toContain("room_category");
    expect(names).toContain("price");
    expect(names).toContain("available_from");
    expect(names).toContain("availability_range");
    expect(names).toContain("publish_status");
    expect(names).toContain("source_version");
    expect(names).toContain("projection_epoch");
    expect(names).toContain("public_point");
    expect(names).toContain("public_cell_id");
    expect(names).toContain("public_area_name");
  });

  it("has a UNIQUE index on inventory_id", async () => {
    // Insert a row then try to insert duplicate — should fail
    const unitId = "unit-schema-test";
    await fixture.insertUser("user-schema-test");

    await fixture.query(`
      INSERT INTO inventory_search_projection
        (id, inventory_id, unit_id, unit_identity_epoch_written_at,
         room_category, price, available_from, availability_range,
         publish_status, source_version, projection_epoch, created_at, updated_at)
      VALUES
        ('isp-1', 'inv-1', '${unitId}', 1,
         'PRIVATE_ROOM', 1000, '2026-05-01',
         '[2026-05-01T00:00:00Z,2026-06-01T00:00:00Z)',
         'PENDING_PROJECTION', 1, 1, NOW(), NOW())
    `);

    await expect(
      fixture.query(`
        INSERT INTO inventory_search_projection
          (id, inventory_id, unit_id, unit_identity_epoch_written_at,
           room_category, price, available_from, availability_range,
           publish_status, source_version, projection_epoch, created_at, updated_at)
        VALUES
          ('isp-2', 'inv-1', '${unitId}', 1,
           'PRIVATE_ROOM', 1000, '2026-05-01',
           '[2026-05-01T00:00:00Z,2026-06-01T00:00:00Z)',
           'PENDING_PROJECTION', 2, 1, NOW(), NOW())
      `)
    ).rejects.toThrow();
  });

  it("rejects invalid publish_status via CHECK constraint", async () => {
    await expect(
      fixture.query(`
        INSERT INTO inventory_search_projection
          (id, inventory_id, unit_id, unit_identity_epoch_written_at,
           room_category, price, available_from, availability_range,
           publish_status, source_version, projection_epoch, created_at, updated_at)
        VALUES
          ('isp-bad', 'inv-bad-${Date.now()}', 'unit-bad', 1,
           'PRIVATE_ROOM', 1000, '2026-05-01',
           '[2026-05-01T00:00:00Z,2026-06-01T00:00:00Z)',
           'INVALID_STATUS', 1, 1, NOW(), NOW())
      `)
    ).rejects.toThrow();
  });

  it("accepts all valid publish_status values", async () => {
    const statuses = [
      "DRAFT",
      "PENDING_GEOCODE",
      "PENDING_PROJECTION",
      "PENDING_EMBEDDING",
      "PUBLISHED",
      "STALE_PUBLISHED",
      "PAUSED",
      "SUPPRESSED",
      "ARCHIVED",
    ];

    for (const status of statuses) {
      await expect(
        fixture.query(`
          INSERT INTO inventory_search_projection
            (id, inventory_id, unit_id, unit_identity_epoch_written_at,
             room_category, price, available_from, availability_range,
             publish_status, source_version, projection_epoch, created_at, updated_at)
          VALUES
            ('isp-${status}', 'inv-${status}', 'unit-x', 1,
             'PRIVATE_ROOM', 1000, '2026-05-01',
             '[2026-05-01T00:00:00Z,2026-06-01T00:00:00Z)',
             '${status}', 1, 1, NOW(), NOW())
        `)
      ).resolves.not.toThrow();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// unit_public_projection
// ─────────────────────────────────────────────────────────────────────────────

describe("unit_public_projection table", () => {
  it("exists with expected columns", async () => {
    const rows = await fixture.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'unit_public_projection'
      ORDER BY ordinal_position
    `);

    const names = rows.map((r: Record<string, unknown>) => r.column_name as string);
    expect(names).toContain("unit_id");
    expect(names).toContain("unit_identity_epoch");
    expect(names).toContain("from_price");
    expect(names).toContain("room_categories");
    expect(names).toContain("earliest_available_from");
    expect(names).toContain("matching_inventory_count");
    expect(names).toContain("coarse_availability_badges");
    expect(names).toContain("source_version");
    expect(names).toContain("projection_epoch");
  });

  it("has UNIQUE constraint on (unit_id, unit_identity_epoch)", async () => {
    await fixture.insertUnitPublicProjection({
      unitId: "unit-upp-1",
      unitIdentityEpoch: 1,
      matchingInventoryCount: 1,
      sourceVersion: BigInt(1),
      projectionEpoch: BigInt(1),
    });

    // Second insert with same (unit_id, epoch) should upsert (ON CONFLICT), not fail
    await expect(
      fixture.insertUnitPublicProjection({
        unitId: "unit-upp-1",
        unitIdentityEpoch: 1,
        matchingInventoryCount: 2,
        sourceVersion: BigInt(2),
        projectionEpoch: BigInt(1),
      })
    ).resolves.not.toThrow();

    const rows = await fixture.getUnitPublicProjections();
    const row = rows.find((r) => r.unitId === "unit-upp-1");
    expect(row).toBeDefined();
    // Should have updated to count=2
    expect(row?.matchingInventoryCount).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// physical_units geocode columns
// ─────────────────────────────────────────────────────────────────────────────

describe("physical_units Phase 02 geocode columns", () => {
  it("has exact_point, public_point, public_cell_id, public_area_name columns", async () => {
    const rows = await fixture.query(`
      SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'physical_units'
        AND column_name IN ('exact_point','public_point','public_cell_id','public_area_name')
      ORDER BY column_name
    `);

    const names = rows.map((r: Record<string, unknown>) => r.column_name as string);
    expect(names).toContain("exact_point");
    expect(names).toContain("public_point");
    expect(names).toContain("public_cell_id");
    expect(names).toContain("public_area_name");

    // All should be nullable
    rows.forEach((r: Record<string, unknown>) => {
      expect(r.is_nullable).toBe("YES");
    });
  });

  it("can store TEXT in geocode columns (PGlite fallback)", async () => {
    const unitId = await fixture.insertPhysicalUnit({
      canonicalAddressHash: "hash-geocode-test",
    });

    await fixture.query(`
      UPDATE physical_units
      SET exact_point = 'POINT(151.2099 -33.8688)',
          public_point = 'POINT(151.21 -33.87)',
          public_cell_id = '-33.87,151.21',
          public_area_name = 'Sydney CBD'
      WHERE id = '${unitId}'
    `);

    const rows = await fixture.query(
      `SELECT exact_point, public_point, public_cell_id, public_area_name
       FROM physical_units WHERE id = '${unitId}'`
    );
    expect(rows[0]).toMatchObject({
      exact_point: "POINT(151.2099 -33.8688)",
      public_cell_id: "-33.87,151.21",
      public_area_name: "Sydney CBD",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// listing_inventories publish_status CHECK constraint
// ─────────────────────────────────────────────────────────────────────────────

describe("listing_inventories publish_status CHECK constraint", () => {
  it("rejects invalid publish_status", async () => {
    const unitId = await fixture.insertPhysicalUnit({
      canonicalAddressHash: "hash-chk-test",
    });

    // Build a valid PRIVATE_ROOM insert with capacityGuests (required by shape constraint)
    const invId = await fixture.insertListingInventory({
      unitId,
      canonicalAddressHash: "hash-chk-test",
      roomCategory: "PRIVATE_ROOM",
      capacityGuests: 2,
    });

    await expect(
      fixture.query(`
        UPDATE listing_inventories
        SET publish_status = 'INVALID_STATUS'
        WHERE id = '${invId}'
      `)
    ).rejects.toThrow();
  });

  it("accepts all valid publish_status values", async () => {
    const unitId = await fixture.insertPhysicalUnit({
      canonicalAddressHash: "hash-chk-valid",
    });
    // PRIVATE_ROOM requires capacityGuests IS NOT NULL, total_beds IS NULL
    const invId = await fixture.insertListingInventory({
      unitId,
      canonicalAddressHash: "hash-chk-valid",
      roomCategory: "PRIVATE_ROOM",
      capacityGuests: 2,
    });

    const statuses = [
      "PENDING_GEOCODE",
      "PENDING_PROJECTION",
      "PENDING_EMBEDDING",
      "PUBLISHED",
      "STALE_PUBLISHED",
      "PAUSED",
      "SUPPRESSED",
      "ARCHIVED",
      "DRAFT",
    ];

    for (const status of statuses) {
      await expect(
        fixture.query(`
          UPDATE listing_inventories SET publish_status = '${status}' WHERE id = '${invId}'
        `)
      ).resolves.not.toThrow();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cache_invalidations partial index
// ─────────────────────────────────────────────────────────────────────────────

describe("cache_invalidations backlog-age index", () => {
  it("index cache_invalidations_pending_enqueued_idx exists", async () => {
    const rows = await fixture.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'cache_invalidations'
        AND indexname = 'cache_invalidations_pending_enqueued_idx'
    `);
    expect(rows.length).toBe(1);
  });

  it("can query by enqueued_at where consumed_at is null", async () => {
    // This query uses the new index
    const rows = await fixture.query(`
      SELECT id, enqueued_at
      FROM cache_invalidations
      WHERE consumed_at IS NULL
      ORDER BY enqueued_at ASC
      LIMIT 1
    `);
    expect(Array.isArray(rows)).toBe(true);
  });
});
