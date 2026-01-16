// @ts-nocheck - Uses sleepingSpot/spots Prisma models not yet in schema
/**
 * Phase 2: Backfill SleepingSpot Entities
 *
 * Creates SleepingSpot rows for existing listings and assigns
 * ACCEPTED bookings to spots.
 *
 * Features:
 * - Pre-backfill validation (fails fast on corruption)
 * - Per-listing advisory locks (prevents concurrent backfill)
 * - SERIALIZABLE with retry (handles 40001/P2034)
 * - Idempotent (skips listings with existing spots)
 * - Requires safety flag for writes
 *
 * Usage:
 *   npx ts-node src/scripts/backfill-sleeping-spots.ts --dry-run      # Preview changes
 *   npx ts-node src/scripts/backfill-sleeping-spots.ts --i-understand # Real backfill
 */

import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

const MAX_SERIALIZATION_RETRIES = 3;

interface BackfillStats {
  listingsProcessed: number;
  listingsSkipped: number;
  spotsCreated: number;
  bookingsLinked: number;
  errors: string[];
}

const stats: BackfillStats = {
  listingsProcessed: 0,
  listingsSkipped: 0,
  spotsCreated: 0,
  bookingsLinked: 0,
  errors: [],
};

function log(message: string): void {
  console.log(`[Backfill] ${message}`);
}

function isSerializationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string; message?: string };
  return err.code === "P2034" || err.message?.includes("40001") || false;
}

// ============================================================
// PRE-BACKFILL VALIDATION
// ============================================================
async function validateLegacyData(): Promise<boolean> {
  log("Running pre-backfill validation...");

  // Check 1: ACCEPTED bookings > totalSlots (impossible state)
  const overbooked = await prisma.$queryRaw<
    Array<{
      id: string;
      title: string;
      totalSlots: number;
      accepted_count: bigint;
    }>
  >`
    SELECT l.id, l.title, l."totalSlots", COUNT(b.id) as accepted_count
    FROM "Listing" l
    LEFT JOIN "Booking" b ON b."listingId" = l.id AND b.status = 'ACCEPTED'
    GROUP BY l.id
    HAVING COUNT(b.id) > l."totalSlots"
  `;

  if (overbooked.length > 0) {
    console.error("❌ VALIDATION FAILED: Listings with ACCEPTED > totalSlots");
    for (const listing of overbooked) {
      console.error(
        `  - ${listing.id}: "${listing.title}" has ${listing.accepted_count} ACCEPTED but only ${listing.totalSlots} slots`,
      );
    }
    return false;
  }
  log("  ✅ No overbooked listings");

  // Check 2: availableSlots inconsistent with accepted bookings
  const inconsistent = await prisma.$queryRaw<
    Array<{
      id: string;
      title: string;
      totalSlots: number;
      availableSlots: number;
      expected_available: bigint;
    }>
  >`
    SELECT l.id, l.title, l."totalSlots", l."availableSlots",
           l."totalSlots" - COUNT(b.id) as expected_available
    FROM "Listing" l
    LEFT JOIN "Booking" b ON b."listingId" = l.id AND b.status = 'ACCEPTED'
    GROUP BY l.id
    HAVING l."availableSlots" != l."totalSlots" - COUNT(b.id)
  `;

  if (inconsistent.length > 0) {
    console.error(
      "❌ VALIDATION FAILED: Listings with inconsistent availableSlots",
    );
    for (const listing of inconsistent) {
      console.error(
        `  - ${listing.id}: "${listing.title}" has availableSlots=${listing.availableSlots} but expected ${listing.expected_available}`,
      );
    }
    return false;
  }
  log("  ✅ All availableSlots counters are consistent");

  return true;
}

