/**
 * Deterministic Test Dataset
 *
 * Seeded fixtures that cover all filter combinations for integration
 * and property-based testing.
 *
 * Design goals:
 * - Deterministic (same output every run)
 * - Covers all filter value permutations
 * - Small (~100 listings) for fast tests
 * - Realistic data distribution
 */

import type { Amenity, HouseRule, RoomType, SortOption } from '@/lib/filter-schema';

// ============================================
// Types
// ============================================

export interface TestListing {
  id: string;
  title: string;
  description: string;
  price: number;
  roomType: RoomType;
  amenities: Amenity[];
  houseRules: HouseRule[];
  languages: string[];
  leaseDuration: string;
  genderPreference: string;
  householdGender: string;
  moveInDate: string | null;
  location: {
    city: string;
    state: string;
    lat: number;
    lng: number;
  };
  availableSlots: number;
  status: 'ACTIVE' | 'INACTIVE';
  avgRating: number | null;
  reviewCount: number;
  viewCount: number;
  createdAt: Date;
  hostId: string;
}

// ============================================
// Seeded Random Number Generator
// ============================================

/**
 * Mulberry32 PRNG - deterministic random numbers from a seed
 */
function createSeededRandom(seed: number) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = createSeededRandom(42);

function randomInt(min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function randomChoice<T>(arr: readonly T[]): T {
  return arr[Math.floor(random() * arr.length)];
}

function randomSubset<T>(arr: readonly T[], min = 0, max?: number): T[] {
  const n = randomInt(min, max ?? arr.length);
  const shuffled = [...arr].sort(() => random() - 0.5);
  return shuffled.slice(0, n);
}

// ============================================
// Test Data Constants
// ============================================

const AMENITIES: Amenity[] = ['Wifi', 'AC', 'Parking', 'Washer', 'Dryer', 'Kitchen', 'Gym', 'Pool'];

const HOUSE_RULES: HouseRule[] = [
  'Pets allowed',
  'Smoking allowed',
  'Couples allowed',
  'Guests allowed',
];

const ROOM_TYPES: RoomType[] = ['Private Room', 'Shared Room', 'Entire Place'];

const LEASE_DURATIONS = ['Month-to-month', '3 months', '6 months', '12 months', 'Flexible'];

const GENDER_PREFERENCES = ['MALE_ONLY', 'FEMALE_ONLY', 'NO_PREFERENCE'];

const HOUSEHOLD_GENDERS = ['ALL_MALE', 'ALL_FEMALE', 'MIXED'];

const LANGUAGES = [
  'en', 'es', 'zh', 'fr', 'de', 'ja', 'ko', 'pt', 'ru', 'ar',
  'hi', 'it', 'nl', 'pl', 'tr', 'vi', 'th', 'id', 'ms', 'tl',
];

const CITIES = [
  // US West Coast
  { city: 'San Francisco', state: 'CA', lat: 37.7749, lng: -122.4194 },
  { city: 'Los Angeles', state: 'CA', lat: 34.0522, lng: -118.2437 },
  { city: 'San Diego', state: 'CA', lat: 32.7157, lng: -117.1611 },
  { city: 'Seattle', state: 'WA', lat: 47.6062, lng: -122.3321 },
  { city: 'Portland', state: 'OR', lat: 45.5152, lng: -122.6784 },
  // US East Coast
  { city: 'New York', state: 'NY', lat: 40.7128, lng: -74.006 },
  { city: 'Boston', state: 'MA', lat: 42.3601, lng: -71.0589 },
  { city: 'Miami', state: 'FL', lat: 25.7617, lng: -80.1918 },
  { city: 'Washington', state: 'DC', lat: 38.9072, lng: -77.0369 },
  { city: 'Philadelphia', state: 'PA', lat: 39.9526, lng: -75.1652 },
  // Other US
  { city: 'Austin', state: 'TX', lat: 30.2672, lng: -97.7431 },
  { city: 'Denver', state: 'CO', lat: 39.7392, lng: -104.9903 },
  { city: 'Chicago', state: 'IL', lat: 41.8781, lng: -87.6298 },
  // International (for antimeridian tests)
  { city: 'Tokyo', state: 'JP', lat: 35.6762, lng: 139.6503 },
  { city: 'Sydney', state: 'AU', lat: -33.8688, lng: 151.2093 },
  // Near antimeridian
  { city: 'Auckland', state: 'NZ', lat: -36.8509, lng: 174.7645 },
  { city: 'Fiji', state: 'FJ', lat: -17.7134, lng: 178.065 },
];

const PRICE_RANGES = [
  { min: 0, max: 500 },
  { min: 500, max: 1000 },
  { min: 1000, max: 1500 },
  { min: 1500, max: 2000 },
  { min: 2000, max: 3000 },
  { min: 3000, max: 5000 },
];

const TITLE_TEMPLATES = [
  'Cozy {roomType} in {city}',
  'Modern {roomType} near downtown',
  'Spacious {roomType} with great views',
  'Budget-friendly {roomType}',
  'Luxury {roomType} in {city}',
  'Student-friendly {roomType}',
  'Professional {roomType} in prime location',
  'Quiet {roomType} with parking',
];

const DESCRIPTION_SNIPPETS = [
  'Walking distance to public transit.',
  'Recently renovated kitchen and bathroom.',
  'Quiet neighborhood, perfect for remote work.',
  'Close to restaurants and shopping.',
  'Pet-friendly building.',
  'Utilities included in rent.',
  'Fully furnished with modern appliances.',
  'Laundry on-site.',
];

// ============================================
// Generate Test Listings
// ============================================

function generateDate(daysFromNow: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().split('T')[0];
}

function generateListing(index: number): TestListing {
  const location = randomChoice(CITIES);
  const roomType = randomChoice(ROOM_TYPES);
  const priceRange = randomChoice(PRICE_RANGES);
  const price = randomInt(priceRange.min, priceRange.max);

  // Generate title
  const titleTemplate = randomChoice(TITLE_TEMPLATES);
  const title = titleTemplate
    .replace('{roomType}', roomType)
    .replace('{city}', location.city);

  // Generate description
  const snippets = randomSubset(DESCRIPTION_SNIPPETS, 1, 3);
  const description = snippets.join(' ');

  // Add slight location variance (within ~10km)
  const latVariance = (random() - 0.5) * 0.1;
  const lngVariance = (random() - 0.5) * 0.1;

  // Generate move-in date (some null, some past, some future)
  let moveInDate: string | null = null;
  const dateChoice = random();
  if (dateChoice < 0.2) {
    moveInDate = null; // Available immediately
  } else if (dateChoice < 0.3) {
    // Past date (should be filtered out normally)
    moveInDate = generateDate(-randomInt(1, 30));
  } else {
    // Future date
    moveInDate = generateDate(randomInt(1, 180));
  }

  // Generate ratings
  const hasRatings = random() > 0.3;
  const avgRating = hasRatings ? Number((3 + random() * 2).toFixed(1)) : null;
  const reviewCount = hasRatings ? randomInt(1, 50) : 0;

  // Generate status (most active)
  const status = random() > 0.1 ? 'ACTIVE' : 'INACTIVE';

  // Generate created date (within last 180 days)
  const createdDaysAgo = randomInt(0, 180);
  const createdAt = new Date();
  createdAt.setDate(createdAt.getDate() - createdDaysAgo);

  return {
    id: `listing-${String(index).padStart(4, '0')}`,
    title,
    description,
    price,
    roomType,
    amenities: randomSubset(AMENITIES, 1, 5),
    houseRules: randomSubset(HOUSE_RULES, 0, 3),
    languages: randomSubset(LANGUAGES, 1, 4),
    leaseDuration: randomChoice(LEASE_DURATIONS),
    genderPreference: randomChoice(GENDER_PREFERENCES),
    householdGender: randomChoice(HOUSEHOLD_GENDERS),
    moveInDate,
    location: {
      city: location.city,
      state: location.state,
      lat: Number((location.lat + latVariance).toFixed(6)),
      lng: Number((location.lng + lngVariance).toFixed(6)),
    },
    availableSlots: randomInt(1, 5),
    status: status as 'ACTIVE' | 'INACTIVE',
    avgRating,
    reviewCount,
    viewCount: randomInt(10, 1000),
    createdAt,
    hostId: `host-${randomInt(1, 20).toString().padStart(3, '0')}`,
  };
}

// ============================================
// Main Dataset
// ============================================

/**
 * Generate base dataset with 100 listings
 */
function generateDataset(count: number): TestListing[] {
  const listings: TestListing[] = [];
  for (let i = 0; i < count; i++) {
    listings.push(generateListing(i));
  }
  return listings;
}

/**
 * Main test dataset - 100 deterministic listings
 */
export const TEST_LISTINGS: TestListing[] = generateDataset(100);

/**
 * Active listings only (for most tests)
 */
export const ACTIVE_LISTINGS = TEST_LISTINGS.filter((l) => l.status === 'ACTIVE');

// ============================================
// Coverage Verification
// ============================================

/**
 * Verify the dataset has coverage for all filter values.
 * Run this as a test to ensure fixtures are adequate.
 */
export function verifyCoverage(listings: TestListing[]): {
  covered: string[];
  missing: string[];
} {
  const covered: string[] = [];
  const missing: string[] = [];

  // Room types
  for (const type of ROOM_TYPES) {
    if (listings.some((l) => l.roomType === type)) {
      covered.push(`roomType:${type}`);
    } else {
      missing.push(`roomType:${type}`);
    }
  }

  // Amenities
  for (const amenity of AMENITIES) {
    if (listings.some((l) => l.amenities.includes(amenity))) {
      covered.push(`amenity:${amenity}`);
    } else {
      missing.push(`amenity:${amenity}`);
    }
  }

  // House rules
  for (const rule of HOUSE_RULES) {
    if (listings.some((l) => l.houseRules.includes(rule))) {
      covered.push(`houseRule:${rule}`);
    } else {
      missing.push(`houseRule:${rule}`);
    }
  }

  // Languages
  for (const lang of LANGUAGES) {
    if (listings.some((l) => l.languages.includes(lang))) {
      covered.push(`language:${lang}`);
    } else {
      missing.push(`language:${lang}`);
    }
  }

  // Lease durations
  for (const duration of LEASE_DURATIONS) {
    if (listings.some((l) => l.leaseDuration === duration)) {
      covered.push(`leaseDuration:${duration}`);
    } else {
      missing.push(`leaseDuration:${duration}`);
    }
  }

  // Gender preferences
  for (const pref of GENDER_PREFERENCES) {
    if (listings.some((l) => l.genderPreference === pref)) {
      covered.push(`genderPreference:${pref}`);
    } else {
      missing.push(`genderPreference:${pref}`);
    }
  }

  // Household genders
  for (const gender of HOUSEHOLD_GENDERS) {
    if (listings.some((l) => l.householdGender === gender)) {
      covered.push(`householdGender:${gender}`);
    } else {
      missing.push(`householdGender:${gender}`);
    }
  }

  // Price ranges
  const priceRanges = [
    { label: '$0-500', min: 0, max: 500 },
    { label: '$500-1000', min: 500, max: 1000 },
    { label: '$1000-2000', min: 1000, max: 2000 },
    { label: '$2000-5000', min: 2000, max: 5000 },
  ];
  for (const range of priceRanges) {
    if (listings.some((l) => l.price >= range.min && l.price <= range.max)) {
      covered.push(`price:${range.label}`);
    } else {
      missing.push(`price:${range.label}`);
    }
  }

  // Locations (by state)
  const states = [...new Set(CITIES.map((c) => c.state))];
  for (const state of states) {
    if (listings.some((l) => l.location.state === state)) {
      covered.push(`location:${state}`);
    } else {
      missing.push(`location:${state}`);
    }
  }

  // Ratings
  if (listings.some((l) => l.avgRating !== null)) {
    covered.push('hasRating');
  } else {
    missing.push('hasRating');
  }
  if (listings.some((l) => l.avgRating === null)) {
    covered.push('noRating');
  } else {
    missing.push('noRating');
  }

  return { covered, missing };
}

// ============================================
// Specialized Datasets
// ============================================

/**
 * San Francisco area listings (for bounds testing)
 */
export const SF_LISTINGS = TEST_LISTINGS.filter(
  (l) =>
    l.location.lat > 37.5 &&
    l.location.lat < 38.0 &&
    l.location.lng > -123.0 &&
    l.location.lng < -122.0
);

/**
 * SF bounding box for tests
 */
export const SF_BOUNDS = {
  minLat: 37.5,
  maxLat: 38.0,
  minLng: -123.0,
  maxLng: -122.0,
};

/**
 * Tokyo area listings (for antimeridian testing)
 */
export const TOKYO_LISTINGS = TEST_LISTINGS.filter(
  (l) =>
    l.location.lat > 35.0 &&
    l.location.lat < 36.5 &&
    l.location.lng > 139.0 &&
    l.location.lng < 140.5
);

/**
 * Pacific crossing bounds (antimeridian test)
 */
export const ANTIMERIDIAN_BOUNDS = {
  minLat: -40.0,
  maxLat: -15.0,
  minLng: 170.0,
  maxLng: -170.0, // Crosses antimeridian
};

/**
 * Listings with high ratings (for sort testing)
 */
export const HIGH_RATED_LISTINGS = TEST_LISTINGS.filter(
  (l) => l.avgRating !== null && l.avgRating >= 4.5
);

/**
 * Budget listings (for price range testing)
 */
export const BUDGET_LISTINGS = TEST_LISTINGS.filter((l) => l.price < 1000);

/**
 * Luxury listings (for price range testing)
 */
export const LUXURY_LISTINGS = TEST_LISTINGS.filter((l) => l.price >= 3000);

// ============================================
// Filter Application Helpers
// ============================================

/**
 * Apply filters to a listing set (for in-memory testing).
 * Mirrors the database query logic for verification.
 */
export function applyFilters(
  listings: TestListing[],
  filters: {
    query?: string;
    minPrice?: number;
    maxPrice?: number;
    roomType?: string;
    amenities?: string[];
    houseRules?: string[];
    languages?: string[];
    leaseDuration?: string;
    genderPreference?: string;
    householdGender?: string;
    bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  }
): TestListing[] {
  let result = listings.filter((l) => l.status === 'ACTIVE' && l.availableSlots > 0);

  // Query (text search)
  if (filters.query) {
    const q = filters.query.toLowerCase();
    result = result.filter(
      (l) =>
        l.title.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q) ||
        l.location.city.toLowerCase().includes(q) ||
        l.location.state.toLowerCase().includes(q)
    );
  }

  // Price range
  if (filters.minPrice !== undefined) {
    result = result.filter((l) => l.price >= filters.minPrice!);
  }
  if (filters.maxPrice !== undefined) {
    result = result.filter((l) => l.price <= filters.maxPrice!);
  }

  // Room type
  if (filters.roomType && filters.roomType !== 'any') {
    result = result.filter(
      (l) => l.roomType.toLowerCase() === filters.roomType!.toLowerCase()
    );
  }

  // Amenities (AND logic)
  if (filters.amenities?.length) {
    result = result.filter((l) =>
      filters.amenities!.every((a) =>
        l.amenities.some((la) => la.toLowerCase().includes(a.toLowerCase()))
      )
    );
  }

  // House rules (AND logic)
  if (filters.houseRules?.length) {
    result = result.filter((l) =>
      filters.houseRules!.every((r) =>
        l.houseRules.some((lr) => lr.toLowerCase() === r.toLowerCase())
      )
    );
  }

  // Languages (OR logic)
  if (filters.languages?.length) {
    result = result.filter((l) =>
      filters.languages!.some((lang) => l.languages.includes(lang.toLowerCase()))
    );
  }

  // Lease duration
  if (filters.leaseDuration && filters.leaseDuration !== 'any') {
    result = result.filter(
      (l) => l.leaseDuration.toLowerCase() === filters.leaseDuration!.toLowerCase()
    );
  }

  // Gender preference
  if (filters.genderPreference && filters.genderPreference !== 'any') {
    result = result.filter(
      (l) => l.genderPreference.toLowerCase() === filters.genderPreference!.toLowerCase()
    );
  }

  // Household gender
  if (filters.householdGender && filters.householdGender !== 'any') {
    result = result.filter(
      (l) => l.householdGender.toLowerCase() === filters.householdGender!.toLowerCase()
    );
  }

  // Bounds
  if (filters.bounds) {
    const { minLat, maxLat, minLng, maxLng } = filters.bounds;
    result = result.filter((l) => {
      const { lat, lng } = l.location;
      if (lat < minLat || lat > maxLat) return false;

      // Handle antimeridian
      if (minLng <= maxLng) {
        // Normal case
        return lng >= minLng && lng <= maxLng;
      } else {
        // Antimeridian crossing
        return lng >= minLng || lng <= maxLng;
      }
    });
  }

  return result;
}

