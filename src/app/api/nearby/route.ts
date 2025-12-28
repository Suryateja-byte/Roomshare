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
import type { NearbyPlace, RadarSearchResponse, RadarAutocompleteResponse } from '@/types/nearby';

// Common search terms mapped to Radar categories
// When users search for category keywords like "gym", route to Places Search API
// instead of Autocomplete (which only finds places literally named "gym")
const KEYWORD_CATEGORY_MAP: Record<string, string[]> = {
  // Fitness
  'gym': ['gym', 'fitness-recreation'],
  'fitness': ['gym', 'fitness-recreation'],
  'workout': ['gym', 'fitness-recreation'],

  // Food & Dining
  'restaurant': ['restaurant', 'food-beverage'],
  'food': ['food-beverage', 'restaurant'],
  'pizza': ['pizza', 'restaurant'],
  'burger': ['burger-joint', 'restaurant'],
  'sushi': ['sushi-restaurant', 'restaurant'],
  'chinese': ['chinese-restaurant', 'restaurant'],
  'mexican': ['mexican-restaurant', 'restaurant'],
  'italian': ['italian-restaurant', 'restaurant'],
  'thai': ['thai-restaurant', 'restaurant'],
  'indian': ['indian-restaurant', 'restaurant'],

  // Coffee & Drinks
  'coffee': ['coffee-shop', 'cafe'],
  'cafe': ['cafe', 'coffee-shop'],
  'tea': ['tea-room', 'cafe'],
  'bar': ['bar', 'nightlife'],

  // Shopping
  'grocery': ['food-grocery', 'supermarket'],
  'supermarket': ['supermarket', 'food-grocery'],
  'shopping': ['shopping-retail'],

  // Health
  'pharmacy': ['pharmacy'],
  'drugstore': ['pharmacy'],
  'doctor': ['doctor', 'health-medicine'],
  'hospital': ['hospital', 'health-medicine'],
  'dentist': ['dentist', 'health-medicine'],

  // Services
  'bank': ['bank', 'financial-service'],
  'atm': ['atm', 'financial-service'],
  'gas': ['gas-station'],
  'gas station': ['gas-station'],
  'parking': ['parking'],
  'hotel': ['hotel', 'lodging'],
};

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
    if (!session?.user?.id || session.user.id.trim() === '') {
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
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body', details: 'Request body must be valid JSON' },
        { status: 400 }
      );
    }
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

    // Detect search mode: text query vs category chips vs keyword search
    const queryLower = query?.trim().toLowerCase() || '';
    const isTextSearch = queryLower.length >= 2 && (!categories || categories.length === 0);

    // Check if query matches a known category keyword (e.g., "gym", "coffee", "restaurant")
    // These should use Places Search API with categories, not Autocomplete
    const mappedCategories = KEYWORD_CATEGORY_MAP[queryLower];
    const isKeywordSearch = isTextSearch && mappedCategories;

    // Use Autocomplete only for specific place names (e.g., "Chipotle", "Planet Fitness")
    // NOT for category keywords like "gym" which should use Places Search
    if (isTextSearch && !isKeywordSearch) {
      // Use Radar Autocomplete for text-based place search
      // This provides fuzzy matching for place names (e.g., "Chipotle" → actual Chipotle locations)
      const radarUrl = new URL('https://api.radar.io/v1/search/autocomplete');
      radarUrl.searchParams.set('query', query.trim());
      radarUrl.searchParams.set('near', `${listingLat},${listingLng}`);
      radarUrl.searchParams.set('layers', 'place'); // Only return places, not addresses
      radarUrl.searchParams.set('countryCode', 'US'); // Restrict to US results (Radar Autocomplete doesn't support radius)
      // Request more results for local filtering since Autocomplete doesn't support radius parameter
      radarUrl.searchParams.set('limit', Math.min(limit * 3, 100).toString());

      const radarResponse = await fetch(radarUrl.toString(), {
        method: 'GET',
        headers: {
          Authorization: radarSecretKey,
          'Content-Type': 'application/json',
        },
      });

      if (!radarResponse.ok) {
        const errorText = await radarResponse.text();
        console.error('Radar Autocomplete API error:', radarResponse.status, errorText);

        let userMessage = 'Failed to search for places';
        let details: string | undefined = undefined;

        if (radarResponse.status === 401) {
          userMessage = 'Radar API authentication failed';
          details = 'Invalid or expired API key';
        } else if (radarResponse.status === 403) {
          userMessage = 'Radar API access denied';
          details = 'API key lacks permission for Autocomplete';
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

      const radarData: RadarAutocompleteResponse = await radarResponse.json();

      // Convert radius from meters to miles for filtering
      const radiusMiles = radiusMeters / 1609;

      // Normalize autocomplete results to NearbyPlace format
      // Apply server-side distance filtering since Radar Autocomplete doesn't support radius parameter
      const places: NearbyPlace[] = (radarData.addresses || [])
        .filter((addr) => addr.latitude && addr.longitude && addr.layer === 'place')
        .map((addr): NearbyPlace => ({
          id: `ac-${addr.latitude.toFixed(6)}-${addr.longitude.toFixed(6)}`,
          name: addr.placeLabel || addr.addressLabel || addr.formattedAddress || 'Unknown',
          address: addr.formattedAddress || '',
          category: 'place', // Autocomplete doesn't provide categories
          location: {
            lat: addr.latitude,
            lng: addr.longitude,
          },
          distanceMiles: haversineMiles(listingLat, listingLng, addr.latitude, addr.longitude),
        }))
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
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            Pragma: 'no-cache',
          },
        }
      );
    }

    // Category-based search OR keyword search: Use Radar Places Search API
    // Build Radar API URL
    const radarUrl = new URL('https://api.radar.io/v1/search/places');
    radarUrl.searchParams.set('near', `${listingLat},${listingLng}`);
    radarUrl.searchParams.set('radius', radiusMeters.toString());
    radarUrl.searchParams.set('limit', limit.toString());

    // Radar requires at least one of: chains, categories, groups, iataCodes
    // Priority: keyword-mapped categories > user-provided categories > default categories
    if (isKeywordSearch && mappedCategories) {
      // Keyword search: Use mapped categories (e.g., "gym" → ['gym', 'fitness-recreation'])
      radarUrl.searchParams.set('categories', mappedCategories.join(','));
    } else if (categories && categories.length > 0) {
      // Category chip: Use user-provided categories
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
    const places: NearbyPlace[] = (radarData.places || [])
      .map((place): NearbyPlace | null => {
        // Null safety: skip null/undefined entries and places with missing coordinates
        if (!place || !place.location?.coordinates?.length) {
          if (place) {
            console.warn('Place missing coordinates:', place._id);
          }
          return null;
        }

        // Radar returns [lng, lat] in coordinates
        const placeLat = place.location.coordinates[1];
        const placeLng = place.location.coordinates[0];

        const nearbyPlace: NearbyPlace = {
          id: place._id || `place-${placeLat.toFixed(6)}-${placeLng.toFixed(6)}`,
          name: place.name || 'Unknown Place',
          address: place.formattedAddress || '',
          category: place.categories?.[0] || 'unknown',
          location: {
            lat: placeLat,
            lng: placeLng,
          },
          distanceMiles: haversineMiles(listingLat, listingLng, placeLat, placeLng),
        };

        // Only add chain if it exists
        if (place.chain?.name) {
          nearbyPlace.chain = place.chain.name;
        }

        return nearbyPlace;
      })
      .filter((place): place is NearbyPlace => place !== null)
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
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          Pragma: 'no-cache',
        },
      }
    );
  } catch (error) {
    console.error('Nearby search error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
