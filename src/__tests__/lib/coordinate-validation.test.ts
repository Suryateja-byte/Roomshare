/**
 * Tests for shared coordinate parsing and validation utilities.
 * Covers: parseCoordinate, validateLatitude, validateLongitude,
 * validateBounds, validateCoordinates.
 */

import {
  parseCoordinate,
  validateLatitude,
  validateLongitude,
  validateBounds,
  validateCoordinates,
} from '@/lib/validation';

describe('parseCoordinate', () => {
  it('parses valid numeric strings', () => {
    expect(parseCoordinate('37.7749')).toBeCloseTo(37.7749);
    expect(parseCoordinate('-122.4194')).toBeCloseTo(-122.4194);
    expect(parseCoordinate('0')).toBe(0);
    expect(parseCoordinate('-0')).toBeCloseTo(0);
  });

  it('parses valid numbers', () => {
    expect(parseCoordinate(37.7749)).toBeCloseTo(37.7749);
    expect(parseCoordinate(0)).toBe(0);
    expect(parseCoordinate(-90)).toBe(-90);
  });

  it('returns null for "abc" (non-numeric string)', () => {
    expect(parseCoordinate('abc')).toBeNull();
  });

  it('returns null for "NaN"', () => {
    expect(parseCoordinate('NaN')).toBeNull();
  });

  it('returns null for "Infinity" and "-Infinity"', () => {
    expect(parseCoordinate('Infinity')).toBeNull();
    expect(parseCoordinate('-Infinity')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseCoordinate('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(parseCoordinate('   ')).toBeNull();
  });

  it('returns null for null and undefined', () => {
    expect(parseCoordinate(null)).toBeNull();
    expect(parseCoordinate(undefined)).toBeNull();
  });

  it('returns null for NaN number', () => {
    expect(parseCoordinate(NaN)).toBeNull();
  });

  it('returns null for Infinity number', () => {
    expect(parseCoordinate(Infinity)).toBeNull();
    expect(parseCoordinate(-Infinity)).toBeNull();
  });

  it('handles strings with leading/trailing whitespace', () => {
    expect(parseCoordinate('  37.5  ')).toBeCloseTo(37.5);
  });

  it('returns null for non-string/non-number types', () => {
    expect(parseCoordinate({})).toBeNull();
    expect(parseCoordinate([])).toBeNull();
    expect(parseCoordinate(true)).toBeNull();
  });
});

describe('validateLatitude', () => {
  it('accepts valid latitudes', () => {
    expect(validateLatitude(0)).toBe(true);
    expect(validateLatitude(45)).toBe(true);
    expect(validateLatitude(-45)).toBe(true);
    expect(validateLatitude(90)).toBe(true);
    expect(validateLatitude(-90)).toBe(true);
  });

  it('rejects out-of-range latitudes', () => {
    expect(validateLatitude(90.1)).toBe(false);
    expect(validateLatitude(-90.1)).toBe(false);
    expect(validateLatitude(180)).toBe(false);
    expect(validateLatitude(-180)).toBe(false);
  });

  it('rejects NaN and Infinity', () => {
    expect(validateLatitude(NaN)).toBe(false);
    expect(validateLatitude(Infinity)).toBe(false);
    expect(validateLatitude(-Infinity)).toBe(false);
  });
});

describe('validateLongitude', () => {
  it('accepts valid longitudes', () => {
    expect(validateLongitude(0)).toBe(true);
    expect(validateLongitude(180)).toBe(true);
    expect(validateLongitude(-180)).toBe(true);
    expect(validateLongitude(122.4)).toBe(true);
  });

  it('rejects out-of-range longitudes', () => {
    expect(validateLongitude(180.1)).toBe(false);
    expect(validateLongitude(-180.1)).toBe(false);
    expect(validateLongitude(360)).toBe(false);
  });

  it('rejects NaN and Infinity', () => {
    expect(validateLongitude(NaN)).toBe(false);
    expect(validateLongitude(Infinity)).toBe(false);
  });
});

describe('validateBounds', () => {
  it('accepts valid bounds', () => {
    expect(validateBounds({
      minLat: 37.7, maxLat: 37.8, minLng: -122.5, maxLng: -122.4,
    })).toBe(true);
  });

  it('rejects when minLat >= maxLat', () => {
    expect(validateBounds({
      minLat: 38, maxLat: 37, minLng: -122.5, maxLng: -122.4,
    })).toBe(false);
    expect(validateBounds({
      minLat: 37, maxLat: 37, minLng: -122.5, maxLng: -122.4,
    })).toBe(false);
  });

  it('rejects out-of-range values', () => {
    expect(validateBounds({
      minLat: -91, maxLat: 37.8, minLng: -122.5, maxLng: -122.4,
    })).toBe(false);
    expect(validateBounds({
      minLat: 37.7, maxLat: 37.8, minLng: -181, maxLng: -122.4,
    })).toBe(false);
  });

  it('rejects NaN values', () => {
    expect(validateBounds({
      minLat: NaN, maxLat: 37.8, minLng: -122.5, maxLng: -122.4,
    })).toBe(false);
  });
});

describe('validateCoordinates', () => {
  it('accepts valid number coordinates', () => {
    const result = validateCoordinates(37.7749, -122.4194);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.lat).toBeCloseTo(37.7749);
      expect(result.lng).toBeCloseTo(-122.4194);
    }
  });

  it('accepts string coordinates', () => {
    const result = validateCoordinates('37.7749', '-122.4194');
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.lat).toBeCloseTo(37.7749);
      expect(result.lng).toBeCloseTo(-122.4194);
    }
  });

  it('rejects non-numeric inputs', () => {
    expect(validateCoordinates('abc', '-122')).toEqual({ valid: false });
  });

  it('rejects NaN numbers', () => {
    expect(validateCoordinates(NaN, -122)).toEqual({ valid: false });
    expect(validateCoordinates(37, NaN)).toEqual({ valid: false });
  });

  it('rejects out-of-range coordinates', () => {
    expect(validateCoordinates(91, -122)).toEqual({ valid: false });
    expect(validateCoordinates(37, 181)).toEqual({ valid: false });
  });

  it('rejects null/undefined', () => {
    expect(validateCoordinates(null, null)).toEqual({ valid: false });
    expect(validateCoordinates(undefined, undefined)).toEqual({ valid: false });
  });
});
