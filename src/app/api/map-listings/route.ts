/**
 * GET /api/map-listings
 *
 * Fetch map listings based on bounds and filters.
 * Used by the persistent map component in layout.tsx to fetch its own data.
 */

import { NextRequest, NextResponse } from "next/server";
import { getMapListings, MapListingData } from "@/lib/data";
import { withRateLimitRedis } from "@/lib/with-rate-limit-redis";
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

export async function GET(request: NextRequest) {
  const context = createContextFromHeaders(request.headers);

  return runWithRequestContext(context, async () => {
    const requestId = getRequestId();

    try {
      // Rate limiting via Redis (fail-closed in production)
      const rateLimitResponse = await withRateLimitRedis(request, {
        type: "map",
      });
      if (rateLimitResponse) return rateLimitResponse;

      const searchParams = request.nextUrl.searchParams;

      // Validate and parse bounds (required - prevents full-table scans)
      const boundsResult = validateAndParseBounds(
        searchParams.get("minLng"),
        searchParams.get("maxLng"),
        searchParams.get("minLat"),
        searchParams.get("maxLat"),
      );

      if (!boundsResult.valid) {
        return NextResponse.json(
          { error: boundsResult.error },
          {
            status: 400,
            headers: { "x-request-id": requestId },
          },
        );
      }

      const bounds = boundsResult.bounds;

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
      const listings: MapListingData[] = await getMapListings(filterParams);

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
      console.error("Map listings API error:", { error, requestId });
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
