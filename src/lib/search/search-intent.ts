"use client";

import {
  boundsTupleToObject,
  deriveSearchBoundsFromPoint,
  type SearchLocationBoundsTuple,
} from "@/lib/search/location-bounds";

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
  const locationInput = searchParams.get("where") || searchParams.get("q") || "";
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
  const params = new URLSearchParams(currentParams.toString());
  const trimmedLocation = values.location.trim();
  const trimmedVibe = values.vibe.trim();

  params.delete("page");
  params.delete("cursor");
  params.delete("cursorStack");
  params.delete("pageNumber");

  params.delete("q");
  params.delete("where");
  params.delete("what");

  if (values.selectedLocation && trimmedLocation.length >= 2) {
    params.set("where", trimmedLocation);
  }
  if (trimmedVibe.length >= 2) {
    params.set("what", trimmedVibe);
  }

  if (values.selectedLocation) {
    params.set("lat", values.selectedLocation.lat.toString());
    params.set("lng", values.selectedLocation.lng.toString());
    const bounds = boundsTupleToObject(
      values.selectedLocation.bounds ??
        deriveSearchBoundsFromPoint(
          values.selectedLocation.lat,
          values.selectedLocation.lng
        )
    );
    params.set("minLng", bounds.minLng.toString());
    params.set("minLat", bounds.minLat.toString());
    params.set("maxLng", bounds.maxLng.toString());
    params.set("maxLat", bounds.maxLat.toString());
  } else {
    params.delete("lat");
    params.delete("lng");
    // When a vibe query is present, bounds are required to avoid full-table scans.
    // Preserve existing URL bounds if available; otherwise fall back to defaults.
    const hasVibe = trimmedVibe.length >= 2;
    const hasExistingBounds =
      params.has("minLat") &&
      params.has("maxLat") &&
      params.has("minLng") &&
      params.has("maxLng");
    if (hasVibe && !hasExistingBounds) {
      const fallback = boundsTupleToObject(
        deriveSearchBoundsFromPoint(37.7749, -122.4194)
      );
      params.set("minLat", fallback.minLat.toString());
      params.set("maxLat", fallback.maxLat.toString());
      params.set("minLng", fallback.minLng.toString());
      params.set("maxLng", fallback.maxLng.toString());
    } else if (!hasVibe) {
      // No vibe and no location — clean slate (browse mode)
      params.delete("minLat");
      params.delete("maxLat");
      params.delete("minLng");
      params.delete("maxLng");
    }
    // When hasVibe && hasExistingBounds: bounds already in URL, leave them.
  }

  return params;
}
