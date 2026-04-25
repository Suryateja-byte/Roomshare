"use client";

import {
  boundsTupleToObject,
  deriveSearchBoundsFromPoint,
  type SearchLocationBoundsTuple,
} from "@/lib/search/location-bounds";
import {
  applySearchQueryChange,
  normalizeSearchQuery,
  serializeSearchQuery,
} from "@/lib/search/search-query";

export interface SearchLocationSelection {
  lat: number;
  lng: number;
  bounds?: SearchLocationBoundsTuple;
}

export interface SearchIntentState {
  locationInput: string;
  vibeInput: string;
  locationSummary: string;
  vibeSummary: string;
  selectedLocation: SearchLocationSelection | null;
}

function parseFiniteNumber(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function readSearchIntentState(
  searchParams: URLSearchParams
): SearchIntentState {
  const vibeInput = searchParams.get("what") || "";
  const locationInput =
    searchParams.get("locationLabel") ||
    searchParams.get("where") ||
    searchParams.get("q") ||
    "";
  const lat = parseFiniteNumber(searchParams.get("lat"));
  const lng = parseFiniteNumber(searchParams.get("lng"));
  const minLng = parseFiniteNumber(searchParams.get("minLng"));
  const minLat = parseFiniteNumber(searchParams.get("minLat"));
  const maxLng = parseFiniteNumber(searchParams.get("maxLng"));
  const maxLat = parseFiniteNumber(searchParams.get("maxLat"));

  const selectedLocation =
    lat !== null && lng !== null
      ? {
          lat,
          lng,
          bounds: (
            minLng !== null &&
            minLat !== null &&
            maxLng !== null &&
            maxLat !== null
              ? [minLng, minLat, maxLng, maxLat]
              : deriveSearchBoundsFromPoint(lat, lng)
          ) as SearchLocationBoundsTuple,
        }
      : null;

  return {
    locationInput,
    vibeInput,
    locationSummary:
      locationInput || (selectedLocation ? "Selected area" : "Anywhere"),
    vibeSummary: vibeInput || "Any vibe",
    selectedLocation,
  };
}

export function buildSearchIntentParams(
  currentParams: URLSearchParams,
  values: {
    location: string;
    vibe: string;
    selectedLocation: SearchLocationSelection | null;
  }
): URLSearchParams {
  const currentQuery = normalizeSearchQuery(currentParams);
  const trimmedLocation = values.location.trim();
  const trimmedVibe = values.vibe.trim();

  if (values.selectedLocation) {
    const bounds = boundsTupleToObject(
      values.selectedLocation.bounds ??
        deriveSearchBoundsFromPoint(
          values.selectedLocation.lat,
          values.selectedLocation.lng
        )
    );
    // CFM-604: canonical-on-write guarantee — intent URLs serialize via the canonical query builder.
    return serializeSearchQuery(
      applySearchQueryChange(currentQuery, "location", {
        query: undefined,
        locationLabel:
          trimmedLocation.length >= 2 ? trimmedLocation : undefined,
        vibeQuery: trimmedVibe.length >= 2 ? trimmedVibe : undefined,
        lat: values.selectedLocation.lat,
        lng: values.selectedLocation.lng,
        bounds,
      })
    );
  }

  const nextQuery = applySearchQueryChange(currentQuery, "location", {
    query: undefined,
    locationLabel: undefined,
    vibeQuery: trimmedVibe.length >= 2 ? trimmedVibe : undefined,
    lat: undefined,
    lng: undefined,
  });

  if (trimmedVibe.length >= 2) {
    nextQuery.bounds =
      currentQuery.bounds ??
      boundsTupleToObject(deriveSearchBoundsFromPoint(37.7749, -122.4194));
  } else {
    nextQuery.bounds = undefined;
  }
  nextQuery.lat = undefined;
  nextQuery.lng = undefined;

  // CFM-604: canonical-on-write guarantee — intent URLs serialize via the canonical query builder.
  return serializeSearchQuery(nextQuery);
}
