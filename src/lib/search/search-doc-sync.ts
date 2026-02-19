/**
 * Synchronous Search Document Upsert
 *
 * Provides immediate search document creation for new listings.
 * This eliminates the 6-hour delay from batch processing, making
 * new listings immediately searchable.
 *
 * Usage:
 * - Call after listing creation to ensure immediate visibility
 * - Falls back gracefully on error (logs but doesn't fail the parent operation)
 * - Uses the same field mappings and scoring as the cron job
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { computeRecommendedScore } from "@/lib/search/recommended-score";

interface ListingSearchData {
  id: string;
  ownerId: string;
  title: string;
  description: string | null;
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
 * Fetch listing data with location and review aggregation
 * Returns null if listing or location not found
 */
async function fetchListingSearchData(
  listingId: string
): Promise<ListingSearchData | null> {
  const results = await prisma.$queryRaw<ListingSearchData[]>`
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
    WHERE l.id = ${listingId}
      AND loc.coords IS NOT NULL
    GROUP BY l.id, loc.id
  `;

  return results.length > 0 ? results[0] : null;
}

/**
 * Upsert a search document for a single listing
 */
async function upsertSearchDocument(listing: ListingSearchData): Promise<void> {
  const recommendedScore = computeRecommendedScore(
    listing.avgRating,
    listing.viewCount,
    listing.reviewCount,
    listing.createdAt
  );

  // Compute lowercase arrays for case-insensitive filtering
  const amenitiesLower = listing.amenities.map((a) => a.toLowerCase());
  const houseRulesLower = listing.houseRules.map((r) => r.toLowerCase());
  const householdLanguagesLower = listing.householdLanguages.map((l) =>
    l.toLowerCase()
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
 * Synchronously upsert a search document for a listing.
 *
 * This function:
 * 1. Fetches the listing with all required relations (location, reviews)
 * 2. Computes the recommended_score using the same formula as cron
 * 3. Executes INSERT ON CONFLICT DO UPDATE to listing_search_docs
 *
 * Errors are logged but do not throw - listing creation should not fail
 * if search doc sync fails. The cron job will catch up eventually.
 *
 * @param listingId - The ID of the listing to upsert
 * @returns true if successful, false if failed
 */
export async function upsertSearchDocSync(listingId: string): Promise<boolean> {
  try {
    // Fetch listing with location and review data
    const listingData = await fetchListingSearchData(listingId);

    if (!listingData) {
      // This can happen if location coords are not yet set
      // The cron job will pick it up later
      logger.sync.warn("Search doc sync: listing or location not found", {
        action: "upsertSearchDocSync",
        listingId: listingId.slice(0, 8) + "...",
      });
      return false;
    }

    // Upsert the search document
    await upsertSearchDocument(listingData);

    logger.sync.info("Search doc synced successfully", {
      action: "upsertSearchDocSync",
      listingId: listingId.slice(0, 8) + "...",
    });

    return true;
  } catch (error) {
    // Log but don't throw - we don't want to fail listing creation
    // The dirty flag mechanism will ensure eventual consistency
    logger.sync.error("Search doc sync failed", {
      action: "upsertSearchDocSync",
      listingId: listingId.slice(0, 8) + "...",
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return false;
  }
}
