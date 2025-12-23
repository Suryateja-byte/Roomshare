/**
 * Geocoding and POI search provider abstractions.
 * Supports Mapbox, HERE, and US Census Geocoder.
 */

import { haversineMeters } from './haversine';

// ============================================================================
// Types
// ============================================================================

export interface GeocodingResult {
  provider: string;
  lat: number;
  lon: number;
  formatted: string | null;
  matchQuality?: string | null;
  raw?: unknown;
}

export interface POIResult {
  name: string;
  address: string | null;
  lat: number;
  lon: number;
  distance_m: number;
  categories?: string[];
  raw?: unknown;
}

export interface ProviderConfig {
  mapboxToken?: string;
  hereApiKey?: string;
}

// ============================================================================
// HTTP Utilities
// ============================================================================

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'roomshare-accuracy-check/1.0' },
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} for ${url}\n${txt.slice(0, 500)}`);
  }

  return res.json();
}

function pickFirst<T>(arr: T[] | undefined): T | null {
  return Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
}

// ============================================================================
// Mapbox Geocoding (v6)
// ============================================================================

/**
 * Geocode an address using Mapbox Geocoding v6.
 * @see https://docs.mapbox.com/api/search/geocoding/
 */
export async function geocodeMapbox(
  address: string,
  token: string
): Promise<GeocodingResult | null> {
  const url =
    'https://api.mapbox.com/search/geocode/v6/forward' +
    `?q=${encodeURIComponent(address)}` +
    `&limit=1` +
    `&country=us` +
    `&access_token=${encodeURIComponent(token)}`;

  const data = (await fetchJson(url)) as {
    features?: Array<{
      geometry?: { coordinates?: [number, number] };
      properties?: {
        match_code?: { confidence?: string };
        full_address?: string;
        place_formatted?: string;
      };
    }>;
  };

  const feat = pickFirst(data?.features);
  if (!feat) return null;

  const [lon, lat] = feat.geometry?.coordinates || [];
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;

  return {
    provider: 'mapbox_geocode_v6',
    lat,
    lon,
    matchQuality: feat.properties?.match_code?.confidence || null,
    formatted:
      feat.properties?.full_address ||
      feat.properties?.place_formatted ||
      null,
    raw: feat,
  };
}

/**
 * Geocode using Mapbox Geocoding v5 (legacy, still used in production).
 */
export async function geocodeMapboxV5(
  address: string,
  token: string
): Promise<GeocodingResult | null> {
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/` +
    `${encodeURIComponent(address)}.json` +
    `?access_token=${encodeURIComponent(token)}` +
    `&limit=1` +
    `&country=us`;

  const data = (await fetchJson(url)) as {
    features?: Array<{
      center?: [number, number];
      place_name?: string;
      relevance?: number;
    }>;
  };

  const feat = pickFirst(data?.features);
  if (!feat) return null;

  const [lon, lat] = feat.center || [];
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;

  return {
    provider: 'mapbox_geocode_v5',
    lat,
    lon,
    matchQuality: feat.relevance?.toString() || null,
    formatted: feat.place_name || null,
    raw: feat,
  };
}

// ============================================================================
// HERE Geocoding
// ============================================================================

/**
 * Geocode an address using HERE Geocoding v1.
 * @see https://developer.here.com/documentation/geocoding-search-api/
 */
export async function geocodeHere(
  address: string,
  apiKey: string
): Promise<GeocodingResult | null> {
  const url =
    'https://geocode.search.hereapi.com/v1/geocode' +
    `?q=${encodeURIComponent(address)}` +
    `&in=countryCode:USA` +
    `&limit=1` +
    `&apiKey=${encodeURIComponent(apiKey)}`;

  const data = (await fetchJson(url)) as {
    items?: Array<{
      position?: { lat: number; lng: number };
      address?: { label?: string };
      scoring?: { queryScore?: number };
    }>;
  };

  const item = pickFirst(data?.items);
  if (!item) return null;

  const lat = item.position?.lat;
  const lon = item.position?.lng;
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;

  return {
    provider: 'here_geocode_v1',
    lat,
    lon,
    matchQuality: item.scoring?.queryScore?.toString() || null,
    formatted: item.address?.label || null,
    raw: item,
  };
}

// ============================================================================
// US Census Geocoder (Reference Baseline)
// ============================================================================

/**
 * Geocode an address using US Census Geocoder.
 * This provides an independent baseline for comparison.
 * @see https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html
 */
