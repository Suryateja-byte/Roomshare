/**
 * SearchDoc: Backfill listing_search_docs from existing data
 *
 * Creates SearchDoc rows by joining Listing + Location + Review data.
 * Designed for initial population and disaster recovery.
 *
 * Features:
 * - Batch processing (configurable batch size)
 * - Idempotent (upsert, safe to re-run)
 * - Dry-run mode for preview
 * - Progress logging
 * - Requires safety flag for writes
 *
 * Usage:
 *   npx ts-node src/scripts/backfill-search-docs.ts --dry-run       # Preview
 *   npx ts-node src/scripts/backfill-search-docs.ts --i-understand  # Real backfill
 *   npx ts-node src/scripts/backfill-search-docs.ts --i-understand --batch-size 50
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_BATCH_SIZE = 100;

interface BackfillStats {
  listingsProcessed: number;
  docsCreated: number;
  docsUpdated: number;
  listingsSkipped: number; // Missing location
  errors: string[];
}

const stats: BackfillStats = {
  listingsProcessed: 0,
  docsCreated: 0,
  docsUpdated: 0,
  listingsSkipped: 0,
  errors: [],
};

function log(message: string): void {
  console.log(`[Backfill] ${message}`);
}

// ============================================================
// COMPUTE SEARCH DOC FROM SOURCE DATA
// ============================================================

interface ListingWithData {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  price: number;
  images: string[];
  amenities: string[];
  houseRules: string[];
  householdLanguages: string[];
  primaryHomeLanguage: string | null;
  leaseDuration: string | null;
  roomType: string | null;
  moveInDate: Date | null;
  totalSlots: number;
  availableSlots: number;
  viewCount: number;
  status: string;
  createdAt: Date;
  // Location data
  address: string;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
  // Review aggregation
  avgRating: number;
  reviewCount: number;
}

/**
 * Fetch listings with location and review data using raw SQL
 * This matches the current v2 query pattern for consistency
 */
async function fetchListingsWithData(
  offset: number,
  limit: number,
): Promise<ListingWithData[]> {
  const results = await prisma.$queryRaw<ListingWithData[]>`
    SELECT
      l.id,
      l."ownerId" as "ownerId",
      l.title,
      l.description,
      l.price,
      l.images,
      l.amenities,
      l."houseRules" as "houseRules",
      l."household_languages" as "householdLanguages",
      l."primary_home_language" as "primaryHomeLanguage",
      l."leaseDuration" as "leaseDuration",
      l."roomType" as "roomType",
      l."moveInDate" as "moveInDate",
      l."totalSlots" as "totalSlots",
      l."availableSlots" as "availableSlots",
      l."viewCount" as "viewCount",
      l.status::text as status,
      l."createdAt" as "createdAt",
      loc.address,
      loc.city,
      loc.state,
      loc.zip,
      ST_X(loc.coords::geometry) as lng,
      ST_Y(loc.coords::geometry) as lat,
      COALESCE(AVG(r.rating), 0)::float as "avgRating",
      COUNT(r.id)::int as "reviewCount"
    FROM "Listing" l
    JOIN "Location" loc ON l.id = loc."listingId"
    LEFT JOIN "Review" r ON l.id = r."listingId"
    WHERE loc.coords IS NOT NULL
    GROUP BY l.id, loc.id
    ORDER BY l."createdAt" ASC
    OFFSET ${offset}
    LIMIT ${limit}
  `;

  return results;
}

/**
 * Count total listings that can be backfilled (have location with coords)
 */
async function countBackfillableListings(): Promise<number> {
  const result = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(DISTINCT l.id) as count
    FROM "Listing" l
    JOIN "Location" loc ON l.id = loc."listingId"
    WHERE loc.coords IS NOT NULL
  `;
  return Number(result[0].count);
}

/**
 * Count listings without location (will be skipped)
 */
async function countListingsWithoutLocation(): Promise<number> {
  const result = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(l.id) as count
    FROM "Listing" l
    LEFT JOIN "Location" loc ON l.id = loc."listingId"
    WHERE loc.coords IS NULL OR loc.id IS NULL
  `;
  return Number(result[0].count);
}

