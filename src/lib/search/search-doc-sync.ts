/**
 * Shared SearchDoc projection helpers.
 *
 * Immediate sync and cron refresh both route through the same single-listing
 * projection path so they classify and repair the same source states.
 */

import "server-only";

import { getAvailability } from "@/lib/availability";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import { hashIdForLog } from "@/lib/messaging/cfm-messaging-telemetry";
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

export type SearchDocDivergenceReason =
  | "missing_doc"
  | "stale_doc"
  | "version_skew"
  | null;

export type CasSuppressionReason =
  | "older_source_version"
  | "older_projection_version";

/**
 * Current search-doc projection contract version. Bump this whenever the
 * projection shape (columns written, semantics) changes. The cron compares
 * this against `listing_search_docs.projection_version` to detect shape drift
 * even when the underlying listing.updatedAt has not moved.
 */
export const SEARCH_DOC_PROJECTION_VERSION = 1;

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
  version: number;
  docUpdatedAt: Date | null;
  docSourceVersion: number | null;
  docProjectionVersion: number | null;
}

export interface SearchDocProjectionResult {
  listingId: string;
  outcome: SearchDocProjectionOutcome;
  divergenceReason: SearchDocDivergenceReason;
  casSuppressionReason: CasSuppressionReason | null;
  hadExistingDoc: boolean;
  listingVersion: number | null;
  docSourceVersion: number | null;
  docProjectionVersion: number | null;
  writeApplied: boolean;
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
      'HOST_MANAGED' as "availabilitySource",
      l."openSlots" as "openSlots",
      l."availableUntil" as "availableUntil",
      l."minStayMonths" as "minStayMonths",
      l."lastConfirmedAt" as "lastConfirmedAt",
      l."statusReason" as "statusReason",
      l."viewCount" as "viewCount",
      l.status::text as status,
      CASE
        WHEN l."roomType" = 'Entire Place' THEN 'WHOLE_UNIT'
        ELSE 'SHARED'
      END as "bookingMode",
      l."createdAt" as "createdAt",
      l."updatedAt" as "updatedAt",
      l."version" as "version",
      loc.address,
      loc.city,
      loc.state,
      loc.zip,
      ST_X(loc.coords::geometry) as lng,
      ST_Y(loc.coords::geometry) as lat,
      COALESCE(AVG(r.rating), 0)::float as "avgRating",
      COUNT(r.id)::int as "reviewCount",
      MAX(sd.doc_updated_at) as "docUpdatedAt",
      MAX(sd.source_version) as "docSourceVersion",
      MAX(sd.projection_version) as "docProjectionVersion"
    FROM "Listing" l
    LEFT JOIN "Location" loc ON l.id = loc."listingId"
    LEFT JOIN "Review" r ON l.id = r."listingId"
    LEFT JOIN listing_search_docs sd ON sd.id = l.id
    WHERE l.id = ${listingId}
    GROUP BY l.id, loc.id
  `;

  return results[0] ?? null;
}

export function getProjectionDivergenceReason(
  listing: Pick<
    ListingSearchSnapshot,
    | "docUpdatedAt"
    | "updatedAt"
    | "version"
    | "docSourceVersion"
    | "docProjectionVersion"
  >
): SearchDocDivergenceReason {
  if (!listing.docUpdatedAt) {
    return "missing_doc";
  }

  const sourceVersionSkew =
    listing.docSourceVersion != null &&
    listing.version > listing.docSourceVersion;
  const projectionVersionSkew =
    listing.docProjectionVersion != null &&
    listing.docProjectionVersion < SEARCH_DOC_PROJECTION_VERSION;

  if (sourceVersionSkew || projectionVersionSkew) {
    return "version_skew";
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

function classifyCasSuppressionReason(
  listing: Pick<
    ListingSearchSnapshot,
    "version" | "docSourceVersion" | "docProjectionVersion"
  >
): CasSuppressionReason {
  // This is best-effort diagnostic labeling from the pre-write snapshot. A
  // concurrent winner can still land between the read and the UPSERT attempt.
  // Prefer source-version skew when both dimensions look stale.
  if (
    listing.docSourceVersion != null &&
    listing.docSourceVersion > listing.version
  ) {
    return "older_source_version";
  }

  if (
    listing.docProjectionVersion != null &&
    listing.docProjectionVersion > SEARCH_DOC_PROJECTION_VERSION
  ) {
    return "older_projection_version";
  }

  return "older_source_version";
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
): Promise<boolean> {
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

  const rowsAffected = await prisma.$executeRaw`
    INSERT INTO listing_search_docs (
      id, owner_id, title, description, price, images,
      amenities, house_rules, household_languages, primary_home_language,
      lease_duration, room_type, move_in_date, total_slots, available_slots,
      view_count, status, listing_created_at,
      address, city, state, zip, location_geog, lat, lng,
      avg_rating, review_count, recommended_score,
      amenities_lower, house_rules_lower, household_languages_lower,
      booking_mode,
      projection_version, source_version,
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
      ${SEARCH_DOC_PROJECTION_VERSION}, ${listing.version},
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
      projection_version = EXCLUDED.projection_version,
      source_version = EXCLUDED.source_version,
      doc_updated_at = NOW()
    WHERE listing_search_docs.source_version <= EXCLUDED.source_version
      AND listing_search_docs.projection_version <= EXCLUDED.projection_version
  `;

  return rowsAffected > 0;
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
      casSuppressionReason: null,
      hadExistingDoc: false,
      listingVersion: null,
      docSourceVersion: null,
      docProjectionVersion: null,
      writeApplied: false,
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
      casSuppressionReason: null,
      hadExistingDoc,
      listingVersion: listing.version,
      docSourceVersion: listing.docSourceVersion,
      docProjectionVersion: listing.docProjectionVersion,
      writeApplied: false,
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
      casSuppressionReason: null,
      hadExistingDoc,
      listingVersion: listing.version,
      docSourceVersion: listing.docSourceVersion,
      docProjectionVersion: listing.docProjectionVersion,
      writeApplied: false,
    };
  }

  const writeApplied = await writeSearchDocument(listing, resolvedAvailability);
  const casSuppressionReason = writeApplied
    ? null
    : classifyCasSuppressionReason(listing);

  if (!writeApplied) {
    logger.sync.info("Search doc write suppressed by version CAS", {
      event: "cfm.search.doc.cas_suppressed",
      listingIdHash: hashIdForLog(listing.id),
      reason: casSuppressionReason,
      listingVersion: listing.version,
      docSourceVersion: listing.docSourceVersion,
      docProjectionVersion: listing.docProjectionVersion,
    });
  }

  return {
    listingId: listing.id,
    outcome: "upsert",
    divergenceReason,
    casSuppressionReason,
    hadExistingDoc,
    listingVersion: listing.version,
    docSourceVersion: listing.docSourceVersion,
    docProjectionVersion: listing.docProjectionVersion,
    writeApplied,
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
      listingIdHash: hashIdForLog(listingId),
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
      listingIdHash: hashIdForLog(listingId),
      error: sanitizeErrorMessage(error),
    });
    return false;
  }
}
