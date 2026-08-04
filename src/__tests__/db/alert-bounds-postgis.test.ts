/**
 * @jest-environment node
 *
 * Real-Postgres proof that the search-alert viewport predicate actually excludes
 * out-of-box listings (review P1-5).
 *
 * Mocks cannot prove this. `ST_MakeEnvelope` takes (xmin, ymin, xmax, ymax) —
 * longitude first — while every filter type in this repo lists lat before lng,
 * and the SRID must match the one Location.coords was written with. Both
 * mistakes produce a perfectly valid query that quietly matches the wrong part
 * of the world, so the predicate is exercised against real PostGIS here.
 *
 * Requires a live Postgres with PostGIS. Opt in with REAL_DB_URL; skipped
 * otherwise. (Deliberately not DATABASE_URL: jest.env.js overwrites that with a
 * dummy, and a separate variable makes it impossible to point this at a real
 * environment by accident.)
 *
 *   docker compose up -d db
 *   REAL_DB_URL=postgresql://postgres:password@localhost:5434/roomshare \
 *     pnpm exec jest src/__tests__/db/alert-bounds-postgis.test.ts
 */

import { PrismaClient, Prisma } from "@prisma/client";
import { buildBoundsPredicate } from "@/lib/search/alert-bounds";

const REAL_DB_URL = process.env.REAL_DB_URL;
const describeRealDb = REAL_DB_URL ? describe : describe.skip;

const RUN_ID = `p15-${process.pid}`;
const OWNER_ID = `${RUN_ID}-owner`;
const AUSTIN_LISTING = `${RUN_ID}-austin`;
const SEATTLE_LISTING = `${RUN_ID}-seattle`;
const NULL_ISLAND_LISTING = `${RUN_ID}-nullisland`;

const AUSTIN_BOUNDS = {
  minLat: 30.1,
  maxLat: 30.4,
  minLng: -97.9,
  maxLng: -97.5,
};

describeRealDb("alert bounds predicate — real PostGIS", () => {
  const prisma = new PrismaClient({ datasourceUrl: REAL_DB_URL });

  async function seedListing(id: string, lat: number, lng: number) {
    await prisma.$executeRaw`
      INSERT INTO "Listing" (id, "ownerId", title, description, price, status,
                             "totalSlots", "availableSlots", "createdAt", "updatedAt",
                             amenities, "houseRules", images)
      VALUES (${id}, ${OWNER_ID}, 'Test', 'Test', 1000, 'ACTIVE',
              1, 1, now(), now(), '{}', '{}', '{}')
      ON CONFLICT (id) DO NOTHING
    `;
    // coords is a PostGIS geometry column: Prisma cannot write it, so raw SQL.
    await prisma.$executeRaw`
      INSERT INTO "Location" (id, "listingId", address, city, state, zip, coords)
      VALUES (${`${id}-loc`}, ${id}, '1 Main St', 'City', 'ST', '00000',
              ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326))
      ON CONFLICT ("listingId") DO NOTHING
    `;
  }

  async function idsWithinAustin(): Promise<string[]> {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
        SELECT l.id
        FROM "Listing" l
        JOIN "Location" loc ON loc."listingId" = l.id
        WHERE l.id IN (${AUSTIN_LISTING}, ${SEATTLE_LISTING}, ${NULL_ISLAND_LISTING})
          AND NOT (ST_X(loc.coords::geometry) = 0 AND ST_Y(loc.coords::geometry) = 0)
          AND ${buildBoundsPredicate(AUSTIN_BOUNDS)}
      `
    );
    return rows.map((row) => row.id).sort();
  }

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.$executeRaw`
      INSERT INTO "User" (id, email, name, "createdAt", "updatedAt")
      VALUES (${OWNER_ID}, ${`${RUN_ID}@example.test`}, 'Owner', now(), now())
      ON CONFLICT (id) DO NOTHING
    `;
    await seedListing(AUSTIN_LISTING, 30.2672, -97.7431);
    await seedListing(SEATTLE_LISTING, 47.6062, -122.3321);
    await seedListing(NULL_ISLAND_LISTING, 0, 0);
  });

  afterAll(async () => {
    const ids = [AUSTIN_LISTING, SEATTLE_LISTING, NULL_ISLAND_LISTING];
    await prisma
      .$executeRaw`DELETE FROM "Location" WHERE "listingId" IN (${Prisma.join(ids)})`
      .catch(() => {});
    await prisma
      .$executeRaw`DELETE FROM "Listing" WHERE id IN (${Prisma.join(ids)})`
      .catch(() => {});
    await prisma.$executeRaw`DELETE FROM "User" WHERE id = ${OWNER_ID}`.catch(
      () => {}
    );
    await prisma.$disconnect();
  });

  it("matches a listing inside the viewport", async () => {
    expect(await idsWithinAustin()).toContain(AUSTIN_LISTING);
  });

  it("excludes a listing outside the viewport", async () => {
    expect(await idsWithinAustin()).not.toContain(SEATTLE_LISTING);
  });

  it("excludes a listing with unset (0,0) coordinates", async () => {
    expect(await idsWithinAustin()).not.toContain(NULL_ISLAND_LISTING);
  });

  it("returns exactly the in-viewport listing", async () => {
    expect(await idsWithinAustin()).toEqual([AUSTIN_LISTING]);
  });
});