export async function geocodeCensus(
  address: string
): Promise<GeocodingResult | null> {
  const url =
    'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress' +
    `?address=${encodeURIComponent(address)}` +
    `&benchmark=Public_AR_Current` +
    `&format=json`;

  const data = (await fetchJson(url)) as {
    result?: {
      addressMatches?: Array<{
        coordinates?: { x: number; y: number };
        matchedAddress?: string;
        tigerLine?: { side?: string };
      }>;
    };
  };

  const match = pickFirst(data?.result?.addressMatches);
  if (!match) return null;

  const lat = Number(match.coordinates?.y);
  const lon = Number(match.coordinates?.x);
  if (isNaN(lat) || isNaN(lon)) return null;

  return {
    provider: 'census_geocoder',
    lat,
    lon,
    matchQuality: match.tigerLine?.side || null,
    formatted: match.matchedAddress || null,
    raw: match,
  };
}

// ============================================================================
// Mapbox POI Search (Search Box API)
// ============================================================================

/**
 * Search for POIs using Mapbox Search Box API.
 * @see https://docs.mapbox.com/api/search/search-box/
 */
export async function searchMapboxPOIs(
  query: string,
  centerLat: number,
  centerLon: number,
  token: string,
  limit: number = 10
): Promise<POIResult[]> {
  const url =
    'https://api.mapbox.com/search/searchbox/v1/forward' +
    `?q=${encodeURIComponent(query)}` +
    `&limit=${limit}` +
    `&country=US` +
    `&proximity=${encodeURIComponent(`${centerLon},${centerLat}`)}` +
    `&access_token=${encodeURIComponent(token)}`;

  const data = (await fetchJson(url)) as {
    features?: Array<{
      geometry?: { coordinates?: [number, number] };
      properties?: {
        name?: string;
        feature_name?: string;
        place_formatted?: string;
        full_address?: string;
        address?: string;
        poi_category?: string[];
        maki?: string;
      };
    }>;
  };

  const features = Array.isArray(data?.features) ? data.features : [];

  const results: POIResult[] = [];

  for (const f of features) {
    const [lon, lat] = f.geometry?.coordinates || [];
    if (typeof lat !== 'number' || typeof lon !== 'number') continue;

    const name =
      f.properties?.name ||
      f.properties?.feature_name ||
      f.properties?.place_formatted ||
      'Unknown';

    const address =
      f.properties?.full_address ||
      f.properties?.place_formatted ||
      f.properties?.address ||
      null;

    const distanceM = haversineMeters(centerLat, centerLon, lat, lon);

    results.push({
      name,
      address,
      lat,
      lon,
      distance_m: distanceM,
      categories: f.properties?.poi_category || [],
      raw: f,
    });
  }

  return results.sort((a, b) => a.distance_m - b.distance_m);
}

// ============================================================================
// HERE POI Search (Discover API)
// ============================================================================

/**
 * Search for POIs using HERE Discover API.
 * @see https://developer.here.com/documentation/geocoding-search-api/dev_guide/topics/endpoint-discover-brief.html
 */
export async function searchHereDiscover(
  query: string,
  centerLat: number,
  centerLon: number,
  apiKey: string,
  limit: number = 10
): Promise<POIResult[]> {
  const url =
    'https://discover.search.hereapi.com/v1/discover' +
    `?at=${encodeURIComponent(`${centerLat},${centerLon}`)}` +
    `?in=countryCode:USA` +
    `&q=${encodeURIComponent(query)}` +
    `&limit=${limit}` +
    `&apiKey=${encodeURIComponent(apiKey)}`;

  const data = (await fetchJson(url)) as {
    items?: Array<{
      title?: string;
      position?: { lat: number; lng: number };
      address?: { label?: string };
      categories?: Array<{ name?: string }>;
    }>;
  };

  const items = Array.isArray(data?.items) ? data.items : [];

  const results: POIResult[] = [];

  for (const item of items) {
    const lat = item.position?.lat;
    const lon = item.position?.lng;
    if (typeof lat !== 'number' || typeof lon !== 'number') continue;

    const name = item.title || 'Unknown';
    const address = item.address?.label || null;
    const distanceM = haversineMeters(centerLat, centerLon, lat, lon);

    results.push({
      name,
      address,
      lat,
      lon,
      distance_m: distanceM,
      categories: item.categories?.map((c) => c.name || '').filter(Boolean) as string[] || [],
      raw: item,
    });
  }

  return results.sort((a, b) => a.distance_m - b.distance_m);
}

