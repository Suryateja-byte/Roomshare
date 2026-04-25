/**
 * @jest-environment node
 */
/**
 * AC#1 — Seven canonical tables + required indexes exist after applying actual migrations.
 * AC#2 — Category CHECK constraints reject invalid shapes.
 * AC#4 — resolveOrCreateUnit collapses address variants; source_version increments on upsert.
 *
 * All assertions run against a real PGlite instance with the literal migration SQL applied,
 * exercising PG-specific types (TSTZRANGE, JSONB, TEXT[], SMALLINT, NUMERIC) and the
 * NOT VALID + VALIDATE CONSTRAINT two-phase attach pattern.
 */

import { withActor } from "@/lib/db/with-actor";
import { resolveOrCreateUnit } from "@/lib/identity/resolve-or-create-unit";
import { validateInventoryInput } from "@/lib/validation/category";
import {
  createPGliteFixture,
  hostActor,
  type PGliteFixture,
} from "@/__tests__/utils/pglite-phase01";

describe("Phase 01 schema and DB contracts (PGlite)", () => {
  let fixture: PGliteFixture;

  beforeAll(async () => {
    fixture = await createPGliteFixture();
  });

  afterAll(async () => {
    await fixture.close();
  });

  // -------------------------------------------------------------------------
  // AC#1 — migration applies cleanly; seven canonical tables + indexes exist
  // -------------------------------------------------------------------------

  it("AC#1: applies all three migrations and creates the seven canonical tables", async () => {
    const tables = await fixture.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
    );
    const tableNames = tables.map((r) => r.tablename);

    expect(tableNames).toEqual(
      expect.arrayContaining([
        "physical_units",
        "host_unit_claims",
        "listing_inventories",
        "identity_mutations",
        "outbox_events",
        "cache_invalidations",
        "audit_events",
      ])
    );
  });

  it("AC#1: required indexes exist after migration", async () => {
    const indexes = await fixture.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname`
    );
    const indexNames = indexes.map((r) => r.indexname);

    expect(indexNames).toEqual(
      expect.arrayContaining([
        "physical_units_canonical_unique_idx",
        "outbox_events_pending_idx",
        "outbox_events_aggregate_idx",
        "outbox_events_dlq_idx",
        "cache_invalidations_pending_idx",
        "cache_invalidations_unit_enqueued_idx",
        "audit_events_aggregate_idx",
        "audit_events_kind_idx",
        "audit_events_actor_idx",
      ])
    );
  });

  it("AC#1: partial indexes carry correct WHERE clauses (pg_indexes)", async () => {
    const partials = await fixture.query<{
      indexname: string;
      indexdef: string;
    }>(
      `SELECT indexname, indexdef FROM pg_indexes
       WHERE schemaname = 'public'
         AND indexname IN (
           'outbox_events_pending_idx',
           'outbox_events_dlq_idx',
           'cache_invalidations_pending_idx'
         )
       ORDER BY indexname`
    );

    const byName = Object.fromEntries(
      partials.map((r) => [r.indexname, r.indexdef])
    );

    expect(byName["outbox_events_pending_idx"]).toMatch(/WHERE.*status.*IN/i);
    expect(byName["outbox_events_dlq_idx"]).toMatch(/WHERE.*status.*=.*'DLQ'/i);
    expect(byName["cache_invalidations_pending_idx"]).toMatch(
      /WHERE.*consumed_at IS NULL/i
    );
  });

  it("AC#1: Listing.physical_unit_id column exists (migration 3)", async () => {
    const cols = await fixture.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'Listing' AND column_name = 'physical_unit_id'`
    );
    expect(cols).toHaveLength(1);
  });

  it("AC#1: PG-specific types are present in information_schema (TSTZRANGE, JSONB, TEXT[])", async () => {
    const rangeCol = await fixture.query<{ data_type: string; udt_name: string }>(
      `SELECT data_type, udt_name FROM information_schema.columns
       WHERE table_name = 'listing_inventories' AND column_name = 'availability_range'`
    );
    expect(rangeCol[0].udt_name).toBe("tstzrange");

    const jsonbCol = await fixture.query<{ udt_name: string }>(
      `SELECT udt_name FROM information_schema.columns
       WHERE table_name = 'outbox_events' AND column_name = 'payload'`
    );
    expect(jsonbCol[0].udt_name).toBe("jsonb");

    const arrayCol = await fixture.query<{ data_type: string }>(
      `SELECT data_type FROM information_schema.columns
       WHERE table_name = 'physical_units' AND column_name = 'supersedes_unit_ids'`
    );
    expect(arrayCol[0].data_type).toBe("ARRAY");
  });

  // -------------------------------------------------------------------------
  // AC#2 — category CHECK constraints reject invalid shapes
  //         (tested against the actual migrated schema, NOT hand-written DDL)
  // -------------------------------------------------------------------------

  it.each([
    [
      "ENTIRE_PLACE rejects non-null total_beds",
      {
        roomCategory: "ENTIRE_PLACE",
        capacityGuests: 3,
        totalBeds: 2,
        openBeds: null,
      },
    ],
    [
      "SHARED_ROOM rejects null open_beds",
      {
        roomCategory: "SHARED_ROOM",
        capacityGuests: null,
        totalBeds: 2,
        openBeds: null,
      },
    ],
    [
      "PRIVATE_ROOM rejects non-null total_beds",
      {
        roomCategory: "PRIVATE_ROOM",
        capacityGuests: 1,
        totalBeds: 1,
        openBeds: null,
      },
    ],
    [
      "SHARED_ROOM rejects open_beds > total_beds",
      {
        roomCategory: "SHARED_ROOM",
        capacityGuests: null,
        totalBeds: 2,
        openBeds: 3,
      },
    ],
    [
      "ENTIRE_PLACE rejects non-null gender_preference",
      {
        roomCategory: "ENTIRE_PLACE",
        capacityGuests: 3,
        totalBeds: null,
        openBeds: null,
        genderPreference: "women",
      },
    ],
  ])("AC#2: %s", async (_label, opts) => {
    const unitId = await fixture.insertPhysicalUnit({
      canonicalAddressHash: `hash-check-${randomId()}`,
    });

    await expect(
      fixture.insertListingInventory({
        unitId,
        canonicalAddressHash: "hash-check",
        roomCategory: opts.roomCategory ?? "ENTIRE_PLACE",
        capacityGuests: opts.capacityGuests ?? null,
        totalBeds: opts.totalBeds ?? null,
        openBeds: opts.openBeds ?? null,
        genderPreference:
          "genderPreference" in opts ? opts.genderPreference : null,
      })
    ).rejects.toThrow();
  });

  it("AC#2: accepts a valid ENTIRE_PLACE row (confirms CHECK is not over-restrictive)", async () => {
    const unitId = await fixture.insertPhysicalUnit({
      canonicalAddressHash: `hash-valid-${randomId()}`,
    });

    await expect(
      fixture.insertListingInventory({
        unitId,
        canonicalAddressHash: "hash-valid",
        roomCategory: "ENTIRE_PLACE",
        capacityGuests: 3,
        totalBeds: null,
        openBeds: null,
        genderPreference: null,
        householdGender: null,
      })
    ).resolves.toBeDefined();
  });

  it("AC#2: CHECK constraint names exist in information_schema (NOT VALID + VALIDATE applied)", async () => {
    const constraints = await fixture.query<{ constraint_name: string }>(
      `SELECT constraint_name FROM information_schema.table_constraints
       WHERE table_name = 'listing_inventories'
         AND constraint_type = 'CHECK'
         AND constraint_name LIKE 'inventory_category_%'
       ORDER BY constraint_name`
    );
    const names = constraints.map((r) => r.constraint_name);

    expect(names).toEqual(
      expect.arrayContaining([
        "inventory_category_entire_place_shape",
        "inventory_category_private_room_shape",
        "inventory_category_shared_room_shape",
      ])
    );
  });

  // -------------------------------------------------------------------------
  // AC#4 — resolveOrCreateUnit collapses address variants; source_version bumps
  // -------------------------------------------------------------------------

  it("AC#4: resolveOrCreateUnit collapses five address variants into one row", async () => {
    await fixture.insertUser("host-ac4");
    const actor = { role: "host" as const, id: "host-ac4" };
    const variants = [
      "123 Main St Apt 4B",
      "  123  main  st  apt 4B ",
      "123 MAIN ST APT 4B",
      "123 Main St. Apt 4B",
      "123 Main Street Apt 4B",
    ];

    const results: Array<{
      created: boolean;
      unitId: string;
      canonicalAddressHash: string;
      unitIdentityEpoch: number;
    }> = [];
    for (const address of variants) {
      results.push(
        await withActor(
          actor,
          async (tx) =>
            resolveOrCreateUnit(tx as never, {
              actor,
              address: {
                address,
                city: "San Francisco",
                state: "ca",
                zip: "94107-1234",
              },
            }),
          { client: fixture.client as never }
        )
      );
    }

    // All five variants must resolve to the same unit id.
    const unitIds = new Set(results.map((r) => r.unitId));
    expect(unitIds.size).toBe(1);

    // Exactly one call was a create; the rest resolved existing.
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(results.filter((r) => !r.created)).toHaveLength(4);

    // There is exactly one row for this canonical address in the DB.
    const hash = results[0].canonicalAddressHash;
    const units = await fixture.query<{ id: string }>(
      `SELECT id FROM physical_units WHERE canonical_address_hash = $1`,
      [hash]
    );
    expect(units).toHaveLength(1);
  });

  it("AC#4: source_version and row_version increment on repeated upserts", async () => {
    await fixture.insertUser("host-versions");
    const actor = { role: "host" as const, id: "host-versions" };
    const address = {
      address: "500 Market Street",
      city: "San Francisco",
      state: "CA",
      zip: "94105",
    };

    await withActor(actor, (tx) =>
      resolveOrCreateUnit(tx as never, { actor, address }),
      { client: fixture.client as never }
    );

    // Check units inserted so far by this test only (fixture is shared across
    // tests — filter by canonical hash which is unique per address+city+state+zip).
    const units1 = await fixture.query<{
      source_version: number;
      row_version: number;
    }>(
      `SELECT source_version, row_version FROM physical_units
       WHERE canonical_address_hash = (
         SELECT canonical_address_hash FROM physical_units
         ORDER BY created_at DESC LIMIT 1
       )`
    );
    expect(BigInt(units1[0].source_version)).toBe(BigInt(1));

    await withActor(actor, (tx) =>
      resolveOrCreateUnit(tx as never, { actor, address }),
      { client: fixture.client as never }
    );

    const units2 = await fixture.query<{
      source_version: number;
      row_version: number;
    }>(
      `SELECT source_version, row_version FROM physical_units
       WHERE canonical_address_hash = (
         SELECT canonical_address_hash FROM physical_units
         ORDER BY created_at DESC LIMIT 1
       )`
    );
    expect(BigInt(units2[0].source_version)).toBe(BigInt(2));
    expect(BigInt(units2[0].row_version)).toBe(BigInt(2));
  });

  // -------------------------------------------------------------------------
  // Zod layer (no DB needed)
  // -------------------------------------------------------------------------

  it("rejects invalid SHARED_ROOM shapes at the zod layer before the DB write", () => {
    const result = validateInventoryInput({
      roomCategory: "SHARED_ROOM",
      inventoryKey: "shared-1",
      availableFrom: "2026-05-01",
      availabilityRange: "[2026-05-01T00:00:00Z,2026-06-01T00:00:00Z)",
      price: 900,
      totalBeds: 2,
      openBeds: 3,
    });

    expect(result.ok).toBe(false);
  });
});

function randomId(): string {
  return Math.random().toString(36).slice(2, 8);
}
