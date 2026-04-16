/**
 * Shared SearchDoc projection helpers.
 *
 * Immediate sync and cron refresh both route through the same single-listing
 * projection path so they classify and repair the same source states.
 */

import "server-only";

import { getAvailability } from "@/lib/availability";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { hasValidCoordinates } from "@/lib/search-types";
import {
  resolvePublicAvailability,
  type ResolvedPublicAvailability,
} from "@/lib/search/public-availability";
import { computeRecommendedScore } from "@/lib/search/recommended-score";

export type SearchDocProjectionOutcome =
  | "upsert"
  | "suppress_delete"
  | "defer_retry"
  | "confirmed_orphan";

export type SearchDocDivergenceReason = "missing_doc" | "stale_doc" | null;

interface ListingSearchSnapshot {
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
  availabilitySource: "LEGACY_BOOKING" | "HOST_MANAGED";
  openSlots: number | null;
  availableUntil: Date | null;
  minStayMonths: number;
  lastConfirmedAt: Date | null;
  statusReason: string | null;
  viewCount: number;
  status: string;
  bookingMode: string;
  createdAt: Date;
  updatedAt: Date;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  avgRating: number;
  reviewCount: number;
  docUpdatedAt: Date | null;
}

export interface SearchDocProjectionResult {
  listingId: string;
  outcome: SearchDocProjectionOutcome;
  divergenceReason: SearchDocDivergenceReason;
  hadExistingDoc: boolean;
}

/**
 * Fetches the listing snapshot required to project SearchDoc state.
 * Uses a left join on Location so "listing exists but cannot be projected yet"
 * is distinguishable from a truly missing listing row.
 */
async function fetchListingSearchSnapshot(
  listingId: string
): Promise<ListingSearchSnapshot | null> {
  const results = await prisma.$queryRaw<ListingSearchSnapshot[]>`
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
      l."availabilitySource" as "availabilitySource",
      l."openSlots" as "openSlots",
      l."availableUntil" as "availableUntil",
      l."minStayMonths" as "minStayMonths",
      l."lastConfirmedAt" as "lastConfirmedAt",
      l."statusReason" as "statusReason",
      l."viewCount" as "viewCount",
      l.status::text as status,
      l."booking_mode" as "bookingMode",
      l."createdAt" as "createdAt",
      l."updatedAt" as "updatedAt",
      loc.address,
      loc.city,
      loc.state,
      loc.zip,
      ST_X(loc.coords::geometry) as lng,
      ST_Y(loc.coords::geometry) as lat,
      COALESCE(AVG(r.rating), 0)::float as "avgRating",
      COUNT(r.id)::int as "reviewCount",
      MAX(sd.doc_updated_at) as "docUpdatedAt"
    FROM "Listing" l
    LEFT JOIN "Location" loc ON l.id = loc."listingId"
    LEFT JOIN "Review" r ON l.id = r."listingId"
    LEFT JOIN listing_search_docs sd ON sd.id = l.id
    WHERE l.id = ${listingId}
    GROUP BY l.id, loc.id
  `;

  return results[0] ?? null;
}

function truncateListingId(listingId: string): string {
  return `${listingId.slice(0, 8)}...`;
}

function getProjectionDivergenceReason(
  listing: ListingSearchSnapshot
): SearchDocDivergenceReason {
  if (!listing.docUpdatedAt) {
    return "missing_doc";
  }

  return listing.docUpdatedAt < listing.updatedAt ? "stale_doc" : null;
}

function canProjectSearchDocument(listing: ListingSearchSnapshot): boolean {
  return (
    listing.address != null &&
    listing.city != null &&
    listing.state != null &&
    listing.zip != null &&
    hasValidCoordinates(listing.lat, listing.lng)
  );
}

async function deleteSearchDocument(listingId: string): Promise<void> {
  await prisma.$executeRaw`
    DELETE FROM listing_search_docs
    WHERE id = ${listingId}
  `;
}

