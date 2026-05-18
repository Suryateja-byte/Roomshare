import "server-only";

import { createHash } from "node:crypto";
import type { GeocodingResult } from "@/lib/geocoding-cache";
import type { LocationAutocompleteBias } from "@/lib/geocoding/autocomplete";
import { prisma } from "@/lib/prisma";
import { searchPhoton } from "@/lib/geocoding/photon";
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
const PUBLIC_EXTERNAL_PLACE_LIMIT = 10;
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
  bias?: LocationAutocompleteBias;
}

export const PUBLIC_AUTOCOMPLETE_SELECT_SQL = `
  SELECT
    l.id,
    'HOST_MANAGED'::text AS "availabilitySource",
    l."availableSlots" AS "availableSlots",
    l."openSlots" AS "openSlots",
    l."totalSlots" AS "totalSlots",
    l."moveInDate" AS "moveInDate",
    l."availableUntil" AS "availableUntil",
    l."minStayMonths" AS "minStayMonths",
    l."lastConfirmedAt" AS "lastConfirmedAt",
    l.status::text AS status,
    l."statusReason" AS "statusReason",
    FALSE AS "needsMigrationReview",
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

  if (/^\d{1,6}\b/.test(normalized)) {
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

function createSuggestionKey(result: GeocodingResult): string {
  return normalizeAutocompleteText(result.place_name);
}

function isPointInBounds(
  center: [number, number],
  bounds?: LocationAutocompleteBias["bounds"]
): boolean {
  if (!bounds) {
    return false;
  }

  const [lng, lat] = center;
  const [minLng, minLat, maxLng, maxLat] = bounds;
  return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat;
}

function distanceSquaredFromBias(
  center: [number, number],
  bias?: LocationAutocompleteBias
): number | null {
  if (!bias?.near) {
    return null;
  }

  const [lng, lat] = center;
  const latDelta = lat - bias.near.lat;
  const lngDelta = lng - bias.near.lng;
  return latDelta * latDelta + lngDelta * lngDelta;
}

function scoreExternalSuggestion(
  result: GeocodingResult,
  bias?: LocationAutocompleteBias
): number {
  let score = 100;

  if (isPointInBounds(result.center, bias?.bounds)) {
    score += 50;
  }

  const distanceSquared = distanceSquaredFromBias(result.center, bias);
  if (distanceSquared !== null) {
    score += Math.max(0, 40 - distanceSquared * 1_000);
  }

  return score;
}

function normalizeExternalPlaceType(
  placeName: string,
  placeType: string[]
): string[] | null {
  if (placeType.includes("country")) {
    return null;
  }

  if (placeType.includes("address")) {
    if (!ADDRESS_SUFFIX_PATTERN.test(placeName)) {
      return null;
    }

    return ["street"];
  }

  if (placeType.includes("neighborhood")) {
    return ["neighborhood"];
  }

  if (placeType.includes("locality")) {
    return ["locality"];
  }

  if (placeType.includes("region")) {
    return ["region"];
  }

  return ["place"];
}

function toSafeExternalSuggestion(
  result: GeocodingResult,
  query: string
): GeocodingResult | null {
  if (
    !matchesAutocompleteQuery(result.place_name, query) ||
    !isSafePublicAutocompleteLabel(result.place_name)
  ) {
    return null;
  }

  const placeType = normalizeExternalPlaceType(
    result.place_name,
    result.place_type
  );
  if (!placeType) {
    return null;
  }

  return {
    ...result,
    id: `place:${result.id}`,
    place_type: placeType,
  };
}

async function searchSafeExternalPlaces(
  query: string,
  options: PublicAutocompleteSearchOptions
): Promise<GeocodingResult[]> {
  const externalLimit = Math.min(options.limit * 2, PUBLIC_EXTERNAL_PLACE_LIMIT);
  try {
    const results = await searchPhoton(query, {
      limit: externalLimit,
      near: options.bias?.near,
    });

    return results
      .map((result) => toSafeExternalSuggestion(result, query))
      .filter((result): result is GeocodingResult => Boolean(result))
      .sort(
        (a, b) =>
          scoreExternalSuggestion(b, options.bias) -
          scoreExternalSuggestion(a, options.bias)
      );
  } catch {
    recordPublicAutocompleteFallbackUsed("external_place_search_unavailable");
    return [];
  }
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

  const suggestions = new Map<
    string,
    { result: GeocodingResult; score: number; index: number }
  >();
  let suggestionIndex = 0;

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

    const suggestionKey = createSuggestionKey({
      id: "",
      place_name: label.placeName,
      center: [center.lng, center.lat],
      place_type: label.placeType,
    });
    if (suggestions.has(suggestionKey)) {
      continue;
    }

    suggestions.set(suggestionKey, {
      result: {
        id: createSuggestionId(label.placeName, row.publicCellId ?? ""),
        place_name: label.placeName,
        center: [center.lng, center.lat],
        place_type: label.placeType,
        bbox: buildCoarseBbox(center),
      },
      score: 1_000,
      index: suggestionIndex++,
    });
  }

  if (suggestions.size < options.limit) {
    const externalSuggestions = await searchSafeExternalPlaces(query, options);

    for (const result of externalSuggestions) {
      const suggestionKey = createSuggestionKey(result);
      if (suggestions.has(suggestionKey)) {
        continue;
      }

      suggestions.set(suggestionKey, {
        result,
        score: scoreExternalSuggestion(result, options.bias),
        index: suggestionIndex++,
      });
    }
  }

  return Array.from(suggestions.values())
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((suggestion) => suggestion.result)
    .slice(0, options.limit);
}
