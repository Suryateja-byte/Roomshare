import { NextResponse } from "next/server";
import {
  clampAutocompleteLimit,
  isAutocompleteQueryValid,
  LOCATION_AUTOCOMPLETE_DEFAULT_LIMIT,
  sanitizeAutocompleteQuery,
  type LocationAutocompleteErrorCode,
  type LocationAutocompleteErrorResponse,
  type LocationAutocompleteSuccessResponse,
} from "@/lib/geocoding/autocomplete";
import {
  getCachedResults,
  setCachedResults,
  type GeocodingResult,
} from "@/lib/geocoding-cache";
import { FetchTimeoutError } from "@/lib/fetch-with-timeout";
import { searchPhoton } from "@/lib/geocoding/photon";
import {
  isLikelyStreetAddressQuery,
  searchPublicAutocomplete,
} from "@/lib/geocoding/public-autocomplete";
import { searchLocalDestinationIndex } from "@/lib/geocoding/local-destination-index";
import {
  MapboxGeocodingUnavailableError,
  searchMapboxDestinations,
} from "@/lib/geocoding/mapbox";
import {
  GooglePlacesUnavailableError,
  suggestDestinations,
} from "@/lib/geocoding/google-places";
import {
  isProviderMonthlyCapReached,
  recordGeocodingProviderSkipped,
} from "@/lib/geocoding/provider-cost-controls";
import { buildPublicCacheHeaders } from "@/lib/public-cache/headers";
import { getPublicCacheStatePayload } from "@/lib/public-cache/state";
import { withRateLimit } from "@/lib/with-rate-limit";
import { features } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  recordPublicAutocompleteFallbackUsed,
  recordPublicAutocompleteRequest,
} from "@/lib/geocoding/public-autocomplete-telemetry";