async function writeSearchDocument(
  listing: ListingSearchSnapshot,
  resolvedAvailability: ResolvedPublicAvailability
): Promise<void> {
  const recommendedScore = computeRecommendedScore(
    listing.avgRating,
    listing.viewCount,
    listing.reviewCount,
    listing.createdAt
  );
  const amenitiesLower = listing.amenities.map((amenity) =>
    amenity.toLowerCase()
  );
  const houseRulesLower = listing.houseRules.map((rule) => rule.toLowerCase());
  const householdLanguagesLower = listing.householdLanguages.map((language) =>
    language.toLowerCase()
  );

  await prisma.$executeRaw`
    INSERT INTO listing_search_docs (
      id, owner_id, title, description, price, images,
      amenities, house_rules, household_languages, primary_home_language,
      lease_duration, room_type, move_in_date, total_slots, available_slots,
      view_count, status, listing_created_at,
      address, city, state, zip, location_geog, lat, lng,
      avg_rating, review_count, recommended_score,
      amenities_lower, house_rules_lower, household_languages_lower,
      booking_mode,
      doc_created_at, doc_updated_at
    ) VALUES (
      ${listing.id}, ${listing.ownerId}, ${listing.title}, ${listing.description}, ${listing.price}, ${listing.images},
      ${listing.amenities}, ${listing.houseRules}, ${listing.householdLanguages}, ${listing.primaryHomeLanguage},
      ${listing.leaseDuration}, ${listing.roomType}, ${listing.moveInDate}, ${resolvedAvailability.totalSlots}, ${resolvedAvailability.effectiveAvailableSlots},
      ${listing.viewCount}, ${listing.status}, ${listing.createdAt},
      ${listing.address}, ${listing.city}, ${listing.state}, ${listing.zip},
      ST_SetSRID(ST_MakePoint(${listing.lng}, ${listing.lat}), 4326)::geography,
      ${listing.lat}, ${listing.lng},
      ${listing.avgRating}, ${listing.reviewCount}, ${recommendedScore},
      ${amenitiesLower}, ${houseRulesLower}, ${householdLanguagesLower},
      ${listing.bookingMode},
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
      booking_mode = EXCLUDED.booking_mode,
      doc_updated_at = NOW()
  `;
}

/**
 * Classify and repair SearchDoc state for a single listing.
 *
 * The result is intentionally explicit so callers can decide whether the dirty
 * flag should be cleared (`upsert`, `suppress_delete`, `confirmed_orphan`) or
 * retained for a later retry (`defer_retry`).
 */
export async function projectSearchDocument(
  listingId: string
): Promise<SearchDocProjectionResult> {
  const listing = await fetchListingSearchSnapshot(listingId);

  if (!listing) {
    await deleteSearchDocument(listingId);
    return {
      listingId,
      outcome: "confirmed_orphan",
      divergenceReason: null,
      hadExistingDoc: false,
    };
  }

  const divergenceReason = getProjectionDivergenceReason(listing);
  const hadExistingDoc = listing.docUpdatedAt != null;

  if (!canProjectSearchDocument(listing)) {
    await deleteSearchDocument(listing.id);
    return {
      listingId: listing.id,
      outcome: "defer_retry",
      divergenceReason,
      hadExistingDoc,
    };
  }

  const resolvedAvailability =
    listing.availabilitySource === "LEGACY_BOOKING"
      ? resolvePublicAvailability(listing, {
          legacySnapshot: await getAvailability(listing.id),
        })
      : resolvePublicAvailability(listing);

  if (
    listing.availabilitySource === "HOST_MANAGED" &&
    !resolvedAvailability.isPubliclyAvailable
  ) {
    await deleteSearchDocument(listing.id);
    return {
      listingId: listing.id,
      outcome: "suppress_delete",
      divergenceReason,
      hadExistingDoc,
    };
  }

  await writeSearchDocument(listing, resolvedAvailability);

  return {
    listingId: listing.id,
    outcome: "upsert",
    divergenceReason,
    hadExistingDoc,
  };
}

/**
 * Best-effort immediate SearchDoc refresh used by source writes.
 *
 * Returns true for terminal handled outcomes (`upsert`, `suppress_delete`) and
 * false when the projection must wait for the durable cron backstop.
 */
export async function upsertSearchDocSync(listingId: string): Promise<boolean> {
  try {
    const result = await projectSearchDocument(listingId);
    const logContext = {
      action: "upsertSearchDocSync",
      listingId: truncateListingId(listingId),
      outcome: result.outcome,
      divergenceReason: result.divergenceReason ?? undefined,
    };

    if (result.outcome === "upsert") {
      logger.sync.info("Search doc synced successfully", logContext);
      return true;
    }

    if (result.outcome === "suppress_delete") {
      logger.sync.info("Search doc sync suppressed host-managed listing", logContext);
      return true;
    }

    if (result.outcome === "confirmed_orphan") {
      logger.sync.warn("Search doc sync confirmed orphan listing", logContext);
      return false;
    }

    logger.sync.warn(
      "Search doc sync deferred pending projection prerequisites",
      logContext
    );
    return false;
  } catch (error) {
    logger.sync.error("Search doc sync failed", {
      action: "upsertSearchDocSync",
      listingId: truncateListingId(listingId),
      error: sanitizeErrorMessage(error),
    });
    return false;
  }
}
