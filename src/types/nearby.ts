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
    type: 'Point';
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
    type: 'Point';
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
  icon: 'ShoppingCart' | 'Utensils' | 'ShoppingBag' | 'Fuel' | 'Dumbbell' | 'Pill';
}

// Predefined category chips per plan
// Uses valid Radar API categories: https://radar.com/documentation/places/categories
export const CATEGORY_CHIPS: CategoryChip[] = [
  { label: 'Grocery', categories: ['food-grocery', 'supermarket'], icon: 'ShoppingCart' },
  { label: 'Restaurants', categories: ['restaurant', 'food-beverage'], icon: 'Utensils' },
  { label: 'Shopping', categories: ['shopping-retail'], icon: 'ShoppingBag' },
  { label: 'Gas Stations', categories: ['gas-station'], icon: 'Fuel' },
  { label: 'Fitness', categories: ['gym', 'fitness-recreation'], icon: 'Dumbbell' },
  { label: 'Pharmacy', categories: ['pharmacy'], icon: 'Pill' },
];

// Radius options in meters
export const RADIUS_OPTIONS = [
  { label: '1 mi', meters: 1609 },
  { label: '2 mi', meters: 3218 },
  { label: '5 mi', meters: 8046 },
] as const;

// Category color configuration for premium UI
export interface CategoryColorConfig {
  bg: string;
  bgDark: string;
  icon: string;
  iconDark: string;
  accent: string;
  markerBg: string;
  markerBorder: string;
  markerBgDark: string;
  markerBorderDark: string;
}

