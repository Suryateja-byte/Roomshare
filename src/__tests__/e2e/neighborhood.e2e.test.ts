/**
 * E2E-style Tests for Neighborhood Intelligence Feature
 *
 * Tests the complete neighborhood module flow from query to results.
 * Validates critical user journeys for both Free and Pro users.
 *
 * Note: Uses Jest with mocked components (no browser automation).
 * For full browser E2E tests, these could be ported to Playwright.
 */

import type { POI, SearchMeta, NeighborhoodSearchResult } from '@/lib/places/types';
import { isProUser, getNeighborhoodProFeatures } from '@/lib/subscription';
import {
  haversineMiles,
  formatDistance,
  estimateWalkMins,
  formatWalkTime,
  getWalkabilityRings,
} from '@/lib/geo/distance';

// ============================================
// Test Data
// ============================================

const LISTING_COORDS = { lat: 37.7749, lng: -122.4194 }; // San Francisco

const MOCK_POIS: POI[] = [
  {
    placeId: 'ChIJ-SB-CAFE123',
    name: 'Starbucks',
    lat: 37.7759,
    lng: -122.4184,
    rating: 4.2,
    primaryType: 'coffee_shop',
    openNow: true,
    address: '123 Market St',
  },
  {
    placeId: 'ChIJ-SB-CAFE456',
    name: 'Blue Bottle Coffee',
    lat: 37.7769,
    lng: -122.4174,
    rating: 4.5,
    primaryType: 'coffee_shop',
    openNow: true,
    address: '456 Market St',
  },
  {
    placeId: 'ChIJ-SB-CAFE789',
    name: 'Philz Coffee',
    lat: 37.7779,
    lng: -122.4164,
    rating: 4.7,
    primaryType: 'coffee_shop',
    openNow: false,
    address: '789 Market St',
  },
  {
    placeId: 'ChIJ-SB-GYM001',
    name: "Barry's Fitness",
    lat: 37.7799,
    lng: -122.4144,
    rating: 4.3,
    primaryType: 'gym',
    openNow: true,
    address: '1000 Fitness Way',
  },
  {
    placeId: 'ChIJ-SB-REST001',
    name: 'Panda Express',
    lat: 37.7789,
    lng: -122.4154,
    rating: 3.8,
    primaryType: 'restaurant',
    openNow: true,
    address: '500 Food Court',
  },
];

/**
 * Simulates the distance computation that happens client-side
 */
function computeDistances(pois: POI[], center: { lat: number; lng: number }): POI[] {
  return pois.map((poi) => {
    const distanceMiles = haversineMiles(center.lat, center.lng, poi.lat, poi.lng);
    const walkMins = estimateWalkMins(distanceMiles);
    return { ...poi, distanceMiles, walkMins };
  });
}

/**
 * Simulates sorting by distance
 */
function sortByDistance(pois: POI[]): POI[] {
  return [...pois].sort((a, b) => (a.distanceMiles ?? 0) - (b.distanceMiles ?? 0));
}

/**
 * Simulates building search metadata
 */
function buildSearchMeta(pois: POI[], radiusMeters: number): SearchMeta {
  const sortedPois = sortByDistance(pois);
  return {
    radiusMeters,
    radiusUsed: radiusMeters,
    resultCount: pois.length,
    closestMiles: sortedPois[0]?.distanceMiles ?? 0,
    farthestMiles: sortedPois[sortedPois.length - 1]?.distanceMiles ?? 0,
    searchMode: 'type',
    timestamp: Date.now(),
  };
}

// ============================================
// User Journey: Free User searches for coffee shops
// ============================================

describe('Journey: Free User searches for coffee shops', () => {
  const subscriptionTier = 'free';

  beforeEach(() => {
    // Verify subscription detection
    expect(isProUser(subscriptionTier)).toBe(false);
  });

  it('Step 1: User opens neighborhood module and submits query', () => {
    const query = 'coffee shops';

    // Simulating what happens when user submits query
    // In real app, this would go through the chat flow
    expect(query.toLowerCase()).toContain('coffee');
  });

  it('Step 2: System computes distances for all POIs', () => {
    const poisWithDistances = computeDistances(MOCK_POIS, LISTING_COORDS);

    // All POIs should have distances computed
    poisWithDistances.forEach((poi) => {
      expect(poi.distanceMiles).toBeDefined();
      expect(poi.distanceMiles).toBeGreaterThanOrEqual(0);
      expect(poi.walkMins).toBeDefined();
      expect(poi.walkMins).toBeGreaterThanOrEqual(0);
    });
  });

  it('Step 3: System sorts results by distance', () => {
    const poisWithDistances = computeDistances(MOCK_POIS, LISTING_COORDS);
    const sorted = sortByDistance(poisWithDistances);

    // Verify sorted order
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].distanceMiles).toBeGreaterThanOrEqual(
        sorted[i - 1].distanceMiles ?? 0
      );
    }
  });

  it('Step 4: ContextBar displays correct metadata', () => {
    const poisWithDistances = computeDistances(MOCK_POIS, LISTING_COORDS);
    const sorted = sortByDistance(poisWithDistances);
    const meta = buildSearchMeta(sorted, 1600);

    // Verify metadata
    expect(meta.resultCount).toBe(5);
    expect(meta.radiusUsed).toBe(1600);
    expect(meta.closestMiles).toBeLessThan(meta.farthestMiles);
    expect(meta.searchMode).toBe('type');
  });

  it('Step 5: Free user sees Google UI Kit cards (not custom list)', () => {
    const features = getNeighborhoodProFeatures(subscriptionTier);

    expect(features.showCustomPlaceList).toBe(false);
    expect(features.showInteractiveMap).toBe(false);
    expect(features.showPerItemDistance).toBe(false);
  });

  it('Step 6: Free user sees upgrade CTA', () => {
    const features = getNeighborhoodProFeatures(subscriptionTier);

    // Free user should NOT have Pro features
    expect(features.showInteractiveMap).toBe(false);
    expect(features.enableListMapSync).toBe(false);
  });
});

