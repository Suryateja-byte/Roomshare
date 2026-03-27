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

// Category chip configuration
export interface CategoryChip {
  label: string;
  categories: string[];
  query?: string; // Optional text filter (e.g., "indian" for Indian grocery)
  icon:
    | "ShoppingCart"
    | "Utensils"
    | "ShoppingBag"
    | "Fuel"
    | "Dumbbell"
    | "Pill";
}

// Predefined category chips per plan
// Uses valid Radar API categories: https://radar.com/documentation/places/categories
export const CATEGORY_CHIPS: CategoryChip[] = [
  {
    label: "Grocery",
    categories: ["food-grocery", "supermarket"],
    icon: "ShoppingCart",
  },
  {
    label: "Restaurants",
    categories: ["restaurant", "food-beverage"],
    icon: "Utensils",
  },
  { label: "Shopping", categories: ["shopping-retail"], icon: "ShoppingBag" },
  { label: "Gas Stations", categories: ["gas-station"], icon: "Fuel" },
  {
    label: "Fitness",
    categories: ["gym", "fitness-recreation"],
    icon: "Dumbbell",
  },
  { label: "Pharmacy", categories: ["pharmacy"], icon: "Pill" },
];

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

export const CATEGORY_COLORS: Record<string, CategoryColorConfig> = {
  // Grocery stores (valid Radar API category)
  grocery: {
    bg: "bg-orange-50",
    icon: "text-orange-600",
    accent: "bg-orange-500",
    markerBg: "#fff7ed",
    markerBorder: "#ea580c",
  },
  // Food-Grocery (valid Radar API category, same colors as grocery)
  "food-grocery": {
    bg: "bg-orange-50",
    icon: "text-orange-600",
    accent: "bg-orange-500",
    markerBg: "#fff7ed",
    markerBorder: "#ea580c",
  },
  // Supermarket (valid Radar API category, same colors as grocery)
  supermarket: {
    bg: "bg-orange-50",
    icon: "text-orange-600",
    accent: "bg-orange-500",
    markerBg: "#fff7ed",
    markerBorder: "#ea580c",
  },
  // Restaurants (valid Radar API category)
  restaurant: {
    bg: "bg-rose-50",
    icon: "text-rose-600",
    accent: "bg-rose-500",
    markerBg: "#fff1f2",
    markerBorder: "#e11d48",
  },
  // Food & Beverage (valid Radar API category, same colors as restaurant)
  "food-beverage": {
    bg: "bg-rose-50",
    icon: "text-rose-600",
    accent: "bg-rose-500",
    markerBg: "#fff1f2",
    markerBorder: "#e11d48",
  },
  // Shopping (valid Radar API category)
  shopping: {
    bg: "bg-purple-50",
    icon: "text-purple-600",
    accent: "bg-purple-500",
    markerBg: "#faf5ff",
    markerBorder: "#9333ea",
  },
  // Shopping-Retail (valid Radar API category, same colors as shopping)
  "shopping-retail": {
    bg: "bg-purple-50",
    icon: "text-purple-600",
    accent: "bg-purple-500",
    markerBg: "#faf5ff",
    markerBorder: "#9333ea",
  },
  // Gas stations (valid Radar API category)
  "gas-station": {
    bg: "bg-amber-50",
    icon: "text-amber-600",
    accent: "bg-amber-500",
    markerBg: "#fffbeb",
    markerBorder: "#d97706",
  },
  // Gym (valid Radar API category)
  gym: {
    bg: "bg-primary/10",
    icon: "text-primary",
    accent: "bg-primary",
    markerBg: "#f5ebe3",
    markerBorder: "#9a4027",
  },
  // Fitness & Recreation (valid Radar API category, same colors as gym)
  "fitness-recreation": {
    bg: "bg-primary/10",
    icon: "text-primary",
    accent: "bg-primary",
    markerBg: "#f5ebe3",
    markerBorder: "#9a4027",
  },
  // Health & Medicine (valid Radar API category)
  "health-medicine": {
    bg: "bg-emerald-50",
    icon: "text-emerald-600",
    accent: "bg-emerald-500",
    markerBg: "#ecfdf5",
    markerBorder: "#059669",
  },
  // Pharmacy (valid Radar API category, same colors as health-medicine)
  pharmacy: {
    bg: "bg-emerald-50",
    icon: "text-emerald-600",
    accent: "bg-emerald-500",
    markerBg: "#ecfdf5",
    markerBorder: "#059669",
  },
  // Drugstore (valid Radar API category, same colors as health-medicine)
  drugstore: {
    bg: "bg-emerald-50",
    icon: "text-emerald-600",
    accent: "bg-emerald-500",
    markerBg: "#ecfdf5",
    markerBorder: "#059669",
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