export const CATEGORY_COLORS: Record<string, CategoryColorConfig> = {
  // Grocery stores (valid Radar API category)
  grocery: {
    bg: 'bg-orange-50',
    bgDark: 'dark:bg-orange-900/20',
    icon: 'text-orange-600',
    iconDark: 'dark:text-orange-400',
    accent: 'bg-orange-500',
    markerBg: '#fff7ed',
    markerBorder: '#ea580c',
    markerBgDark: '#431407',
    markerBorderDark: '#fb923c',
  },
  // Food-Grocery (valid Radar API category, same colors as grocery)
  'food-grocery': {
    bg: 'bg-orange-50',
    bgDark: 'dark:bg-orange-900/20',
    icon: 'text-orange-600',
    iconDark: 'dark:text-orange-400',
    accent: 'bg-orange-500',
    markerBg: '#fff7ed',
    markerBorder: '#ea580c',
    markerBgDark: '#431407',
    markerBorderDark: '#fb923c',
  },
  // Supermarket (valid Radar API category, same colors as grocery)
  supermarket: {
    bg: 'bg-orange-50',
    bgDark: 'dark:bg-orange-900/20',
    icon: 'text-orange-600',
    iconDark: 'dark:text-orange-400',
    accent: 'bg-orange-500',
    markerBg: '#fff7ed',
    markerBorder: '#ea580c',
    markerBgDark: '#431407',
    markerBorderDark: '#fb923c',
  },
  // Restaurants (valid Radar API category)
  restaurant: {
    bg: 'bg-rose-50',
    bgDark: 'dark:bg-rose-900/20',
    icon: 'text-rose-600',
    iconDark: 'dark:text-rose-400',
    accent: 'bg-rose-500',
    markerBg: '#fff1f2',
    markerBorder: '#e11d48',
    markerBgDark: '#4c0519',
    markerBorderDark: '#fb7185',
  },
  // Food & Beverage (valid Radar API category, same colors as restaurant)
  'food-beverage': {
    bg: 'bg-rose-50',
    bgDark: 'dark:bg-rose-900/20',
    icon: 'text-rose-600',
    iconDark: 'dark:text-rose-400',
    accent: 'bg-rose-500',
    markerBg: '#fff1f2',
    markerBorder: '#e11d48',
    markerBgDark: '#4c0519',
    markerBorderDark: '#fb7185',
  },
  // Shopping (valid Radar API category)
  shopping: {
    bg: 'bg-purple-50',
    bgDark: 'dark:bg-purple-900/20',
    icon: 'text-purple-600',
    iconDark: 'dark:text-purple-400',
    accent: 'bg-purple-500',
    markerBg: '#faf5ff',
    markerBorder: '#9333ea',
    markerBgDark: '#3b0764',
    markerBorderDark: '#c084fc',
  },
  // Shopping-Retail (valid Radar API category, same colors as shopping)
  'shopping-retail': {
    bg: 'bg-purple-50',
    bgDark: 'dark:bg-purple-900/20',
    icon: 'text-purple-600',
    iconDark: 'dark:text-purple-400',
    accent: 'bg-purple-500',
    markerBg: '#faf5ff',
    markerBorder: '#9333ea',
    markerBgDark: '#3b0764',
    markerBorderDark: '#c084fc',
  },
  // Gas stations (valid Radar API category)
  'gas-station': {
    bg: 'bg-amber-50',
    bgDark: 'dark:bg-amber-900/20',
    icon: 'text-amber-600',
    iconDark: 'dark:text-amber-400',
    accent: 'bg-amber-500',
    markerBg: '#fffbeb',
    markerBorder: '#d97706',
    markerBgDark: '#451a03',
    markerBorderDark: '#fbbf24',
  },
  // Gym (valid Radar API category)
  gym: {
    bg: 'bg-indigo-50',
    bgDark: 'dark:bg-indigo-900/20',
    icon: 'text-indigo-600',
    iconDark: 'dark:text-indigo-400',
    accent: 'bg-indigo-500',
    markerBg: '#eef2ff',
    markerBorder: '#4f46e5',
    markerBgDark: '#1e1b4b',
    markerBorderDark: '#a5b4fc',
  },
  // Fitness & Recreation (valid Radar API category, same colors as gym)
  'fitness-recreation': {
    bg: 'bg-indigo-50',
    bgDark: 'dark:bg-indigo-900/20',
    icon: 'text-indigo-600',
    iconDark: 'dark:text-indigo-400',
    accent: 'bg-indigo-500',
    markerBg: '#eef2ff',
    markerBorder: '#4f46e5',
    markerBgDark: '#1e1b4b',
    markerBorderDark: '#a5b4fc',
  },
  // Health & Medicine (valid Radar API category)
  'health-medicine': {
    bg: 'bg-emerald-50',
    bgDark: 'dark:bg-emerald-900/20',
    icon: 'text-emerald-600',
    iconDark: 'dark:text-emerald-400',
    accent: 'bg-emerald-500',
    markerBg: '#ecfdf5',
    markerBorder: '#059669',
    markerBgDark: '#022c22',
    markerBorderDark: '#34d399',
  },
  // Pharmacy (valid Radar API category, same colors as health-medicine)
  pharmacy: {
    bg: 'bg-emerald-50',
    bgDark: 'dark:bg-emerald-900/20',
    icon: 'text-emerald-600',
    iconDark: 'dark:text-emerald-400',
    accent: 'bg-emerald-500',
    markerBg: '#ecfdf5',
    markerBorder: '#059669',
    markerBgDark: '#022c22',
    markerBorderDark: '#34d399',
  },
  // Drugstore (valid Radar API category, same colors as health-medicine)
  drugstore: {
    bg: 'bg-emerald-50',
    bgDark: 'dark:bg-emerald-900/20',
    icon: 'text-emerald-600',
    iconDark: 'dark:text-emerald-400',
    accent: 'bg-emerald-500',
    markerBg: '#ecfdf5',
    markerBorder: '#059669',
    markerBgDark: '#022c22',
    markerBorderDark: '#34d399',
  },
  // Fallback for unknown categories
  default: {
    bg: 'bg-zinc-50',
    bgDark: 'dark:bg-zinc-800',
    icon: 'text-zinc-600',
    iconDark: 'dark:text-zinc-400',
    accent: 'bg-zinc-500',
    markerBg: '#fafafa',
    markerBorder: '#71717a',
    markerBgDark: '#27272a',
    markerBorderDark: '#a1a1aa',
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

  return CATEGORY_COLORS['default'];
}