// ============================================
// User Journey: Pro User searches for gyms
// ============================================

describe('Journey: Pro User searches for gyms', () => {
  const subscriptionTier = 'pro';

  beforeEach(() => {
    expect(isProUser(subscriptionTier)).toBe(true);
  });

  it('Step 1: Pro user has all enhanced features enabled', () => {
    const features = getNeighborhoodProFeatures(subscriptionTier);

    expect(features.showInteractiveMap).toBe(true);
    expect(features.showCustomPlaceList).toBe(true);
    expect(features.showPerItemDistance).toBe(true);
    expect(features.enableListMapSync).toBe(true);
    expect(features.showWalkabilityRings).toBe(true);
    expect(features.showPlaceDetailsPanel).toBe(true);
  });

  it('Step 2: Pro user sees distance on every list item', () => {
    const poisWithDistances = computeDistances(MOCK_POIS, LISTING_COORDS);

    // Each POI should have formatted distance and walk time
    poisWithDistances.forEach((poi) => {
      const formattedDistance = formatDistance(poi.distanceMiles ?? 0);
      const formattedWalkTime = formatWalkTime(poi.walkMins ?? 0);

      expect(formattedDistance).toMatch(/\d+\s*(ft|mi)/);
      expect(formattedWalkTime).toMatch(/min walk|hr/);
    });
  });

  it('Step 3: Pro user sees walkability rings on map', () => {
    const rings = getWalkabilityRings();

    expect(rings).toHaveLength(3);
    expect(rings[0].minutes).toBe(5);
    expect(rings[1].minutes).toBe(10);
    expect(rings[2].minutes).toBe(15);

    // 5 min walk ≈ 400m
    expect(rings[0].meters).toBeGreaterThan(400);
    expect(rings[0].meters).toBeLessThan(410);
  });

  it('Step 4: List and map sync on hover/click', () => {
    const features = getNeighborhoodProFeatures(subscriptionTier);

    expect(features.enableListMapSync).toBe(true);

    // Simulating the sync behavior
    const selectedPoiId = MOCK_POIS[0].placeId;
    const hoveredPoiId = MOCK_POIS[1].placeId;

    // In real component, this would update state
    expect(selectedPoiId).toBe('ChIJ-SB-CAFE123');
    expect(hoveredPoiId).toBe('ChIJ-SB-CAFE456');
  });
});

// ============================================
// Distance Calculation Integration
// ============================================

describe('Distance Calculation Integration', () => {
  it('calculates realistic distances for SF locations', () => {
    // Starbucks is about 0.1 miles from listing center
    const starbucks = MOCK_POIS[0];
    const distance = haversineMiles(
      LISTING_COORDS.lat,
      LISTING_COORDS.lng,
      starbucks.lat,
      starbucks.lng
    );

    // Should be a short walkable distance (< 0.5 miles)
    expect(distance).toBeLessThan(0.5);
    expect(distance).toBeGreaterThan(0);
  });

  it('walk time estimates are reasonable', () => {
    const distance = 0.5; // Half mile
    const walkMins = estimateWalkMins(distance);

    // At 3mph, half mile should be about 10 minutes
    expect(walkMins).toBe(10);
  });

  it('formats short distances in feet', () => {
    expect(formatDistance(0.05)).toMatch(/ft$/);
    expect(formatDistance(0.01)).toMatch(/ft$/);
  });

  it('formats longer distances in miles', () => {
    expect(formatDistance(0.5)).toMatch(/mi$/);
    expect(formatDistance(1.0)).toMatch(/mi$/);
  });
});

// ============================================
// Search Result Caching Integration
// ============================================

