/**
 * Unit tests for geographic distance utilities
 */

import {
  haversineMeters,
  haversineMiles,
  formatDistance,
  estimateWalkMins,
  formatWalkTime,
  walkMinutesToMeters,
  metersToMiles,
  milesToMeters,
  getWalkabilityRings,
} from '@/lib/geo/distance';

describe('haversineMeters', () => {
  it('should return 0 for identical points', () => {
    const distance = haversineMeters(37.7749, -122.4194, 37.7749, -122.4194);
    expect(distance).toBe(0);
  });

  it('should calculate distance between SF and LA (~559km)', () => {
    // San Francisco: 37.7749, -122.4194
    // Los Angeles: 34.0522, -118.2437
    const distance = haversineMeters(37.7749, -122.4194, 34.0522, -118.2437);
    // Expected: ~559,000 meters (559 km)
    expect(distance).toBeGreaterThan(550000);
    expect(distance).toBeLessThan(570000);
  });

  it('should calculate short distance (~1 mile = 1609m)', () => {
    // Moving ~1 mile north in SF (approximately 0.0145 degrees latitude)
    const distance = haversineMeters(37.7749, -122.4194, 37.7749 + 0.0145, -122.4194);
    expect(distance).toBeGreaterThan(1500);
    expect(distance).toBeLessThan(1700);
  });

  it('should handle crossing the equator', () => {
    const distance = haversineMeters(1, 0, -1, 0);
    // 2 degrees of latitude ≈ 222 km
    expect(distance).toBeGreaterThan(220000);
    expect(distance).toBeLessThan(224000);
  });

  it('should handle crossing the prime meridian', () => {
    const distance = haversineMeters(0, -1, 0, 1);
    // 2 degrees of longitude at equator ≈ 222 km
    expect(distance).toBeGreaterThan(220000);
    expect(distance).toBeLessThan(224000);
  });
});

describe('haversineMiles', () => {
  it('should return 0 for identical points', () => {
    const distance = haversineMiles(37.7749, -122.4194, 37.7749, -122.4194);
    expect(distance).toBe(0);
  });

  it('should calculate distance between SF and LA (~347 miles)', () => {
    const distance = haversineMiles(37.7749, -122.4194, 34.0522, -118.2437);
    expect(distance).toBeGreaterThan(340);
    expect(distance).toBeLessThan(355);
  });

  it('should be consistent with haversineMeters conversion', () => {
    const lat1 = 37.7749, lng1 = -122.4194;
    const lat2 = 37.8, lng2 = -122.4;

    const miles = haversineMiles(lat1, lng1, lat2, lng2);
    const meters = haversineMeters(lat1, lng1, lat2, lng2);

    // 1 mile = 1609.344 meters
    expect(miles * 1609.344).toBeCloseTo(meters, 1);
  });
});

describe('formatDistance', () => {
  it('should format distances under 0.1 miles in feet', () => {
    expect(formatDistance(0.05)).toBe('264 ft');
    expect(formatDistance(0.01)).toBe('53 ft');
    expect(formatDistance(0.099)).toBe('523 ft');
  });

  it('should format distances at 0.1 miles threshold in miles', () => {
    expect(formatDistance(0.1)).toBe('0.1 mi');
  });

  it('should format distances above 0.1 miles in miles with 1 decimal', () => {
    expect(formatDistance(0.3)).toBe('0.3 mi');
    expect(formatDistance(1.0)).toBe('1.0 mi');
    expect(formatDistance(2.5)).toBe('2.5 mi');
    expect(formatDistance(10.123)).toBe('10.1 mi');
  });

  it('should handle edge case of 0 distance', () => {
    expect(formatDistance(0)).toBe('0 ft');
  });

  it('should round feet to nearest integer', () => {
    // 0.05 miles = 264 feet (exactly)
    expect(formatDistance(0.05)).toBe('264 ft');
  });
});

describe('estimateWalkMins', () => {
  it('should estimate 20 minutes per mile (3 mph walking speed)', () => {
    expect(estimateWalkMins(1)).toBe(20);
  });

  it('should estimate 10 minutes for half mile', () => {
    expect(estimateWalkMins(0.5)).toBe(10);
  });

  it('should return 0 for 0 distance', () => {
    expect(estimateWalkMins(0)).toBe(0);
  });

  it('should round to nearest minute', () => {
    // 0.3 miles = 6 minutes
    expect(estimateWalkMins(0.3)).toBe(6);
    // 0.25 miles = 5 minutes
    expect(estimateWalkMins(0.25)).toBe(5);
  });

  it('should handle long distances', () => {
    // 3 miles = 60 minutes
    expect(estimateWalkMins(3)).toBe(60);
  });
});