/**
 * Sort listings (mirrors database sort)
 */
export function sortListings(
  listings: TestListing[],
  sort: SortOption = 'recommended'
): TestListing[] {
  const sorted = [...listings];

  switch (sort) {
    case 'price_asc':
      return sorted.sort((a, b) => {
        if (a.price !== b.price) return a.price - b.price;
        return b.createdAt.getTime() - a.createdAt.getTime();
      });

    case 'price_desc':
      return sorted.sort((a, b) => {
        if (a.price !== b.price) return b.price - a.price;
        return b.createdAt.getTime() - a.createdAt.getTime();
      });

    case 'newest':
      return sorted.sort((a, b) => {
        const timeDiff = b.createdAt.getTime() - a.createdAt.getTime();
        if (timeDiff !== 0) return timeDiff;
        return a.id.localeCompare(b.id);
      });

    case 'rating':
      return sorted.sort((a, b) => {
        const ratingA = a.avgRating ?? 0;
        const ratingB = b.avgRating ?? 0;
        if (ratingA !== ratingB) return ratingB - ratingA;
        if (a.reviewCount !== b.reviewCount) return b.reviewCount - a.reviewCount;
        return b.createdAt.getTime() - a.createdAt.getTime();
      });

    case 'recommended':
    default:
      return sorted.sort((a, b) => {
        const scoreA = (a.avgRating ?? 0) * 20 + a.viewCount * 0.1 + a.reviewCount * 5;
        const scoreB = (b.avgRating ?? 0) * 20 + b.viewCount * 0.1 + b.reviewCount * 5;
        if (scoreA !== scoreB) return scoreB - scoreA;
        return b.createdAt.getTime() - a.createdAt.getTime();
      });
  }
}

/**
 * Paginate listings
 */
export function paginateListings(
  listings: TestListing[],
  page: number,
  limit: number
): { items: TestListing[]; total: number; totalPages: number } {
  const total = listings.length;
  const totalPages = Math.ceil(total / limit);
  const offset = (page - 1) * limit;
  const items = listings.slice(offset, offset + limit);

  return { items, total, totalPages };
}