/**
 * Compute recommended score with time decay, log scaling, and freshness boost
 * Same formula used in cron job for consistency
 */
function computeRecommendedScore(
  avgRating: number,
  viewCount: number,
  reviewCount: number,
  createdAt: Date,
): number {
  // Base scores
  const ratingScore = avgRating * 20;
  const reviewScore = reviewCount * 5;

  // Time decay on views (30-day half-life)
  const daysSinceCreation = Math.floor(
    (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );
  const decayFactor = Math.max(0.1, 1 - (daysSinceCreation / 30) * 0.5);

  // Logarithmic scaling on views
  const viewScore = Math.log(1 + viewCount) * 10 * decayFactor;

  // Freshness boost for new listings (first 7 days)
  const freshnessBoost = daysSinceCreation <= 7
    ? 15 * (1 - daysSinceCreation / 7)
    : 0;

  return ratingScore + viewScore + reviewScore + freshnessBoost;
}

/**
 * Upsert a batch of search docs
 */
async function upsertSearchDocsBatch(
  listings: ListingWithData[],
  dryRun: boolean,
): Promise<{ created: number; updated: number }> {
  if (dryRun) {
    return { created: listings.length, updated: 0 };
  }

  let created = 0;
  let updated = 0;

  for (const listing of listings) {
    const recommendedScore = computeRecommendedScore(
      listing.avgRating,
      listing.viewCount,
      listing.reviewCount,
      listing.createdAt,
    );

    // Compute lowercase arrays for case-insensitive filtering
    const amenitiesLower = listing.amenities.map((a) => a.toLowerCase());
    const houseRulesLower = listing.houseRules.map((r) => r.toLowerCase());
    const householdLanguagesLower = listing.householdLanguages.map((l) =>
      l.toLowerCase(),
    );

    // Use raw SQL for upsert with geography type
    await prisma.$executeRaw`
      INSERT INTO listing_search_docs (
        id, owner_id, title, description, price, images,
        amenities, house_rules, household_languages, primary_home_language,
        lease_duration, room_type, move_in_date, total_slots, available_slots,
        view_count, status, listing_created_at,
        address, city, state, zip, location_geog, lat, lng,
        avg_rating, review_count, recommended_score,
        amenities_lower, house_rules_lower, household_languages_lower,
        doc_created_at, doc_updated_at
      ) VALUES (
        ${listing.id}, ${listing.ownerId}, ${listing.title}, ${listing.description}, ${listing.price}, ${listing.images},
        ${listing.amenities}, ${listing.houseRules}, ${listing.householdLanguages}, ${listing.primaryHomeLanguage},
        ${listing.leaseDuration}, ${listing.roomType}, ${listing.moveInDate}, ${listing.totalSlots}, ${listing.availableSlots},
        ${listing.viewCount}, ${listing.status}, ${listing.createdAt},
        ${listing.address}, ${listing.city}, ${listing.state}, ${listing.zip},
        ST_SetSRID(ST_MakePoint(${listing.lng}, ${listing.lat}), 4326)::geography,
        ${listing.lat}, ${listing.lng},
        ${listing.avgRating}, ${listing.reviewCount}, ${recommendedScore},
        ${amenitiesLower}, ${houseRulesLower}, ${householdLanguagesLower},
        NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        owner_id = EXCLUDED.owner_id,
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        price = EXCLUDED.price,
        images = EXCLUDED.images,
        amenities = EXCLUDED.amenities,
        house_rules = EXCLUDED.house_rules,
        household_languages = EXCLUDED.household_languages,
        primary_home_language = EXCLUDED.primary_home_language,
        lease_duration = EXCLUDED.lease_duration,
        room_type = EXCLUDED.room_type,
        move_in_date = EXCLUDED.move_in_date,
        total_slots = EXCLUDED.total_slots,
        available_slots = EXCLUDED.available_slots,
        view_count = EXCLUDED.view_count,
        status = EXCLUDED.status,
        listing_created_at = EXCLUDED.listing_created_at,
        address = EXCLUDED.address,
        city = EXCLUDED.city,
        state = EXCLUDED.state,
        zip = EXCLUDED.zip,
        location_geog = EXCLUDED.location_geog,
        lat = EXCLUDED.lat,
        lng = EXCLUDED.lng,
        avg_rating = EXCLUDED.avg_rating,
        review_count = EXCLUDED.review_count,
        recommended_score = EXCLUDED.recommended_score,
        amenities_lower = EXCLUDED.amenities_lower,
        house_rules_lower = EXCLUDED.house_rules_lower,
        household_languages_lower = EXCLUDED.household_languages_lower,
        doc_updated_at = NOW()
    `;

    // If 1 row affected, it's an insert; otherwise update
    // (PostgreSQL ON CONFLICT always returns 1 for upsert)
    // We track as created for simplicity
    created++;
  }

  return { created, updated };
}

// ============================================================
// MAIN BACKFILL LOOP
// ============================================================
async function runBackfill(dryRun: boolean, batchSize: number): Promise<void> {
  const totalListings = await countBackfillableListings();
  const skippedListings = await countListingsWithoutLocation();

  log(`Found ${totalListings} listings with location data`);
  log(`Skipping ${skippedListings} listings without location data`);
  stats.listingsSkipped = skippedListings;

  if (totalListings === 0) {
    log("No listings to backfill. Done.");
    return;
  }

  let offset = 0;
  let batchNum = 1;
  const totalBatches = Math.ceil(totalListings / batchSize);

  while (offset < totalListings) {
    log(`Processing batch ${batchNum}/${totalBatches} (offset ${offset})...`);

    try {
      const listings = await fetchListingsWithData(offset, batchSize);

      if (listings.length === 0) {
        break;
      }

      const { created, updated } = await upsertSearchDocsBatch(
        listings,
        dryRun,
      );

      stats.listingsProcessed += listings.length;
      stats.docsCreated += created;
      stats.docsUpdated += updated;

      if (dryRun) {
        log(`  [DRY-RUN] Would upsert ${listings.length} search docs`);
      } else {
        log(`  ✅ Upserted ${listings.length} search docs`);
      }
    } catch (error) {
      const errorMsg = `Batch ${batchNum} failed: ${(error as Error).message}`;
      stats.errors.push(errorMsg);
      console.error(`❌ ${errorMsg}`);
      // Continue with next batch
    }

    offset += batchSize;
    batchNum++;
  }
}

// ============================================================
// MAIN
// ============================================================
async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const safetyFlag = process.argv.includes("--i-understand");

  // Parse batch size
  let batchSize = DEFAULT_BATCH_SIZE;
  const batchSizeArg = process.argv.find((arg) =>
    arg.startsWith("--batch-size"),
  );
  if (batchSizeArg) {
    const idx = process.argv.indexOf(batchSizeArg);
    if (batchSizeArg.includes("=")) {
      batchSize = parseInt(batchSizeArg.split("=")[1], 10);
    } else if (process.argv[idx + 1]) {
      batchSize = parseInt(process.argv[idx + 1], 10);
    }
    if (isNaN(batchSize) || batchSize < 1) {
      batchSize = DEFAULT_BATCH_SIZE;
    }
  }

  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log(" SearchDoc: Backfill listing_search_docs");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log();

  if (!dryRun && !safetyFlag) {
    console.error("❌ ERROR: This script modifies the database.");
    console.error("");
    console.error(
      "  To preview changes:  npx ts-node src/scripts/backfill-search-docs.ts --dry-run",
    );
    console.error(
      "  To run for real:     npx ts-node src/scripts/backfill-search-docs.ts --i-understand",
    );
    console.error("");
    process.exit(1);
  }

  if (dryRun) {
    log("Running in DRY-RUN mode (no changes will be made)");
  } else {
    log("Running in LIVE mode (changes will be written to database)");
  }
  log(`Batch size: ${batchSize}`);

  console.log();

  // Run backfill
  await runBackfill(dryRun, batchSize);

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
  console.log(`  Search docs created/updated: ${stats.docsCreated}`);
  console.log(`  Listings skipped (no location): ${stats.listingsSkipped}`);
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
    console.log("✅ BACKFILL COMPLETE");
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