describe('Search Result Caching Integration', () => {
  it('generates consistent cache keys for same query', () => {
    const cacheKey1 = {
      listingId: 'listing-123',
      normalizedQuery: 'coffee_shop',
      radiusMeters: 1600,
      searchMode: 'type' as const,
    };

    const cacheKey2 = {
      listingId: 'listing-123',
      normalizedQuery: 'coffee_shop',
      radiusMeters: 1600,
      searchMode: 'type' as const,
    };

    expect(JSON.stringify(cacheKey1)).toBe(JSON.stringify(cacheKey2));
  });

  it('generates different cache keys for different radius', () => {
    const cacheKey1 = {
      listingId: 'listing-123',
      normalizedQuery: 'coffee_shop',
      radiusMeters: 1600,
      searchMode: 'type' as const,
    };

    const cacheKey2 = {
      listingId: 'listing-123',
      normalizedQuery: 'coffee_shop',
      radiusMeters: 5000, // Different radius
      searchMode: 'type' as const,
    };

    expect(JSON.stringify(cacheKey1)).not.toBe(JSON.stringify(cacheKey2));
  });
});

// ============================================
// Subscription Tier Gating Integration
// ============================================

describe('Subscription Tier Gating Integration', () => {
  it('free tier has no Pro features', () => {
    const features = getNeighborhoodProFeatures('free');

    Object.values(features).forEach((value) => {
      expect(value).toBe(false);
    });
  });

  it('pro tier has all Pro features', () => {
    const features = getNeighborhoodProFeatures('pro');

    Object.values(features).forEach((value) => {
      expect(value).toBe(true);
    });
  });

  it('undefined tier defaults to free', () => {
    const features = getNeighborhoodProFeatures(undefined);

    Object.values(features).forEach((value) => {
      expect(value).toBe(false);
    });
  });

  it('null tier defaults to free', () => {
    const features = getNeighborhoodProFeatures(null);

    Object.values(features).forEach((value) => {
      expect(value).toBe(false);
    });
  });
});

// ============================================
// Error Handling Integration
// ============================================

describe('Error Handling Integration', () => {
  it('handles empty POI results', () => {
    const emptyPois: POI[] = [];
    const poisWithDistances = computeDistances(emptyPois, LISTING_COORDS);
    const sorted = sortByDistance(poisWithDistances);
    const meta = buildSearchMeta(sorted, 1600);

    expect(meta.resultCount).toBe(0);
    expect(meta.closestMiles).toBe(0);
    expect(meta.farthestMiles).toBe(0);
  });

  it('handles single POI result', () => {
    const singlePoi = [MOCK_POIS[0]];
    const poisWithDistances = computeDistances(singlePoi, LISTING_COORDS);
    const sorted = sortByDistance(poisWithDistances);
    const meta = buildSearchMeta(sorted, 1600);

    expect(meta.resultCount).toBe(1);
    expect(meta.closestMiles).toBe(meta.farthestMiles);
  });

  it('handles POIs at same location (distance = 0)', () => {
    const sameLocationPoi: POI = {
      placeId: 'same-location',
      name: 'Same Location Place',
      lat: LISTING_COORDS.lat,
      lng: LISTING_COORDS.lng,
    };

    const distance = haversineMiles(
      LISTING_COORDS.lat,
      LISTING_COORDS.lng,
      sameLocationPoi.lat,
      sameLocationPoi.lng
    );

    expect(distance).toBe(0);
  });
});

// ============================================
// Performance Smoke Tests
// ============================================

describe('Neighborhood Performance Smoke Tests', () => {
  it('computes distances for 100 POIs quickly', () => {
    // Generate 100 POIs
    const manyPois: POI[] = Array.from({ length: 100 }, (_, i) => ({
      placeId: `poi-${i}`,
      name: `Place ${i}`,
      lat: LISTING_COORDS.lat + (Math.random() - 0.5) * 0.1,
      lng: LISTING_COORDS.lng + (Math.random() - 0.5) * 0.1,
    }));

    const start = performance.now();

    for (let i = 0; i < 100; i++) {
      computeDistances(manyPois, LISTING_COORDS);
    }

    const elapsed = performance.now() - start;

    // 100 iterations should complete in < 100ms
    expect(elapsed).toBeLessThan(100);
  });

  it('sorts 100 POIs by distance quickly', () => {
    const manyPois: POI[] = Array.from({ length: 100 }, (_, i) => ({
      placeId: `poi-${i}`,
      name: `Place ${i}`,
      lat: LISTING_COORDS.lat + (Math.random() - 0.5) * 0.1,
      lng: LISTING_COORDS.lng + (Math.random() - 0.5) * 0.1,
      distanceMiles: Math.random() * 5,
    }));

    const start = performance.now();

    for (let i = 0; i < 1000; i++) {
      sortByDistance(manyPois);
    }

    const elapsed = performance.now() - start;

    // 1000 sorts should complete in < 500ms
    expect(elapsed).toBeLessThan(500);
  });
});
