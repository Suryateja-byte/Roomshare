/**
 * POST /api/nearby
 *
 * Search for nearby places using Radar API.
 *
 * COMPLIANCE NOTES:
 * - Requires authentication (login required)
 * - No caching (default to safe)
 * - No POI database storage
 * - Only called on explicit user interaction (never prefetch)
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { withRateLimit } from '@/lib/with-rate-limit';
import { haversineMiles } from '@/lib/geo/distance';
import type { NearbyPlace, RadarSearchResponse } from '@/types/nearby';

// Validation schema for request body
const requestSchema = z.object({
  listingLat: z.number().min(-90).max(90),
  listingLng: z.number().min(-180).max(180),
  query: z.string().max(100).optional(),
  categories: z.array(z.string()).optional(),
  radiusMeters: z.union([
    z.literal(1609),  // 1 mi
    z.literal(3218),  // 2 mi
    z.literal(8046),  // 5 mi
  ]),
  limit: z.number().int().min(1).max(50).optional().default(20),
});

export async function POST(request: Request) {
  try {
    // Rate limiting
    const rateLimitResponse = await withRateLimit(request, { type: 'nearbySearch' });
    if (rateLimitResponse) return rateLimitResponse;

    // Authentication check
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if Radar API is configured
    const radarSecretKey = process.env.RADAR_SECRET_KEY;
    if (!radarSecretKey) {
      console.error('RADAR_SECRET_KEY is not configured');
      return NextResponse.json(
        { error: 'Nearby search is not configured' },
        { status: 503 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const parseResult = requestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid request',
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { listingLat, listingLng, query, categories, radiusMeters, limit } = parseResult.data;

    // Build Radar API URL
    const radarUrl = new URL('https://api.radar.io/v1/search/places');
    radarUrl.searchParams.set('near', `${listingLat},${listingLng}`);
    radarUrl.searchParams.set('radius', radiusMeters.toString());
    radarUrl.searchParams.set('limit', limit.toString());

    // Radar requires at least one of: chains, categories, groups, iataCodes
    // If user provides categories, use those; otherwise use default broad categories
    if (categories && categories.length > 0) {
      radarUrl.searchParams.set('categories', categories.join(','));
    } else {
      // Default categories for general nearby search
      // These cover common POI types users might be interested in
      const defaultCategories = [
        'food-beverage',
        'grocery',
        'shopping',
        'health-medicine',
        'fitness-recreation',
        'gas-station',
      ];
      radarUrl.searchParams.set('categories', defaultCategories.join(','));
    }

    if (query) {
      radarUrl.searchParams.set('query', query);
    }

    // Call Radar API
    const radarResponse = await fetch(radarUrl.toString(), {
      method: 'GET',
      headers: {
        Authorization: radarSecretKey,
        'Content-Type': 'application/json',
      },
    });

    if (!radarResponse.ok) {
      const errorText = await radarResponse.text();
      console.error('Radar API error:', radarResponse.status, errorText);

      // Parse error for user-friendly message
      let userMessage = 'Failed to fetch nearby places';
      let details: string | undefined = undefined;

      if (radarResponse.status === 401) {
        userMessage = 'Radar API authentication failed';
        details = 'Invalid or expired API key';
      } else if (radarResponse.status === 403) {
        userMessage = 'Radar API access denied';
        details = 'API key lacks permission for Places Search';
      } else if (radarResponse.status === 429) {
        userMessage = 'Radar API rate limit exceeded';
        details = 'Too many requests, please try again later';
      } else if (radarResponse.status === 400) {
        userMessage = 'Invalid search parameters';
        try {
          const errorData = JSON.parse(errorText);
          details = errorData.meta?.message || errorData.message || errorData.error;
        } catch {
          details = errorText;
        }
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

    // Normalize response and compute distances
    const places: NearbyPlace[] = radarData.places.map((place) => {
      // Radar returns [lng, lat] in coordinates
      const placeLat = place.location.coordinates[1];
      const placeLng = place.location.coordinates[0];

      return {
        id: place._id,
        name: place.name,
        address: place.formattedAddress || '',
        category: place.categories[0] || 'unknown',
        chain: place.chain?.name,
        location: {
          lat: placeLat,
          lng: placeLng,
        },
        distanceMiles: haversineMiles(listingLat, listingLng, placeLat, placeLng),
      };
    });

    return NextResponse.json({
      places,
      meta: {
        cached: false, // Never cache per compliance
        count: places.length,
      },
    });
  } catch (error) {
    console.error('Nearby search error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
