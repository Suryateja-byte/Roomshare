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

// Category chip configuration
export interface CategoryChip {
  label: string;
  categories: string[];
  query?: string; // Optional text filter (e.g., "indian" for Indian grocery)
  icon: 'ShoppingCart' | 'Utensils' | 'ShoppingBag' | 'Fuel' | 'Dumbbell' | 'Pill';
}

// Predefined category chips per plan
export const CATEGORY_CHIPS: CategoryChip[] = [
  { label: 'Indian Grocery', categories: ['food-grocery'], query: 'indian', icon: 'ShoppingCart' },
  { label: 'Restaurants', categories: ['indian-restaurant'], icon: 'Utensils' },
  { label: 'Shopping', categories: ['shopping-mall'], icon: 'ShoppingBag' },
  { label: 'Gas Stations', categories: ['gas-station'], icon: 'Fuel' },
  { label: 'Fitness', categories: ['gym'], icon: 'Dumbbell' },
  { label: 'Pharmacy', categories: ['pharmacy'], icon: 'Pill' },
];

// Radius options in meters
export const RADIUS_OPTIONS = [
  { label: '1 mi', meters: 1609 },
  { label: '2 mi', meters: 3218 },
  { label: '5 mi', meters: 8046 },
] as const;
