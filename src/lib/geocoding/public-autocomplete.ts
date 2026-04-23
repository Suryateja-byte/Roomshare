import "server-only";

import { createHash } from "node:crypto";
import type { GeocodingResult } from "@/lib/geocoding-cache";
import { prisma } from "@/lib/prisma";
import {
  isListingEligibleForPublicSearch,
  resolvePublicAvailability,
  type PublicAvailabilitySource,
} from "@/lib/search/public-availability";
import {
  recordPublicAutocompleteFallbackUsed,
  recordPublicAutocompletePrivacyViolation,
  recordPublicAutocompleteVisibilityMismatch,
} from "@/lib/geocoding/public-autocomplete-telemetry";

const PUBLIC_AUTOCOMPLETE_MAX_CANDIDATES = 250;
const PUBLIC_CELL_HALF_SIZE = 0.005;
const ADDRESS_SUFFIX_PATTERN =
  /\b(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|blvd|boulevard|ct|court|cir|circle|trl|trail|way|pl|place|hwy|highway|pkwy|parkway)\b/i;

interface PublicAutocompleteCandidateRow {
  id: string;
  availabilitySource: PublicAvailabilitySource | null;
  availableSlots: number | null;
  openSlots: number | null;
  totalSlots: number | null;
  moveInDate: Date | null;
  availableUntil: Date | null;
  minStayMonths: number | null;
  lastConfirmedAt: Date | null;
  status: string | null;
  statusReason: string | null;
  needsMigrationReview: boolean | null;
  city: string | null;
  state: string | null;
  publicAreaName: string | null;
  publicCellId: string | null;
}

interface PublicAutocompleteLabel {
  placeName: string;
  placeType: string[];
}

export interface PublicAutocompleteSearchOptions {
  limit: number;
  now?: Date;
}

export const PUBLIC_AUTOCOMPLETE_SELECT_SQL = `
  SELECT
    l.id,
    l."availabilitySource"::text AS "availabilitySource",
    l."availableSlots" AS "availableSlots",
    l."openSlots" AS "openSlots",
    l."totalSlots" AS "totalSlots",
    l."moveInDate" AS "moveInDate",
    l."availableUntil" AS "availableUntil",
    l."minStayMonths" AS "minStayMonths",
    l."lastConfirmedAt" AS "lastConfirmedAt",
    l.status::text AS status,
    l."statusReason" AS "statusReason",
    l."needsMigrationReview" AS "needsMigrationReview",
    loc.city,
    loc.state,
    pu.public_area_name AS "publicAreaName",
    pu.public_cell_id AS "publicCellId"
  FROM "Listing" l
  INNER JOIN "Location" loc
    ON loc."listingId" = l.id
  INNER JOIN physical_units pu
    ON pu.id = l."physical_unit_id"
  WHERE l."physical_unit_id" IS NOT NULL
    AND pu.public_point IS NOT NULL
    AND pu.public_cell_id IS NOT NULL
    AND loc.city IS NOT NULL
    AND loc.state IS NOT NULL
    AND LOWER(
      TRIM(
        COALESCE(pu.public_area_name, '') || ' ' ||
        COALESCE(loc.city, '') || ' ' ||
        COALESCE(loc.state, '')
      )
    ) LIKE $1
  ORDER BY l."updatedAt" DESC
  LIMIT $2
`;

function normalizeAutocompleteText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function tokenizePublicAutocompleteText(value: string): string[] {
  return normalizeAutocompleteText(value)
    .split(" ")
    .filter((token) => token.length >= 2 && /[a-z]/.test(token));
}

export function isLikelyStreetAddressQuery(query: string): boolean {
  const normalized = normalizeAutocompleteText(query);
  if (!/\d/.test(normalized)) {
    return false;
  }

  return ADDRESS_SUFFIX_PATTERN.test(normalized);
}

function buildLikePattern(query: string): string | null {
  const normalized = normalizeAutocompleteText(query);
  if (!normalized) {
    return null;
  }

  return `%${normalized.replace(/\s+/g, "%")}%`;
}

function isMeaningfullyNarrowerArea(areaName: string | null, city: string | null): boolean {
  if (!areaName || !city) {
    return false;
  }

  return normalizeAutocompleteText(areaName) !== normalizeAutocompleteText(city);
}

export function buildPublicAutocompleteLabel(input: {
  city: string | null;
  state: string | null;
  publicAreaName: string | null;
}): PublicAutocompleteLabel | null {
  const city = input.city?.trim() ?? "";
  const state = input.state?.trim() ?? "";
  const publicAreaName = input.publicAreaName?.trim() ?? "";

  if (!state) {
    return null;
  }

  if (publicAreaName && isMeaningfullyNarrowerArea(publicAreaName, city)) {
    return {
      placeName: `${publicAreaName}, ${state}`,
      placeType: ["neighborhood"],
    };
  }

  if (!city) {
    return null;
  }

  return {
    placeName: `${city}, ${state}`,
    placeType: ["place"],
  };
}

function isSafePublicAutocompleteLabel(placeName: string): boolean {
  const normalized = normalizeAutocompleteText(placeName);
  if (!normalized) {
    return false;
  }

  if (/^\d/.test(normalized)) {
    return false;
  }

  return !/\b\d{1,6}\b.*\b(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|blvd|boulevard|ct|court|cir|circle|trl|trail|way|pl|place|hwy|highway|pkwy|parkway)\b/i.test(
    normalized
  );
}

