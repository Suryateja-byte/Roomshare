/**
 * @jest-environment node
 *
 * Phase 09 schema coverage for destructive booking retirement.
 */

import fs from "fs";
import path from "path";

import {
  createPGlitePhase09Fixture,
  type Phase09Fixture,
} from "@/__tests__/utils/pglite-phase09";

const MIGRATION_PATH = path.resolve(
  __dirname,
  "../../../prisma/migrations/20260509000000_phase09_cutover_retire_booking/migration.sql"
);

let fixture: Phase09Fixture;

beforeAll(async () => {
  fixture = await createPGlitePhase09Fixture();
}, 30_000);

afterAll(async () => {
  await fixture?.close();
});

describe("Phase 09 cutover booking retirement schema", () => {
  it("records the destructive pre-launch data-safety note", () => {
    const sql = fs.readFileSync(MIGRATION_PATH, "utf8");

    expect(sql).toContain(
      "pre-launch, dummy data only; destructive drop accepted"
    );
    expect(sql).toMatch(/DROP TABLE IF EXISTS "Booking"/);
    expect(sql).toMatch(/DROP TABLE IF EXISTS "BookingAuditLog"/);
    expect(sql).toMatch(/DROP TABLE IF EXISTS listing_day_inventory/);
  });

  it("drops booking-era tables and enums", async () => {
    const tables = await fixture.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN ('Booking', 'BookingAuditLog', 'listing_day_inventory')`
    );

    expect(tables).toEqual([]);

    const enumTypes = await fixture.query<{ typname: string }>(
      `SELECT typname
       FROM pg_type
       WHERE typname IN ('BookingStatus', 'ListingAvailabilitySource')`
    );

    expect(enumTypes).toEqual([]);
  });

  it("drops booking and hold-only listing columns", async () => {
    const columns = await fixture.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'Listing'
         AND column_name IN (
           'availabilitySource',
           'needsMigrationReview',
           'booking_mode',
           'hold_ttl_minutes'
         )`
    );

    expect(columns).toEqual([]);
  });
});