// ============================================================================
// Comparison Utilities
// ============================================================================

export interface GeocodeComparison {
  address: string;
  mapbox: GeocodingResult | null;
  mapboxV5: GeocodingResult | null;
  here: GeocodingResult | null;
  census: GeocodingResult | null;
  distances: {
    mapbox_here: number | null;
    mapbox_census: number | null;
    mapboxV5_census: number | null;
    here_census: number | null;
  };
  winner: 'mapbox' | 'here' | 'tie' | 'unknown';
}

/**
 * Compare geocoding results from multiple providers.
 */
export function compareGeocodeResults(
  address: string,
  mapbox: GeocodingResult | null,
  mapboxV5: GeocodingResult | null,
  here: GeocodingResult | null,
  census: GeocodingResult | null
): GeocodeComparison {
  const distances = {
    mapbox_here: null as number | null,
    mapbox_census: null as number | null,
    mapboxV5_census: null as number | null,
    here_census: null as number | null,
  };

  if (mapbox && here) {
    distances.mapbox_here = haversineMeters(
      mapbox.lat,
      mapbox.lon,
      here.lat,
      here.lon
    );
  }

  if (mapbox && census) {
    distances.mapbox_census = haversineMeters(
      mapbox.lat,
      mapbox.lon,
      census.lat,
      census.lon
    );
  }

  if (mapboxV5 && census) {
    distances.mapboxV5_census = haversineMeters(
      mapboxV5.lat,
      mapboxV5.lon,
      census.lat,
      census.lon
    );
  }

  if (here && census) {
    distances.here_census = haversineMeters(
      here.lat,
      here.lon,
      census.lat,
      census.lon
    );
  }

  // Determine winner (closest to Census baseline)
  let winner: 'mapbox' | 'here' | 'tie' | 'unknown' = 'unknown';

  if (
    distances.mapbox_census !== null &&
    distances.here_census !== null
  ) {
    const diff = Math.abs(distances.mapbox_census - distances.here_census);
    if (diff < 5) {
      // Within 5 meters = tie
      winner = 'tie';
    } else if (distances.mapbox_census < distances.here_census) {
      winner = 'mapbox';
    } else {
      winner = 'here';
    }
  } else if (distances.mapbox_census !== null) {
    winner = 'mapbox';
  } else if (distances.here_census !== null) {
    winner = 'here';
  }

  return {
    address,
    mapbox,
    mapboxV5,
    here,
    census,
    distances,
    winner,
  };
}

export interface POIComparison {
  query: string;
  centerLat: number;
  centerLon: number;
  mapbox: POIResult[];
  here: POIResult[];
  analysis: {
    mapboxCount: number;
    hereCount: number;
    mapboxClosest: POIResult | null;
    hereClosest: POIResult | null;
    relevanceScore: {
      mapbox: number;
      here: number;
    };
  };
}

/**
 * Compare POI search results from Mapbox and HERE.
 */
export function comparePOIResults(
  query: string,
  centerLat: number,
  centerLon: number,
  mapbox: POIResult[],
  here: POIResult[]
): POIComparison {
  // Simple relevance scoring based on:
  // 1. Number of results (max 10 points)
  // 2. Closest result distance (max 10 points, inversely proportional)
  // 3. Name match quality (max 10 points)

  const queryLower = query.toLowerCase();

  const scoreResults = (results: POIResult[]): number => {
    if (results.length === 0) return 0;

    // Count score (0-10)
    const countScore = Math.min(results.length, 10);

    // Distance score (0-10) - closer is better
    const closestDistance = results[0]?.distance_m || Infinity;
    const distanceScore = Math.max(0, 10 - closestDistance / 1000); // 1km = 0 score

    // Name match score (0-10)
    const nameMatchCount = results.filter((r) =>
      r.name.toLowerCase().includes(queryLower)
    ).length;
    const nameScore = Math.min(nameMatchCount * 2, 10);

    return countScore + distanceScore + nameScore;
  };

  return {
    query,
    centerLat,
    centerLon,
    mapbox,
    here,
    analysis: {
      mapboxCount: mapbox.length,
      hereCount: here.length,
      mapboxClosest: mapbox[0] || null,
      hereClosest: here[0] || null,
      relevanceScore: {
        mapbox: scoreResults(mapbox),
        here: scoreResults(here),
      },
    },
  };
}
