/**
 * Nominatim geocoding adapter (nominatim.openstreetmap.org)
 * Official OSM search engine for forward geocoding, reverse geocoding,
 * and boundary polygon lookups.
 *
 * Requirements:
 * - User-Agent header required on every request
 * - Max 1 request/second (enforced by built-in rate limiter)
 * - No autocomplete use (use Photon for that)
 */

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'Roomshare/1.0 (contact@roomshare.app)';
const MIN_REQUEST_INTERVAL_MS = 1100; // Slightly over 1s to be safe

/** Module-level rate limiter for server-side usage */
let lastRequestTimestamp = 0;

async function rateLimitWait(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTimestamp;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await new Promise((resolve) =>
      setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed),
    );
  }
  lastRequestTimestamp = Date.now();
}

/** Common headers for all Nominatim requests */
const NOMINATIM_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'application/json',
};

interface NominatimSearchResult {
  place_id: number;
  osm_type: string;
  osm_id: number;
  lat: string; // Nominatim returns strings!
  lon: string;
  display_name: string;
  boundingbox: [string, string, string, string]; // [minLat, maxLat, minLon, maxLon] as strings
  geojson?: GeoJSON.Geometry;
  address?: Record<string, string>;
  type?: string;
}

interface NominatimReverseResult {
  place_id: number;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  display_name: string;
  address?: Record<string, string>;
}

/**
 * Forward geocode an address to coordinates.
 * Used server-side for listing creation. Includes rate limiting.
 */
export async function forwardGeocode(
  query: string,
  options?: { signal?: AbortSignal },
): Promise<{ lat: number; lng: number } | null> {
  await rateLimitWait();

  const encoded = encodeURIComponent(query);
  const url = `${NOMINATIM_BASE_URL}/search?q=${encoded}&format=jsonv2&limit=1&addressdetails=1`;

  const response = await fetch(url, {
    headers: NOMINATIM_HEADERS,
    signal: options?.signal,
  });

  if (!response.ok) {
    throw new Error(
      `Nominatim search failed: ${response.status} ${response.statusText}`,
    );
  }

  const data: NominatimSearchResult[] = await response.json();

  if (!data || data.length === 0) {
    return null;
  }

  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
  };
}

/**
 * Reverse geocode coordinates to an address string.
 * Used client-side for user pin placement (low frequency, user-initiated).
 * No rate limiter needed client-side (one call at a time).
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
  options?: { signal?: AbortSignal },
): Promise<string | null> {
  const url = `${NOMINATIM_BASE_URL}/reverse?lat=${lat}&lon=${lng}&format=jsonv2&addressdetails=1`;

  const response = await fetch(url, {
    headers: NOMINATIM_HEADERS,
    signal: options?.signal,
  });

  if (!response.ok) {
    return null;
  }

  const data: NominatimReverseResult = await response.json();
  return data.display_name ?? null;
}

export interface BoundaryResult {
  displayName: string;
  /** Actual GeoJSON polygon geometry (when available) */
  geometry: GeoJSON.Geometry | null;
  /** Bounding box as [minLng, minLat, maxLng, maxLat] */
  bbox: [number, number, number, number] | null;
}

/**
 * Search for a place boundary polygon.
 * Returns actual polygon geometry when available (upgrade from Mapbox bbox rectangles).
 * Falls back to bounding box when polygon data is unavailable.
 */
export async function searchBoundary(
  query: string,
  options?: { signal?: AbortSignal },
): Promise<BoundaryResult | null> {
  const encoded = encodeURIComponent(query);
  const url = `${NOMINATIM_BASE_URL}/search?q=${encoded}&format=jsonv2&polygon_geojson=1&limit=1`;

  const response = await fetch(url, {
    headers: NOMINATIM_HEADERS,
    signal: options?.signal,
  });

  if (!response.ok) {
    return null;
  }

  const data: NominatimSearchResult[] = await response.json();

  if (!data || data.length === 0) {
    return null;
  }

  const result = data[0];

  // Convert Nominatim boundingbox [minLat, maxLat, minLon, maxLon] (strings)
  // to [minLng, minLat, maxLng, maxLat] (numbers, GeoJSON order)
  const [minLat, maxLat, minLon, maxLon] = result.boundingbox.map(parseFloat);
  const bbox: [number, number, number, number] = [minLon, minLat, maxLon, maxLat];

  return {
    displayName: result.display_name,
    geometry: result.geojson ?? null,
    bbox,
  };
}
