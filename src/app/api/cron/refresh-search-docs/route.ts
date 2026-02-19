/**
 * SearchDoc Refresh Cron Route
 *
 * Processes listing_search_doc_dirty entries and updates corresponding
 * search docs. Uses the dirty flag sweeper pattern for incremental updates.
 *
 * Schedule: Every 5 minutes (recommended) or on-demand
 *
 * Features:
 * - Batch processing (100 listings at a time)
 * - Oldest-first ordering (fairness)
 * - Cleans up processed dirty flags
 * - Logs processing stats without PII
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeRecommendedScore } from "@/lib/search/recommended-score";

// Number of dirty listings to process per cron run
const BATCH_SIZE = parseInt(process.env.SEARCH_DOC_BATCH_SIZE || "100", 10);

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
 * Fetch dirty listing IDs (oldest first)
 */
async function fetchDirtyListingIds(limit: number): Promise<string[]> {
  const dirtyEntries = await prisma.$queryRaw<{ listing_id: string }[]>`
    SELECT listing_id
    FROM listing_search_doc_dirty
    ORDER BY marked_at ASC
    LIMIT ${limit}
  `;
  return dirtyEntries.map((e) => e.listing_id);
}

/**
 * Fetch full listing data for given IDs
 * Returns listings with location and review aggregation
 */
async function fetchListingsWithData(
  listingIds: string[],
): Promise<ListingWithData[]> {
  if (listingIds.length === 0) return [];

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
    WHERE l.id = ANY(${listingIds})
      AND loc.coords IS NOT NULL
    GROUP BY l.id, loc.id
  `;

  return results;
}

/**
 * Upsert a single search doc
 */
async function upsertSearchDoc(listing: ListingWithData): Promise<void> {
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

  // Note: search_tsv (tsvector) is auto-populated by a BEFORE INSERT/UPDATE
  // trigger defined in migration 20260116000000_search_doc_fts. The trigger
  // builds a weighted tsvector from title (A), city/state (B), description (C).
  // No need to set it here — the DB handles it on every INSERT and UPDATE.
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
}

/**
 * Delete dirty flags for processed listings
 */
async function clearDirtyFlags(listingIds: string[]): Promise<number> {
  if (listingIds.length === 0) return 0;

  const result = await prisma.$executeRaw`
    DELETE FROM listing_search_doc_dirty
    WHERE listing_id = ANY(${listingIds})
  `;

  return result;
}

/**
 * Delete search docs for listings that no longer exist or lack location
 * These are "orphan" dirty flags for deleted listings
 */
async function handleOrphanDirtyFlags(
  dirtyIds: string[],
  foundIds: Set<string>,
): Promise<number> {
  const orphanIds = dirtyIds.filter((id) => !foundIds.has(id));
  if (orphanIds.length === 0) return 0;

  // Delete any search docs for these orphan listings (listing was deleted)
  await prisma.$executeRaw`
    DELETE FROM listing_search_docs
    WHERE id = ANY(${orphanIds})
  `;

  // Clear the dirty flags
  await prisma.$executeRaw`
    DELETE FROM listing_search_doc_dirty
    WHERE listing_id = ANY(${orphanIds})
  `;

  return orphanIds.length;
}

export async function GET(request: NextRequest) {
  try {
    // Verify the request is from Vercel Cron
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    // Defense in depth: validate secret configuration
    if (!cronSecret || cronSecret.length < 32) {
      console.error(
        "[SearchDoc Cron] CRON_SECRET not configured or too short (min 32 chars)",
      );
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    // Reject placeholder values
    if (
      cronSecret.includes("change-in-production") ||
      cronSecret.startsWith("your-") ||
      cronSecret.startsWith("generate-")
    ) {
      console.error("[SearchDoc Cron] CRON_SECRET contains placeholder value");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const startTime = Date.now();

    // 1. Fetch dirty listing IDs (oldest first)
    const dirtyIds = await fetchDirtyListingIds(BATCH_SIZE);

    if (dirtyIds.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        orphans: 0,
        durationMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      });
    }

    // 2. Fetch full listing data for dirty listings
    const listings = await fetchListingsWithData(dirtyIds);
    const foundIds = new Set(listings.map((l) => l.id));

    // 3. Upsert search docs for each listing
    let upsertedCount = 0;
    const errors: string[] = [];

    for (const listing of listings) {
      try {
        await upsertSearchDoc(listing);
        upsertedCount++;
      } catch (error) {
        // Log error without PII (only listing ID)
        errors.push(
          `Listing ${listing.id}: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }

    // 4. Clear dirty flags for successfully processed listings
    const processedIds = listings
      .filter((l) => !errors.some((e) => e.startsWith(`Listing ${l.id}:`)))
      .map((l) => l.id);
    await clearDirtyFlags(processedIds);

    // 5. Handle orphan dirty flags (listing deleted or missing location)
    const orphanCount = await handleOrphanDirtyFlags(dirtyIds, foundIds);

    const durationMs = Date.now() - startTime;

    console.log(JSON.stringify({
      event: "search_doc_cron_complete",
      processed: upsertedCount,
      orphans: orphanCount,
      errors: errors.length,
      totalDirty: dirtyIds.length,
      durationMs,
    }));

    console.log(
      `[SearchDoc Cron] Processed: ${upsertedCount}, Orphans: ${orphanCount}, ` +
        `Errors: ${errors.length}, Duration: ${durationMs}ms`,
    );

    return NextResponse.json({
      success: errors.length === 0,
      processed: upsertedCount,
      orphans: orphanCount,
      errors: errors.length,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[SearchDoc Cron] Error:", error);
    return NextResponse.json(
      { error: "SearchDoc refresh failed" },
      { status: 500 },
    );
  }
}