// ============================================================
// BACKFILL SINGLE LISTING (with advisory lock + retry)
// ============================================================
async function backfillListing(
  listingId: string,
  dryRun: boolean,
): Promise<void> {
  for (let attempt = 1; attempt <= MAX_SERIALIZATION_RETRIES; attempt++) {
    try {
      await prisma.$transaction(
        async (tx) => {
          // Advisory lock prevents concurrent backfill of same listing
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${listingId}))`;

          // Fetch listing with existing spots and ACCEPTED bookings
          const listing = await tx.listing.findUnique({
            where: { id: listingId },
            include: {
              spots: true,
              bookings: {
                where: { status: "ACCEPTED" },
                orderBy: { createdAt: "asc" },
              },
            },
          });

          if (!listing) {
            log(`  ⚠️ Listing ${listingId} not found`);
            return;
          }

          // Idempotency: skip if spots already exist
          if (listing.spots.length > 0) {
            log(
              `  ⏭️ Skipping ${listing.id} - already has ${listing.spots.length} spots`,
            );
            stats.listingsSkipped++;
            return;
          }

          if (dryRun) {
            log(
              `  [DRY-RUN] Would create ${listing.totalSlots} spots for "${listing.title}"`,
            );
            log(
              `  [DRY-RUN] Would link ${listing.bookings.length} ACCEPTED bookings`,
            );
            stats.listingsProcessed++;
            stats.spotsCreated += listing.totalSlots;
            stats.bookingsLinked += listing.bookings.length;
            return;
          }

          // Create spots
          const spotIds: string[] = [];
          for (let i = 1; i <= listing.totalSlots; i++) {
            const spot = await tx.sleepingSpot.create({
              data: {
                listingId: listing.id,
                spotNumber: i,
                status: "AVAILABLE",
              },
            });
            spotIds.push(spot.id);
            stats.spotsCreated++;
          }

          log(
            `  ✅ Created ${listing.totalSlots} spots for "${listing.title}"`,
          );

          // Assign ACCEPTED bookings to spots
          const availableSpots = await tx.sleepingSpot.findMany({
            where: { listingId: listing.id, status: "AVAILABLE" },
            orderBy: { spotNumber: "asc" },
          });

          for (let i = 0; i < listing.bookings.length; i++) {
            const booking = listing.bookings[i];
            const spot = availableSpots[i];

            if (!spot) {
              stats.errors.push(
                `${listing.id}: Not enough spots for ACCEPTED bookings`,
              );
              throw new Error(`Not enough spots for booking ${booking.id}`);
            }

            // Skip bookings that already have a spotId (idempotency)
            if (booking.spotId) {
              log(`  ⏭️ Booking ${booking.id} already has spotId`);
              continue;
            }

            // Update spot to FILLED
            await tx.sleepingSpot.update({
              where: { id: spot.id },
              data: {
                status: "FILLED",
                filledByBookingId: booking.id,
              },
            });

            // Update booking with spotId and statusV2
            await tx.booking.update({
              where: { id: booking.id },
              data: {
                spotId: spot.id,
                statusV2: "MOVE_IN_CONFIRMED",
                moveInConfirmedAt: new Date(),
              },
            });

            stats.bookingsLinked++;
            log(
              `  ✅ Linked booking ${booking.id} to spot #${spot.spotNumber}`,
            );
          }

          stats.listingsProcessed++;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 30000,
        },
      );

      return; // Success
    } catch (error) {
      if (isSerializationError(error)) {
        if (attempt === MAX_SERIALIZATION_RETRIES) {
          stats.errors.push(
            `${listingId}: Serialization failed after ${MAX_SERIALIZATION_RETRIES} attempts`,
          );
          throw error;
        }
        const backoffMs = 50 * Math.pow(2, attempt);
        log(
          `  ⚠️ Serialization conflict, retrying in ${backoffMs}ms (attempt ${attempt}/${MAX_SERIALIZATION_RETRIES})`,
        );
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }
      stats.errors.push(`${listingId}: ${(error as Error).message}`);
      throw error;
    }
  }
}

// ============================================================
// MAIN BACKFILL LOOP
// ============================================================
async function runBackfill(dryRun: boolean): Promise<void> {
  // Get all listings that need backfill (no spots yet)
  const listings = await prisma.$queryRaw<Array<{ id: string; title: string }>>`
    SELECT l.id, l.title
    FROM "Listing" l
    LEFT JOIN "SleepingSpot" s ON s."listingId" = l.id
    WHERE s.id IS NULL
    ORDER BY l."createdAt" ASC
  `;

  log(`Found ${listings.length} listings to backfill`);

  if (listings.length === 0) {
    log("No listings need backfill. Done.");
    return;
  }

  for (const listing of listings) {
    try {
      log(`Processing listing ${listing.id}: "${listing.title}"`);
      await backfillListing(listing.id, dryRun);
    } catch (error) {
      console.error(`❌ Error processing listing ${listing.id}:`, error);
      // Continue with next listing
    }
  }
}

// ============================================================
// MAIN
// ============================================================
async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const safetyFlag = process.argv.includes("--i-understand");

  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log(" Phase 2: Backfill SleepingSpot Entities");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log();

  if (!dryRun && !safetyFlag) {
    console.error("❌ ERROR: This script modifies the database.");
    console.error("");
    console.error(
      "  To preview changes:  npx ts-node src/scripts/backfill-sleeping-spots.ts --dry-run",
    );
    console.error(
      "  To run for real:     npx ts-node src/scripts/backfill-sleeping-spots.ts --i-understand",
    );
    console.error("");
    process.exit(1);
  }

  if (dryRun) {
    log("Running in DRY-RUN mode (no changes will be made)");
  } else {
    log("Running in LIVE mode (changes will be written to database)");
  }

  console.log();

  // Pre-backfill validation
  const valid = await validateLegacyData();
  if (!valid) {
    console.error("");
    console.error("❌ BACKFILL ABORTED: Legacy data corruption detected");
    console.error("   Please fix the issues above before running backfill");
    process.exit(1);
  }

  console.log();

  // Run backfill
  await runBackfill(dryRun);

  // Summary
  console.log();
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log(" SUMMARY");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log(`  Mode: ${dryRun ? "DRY-RUN" : "LIVE"}`);
  console.log(`  Listings processed: ${stats.listingsProcessed}`);
  console.log(`  Listings skipped: ${stats.listingsSkipped}`);
  console.log(`  Spots created: ${stats.spotsCreated}`);
  console.log(`  Bookings linked: ${stats.bookingsLinked}`);
  console.log(`  Errors: ${stats.errors.length}`);

  if (stats.errors.length > 0) {
    console.log();
    console.log("Errors:");
    for (const error of stats.errors) {
      console.log(`  - ${error}`);
    }
    process.exit(1);
  }

  console.log();
  if (dryRun) {
    console.log(
      "✅ DRY-RUN COMPLETE - Run with --i-understand to apply changes",
    );
  } else {
    console.log("✅ BACKFILL COMPLETE - Run validate-backfill.ts to verify");
  }
  process.exit(0);
}

main()
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