function jsonError(code: LocationAutocompleteErrorCode, status: number) {
  const response = NextResponse.json<LocationAutocompleteErrorResponse>(
    { code },
    { status }
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function jsonSuccess(data: LocationAutocompleteSuccessResponse) {
  const response = NextResponse.json<LocationAutocompleteSuccessResponse>(data);
  response.headers.set("Cache-Control", "no-store");
  for (const [key, value] of Object.entries(buildPublicCacheHeaders())) {
    response.headers.set(key, value);
  }
  return response;
}

function keepPublicDestinationResults(
  results: GeocodingResult[]
): GeocodingResult[] {
  return results.filter(
    (result) => !result.place_type.some((type) => type === "address")
  );
}

function getPublicLocationProviders(): Set<string> {
  const configured = process.env.PUBLIC_LOCATION_PROVIDER ?? "local,mapbox";
  const providers = configured
    .split(",")
    .map((provider) => provider.trim().toLowerCase())
    .filter(Boolean);
  return new Set(providers.length > 0 ? providers : ["local", "mapbox"]);
}

function parseMonthlyCap(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : undefined;
}

function mergePublicResults(
  existing: GeocodingResult[],
  additions: GeocodingResult[],
  limit: number
): GeocodingResult[] {
  const merged: GeocodingResult[] = [];
  const seen = new Set<string>();
  for (const result of [
    ...existing,
    ...keepPublicDestinationResults(additions),
  ]) {
    const key = `${result.provider ?? "unknown"}:${result.place_id ?? result.id}:${
      result.place_name
    }`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(result);
    if (merged.length >= limit) {
      break;
    }
  }
  return merged;
}

async function getPublicAutocompleteCacheVersion(): Promise<string> {
  try {
    const { cacheFloorToken } = await getPublicCacheStatePayload();
    return `public:${cacheFloorToken}`;
  } catch (error) {
    logger.sync.warn("Public autocomplete cache floor unavailable", {
      error: error instanceof Error ? error.message : String(error),
    });
    return "public:none";
  }
}

export async function GET(request: Request) {
  const rateLimitResponse = await withRateLimit(request, {
    type: "publicAutocomplete",
    endpoint: "/api/geocoding/autocomplete",
  });
  if (rateLimitResponse) {
    rateLimitResponse.headers.set("Cache-Control", "no-store");
    return rateLimitResponse;
  }

  const url = new URL(request.url);
  const rawQuery = url.searchParams.get("q") ?? "";
  const query = sanitizeAutocompleteQuery(rawQuery);
  const requestedLimit = Number(
    url.searchParams.get("limit") ?? LOCATION_AUTOCOMPLETE_DEFAULT_LIMIT
  );
  const limit = clampAutocompleteLimit(requestedLimit);
  const sessionToken = sanitizeAutocompleteQuery(
    url.searchParams.get("sessionToken") ?? ""
  ).slice(0, 128);

  if (!isAutocompleteQueryValid(query)) {
    return jsonError("INVALID_QUERY", 422);
  }

  recordPublicAutocompleteRequest(
    features.publicAutocompleteContract ? "public_contract" : "legacy"
  );

  const providers = getPublicLocationProviders();
  let results: GeocodingResult[] = [];
  let upstreamFailureCode: LocationAutocompleteErrorCode | null = null;
  const isAddressLikeQuery = isLikelyStreetAddressQuery(query);

  if (providers.has("local")) {
    results = mergePublicResults(
      results,
      searchLocalDestinationIndex(query, { limit }),
      limit
    );
    if (results.length >= limit) {
      return jsonSuccess({ results });
    }
  }

  const cacheOptions = features.publicAutocompleteContract
    ? {
        cacheVersion: await getPublicAutocompleteCacheVersion(),
        ttlSeconds: 15 * 60,
      }
    : undefined;

  if (features.publicAutocompleteContract) {
    const cachedResults = await getCachedResults(query, cacheOptions);
    if (cachedResults) {
      results = mergePublicResults(results, cachedResults, limit);
      if (results.length >= limit) {
        return jsonSuccess({ results });
      }
    }
  }

  if (features.publicAutocompleteContract) {
    try {
      const publicResults = keepPublicDestinationResults(
        await searchPublicAutocomplete(query, { limit })
      );
      await setCachedResults(query, publicResults, cacheOptions);
      results = mergePublicResults(results, publicResults, limit);
      if (results.length >= limit) {
        return jsonSuccess({ results });
      }
    } catch {
      recordPublicAutocompleteFallbackUsed("public_inventory_unavailable");
    }
  }

  if (isAddressLikeQuery) {
    recordPublicAutocompleteFallbackUsed("address_like_query_blocked");
  }

  // Mapbox/Google results are intentionally NOT cached server-side: Mapbox
  // Temporary Geocoding and Google Places terms prohibit storing response data
  // (only Google place IDs are cacheable). Spend on these providers is bounded
  // by the Redis-backed monthly caps checked below, behind the first-party
  // local index + public-inventory cache above.
  if (!isAddressLikeQuery && providers.has("mapbox")) {
    if (!features.mapboxGeocoding) {
      recordGeocodingProviderSkipped({
        provider: "mapbox",
        surface: "public_autocomplete",
        reason: "missing_key",
      });
    } else if (
      await isProviderMonthlyCapReached({
        provider: "mapbox",
        surface: "public_autocomplete",
        monthlyCap: parseMonthlyCap(
          process.env.MAPBOX_PUBLIC_AUTOCOMPLETE_MONTHLY_CAP
        ),
      })
    ) {
      recordGeocodingProviderSkipped({
        provider: "mapbox",
        surface: "public_autocomplete",
        reason: "budget_cap",
      });
    } else {
      try {
        const mapboxResults = await searchMapboxDestinations(query, {
          limit: limit - results.length,
        });
        results = mergePublicResults(results, mapboxResults, limit);
        if (results.length > 0) {
          return jsonSuccess({ results });
        }
        recordPublicAutocompleteFallbackUsed("mapbox_empty");
      } catch (error) {
        upstreamFailureCode =
          error instanceof MapboxGeocodingUnavailableError &&
          error.code === "TIMEOUT"
            ? "TIMEOUT"
            : "UNAVAILABLE";
        recordPublicAutocompleteFallbackUsed(
          error instanceof MapboxGeocodingUnavailableError
            ? `mapbox_${error.code.toLowerCase()}`
            : "mapbox_unavailable"
        );
      }
    }
  }

  if (!isAddressLikeQuery && providers.has("google")) {
    if (!features.googlePlacesPublic) {
      recordGeocodingProviderSkipped({
        provider: "google",
        surface: "public_autocomplete",
        reason: "disabled",
      });
    } else if (
      await isProviderMonthlyCapReached({
        provider: "google",
        surface: "public_autocomplete",
        monthlyCap: parseMonthlyCap(
          process.env.GOOGLE_PUBLIC_AUTOCOMPLETE_MONTHLY_CAP
        ),
      })
    ) {
      recordGeocodingProviderSkipped({
        provider: "google",
        surface: "public_autocomplete",
        reason: "budget_cap",
      });
    } else {
      try {
        const googleResults = await suggestDestinations(query, {
          limit: limit - results.length,
          sessionToken,
        });
        results = mergePublicResults(results, googleResults, limit);
        if (results.length > 0) {
          return jsonSuccess({ results });
        }
        recordPublicAutocompleteFallbackUsed("google_places_empty");
      } catch (error) {
        upstreamFailureCode =
          error instanceof GooglePlacesUnavailableError &&
          error.code === "TIMEOUT"
            ? "TIMEOUT"
            : "UNAVAILABLE";
        recordPublicAutocompleteFallbackUsed(
          error instanceof GooglePlacesUnavailableError
            ? `google_places_${error.code.toLowerCase()}`
            : "google_places_unavailable"
        );
      }
    }
  }

  if (!isAddressLikeQuery && providers.has("photon")) {
    try {
      const photonResults = await searchPhoton(query, {
        limit: limit - results.length,
      });
      results = mergePublicResults(results, photonResults, limit);
    } catch (error) {
      if (error instanceof FetchTimeoutError) {
        upstreamFailureCode = "TIMEOUT";
      } else {
        upstreamFailureCode = "UNAVAILABLE";
      }
      recordPublicAutocompleteFallbackUsed("photon_unavailable");
    }
  }

  if (results.length > 0) {
    return jsonSuccess({ results });
  }

  if (upstreamFailureCode) {
    return jsonError(
      upstreamFailureCode,
      upstreamFailureCode === "TIMEOUT" ? 504 : 503
    );
  }

  return jsonSuccess({ results: [] });
}
