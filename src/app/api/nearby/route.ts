/**
 * POST /api/nearby
 *
 * Search for nearby places using Radar API.
 *
 * COMPLIANCE NOTES:
 * - Available to guests and signed-in users
 * - No caching (default to safe)
 * - No POI database storage
 * - Only called on explicit user interaction (never prefetch)
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { captureApiError } from "@/lib/api-error-handler";
import { logger } from "@/lib/logger";
import { withRateLimit } from "@/lib/with-rate-limit";
import { haversineMiles } from "@/lib/geo/distance";
import {
  fetchWithTimeout,
  DEFAULT_TIMEOUTS,
  isTimeoutError,
} from "@/lib/timeout-wrapper";
import { circuitBreakers, isCircuitOpenError } from "@/lib/circuit-breaker";
import type {
  NearbyPlace,
  RadarSearchResponse,
  RadarAutocompleteResponse,
} from "@/types/nearby";
import {
  DEFAULT_NEARBY_CATEGORIES,
  MAX_NEARBY_CATEGORY_COUNT,
  MAX_NEARBY_CATEGORY_LENGTH,
  KEYWORD_CATEGORY_MAP,
  isAllowedRadarCategory,
  shouldIncludePlace,
} from "@/lib/nearby-categories";

const MAX_REQUEST_BODY_BYTES = 10 * 1024;

type JsonBodyResult =
  | { ok: true; body: unknown }
  | { ok: false; response: Response };

function invalidBodyResponse(details: string, status = 400): Response {
  return NextResponse.json(
    {
      error: "Invalid request body",
      details,
    },
    { status }
  );
}

async function readJsonBody(request: Request): Promise<JsonBodyResult> {
  const canReadText = typeof request.text === "function";

  if (canReadText) {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return {
        ok: false,
        response: invalidBodyResponse(
          "Content-Type must be application/json"
        ),
      };
    }

    const contentLength = request.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_REQUEST_BODY_BYTES) {
      return {
        ok: false,
        response: invalidBodyResponse("Request body is too large"),
      };
    }

    const rawBody = await request.text();
    const rawBodyBytes = new TextEncoder().encode(rawBody).byteLength;
    if (rawBodyBytes > MAX_REQUEST_BODY_BYTES) {
      return {
        ok: false,
        response: invalidBodyResponse("Request body is too large"),
      };
    }

    try {
      return { ok: true, body: JSON.parse(rawBody) };
    } catch {
      return {
        ok: false,
        response: invalidBodyResponse("Request body must be valid JSON"),
      };
    }
  }

  try {
    return { ok: true, body: await request.json() };
  } catch {
    return {
      ok: false,
      response: invalidBodyResponse("Request body must be valid JSON"),
    };
  }
}

const categorySchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_NEARBY_CATEGORY_LENGTH)
  .transform((category) => category.toLowerCase())
  .refine(isAllowedRadarCategory, {
    message: "Unsupported nearby category",
  });

function isFiniteLatitude(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= -90 &&
    value <= 90
  );
}

function isFiniteLongitude(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= -180 &&
    value <= 180
  );
}

function sanitizeNearbyPlace(
  place: NearbyPlace,
  source: "autocomplete" | "places"
): NearbyPlace | null {
  const lat = place.location?.lat;
  const lng = place.location?.lng;
  const distanceMiles = place.distanceMiles;

  if (
    !isFiniteLatitude(lat) ||
    !isFiniteLongitude(lng) ||
    typeof distanceMiles !== "number" ||
    !Number.isFinite(distanceMiles) ||
    distanceMiles < 0
  ) {
    logger.sync.warn("Skipping nearby place with invalid numeric data", {
      source,
      placeId: place.id,
    });
    return null;
  }

  return {
    ...place,
    location: {
      lat,
      lng,
    },
    distanceMiles,
  };
}

function normalizeAutocompleteIdPart(value: string | undefined): string {
  const normalized = (value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return normalized || "unknown";
}

// Validation schema for request body
const requestSchema = z.object({
  listingLat: z.number().min(-90).max(90),
  listingLng: z.number().min(-180).max(180),
  query: z.string().max(100).optional(),
  categories: z
    .array(categorySchema)
    .max(MAX_NEARBY_CATEGORY_COUNT)
    .optional()
    .transform((categories) =>
      categories ? Array.from(new Set(categories)) : undefined
    ),
  radiusMeters: z.union([
    z.literal(1609), // 1 mi
    z.literal(3218), // 2 mi
    z.literal(8046), // 5 mi
  ]),
  limit: z.number().int().min(1).max(50).optional().default(20),
});

export async function POST(request: Request) {
  try {
    // Rate limiting
    const rateLimitResponse = await withRateLimit(request, {
      type: "nearbySearch",
    });
    if (rateLimitResponse) return rateLimitResponse;

    // Check if Radar API is configured
    const radarSecretKey = process.env.RADAR_SECRET_KEY?.trim();
    if (!radarSecretKey) {
      logger.sync.error("RADAR_SECRET_KEY is not configured");
      return NextResponse.json(
        { error: "Nearby search is not configured" },
        { status: 503 }
      );
    }

    // Parse and validate request body
    const bodyResult = await readJsonBody(request);
    if (!bodyResult.ok) {
      return bodyResult.response;
    }
    const parseResult = requestSchema.safeParse(bodyResult.body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "Invalid request",
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { listingLat, listingLng, query, categories, radiusMeters, limit } =
      parseResult.data;

    // Detect search mode: text query vs category chips vs keyword search
    const queryTrimmed = query?.trim() || "";
    const queryLower = queryTrimmed.toLowerCase();
    const isTextSearch =
      queryLower.length >= 2 && (!categories || categories.length === 0);

    // Check if query matches a known category keyword (e.g., "gym", "coffee", "restaurant")
    // These should use Places Search API with categories, not Autocomplete
    const mappedCategories = KEYWORD_CATEGORY_MAP[queryLower];
    const isKeywordSearch = isTextSearch && mappedCategories;

    // Use Autocomplete only for specific place names (e.g., "Chipotle", "Planet Fitness")
    // NOT for category keywords like "gym" which should use Places Search
    if (isTextSearch && !isKeywordSearch) {
      // Use Radar Autocomplete for text-based place search
      // This provides fuzzy matching for place names (e.g., "Chipotle" → actual Chipotle locations)
      const radarUrl = new URL("https://api.radar.io/v1/search/autocomplete");
      // query is guaranteed to exist here since isTextSearch requires queryLower.length >= 2
      radarUrl.searchParams.set("query", query!.trim());
      radarUrl.searchParams.set("near", `${listingLat},${listingLng}`);
      radarUrl.searchParams.set("layers", "place"); // Only return places, not addresses
      radarUrl.searchParams.set("countryCode", "US"); // Restrict to US results (Radar Autocomplete doesn't support radius)
      // Request more results for local filtering since Autocomplete doesn't support radius parameter
      radarUrl.searchParams.set("limit", Math.min(limit * 3, 100).toString());

      // P1-09/P1-10 FIX: Use circuit breaker + timeout for Radar API resilience
      let radarResponse: Response;
      try {
        radarResponse = await circuitBreakers.radar.execute(() =>
          fetchWithTimeout(
            radarUrl.toString(),
            {
              method: "GET",
              headers: {
                Authorization: radarSecretKey,
                "Content-Type": "application/json",
              },
            },
            DEFAULT_TIMEOUTS.EXTERNAL_API,
            "Radar Autocomplete API"
          )
        );
      } catch (error) {
        // Handle circuit breaker or timeout errors
        if (isCircuitOpenError(error)) {
          logger.sync.error(
            "Radar API circuit breaker open - service unavailable"
          );
          return NextResponse.json(
            {
              error: "Nearby search temporarily unavailable",
              details: "Service is recovering, please try again later",
            },
            { status: 503 }
          );
        }
        if (isTimeoutError(error)) {
          logger.sync.error("Radar API timeout", { route: "/api/nearby" });
          return NextResponse.json(
            {
              error: "Nearby search timed out",
              details: "The request took too long, please try again",
            },
            { status: 504 }
          );
        }
        throw error; // Re-throw unexpected errors
      }

      if (!radarResponse.ok) {
        const errorText = await radarResponse.text();
        logger.sync.error("Radar Autocomplete API error", {
          status: radarResponse.status,
          errorLength: errorText.length,
        });

        let userMessage = "Failed to search for places";
        let details: string | undefined = undefined;

        if (radarResponse.status === 401) {
          userMessage = "Radar API authentication failed";
          details = "Invalid or expired API key";
        } else if (radarResponse.status === 403) {
          userMessage = "Radar API access denied";
          details = "API key lacks permission for Autocomplete";
        } else if (radarResponse.status === 429) {
          userMessage = "Radar API rate limit exceeded";
          details = "Too many requests, please try again later";
        } else if (radarResponse.status === 400) {
          userMessage = "Invalid search parameters";
          logger.sync.error("Radar 400 details", {
            errorLength: errorText.length,
            route: "/api/nearby",
          });
          details = "The search parameters were rejected by the service";
        }

        return NextResponse.json(
          {
            error: userMessage,
            details,
            radarStatus: radarResponse.status,
          },
          { status: radarResponse.status >= 500 ? 500 : radarResponse.status }
        );
      }

      const radarData: RadarAutocompleteResponse = await radarResponse.json();

      // Convert radius from meters to miles for filtering
      const radiusMiles = radiusMeters / 1609;

      // Normalize autocomplete results to NearbyPlace format
      // Apply server-side distance filtering since Radar Autocomplete doesn't support radius parameter
      const places: NearbyPlace[] = (radarData.addresses || [])
        .filter(
          (addr) =>
            addr.layer === "place" &&
            isFiniteLatitude(addr.latitude) &&
            isFiniteLongitude(addr.longitude)
        )
        .map(
          (addr, index): NearbyPlace => ({
            id: `ac-${index}-${normalizeAutocompleteIdPart(
              addr.placeLabel || addr.addressLabel
            )}-${normalizeAutocompleteIdPart(
              addr.formattedAddress
            )}-${addr.latitude.toFixed(6)}-${addr.longitude.toFixed(6)}`,
            name:
              addr.placeLabel ||
              addr.addressLabel ||
              addr.formattedAddress ||
              "Unknown",
            address: addr.formattedAddress || "",
            category: "place", // Autocomplete doesn't provide categories
            location: {
              lat: addr.latitude,
              lng: addr.longitude,
            },
            distanceMiles: haversineMiles(
              listingLat,
              listingLng,
              addr.latitude,
              addr.longitude
            ),
          })
        )
        .map((place) => sanitizeNearbyPlace(place, "autocomplete"))
        .filter((place): place is NearbyPlace => place !== null)
        .filter((place) => place.distanceMiles <= radiusMiles) // Enforce radius filter
        .sort((a, b) => a.distanceMiles - b.distanceMiles)
        .slice(0, limit); // Limit to requested count after filtering

      return NextResponse.json(
        {
          places,
          meta: {
            cached: false,
            count: places.length,
          },
        },
        {
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
            Pragma: "no-cache",
          },
        }
      );
    }

    // Category-based search OR keyword search: Use Radar Places Search API
    // Build Radar API URL
    const radarUrl = new URL("https://api.radar.io/v1/search/places");
    radarUrl.searchParams.set("near", `${listingLat},${listingLng}`);
    radarUrl.searchParams.set("radius", radiusMeters.toString());
    radarUrl.searchParams.set("limit", limit.toString());

    // Radar requires at least one of: chains, categories, groups, iataCodes
    // Priority: keyword-mapped categories > user-provided categories > default categories
    if (isKeywordSearch && mappedCategories) {
      // Keyword search: Use verified Radar categories (e.g., "gym" -> ["gym"])
      radarUrl.searchParams.set("categories", mappedCategories.join(","));
    } else if (categories && categories.length > 0) {
      // Category chip: Use user-provided categories
      radarUrl.searchParams.set("categories", categories.join(","));
    } else {
      // Default categories for general nearby search
      // These cover common POI types users might be interested in
      radarUrl.searchParams.set(
        "categories",
        DEFAULT_NEARBY_CATEGORIES.join(",")
      );
    }

    if (queryTrimmed) {
      radarUrl.searchParams.set("query", queryTrimmed);
    }

    // P1-09/P1-10 FIX: Use circuit breaker + timeout for Radar API resilience
    let radarResponse: Response;
    try {
      radarResponse = await circuitBreakers.radar.execute(() =>
        fetchWithTimeout(
          radarUrl.toString(),
          {
            method: "GET",
            headers: {
              Authorization: radarSecretKey,
              "Content-Type": "application/json",
            },
          },
          DEFAULT_TIMEOUTS.EXTERNAL_API,
          "Radar Places Search API"
        )
      );
    } catch (error) {
      // Handle circuit breaker or timeout errors
      if (isCircuitOpenError(error)) {
        logger.sync.error(
          "Radar API circuit breaker open - service unavailable",
          { route: "/api/nearby" }
        );
        return NextResponse.json(
          {
            error: "Nearby search temporarily unavailable",
            details: "Service is recovering, please try again later",
          },
          { status: 503 }
        );
      }
      if (isTimeoutError(error)) {
        logger.sync.error("Radar API timeout", { route: "/api/nearby" });
        return NextResponse.json(
          {
            error: "Nearby search timed out",
            details: "The request took too long, please try again",
          },
          { status: 504 }
        );
      }
      throw error; // Re-throw unexpected errors
    }

    if (!radarResponse.ok) {
      const errorText = await radarResponse.text();
      logger.sync.error("Radar API error", {
        status: radarResponse.status,
        errorLength: errorText.length,
      });

      // Parse error for user-friendly message
      let userMessage = "Failed to fetch nearby places";
      let details: string | undefined = undefined;

      if (radarResponse.status === 401) {
        userMessage = "Radar API authentication failed";
        details = "Invalid or expired API key";
      } else if (radarResponse.status === 403) {
        userMessage = "Radar API access denied";
        details = "API key lacks permission for Places Search";
      } else if (radarResponse.status === 429) {
        userMessage = "Radar API rate limit exceeded";
        details = "Too many requests, please try again later";
      } else if (radarResponse.status === 400) {
        userMessage = "Invalid search parameters";
        logger.sync.error("Radar 400 details", {
          errorLength: errorText.length,
          route: "/api/nearby",
        });
        details = "The search parameters were rejected by the service";
      }

      return NextResponse.json(
        {
          error: userMessage,
          details,
          radarStatus: radarResponse.status,
        },
        { status: radarResponse.status >= 500 ? 500 : radarResponse.status }
      );
    }

    const radarData: RadarSearchResponse = await radarResponse.json();

    // Determine which categories were used for the search (for filtering)
    const effectiveCategories =
      isKeywordSearch && mappedCategories
        ? mappedCategories
        : categories && categories.length > 0
          ? categories
          : [];

    // Normalize response and compute distances
    const places: NearbyPlace[] = (radarData.places || [])
      .map((place): NearbyPlace | null => {
        // Null safety: skip null/undefined entries and places with missing coordinates
        if (!place || !place.location?.coordinates?.length) {
          if (place) {
            logger.sync.warn("Place missing coordinates", {
              placeId: place._id,
            });
          }
          return null;
        }

        // Radar returns [lng, lat] in coordinates
        const placeLat = place.location.coordinates[1];
        const placeLng = place.location.coordinates[0];

        if (!isFiniteLatitude(placeLat) || !isFiniteLongitude(placeLng)) {
          logger.sync.warn("Place has invalid coordinates", {
            placeId: place._id,
          });
          return null;
        }

        const nearbyPlace: NearbyPlace = {
          id:
            place._id || `place-${placeLat.toFixed(6)}-${placeLng.toFixed(6)}`,
          name: place.name || "Unknown Place",
          address: place.formattedAddress || "",
          category: place.categories?.[0] || "unknown",
          location: {
            lat: placeLat,
            lng: placeLng,
          },
          distanceMiles: haversineMiles(
            listingLat,
            listingLng,
            placeLat,
            placeLng
          ),
        };

        // Only add chain if it exists
        if (place.chain?.name) {
          nearbyPlace.chain = place.chain.name;
        }

        return sanitizeNearbyPlace(nearbyPlace, "places");
      })
      .filter((place): place is NearbyPlace => place !== null)
      // Apply category-specific filtering to exclude irrelevant results
      .filter((place) => shouldIncludePlace(place, effectiveCategories))
      .sort((a, b) => a.distanceMiles - b.distanceMiles);

    return NextResponse.json(
      {
        places,
        meta: {
          cached: false, // Never cache per compliance
          count: places.length,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
        },
      }
    );
  } catch (error) {
    return captureApiError(error, { route: "/api/nearby", method: "POST" });
  }
}
