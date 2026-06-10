/**
 * Types for Nearby Places feature using Radar API
 * @see https://radar.com/documentation/api#search-places
 */

export interface NearbyPlace {
  id: string;
  name: string;
  address: string;
  category: string;
  chain?: string;
  location: {
    lat: number;
    lng: number;
  };
  distanceMiles: number;
}

export interface NearbySearchRequest {
  listingLat: number;
  listingLng: number;
  query?: string;
  categories?: string[];
  radiusMeters: number;
  limit?: number;
}

export interface NearbySearchResponse {
  places: NearbyPlace[];
  meta: {
    cached: boolean;
    count: number;
  };
}

// Radar API response types (subset of full response)
export interface RadarPlace {
  _id: string;
  name: string;
  location: {
    type: "Point";
    coordinates: [number, number]; // [lng, lat]
  };
  categories: string[];
  chain?: {
    name: string;
    slug: string;
  };
  formattedAddress?: string;
}

export interface RadarSearchResponse {
  meta: {
    code: number;
  };
  places: RadarPlace[];
}

// Radar Autocomplete API response types
// @see https://radar.com/documentation/api#autocomplete
export interface RadarAutocompleteAddress {
  latitude: number;
  longitude: number;
  geometry?: {
    type: "Point";
    coordinates: [number, number]; // [lng, lat]
  };
  formattedAddress?: string;
  addressLabel?: string;
  placeLabel?: string; // Name of the place (for layer='place')
  layer?: string; // 'place' | 'address' | 'postalCode' | etc.
  distance?: number; // Distance in meters from 'near' point
  country?: string;
  countryCode?: string;
  state?: string;
  stateCode?: string;
  city?: string;
  postalCode?: string;
}

export interface RadarAutocompleteResponse {
  meta: {
    code: number;
  };
  addresses: RadarAutocompleteAddress[];
}

export {
  CATEGORY_CHIPS,
  type CategoryChip,
  type RadarCategorySlug,
} from "@/lib/nearby-categories";

// Radius options in meters
export const RADIUS_OPTIONS = [
  { label: "1 mi", meters: 1609 },
  { label: "2 mi", meters: 3218 },
  { label: "5 mi", meters: 8046 },
] as const;

// Category color configuration for premium UI
export interface CategoryColorConfig {
  bg: string;
  icon: string;
  accent: string;
  markerBg: string;
  markerBorder: string;
}

// Brand-token category palette (hex values mirror globals.css @theme).
// White marker chips with a semantic accent border match the search map's
// "Paper chips" family; each category keeps a distinct, conventional hue:
// food=success green, dining=destructive red, medical=info blue,
// fuel=warning amber, shopping=tertiary brown, fitness=primary terracotta.
export const CATEGORY_COLORS: Record<string, CategoryColorConfig> = {
  "food-grocery": {
    bg: "bg-success/10",
    icon: "text-success",
    accent: "bg-success",
    markerBg: "#ffffff",
    markerBorder: "#2d7a3a",
  },
  // Supermarket (valid Radar API category, same colors as grocery)
  supermarket: {
    bg: "bg-success/10",
    icon: "text-success",
    accent: "bg-success",
    markerBg: "#ffffff",
    markerBorder: "#2d7a3a",
  },
  // Restaurants (valid Radar API category)
  restaurant: {
    bg: "bg-destructive/10",
    icon: "text-destructive",
    accent: "bg-destructive",
    markerBg: "#ffffff",
    markerBorder: "#c4321c",
  },
  // Food & Beverage (valid Radar API category, same colors as restaurant)
  "food-beverage": {
    bg: "bg-destructive/10",
    icon: "text-destructive",
    accent: "bg-destructive",
    markerBg: "#ffffff",
    markerBorder: "#c4321c",
  },
  "shopping-retail": {
    bg: "bg-tertiary/10",
    icon: "text-tertiary",
    accent: "bg-tertiary",
    markerBg: "#ffffff",
    markerBorder: "#904917",
  },
  // Gas stations (valid Radar API category)
  "gas-station": {
    bg: "bg-warning/10",
    icon: "text-warning",
    accent: "bg-warning",
    markerBg: "#ffffff",
    markerBorder: "#b45309",
  },
  gym: {
    bg: "bg-primary/10",
    icon: "text-primary",
    accent: "bg-primary",
    markerBg: "#ffffff",
    markerBorder: "#9a4027",
  },
  "medical-health": {
    bg: "bg-info/10",
    icon: "text-info",
    accent: "bg-info",
    markerBg: "#ffffff",
    markerBorder: "#1e6fa0",
  },
  pharmacy: {
    bg: "bg-info/10",
    icon: "text-info",
    accent: "bg-info",
    markerBg: "#ffffff",
    markerBorder: "#1e6fa0",
  },
  // Fallback for unknown categories
  default: {
    bg: "bg-surface-canvas",
    icon: "text-on-surface-variant",
    accent: "bg-on-surface-variant",
    markerBg: "#fbf9f4",
    markerBorder: "#4a4941",
  },
};

/**
 * Get color configuration for a category
 * Falls back to 'default' colors if category not found
 */
export function getCategoryColors(category: string): CategoryColorConfig {
  // Check for exact match first
  if (CATEGORY_COLORS[category]) {
    return CATEGORY_COLORS[category];
  }

  // Check for partial match (e.g., 'indian-restaurant' contains 'restaurant')
  for (const key of Object.keys(CATEGORY_COLORS)) {
    if (category.includes(key) || key.includes(category)) {
      return CATEGORY_COLORS[key];
    }
  }

  return CATEGORY_COLORS["default"];
}