function parsePublicCellId(
  publicCellId: string | null
): { lat: number; lng: number } | null {
  if (!publicCellId) {
    return null;
  }

  const [latText, lngText] = publicCellId.split(",");
  const lat = Number.parseFloat(latText ?? "");
  const lng = Number.parseFloat(lngText ?? "");

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { lat, lng };
}

function buildCoarseBbox(center: { lat: number; lng: number }): [
  number,
  number,
  number,
  number,
] {
  const round = (value: number) => Number(value.toFixed(3));
  return [
    round(center.lng - PUBLIC_CELL_HALF_SIZE),
    round(center.lat - PUBLIC_CELL_HALF_SIZE),
    round(center.lng + PUBLIC_CELL_HALF_SIZE),
    round(center.lat + PUBLIC_CELL_HALF_SIZE),
  ];
}

function matchesAutocompleteQuery(searchText: string, query: string): boolean {
  const normalizedQuery = normalizeAutocompleteText(query);
  const labelText = normalizeAutocompleteText(searchText);

  if (!normalizedQuery || !labelText) {
    return false;
  }

  if (labelText.includes(normalizedQuery)) {
    return true;
  }

  const queryTokens = tokenizePublicAutocompleteText(query);
  const labelTokens = tokenizePublicAutocompleteText(searchText);

  if (queryTokens.length === 0 || labelTokens.length === 0) {
    recordPublicAutocompleteFallbackUsed("token_match_unavailable");
    return labelText.startsWith(normalizedQuery);
  }

  return queryTokens.every((queryToken) =>
    labelTokens.some((labelToken) => labelToken.startsWith(queryToken))
  );
}

function buildSearchableAutocompleteText(input: {
  city: string | null;
  state: string | null;
  publicAreaName: string | null;
}): string {
  return [
    input.publicAreaName?.trim() ?? "",
    input.city?.trim() ?? "",
    input.state?.trim() ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

function createSuggestionId(label: string, publicCellId: string): string {
  return `public:${createHash("sha256")
    .update(`${label}|${publicCellId}`)
    .digest("hex")
    .slice(0, 16)}`;
}

export async function searchPublicAutocomplete(
  query: string,
  options: PublicAutocompleteSearchOptions
): Promise<GeocodingResult[]> {
  if (isLikelyStreetAddressQuery(query)) {
    recordPublicAutocompleteFallbackUsed("address_like_query_blocked");
    return [];
  }

  const likePattern = buildLikePattern(query);
  if (!likePattern) {
    recordPublicAutocompleteFallbackUsed("empty_like_pattern");
    return [];
  }

  const candidateLimit = Math.min(
    PUBLIC_AUTOCOMPLETE_MAX_CANDIDATES,
    Math.max(options.limit * 25, options.limit)
  );

  // SECURITY INVARIANT: all user-controlled values stay in the params array.
  const rows = await prisma.$queryRawUnsafe<PublicAutocompleteCandidateRow[]>(
    PUBLIC_AUTOCOMPLETE_SELECT_SQL,
    likePattern,
    candidateLimit
  );

  const suggestions = new Map<string, GeocodingResult>();

  for (const row of rows) {
    const label = buildPublicAutocompleteLabel(row);
    if (
      !label ||
      !matchesAutocompleteQuery(buildSearchableAutocompleteText(row), query)
    ) {
      continue;
    }

    if (!isSafePublicAutocompleteLabel(label.placeName)) {
      recordPublicAutocompletePrivacyViolation({
        label: label.placeName,
        query,
      });
      continue;
    }

    const resolvedAvailability = resolvePublicAvailability({
      availabilitySource: row.availabilitySource ?? "LEGACY_BOOKING",
      availableSlots: row.availableSlots,
      openSlots: row.openSlots,
      totalSlots: row.totalSlots,
      moveInDate: row.moveInDate,
      availableUntil: row.availableUntil,
      minStayMonths: row.minStayMonths,
      lastConfirmedAt: row.lastConfirmedAt,
      status: row.status,
      statusReason: row.statusReason,
    }, {
      now: options.now,
    });

    if (
      !isListingEligibleForPublicSearch({
        needsMigrationReview: row.needsMigrationReview,
        statusReason: row.statusReason,
        resolvedAvailability,
      })
    ) {
      recordPublicAutocompleteVisibilityMismatch({
        listingId: row.id,
        status: row.status,
        statusReason: row.statusReason,
      });
      continue;
    }

    const center = parsePublicCellId(row.publicCellId);
    if (!center) {
      continue;
    }

    const suggestionKey = `${label.placeName.toLowerCase()}|${row.publicCellId}`;
    if (suggestions.has(suggestionKey)) {
      continue;
    }

    suggestions.set(suggestionKey, {
      id: createSuggestionId(label.placeName, row.publicCellId ?? ""),
      place_name: label.placeName,
      center: [center.lng, center.lat],
      place_type: label.placeType,
      bbox: buildCoarseBbox(center),
    });

    if (suggestions.size >= options.limit) {
      break;
    }
  }

  return Array.from(suggestions.values()).slice(0, options.limit);
}
