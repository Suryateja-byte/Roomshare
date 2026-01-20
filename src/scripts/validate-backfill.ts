/**
 * Phase 2: Post-Backfill Validation
 *
 * Verifies that backfill completed correctly by checking invariants.
 *
 * Checks:
 * 1. Spot count matches totalSlots for all listings
 * 2. Available spots match availableSlots counter
 * 3. All ACCEPTED bookings have spotId
 * 4. FILLED spots equal ACCEPTED bookings count
 * 5. No duplicate filledByBookingId values
 *
 * Usage:
 *   npx ts-node src/scripts/validate-backfill.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface ValidationResult {
  check: string;
  passed: boolean;
  details: string;
  items?: unknown[];
}

const results: ValidationResult[] = [];

function log(message: string): void {
  console.log(`[Validate] ${message}`);
}

function pass(check: string, details: string): void {
  results.push({ check, passed: true, details });
  console.log(`  ✅ ${check}: ${details}`);
}

function fail(check: string, details: string, items?: unknown[]): void {
  results.push({ check, passed: false, details, items });
  console.log(`  ❌ ${check}: ${details}`);
}

// ============================================================
// CHECK 1: Spot count matches totalSlots
// ============================================================
async function checkSpotCounts(): Promise<void> {
  log("Check 1: Spot count matches totalSlots...");

  const mismatches = await prisma.$queryRaw<
    Array<{ id: string; title: string; totalSlots: number; spot_count: bigint }>
  >`
    SELECT l.id, l.title, l."totalSlots", COUNT(s.id) as spot_count
    FROM "Listing" l
    LEFT JOIN "SleepingSpot" s ON s."listingId" = l.id
    GROUP BY l.id
    HAVING l."totalSlots" != COUNT(s.id)
  `;

  if (mismatches.length === 0) {
    pass("Spot Count", "All listings have correct spot count");
  } else {
    fail(
      "Spot Count",
      `${mismatches.length} listings have incorrect spot count`,
      mismatches.map((m) => ({
        id: m.id,
        title: m.title,
        totalSlots: m.totalSlots,
        actualSpots: Number(m.spot_count),
      })),
    );
  }
}

// ============================================================
// CHECK 2: Available spots match availableSlots counter
// ============================================================
async function checkAvailableSpots(): Promise<void> {
  log("Check 2: Available spots match availableSlots counter...");

  const mismatches = await prisma.$queryRaw<
    Array<{
      id: string;
      title: string;
      availableSlots: number;
      available_count: bigint;
    }>
  >`
    SELECT l.id, l.title, l."availableSlots", COUNT(s.id) as available_count
    FROM "Listing" l
    LEFT JOIN "SleepingSpot" s ON s."listingId" = l.id AND s.status = 'AVAILABLE'
    GROUP BY l.id
    HAVING l."availableSlots" != COUNT(s.id)
  `;

  if (mismatches.length === 0) {
    pass(
      "Available Spots",
      "All availableSlots counters match AVAILABLE spot count",
    );
  } else {
    fail(
      "Available Spots",
      `${mismatches.length} listings have mismatched availableSlots`,
      mismatches.map((m) => ({
        id: m.id,
        title: m.title,
        availableSlots: m.availableSlots,
        actualAvailable: Number(m.available_count),
      })),
    );
  }
}

// ============================================================
// CHECK 3: All ACCEPTED bookings have spotId
// ============================================================
async function checkAcceptedBookingsHaveSpots(): Promise<void> {
  log("Check 3: All ACCEPTED bookings have spotId...");

  const orphans = await prisma.$queryRaw<
    Array<{ id: string; listingId: string }>
  >`
    SELECT b.id, b."listingId"
    FROM "Booking" b
    WHERE b.status = 'ACCEPTED' AND b."spotId" IS NULL
  `;

  if (orphans.length === 0) {
    pass("Accepted Bookings", "All ACCEPTED bookings have spotId");
  } else {
    fail(
      "Accepted Bookings",
      `${orphans.length} ACCEPTED bookings missing spotId`,
      orphans,
    );
  }
}

// ============================================================
// CHECK 4: FILLED spots equal ACCEPTED bookings
// ============================================================
async function checkFilledSpotsMatchAccepted(): Promise<void> {
  log("Check 4: FILLED spots equal ACCEPTED bookings...");

  const mismatches = await prisma.$queryRaw<
    Array<{
      id: string;
      title: string;
      filled_spots: bigint;
      accepted_bookings: bigint;
    }>
  >`
    SELECT l.id, l.title,
           COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'FILLED') as filled_spots,
           COUNT(DISTINCT b.id) FILTER (WHERE b.status = 'ACCEPTED') as accepted_bookings
    FROM "Listing" l
    LEFT JOIN "SleepingSpot" s ON s."listingId" = l.id
    LEFT JOIN "Booking" b ON b."listingId" = l.id
    GROUP BY l.id
    HAVING COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'FILLED') !=
           COUNT(DISTINCT b.id) FILTER (WHERE b.status = 'ACCEPTED')
  `;

  if (mismatches.length === 0) {
    pass("Filled Spots", "FILLED spots count matches ACCEPTED bookings count");
  } else {
    fail(
      "Filled Spots",
      `${mismatches.length} listings have FILLED/ACCEPTED mismatch`,
      mismatches.map((m) => ({
        id: m.id,
        title: m.title,
        filledSpots: Number(m.filled_spots),
        acceptedBookings: Number(m.accepted_bookings),
      })),
    );
  }
}

// ============================================================
// CHECK 5: No duplicate filledByBookingId values
// ============================================================
async function checkNoDuplicateFilledBy(): Promise<void> {
  log("Check 5: No duplicate filledByBookingId values...");

  const duplicates = await prisma.$queryRaw<
    Array<{ filledByBookingId: string; count: bigint }>
  >`
    SELECT "filledByBookingId", COUNT(*) as count
    FROM "SleepingSpot"
    WHERE "filledByBookingId" IS NOT NULL
    GROUP BY "filledByBookingId"
    HAVING COUNT(*) > 1
  `;

  if (duplicates.length === 0) {
    pass("No Duplicates", "No duplicate filledByBookingId values");
  } else {
    fail(
      "No Duplicates",
      `${duplicates.length} bookings fill multiple spots (should be 1:1)`,
      duplicates.map((d) => ({
        bookingId: d.filledByBookingId,
        spotCount: Number(d.count),
      })),
    );
  }
}

// ============================================================
// BONUS: Summary statistics
// ============================================================
async function printStats(): Promise<void> {
  log("Computing statistics...");

  const stats = await prisma.$queryRaw<
    Array<{
      total_listings: bigint;
      total_spots: bigint;
      available_spots: bigint;
      held_spots: bigint;
      under_offer_spots: bigint;
      filled_spots: bigint;
      maintenance_spots: bigint;
      total_bookings: bigint;
      accepted_bookings: bigint;
      bookings_with_spot: bigint;
      bookings_with_status_v2: bigint;
    }>
  >`
    SELECT
      (SELECT COUNT(*) FROM "Listing") as total_listings,
      (SELECT COUNT(*) FROM "SleepingSpot") as total_spots,
      (SELECT COUNT(*) FROM "SleepingSpot" WHERE status = 'AVAILABLE') as available_spots,
      (SELECT COUNT(*) FROM "SleepingSpot" WHERE status = 'HELD') as held_spots,
      (SELECT COUNT(*) FROM "SleepingSpot" WHERE status = 'UNDER_OFFER') as under_offer_spots,
      (SELECT COUNT(*) FROM "SleepingSpot" WHERE status = 'FILLED') as filled_spots,
      (SELECT COUNT(*) FROM "SleepingSpot" WHERE status = 'MAINTENANCE') as maintenance_spots,
      (SELECT COUNT(*) FROM "Booking") as total_bookings,
      (SELECT COUNT(*) FROM "Booking" WHERE status = 'ACCEPTED') as accepted_bookings,
      (SELECT COUNT(*) FROM "Booking" WHERE "spotId" IS NOT NULL) as bookings_with_spot,
      (SELECT COUNT(*) FROM "Booking" WHERE "statusV2" IS NOT NULL) as bookings_with_status_v2
  `;

  const s = stats[0];

  console.log();
  console.log("Statistics:");
  console.log(`  Listings: ${s.total_listings}`);
  console.log(`  Total Spots: ${s.total_spots}`);
  console.log(`    - AVAILABLE: ${s.available_spots}`);
  console.log(`    - HELD: ${s.held_spots}`);
  console.log(`    - UNDER_OFFER: ${s.under_offer_spots}`);
  console.log(`    - FILLED: ${s.filled_spots}`);
  console.log(`    - MAINTENANCE: ${s.maintenance_spots}`);
  console.log(`  Total Bookings: ${s.total_bookings}`);
  console.log(`    - ACCEPTED: ${s.accepted_bookings}`);
  console.log(`    - With spotId: ${s.bookings_with_spot}`);
  console.log(`    - With statusV2: ${s.bookings_with_status_v2}`);
}

// ============================================================
// MAIN
// ============================================================
async function main(): Promise<void> {
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log(" Phase 2: Post-Backfill Validation");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log();

  await checkSpotCounts();
  await checkAvailableSpots();
  await checkAcceptedBookingsHaveSpots();
  await checkFilledSpotsMatchAccepted();
  await checkNoDuplicateFilledBy();

  await printStats();

  // Summary
  console.log();
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log(" SUMMARY");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);

  if (failed > 0) {
    console.log();
    console.log("Failed checks:");
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  - ${r.check}: ${r.details}`);
      if (r.items && r.items.length <= 10) {
        for (const item of r.items) {
          console.log(`      ${JSON.stringify(item)}`);
        }
      } else if (r.items && r.items.length > 10) {
        for (const item of r.items.slice(0, 10)) {
          console.log(`      ${JSON.stringify(item)}`);
        }
        console.log(`      ... and ${r.items.length - 10} more`);
      }
    }
    console.log();
    console.log("❌ VALIDATION FAILED");
    process.exit(1);
  } else {
    console.log();
    console.log("✅ ALL CHECKS PASSED - Backfill completed successfully");
    process.exit(0);
  }
}

main()
  .catch((error) => {
    console.error("Validation failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