describe('formatWalkTime', () => {
  it('should format times under 1 minute', () => {
    expect(formatWalkTime(0)).toBe('< 1 min walk');
    expect(formatWalkTime(0.5)).toBe('< 1 min walk');
  });

  it('should format times in minutes', () => {
    expect(formatWalkTime(1)).toBe('~1 min walk');
    expect(formatWalkTime(5)).toBe('~5 min walk');
    expect(formatWalkTime(15)).toBe('~15 min walk');
    expect(formatWalkTime(59)).toBe('~59 min walk');
  });

  it('should format times at exactly 1 hour', () => {
    expect(formatWalkTime(60)).toBe('~1 hr walk');
  });

  it('should format times over 1 hour', () => {
    expect(formatWalkTime(65)).toBe('~1 hr 5 min walk');
    expect(formatWalkTime(90)).toBe('~1 hr 30 min walk');
    expect(formatWalkTime(120)).toBe('~2 hr walk');
    expect(formatWalkTime(125)).toBe('~2 hr 5 min walk');
  });
});

describe('walkMinutesToMeters', () => {
  it('should convert 5 minutes to ~402 meters', () => {
    const meters = walkMinutesToMeters(5);
    // 5 min at 3 mph = 0.25 miles = ~402 meters
    expect(meters).toBeGreaterThan(400);
    expect(meters).toBeLessThan(410);
  });

  it('should convert 20 minutes to ~1609 meters (1 mile)', () => {
    const meters = walkMinutesToMeters(20);
    expect(meters).toBeCloseTo(1609.344, 0);
  });

  it('should return 0 for 0 minutes', () => {
    expect(walkMinutesToMeters(0)).toBe(0);
  });
});

describe('metersToMiles', () => {
  it('should convert 1609.344 meters to 1 mile', () => {
    expect(metersToMiles(1609.344)).toBeCloseTo(1, 5);
  });

  it('should convert 1000 meters to ~0.621 miles', () => {
    expect(metersToMiles(1000)).toBeCloseTo(0.6214, 3);
  });

  it('should return 0 for 0 meters', () => {
    expect(metersToMiles(0)).toBe(0);
  });
});

describe('milesToMeters', () => {
  it('should convert 1 mile to 1609.344 meters', () => {
    expect(milesToMeters(1)).toBeCloseTo(1609.344, 3);
  });

  it('should convert 0.5 miles to ~804.7 meters', () => {
    expect(milesToMeters(0.5)).toBeCloseTo(804.672, 2);
  });

  it('should return 0 for 0 miles', () => {
    expect(milesToMeters(0)).toBe(0);
  });

  it('should be inverse of metersToMiles', () => {
    const miles = 2.5;
    expect(metersToMiles(milesToMeters(miles))).toBeCloseTo(miles, 10);
  });
});

describe('getWalkabilityRings', () => {
  it('should return 3 rings', () => {
    const rings = getWalkabilityRings();
    expect(rings).toHaveLength(3);
  });

  it('should return rings for 5, 10, and 15 minutes', () => {
    const rings = getWalkabilityRings();
    expect(rings[0].minutes).toBe(5);
    expect(rings[1].minutes).toBe(10);
    expect(rings[2].minutes).toBe(15);
  });

  it('should have correct distances for each ring', () => {
    const rings = getWalkabilityRings();

    // 5 min at 3mph = 0.25 miles = ~402m
    expect(rings[0].meters).toBeGreaterThan(400);
    expect(rings[0].meters).toBeLessThan(410);

    // 10 min = ~805m
    expect(rings[1].meters).toBeGreaterThan(800);
    expect(rings[1].meters).toBeLessThan(810);

    // 15 min = ~1207m
    expect(rings[2].meters).toBeGreaterThan(1200);
    expect(rings[2].meters).toBeLessThan(1215);
  });

  it('should return rings in increasing order of distance', () => {
    const rings = getWalkabilityRings();
    expect(rings[0].meters).toBeLessThan(rings[1].meters);
    expect(rings[1].meters).toBeLessThan(rings[2].meters);
  });
});
