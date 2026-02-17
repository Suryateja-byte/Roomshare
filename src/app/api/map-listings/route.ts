/**
 * GET /api/map-listings
 *
 * Fetch map listings based on bounds and filters.
 * Used by the persistent map component in layout.tsx to fetch its own data.
 */

import { NextRequest, NextResponse } from "next/server";
import { getMapListings, MapListingData } from "@/lib/data";
import { withRateLimitRedis } from "@/lib/with-rate-limit-redis";
import { withTimeout, DEFAULT_TIMEOUTS } from "@/lib/timeout-wrapper";
import { validateAndParseBounds } from "@/lib/validation";
import {
  createContextFromHeaders,
  runWithRequestContext,
  getRequestId,
} from "@/lib/request-context";
import {
  buildRawParamsFromSearchParams,
  parseSearchParams,
} from "@/lib/search-params";
import { LAT_OFFSET_DEGREES } from "@/lib/constants";
import { logger } from "@/lib/logger";
import * as Sentry from "@sentry/nextjs";

export async function GET(request: NextRequest) {
  const context = createContextFromHeaders(request.headers);

  return runWithRequestContext(context, async () => {
    const requestId = getRequestId();

    try {
      // Rate limiting via Redis (falls back to DB rate limiting when Redis unavailable)
      const rateLimitResponse = await withRateLimitRedis(request, {
        type: "map",
      });
      if (rateLimitResponse) return rateLimitResponse;

      const searchParams = request.nextUrl.searchParams;

      // Validate and parse explicit bounds first
      const boundsResult = validateAndParseBounds(
        searchParams.get("minLng"),
        searchParams.get("maxLng"),
        searchParams.get("minLat"),
        searchParams.get("maxLat"),
      );

      let bounds = boundsResult.valid ? boundsResult.bounds : null;

      // P2b Fix: Derive bounds from lat/lng when explicit bounds not provided
      // Uses same logic as parseSearchParams (~10km radius)
      if (!bounds) {
        const latStr = searchParams.get("lat");
        const lngStr = searchParams.get("lng");
        const lat = latStr ? parseFloat(latStr) : NaN;
        const lng = lngStr ? parseFloat(lngStr) : NaN;

        if (
          !isNaN(lat) &&
          !isNaN(lng) &&
          lat >= -90 &&
          lat <= 90 &&
          lng >= -180 &&
          lng <= 180
        ) {
          // ~10km radius - use canonical LAT_OFFSET_DEGREES
          const cosLat = Math.cos((lat * Math.PI) / 180);
          const lngOffset = cosLat < 0.01 ? 180 : LAT_OFFSET_DEGREES / cosLat;

          bounds = {
            minLat: Math.max(-90, lat - LAT_OFFSET_DEGREES),
            maxLat: Math.min(90, lat + LAT_OFFSET_DEGREES),
            minLng: Math.max(-180, lng - lngOffset),
            maxLng: Math.min(180, lng + lngOffset),
          };
        }
      }

      // Bounds are required - prevents full-table scans
      if (!bounds) {
        return NextResponse.json(
          { error: boundsResult.error || "Bounds required: provide minLat/maxLat/minLng/maxLng or lat/lng" },
          {
            status: 400,
            headers: { "x-request-id": requestId },
          },
        );
      }

      // Use canonical parsing for all filter params
      // This handles: repeated params, CSV splitting, alias resolution,
      // numeric validation, and allowlist filtering
      const rawParams = buildRawParamsFromSearchParams(searchParams);
      const parsed = parseSearchParams(rawParams);

      // Build filter params from canonical parsed values with validated bounds
      const filterParams = {
        query: parsed.filterParams.query,
        minPrice: parsed.filterParams.minPrice,
        maxPrice: parsed.filterParams.maxPrice,
        bounds,
        amenities: parsed.filterParams.amenities,
        languages: parsed.filterParams.languages,
        houseRules: parsed.filterParams.houseRules,
        moveInDate: parsed.filterParams.moveInDate,
        leaseDuration: parsed.filterParams.leaseDuration,
        roomType: parsed.filterParams.roomType,
        genderPreference: parsed.filterParams.genderPreference,
        householdGender: parsed.filterParams.householdGender,
      };

      // Fetch listings using existing data function
      const listings: MapListingData[] = await withTimeout(
        getMapListings(filterParams),
        DEFAULT_TIMEOUTS.DATABASE,
        "getMapListings"
      );

      return NextResponse.json(
        { listings },
        {
          headers: {
            // Fix #3: Use s-maxage for CDN caching (markers are NOT user-specific)
            // s-maxage: CDN/edge cache duration (60s)
            // max-age: browser cache duration (shorter to allow user refresh)
            "Cache-Control":
              "public, s-maxage=60, max-age=30, stale-while-revalidate=120",
            "x-request-id": requestId,
            // Vary by Accept-Encoding for proper CDN compression handling
            Vary: "Accept-Encoding",
          },
        },
      );
    } catch (error) {
      logger.sync.error("Map listings API error", {
        error: error instanceof Error ? error.message : String(error),
        route: "/api/map-listings",
        requestId,
      });
      Sentry.captureException(error);
      return NextResponse.json(
        { error: "Failed to fetch map listings" },
        {
          status: 500,
          headers: { "x-request-id": requestId },
        },
      );
    }
  });
}
