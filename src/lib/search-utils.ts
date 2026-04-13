// Search utility functions and types (client-safe)

import {
  buildCanonicalSearchUrl,
  normalizeSearchQuery,
  serializeSearchQuery,
  type NormalizedSearchQuery,
} from "@/lib/search/search-query";
import type { SortOption } from "@/lib/search-types";

export interface SearchFilters {
  query?: string;
  locationLabel?: string;
  vibeQuery?: string;
  minPrice?: number;
  maxPrice?: number;
  amenities?: string[];
  moveInDate?: string;
  leaseDuration?: string;
  houseRules?: string[];
  roomType?: string;
  languages?: string[];
  genderPreference?: string;
  householdGender?: string;
  bookingMode?: string;
  minSlots?: number;
  nearMatches?: boolean;
  lat?: number;
  lng?: number;
  minLat?: number;
  maxLat?: number;
  minLng?: number;
  maxLng?: number;
  sort?: SortOption;
  city?: string;
}

function buildBoundsFromFilters(
  filters: SearchFilters
): NormalizedSearchQuery["bounds"] {
  if (
    typeof filters.minLat !== "number" ||
    !Number.isFinite(filters.minLat) ||
    typeof filters.maxLat !== "number" ||
    !Number.isFinite(filters.maxLat) ||
    typeof filters.minLng !== "number" ||
    !Number.isFinite(filters.minLng) ||
    typeof filters.maxLng !== "number" ||
    !Number.isFinite(filters.maxLng)
  ) {
    return undefined;
  }

  const minLat = Math.min(filters.minLat, filters.maxLat);
  const maxLat = Math.max(filters.minLat, filters.maxLat);

  return {
    minLat,
    maxLat,
    minLng: filters.minLng,
    maxLng: filters.maxLng,
  };
}

export function searchFiltersToNormalizedQuery(
  filters: SearchFilters
): NormalizedSearchQuery {
  return normalizeSearchQuery(
    serializeSearchQuery({
      query: filters.query,
      locationLabel: filters.locationLabel,
      vibeQuery: filters.vibeQuery,
      minPrice: filters.minPrice,
      maxPrice: filters.maxPrice,
      amenities: filters.amenities,
      moveInDate: filters.moveInDate,
      leaseDuration: filters.leaseDuration,
      houseRules: filters.houseRules,
      languages: filters.languages,
      roomType: filters.roomType,
      genderPreference: filters.genderPreference,
      householdGender: filters.householdGender,
      bookingMode: filters.bookingMode,
      minSlots: filters.minSlots,
      nearMatches: filters.nearMatches,
      lat: filters.lat,
      lng: filters.lng,
      bounds: buildBoundsFromFilters(filters),
      sort: filters.sort,
    })
  );
}

export function normalizedSearchQueryToSearchFilters(
  query: NormalizedSearchQuery
): SearchFilters {
  return {
    query: query.query,
    locationLabel: query.locationLabel,
    vibeQuery: query.vibeQuery,
    minPrice: query.minPrice,
    maxPrice: query.maxPrice,
    amenities: query.amenities,
    moveInDate: query.moveInDate,
    leaseDuration: query.leaseDuration,
    houseRules: query.houseRules,
    roomType: query.roomType,
    languages: query.languages,
    genderPreference: query.genderPreference,
    householdGender: query.householdGender,
    bookingMode: query.bookingMode,
    minSlots: query.minSlots,
    nearMatches: query.nearMatches,
    lat: query.lat,
    lng: query.lng,
    minLat: query.bounds?.minLat,
    maxLat: query.bounds?.maxLat,
    minLng: query.bounds?.minLng,
    maxLng: query.bounds?.maxLng,
    sort: query.sort,
  };
}

export function normalizeSearchFilters(filters: SearchFilters): SearchFilters {
  const normalized = normalizedSearchQueryToSearchFilters(
    searchFiltersToNormalizedQuery(filters)
  );

  if (filters.city) {
    normalized.city = filters.city;
  }

  return normalized;
}

export function searchParamsToSearchFilters(
  searchParams: URLSearchParams
): SearchFilters {
  return normalizedSearchQueryToSearchFilters(normalizeSearchQuery(searchParams));
}

// Build search URL from filters
export function buildSearchUrl(filters: SearchFilters): string {
  return buildCanonicalSearchUrl(searchFiltersToNormalizedQuery(filters), {
    includePagination: false,
  });
}
