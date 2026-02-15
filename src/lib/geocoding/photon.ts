/**
 * Photon geocoding adapter (photon.komoot.io)
 * Free OSM-based geocoder optimized for autocomplete.
 * No API key needed, fair use policy.
 *
 * Transforms Photon GeoJSON responses to match the existing
 * LocationSuggestion / GeocodingResult interfaces used throughout the app.
 */

import type { GeocodingResult } from '../geocoding-cache';
import { fetchWithTimeout } from '../fetch-with-timeout';

const PHOTON_BASE_URL = 'https://photon.komoot.io/api';
const GEOCODING_TIMEOUT_MS = 5000;

/** Max query length (reasonable limit; Photon has no documented cap) */
export const PHOTON_QUERY_MAX_LENGTH = 500;

interface PhotonProperties {
  osm_id: number;
  osm_type: string;
  name?: string;
  city?: string;
  state?: string;
  country?: string;
  type?: string;
  extent?: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  street?: string;
  housenumber?: string;
  postcode?: string;
  district?: string;
  county?: string;
}

interface PhotonFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
  properties: PhotonProperties;
}

interface PhotonResponse {
  type: 'FeatureCollection';
  features: PhotonFeature[];
}

/** Build a human-readable place name from Photon properties */
function buildPlaceName(props: PhotonProperties): string {
  const parts: string[] = [];

  if (props.name) {
    parts.push(props.name);
  } else if (props.street) {
    const street = props.housenumber
      ? `${props.housenumber} ${props.street}`
      : props.street;
    parts.push(street);
  }

  if (props.city && props.city !== props.name) {
    parts.push(props.city);
  } else if (props.district && props.district !== props.name) {
    parts.push(props.district);
  }

  if (props.state) {
    parts.push(props.state);
  }

  if (props.country) {
    parts.push(props.country);
  }

  return parts.join(', ') || 'Unknown location';
}

/** Map Photon type to Mapbox-compatible place_type array */
function inferPlaceType(type?: string): string[] {
  if (!type) return ['place'];
  switch (type) {
    case 'city':
    case 'town':
    case 'village':
      return ['place'];
    case 'district':
    case 'suburb':
    case 'neighbourhood':
      return ['neighborhood'];
    case 'street':
      return ['address'];
    case 'state':
    case 'county':
      return ['region'];
    case 'country':
      return ['country'];
    case 'house':
      return ['address'];
    case 'locality':
      return ['locality'];
    default:
      return ['place'];
  }
}

/** Transform a single Photon feature to GeocodingResult */
function toGeocodingResult(feature: PhotonFeature): GeocodingResult {
  const props = feature.properties;
  return {
    id: `${props.osm_type || 'N'}:${props.osm_id || 0}`,
    place_name: buildPlaceName(props),
    center: feature.geometry.coordinates as [number, number],
    place_type: inferPlaceType(props.type),
    bbox: props.extent, // Already [minLng, minLat, maxLng, maxLat]
  };
}

/**
 * Search Photon for autocomplete suggestions.
 * Returns results in the same shape as the existing GeocodingResult interface.
 */
export async function searchPhoton(
  query: string,
  options?: { signal?: AbortSignal; limit?: number },
): Promise<GeocodingResult[]> {
  const limit = options?.limit ?? 5;
  const encoded = encodeURIComponent(query);
  const url = `${PHOTON_BASE_URL}?q=${encoded}&limit=${limit}&lang=en`;

  const response = await fetchWithTimeout(url, {
    signal: options?.signal,
    timeout: GEOCODING_TIMEOUT_MS,
  });

  if (!response.ok) {
    if (response.status >= 500) {
      throw new Error('Location service is temporarily unavailable');
    }
    throw new Error('Failed to fetch suggestions');
  }

  const data: PhotonResponse = await response.json();
  return (data.features || []).map(toGeocodingResult);
}
