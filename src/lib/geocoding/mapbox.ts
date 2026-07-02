import "server-only";

import { fetchWithTimeout, FetchTimeoutError } from "@/lib/fetch-with-timeout";
import type { GeocodingResult } from "@/lib/geocoding-cache";
import { recordGeocodingProviderUsage } from "@/lib/geocoding/provider-cost-controls";

const MAPBOX_FORWARD_URL = "https://api.mapbox.com/search/geocode/v6/forward";
const MAPBOX_TIMEOUT_MS = 6000;
const MAPBOX_ALLOWED_TYPES = new Set([
  "place",
  "locality",
  "neighborhood",
  "district",
  "region",
  "city",
]);
const MAPBOX_PUBLIC_DESTINATION_TYPES = [
  "place",
  "locality",
  "neighborhood",
  "district",
  "region",
].join(",");

export class MapboxGeocodingUnavailableError extends Error {
  constructor(
    message: string,
    public readonly code: "MISSING_KEY" | "TIMEOUT" | "UPSTREAM"
  ) {
    super(message);
    this.name = "MapboxGeocodingUnavailableError";
  }
}

interface MapboxFeature {
  id?: string;
  type?: "Feature";
  place_type?: string[];
  bbox?: [number, number, number, number];
  geometry?: {
    type?: "Point";
    coordinates?: [number, number];
  };
  properties?: {
    mapbox_id?: string;
    name?: string;
    name_preferred?: string;
    full_address?: string;
    place_formatted?: string;
    feature_type?: string;
    coordinates?: {
      longitude?: number;
      latitude?: number;
    };
    bbox?: [number, number, number, number];
    context?: {
      region?: {
        name?: string;
        region_code?: string;
      };
      country?: {
        name?: string;
        country_code?: string;
      };
    };
  };
}

interface MapboxGeocodingResponse {
  type?: "FeatureCollection";
  features?: MapboxFeature[];
}

function getMapboxAccessToken(): string {
  const token = process.env.MAPBOX_ACCESS_TOKEN?.trim();
  if (!token) {
    throw new MapboxGeocodingUnavailableError(
      "Mapbox access token is not configured",
      "MISSING_KEY"
    );
  }
  return token;
}

function normalizeText(value: string | undefined): string {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function normalizeFeatureType(feature: MapboxFeature): string {
  const type = normalizeText(
    feature.properties?.feature_type ?? feature.place_type?.[0]
  ).toLowerCase();
  return type === "city" ? "place" : type;
}

function isAllowedPublicDestination(feature: MapboxFeature): boolean {
  const type = normalizeFeatureType(feature);
  return MAPBOX_ALLOWED_TYPES.has(type);
}

function getFeatureCoordinates(
  feature: MapboxFeature
): [number, number] | null {
  const coordinates = feature.geometry?.coordinates;
  if (
    Array.isArray(coordinates) &&
    Number.isFinite(coordinates[0]) &&
    Number.isFinite(coordinates[1])
  ) {
    return coordinates;
  }

  const lng = feature.properties?.coordinates?.longitude;
  const lat = feature.properties?.coordinates?.latitude;
  if (Number.isFinite(lng) && Number.isFinite(lat)) {
    return [lng as number, lat as number];
  }
  return null;
}

function mapFeatureToResult(feature: MapboxFeature): GeocodingResult | null {
  if (!isAllowedPublicDestination(feature)) {
    return null;
  }

  const center = getFeatureCoordinates(feature);
  if (!center) {
    return null;
  }

  const id = normalizeText(feature.properties?.mapbox_id ?? feature.id);
  const primaryText = normalizeText(
    feature.properties?.name_preferred ?? feature.properties?.name
  );
  const secondaryText = normalizeText(feature.properties?.place_formatted);
  const fullAddress = normalizeText(feature.properties?.full_address);
  const label =
    fullAddress ||
    [primaryText, secondaryText].filter(Boolean).join(", ") ||
    primaryText;
  if (!id || !label || !primaryText) {
    return null;
  }

  const featureType = normalizeFeatureType(feature);

  return {
    id: `mapbox:${id}`,
    provider: "mapbox",
    place_id: id,
    place_name: label,
    place_type: [featureType || "place"],
    center,
    bbox: feature.bbox ?? feature.properties?.bbox,
    requires_resolution: false,
    primary_text: primaryText,
    secondary_text: secondaryText,
  };
}

function dedupeResults(results: GeocodingResult[]): GeocodingResult[] {
  const seen = new Set<string>();
  const deduped: GeocodingResult[] = [];
  for (const result of results) {
    const key = `${result.place_name.toLowerCase()}|${result.center?.join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(result);
  }
  return deduped;
}

export async function searchMapboxDestinations(
  query: string,
  options: { limit: number; sessionToken?: string }
): Promise<GeocodingResult[]> {
  const token = getMapboxAccessToken();
  const url = new URL(MAPBOX_FORWARD_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("access_token", token);
  url.searchParams.set("country", "us");
  url.searchParams.set("language", "en");
  url.searchParams.set("worldview", "us");
  url.searchParams.set("autocomplete", "true");
  url.searchParams.set("types", MAPBOX_PUBLIC_DESTINATION_TYPES);
  url.searchParams.set(
    "limit",
    String(Math.min(Math.max(options.limit, 1), 10))
  );
  if (options.sessionToken) {
    url.searchParams.set("session_token", options.sessionToken);
  }

  try {
    const response = await fetchWithTimeout(url.toString(), {
      timeout: MAPBOX_TIMEOUT_MS,
    });

    if (!response.ok) {
      throw new MapboxGeocodingUnavailableError(
        "Mapbox destination request failed",
        "UPSTREAM"
      );
    }

    await recordGeocodingProviderUsage({
      provider: "mapbox",
      surface: "public_autocomplete",
      operation: "temporary_geocoding_forward",
      estimatedUnitCostUsd: 0.00075,
    });

    const data = (await response.json()) as MapboxGeocodingResponse;
    return dedupeResults(
      (data.features ?? [])
        .map(mapFeatureToResult)
        .filter((result): result is GeocodingResult => result !== null)
    ).slice(0, options.limit);
  } catch (error) {
    if (error instanceof MapboxGeocodingUnavailableError) {
      throw error;
    }
    if (error instanceof FetchTimeoutError) {
      throw new MapboxGeocodingUnavailableError(
        "Mapbox destination request timed out",
        "TIMEOUT"
      );
    }
    throw new MapboxGeocodingUnavailableError(
      "Mapbox destination request failed",
      "UPSTREAM"
    );
  }
}
