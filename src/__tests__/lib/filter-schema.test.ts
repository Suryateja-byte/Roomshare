/**
 * Unit tests for filter-schema.ts
 *
 * Tests the canonical filter schema and normalizeFilters() function.
 */

import {
  normalizeFilters,
  validateFilters,
  isEmptyFilters,
  filtersToSearchParams,
  NormalizedFilters,
  MAX_SAFE_PRICE,
  MAX_SAFE_PAGE,
  MAX_ARRAY_ITEMS,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  VALID_AMENITIES,
  VALID_HOUSE_RULES,
  VALID_ROOM_TYPES,
  VALID_LEASE_DURATIONS,
  VALID_GENDER_PREFERENCES,
  VALID_HOUSEHOLD_GENDERS,
  VALID_SORT_OPTIONS,
} from '@/lib/filter-schema';

// ============================================
// Helper: Get dates for testing
// ============================================

const formatLocalDate = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().split('T')[0];
};

const today = formatLocalDate(new Date());
const tomorrow = formatLocalDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
const nextYear = (() => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return formatLocalDate(d);
})();
const farFuture = (() => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 3);
  return formatLocalDate(d);
})();

// ============================================
// normalizeFilters - Basic
// ============================================

describe('normalizeFilters - basic', () => {
  it('returns defaults for undefined input', () => {
    const result = normalizeFilters(undefined);
    expect(result).toEqual({ page: 1, limit: DEFAULT_PAGE_SIZE });
  });

  it('returns defaults for null input', () => {
    const result = normalizeFilters(null);
    expect(result).toEqual({ page: 1, limit: DEFAULT_PAGE_SIZE });
  });

  it('returns defaults for empty object', () => {
    const result = normalizeFilters({});
    expect(result).toEqual({ page: 1, limit: DEFAULT_PAGE_SIZE });
  });

  it('returns defaults for non-object input', () => {
    expect(normalizeFilters('string')).toEqual({ page: 1, limit: DEFAULT_PAGE_SIZE });
    expect(normalizeFilters(123)).toEqual({ page: 1, limit: DEFAULT_PAGE_SIZE });
    expect(normalizeFilters(true)).toEqual({ page: 1, limit: DEFAULT_PAGE_SIZE });
    expect(normalizeFilters([])).toEqual({ page: 1, limit: DEFAULT_PAGE_SIZE });
  });
});

// ============================================
// normalizeFilters - Query
// ============================================

describe('normalizeFilters - query', () => {
  it('trims whitespace', () => {
    const result = normalizeFilters({ query: '  downtown  ' });
    expect(result.query).toBe('downtown');
  });

  it('preserves unicode', () => {
    const result = normalizeFilters({ query: '北京' });
    expect(result.query).toBe('北京');
  });

  it('removes whitespace-only query', () => {
    const result = normalizeFilters({ query: '   ' });
    expect(result.query).toBeUndefined();
  });

  it('removes empty query', () => {
    const result = normalizeFilters({ query: '' });
    expect(result.query).toBeUndefined();
  });

  it('ignores non-string query', () => {
    const result = normalizeFilters({ query: 123 });
    expect(result.query).toBeUndefined();
  });
});

// ============================================
// normalizeFilters - Price
// ============================================

describe('normalizeFilters - price', () => {
  it('accepts valid prices', () => {
    const result = normalizeFilters({ minPrice: 500, maxPrice: 1000 });
    expect(result.minPrice).toBe(500);
    expect(result.maxPrice).toBe(1000);
  });

  it('clamps negative to 0', () => {
    const result = normalizeFilters({ minPrice: -100 });
    expect(result.minPrice).toBe(0);
  });

  it('clamps above MAX_SAFE_PRICE', () => {
    const result = normalizeFilters({ minPrice: MAX_SAFE_PRICE + 1000 });
    expect(result.minPrice).toBe(MAX_SAFE_PRICE);
  });

  // P1-13 FIX: minPrice > maxPrice should throw validation error, not silent swap
  it('throws error if minPrice > maxPrice', () => {
    expect(() => normalizeFilters({ minPrice: 2000, maxPrice: 1000 })).toThrow(
      'minPrice cannot exceed maxPrice'
    );
  });

  it('allows minPrice equal to maxPrice (exact price filter)', () => {
    const result = normalizeFilters({ minPrice: 1500, maxPrice: 1500 });
    expect(result.minPrice).toBe(1500);
    expect(result.maxPrice).toBe(1500);
  });

  it('parses string prices', () => {
    const result = normalizeFilters({ minPrice: '500', maxPrice: '1000' });
    expect(result.minPrice).toBe(500);
    expect(result.maxPrice).toBe(1000);
  });

  it('ignores NaN', () => {
    const result = normalizeFilters({ minPrice: NaN });
    expect(result.minPrice).toBeUndefined();
  });

  it('ignores Infinity', () => {
    const result = normalizeFilters({ minPrice: Infinity });
    expect(result.minPrice).toBeUndefined();
  });

  it('handles decimal prices', () => {
    const result = normalizeFilters({ minPrice: 99.99 });
    expect(result.minPrice).toBe(99.99);
  });
});

// ============================================
// normalizeFilters - Amenities
// ============================================

describe('normalizeFilters - amenities', () => {
  it('accepts valid amenities', () => {
    const result = normalizeFilters({ amenities: ['Wifi', 'Pool'] });
    expect(result.amenities).toEqual(['Pool', 'Wifi']); // sorted
  });

  it('normalizes case', () => {
    const result = normalizeFilters({ amenities: ['wifi', 'POOL'] });
    expect(result.amenities).toEqual(['Pool', 'Wifi']); // sorted
  });

  it('drops invalid values', () => {
    const result = normalizeFilters({ amenities: ['Wifi', 'Invalid', 'Pool'] });
    expect(result.amenities).toEqual(['Pool', 'Wifi']); // sorted
  });

  it('deduplicates', () => {
    const result = normalizeFilters({ amenities: ['Wifi', 'wifi', 'WIFI'] });
    expect(result.amenities).toEqual(['Wifi']);
  });

  it('handles comma-separated string', () => {
    const result = normalizeFilters({ amenities: 'Wifi,Pool' });
    expect(result.amenities).toEqual(['Pool', 'Wifi']); // sorted
  });

  it('returns undefined for empty array', () => {
    const result = normalizeFilters({ amenities: [] });
    expect(result.amenities).toBeUndefined();
  });

  it('returns undefined for all-invalid array', () => {
    const result = normalizeFilters({ amenities: ['Invalid1', 'Invalid2'] });
    expect(result.amenities).toBeUndefined();
  });

  it('limits to MAX_ARRAY_ITEMS', () => {
    const manyAmenities = Array(30).fill('Wifi');
    const result = normalizeFilters({ amenities: manyAmenities });
    expect(result.amenities?.length).toBeLessThanOrEqual(MAX_ARRAY_ITEMS);
  });
});

// ============================================
// normalizeFilters - House Rules
// ============================================

describe('normalizeFilters - houseRules', () => {
  it('accepts valid house rules', () => {
    const result = normalizeFilters({ houseRules: ['Pets allowed', 'Guests allowed'] });
    expect(result.houseRules).toEqual(['Guests allowed', 'Pets allowed']); // sorted
  });

  it('normalizes case', () => {
    const result = normalizeFilters({ houseRules: ['pets allowed'] });
    expect(result.houseRules).toEqual(['Pets allowed']);
  });

  it('drops invalid values', () => {
    const result = normalizeFilters({ houseRules: ['Pets allowed', 'No shouting'] });
    expect(result.houseRules).toEqual(['Pets allowed']);
  });
});

// ============================================
// normalizeFilters - Languages
// ============================================

describe('normalizeFilters - languages', () => {
  it('accepts valid language codes', () => {
    const result = normalizeFilters({ languages: ['en', 'es'] });
    expect(result.languages).toEqual(['en', 'es']); // sorted
  });

  it('normalizes legacy names', () => {
    const result = normalizeFilters({ languages: ['English', 'Spanish'] });
    expect(result.languages).toEqual(['en', 'es']); // sorted
  });

  it('normalizes case', () => {
    const result = normalizeFilters({ languages: ['EN', 'ES'] });
    expect(result.languages).toEqual(['en', 'es']);
  });

  it('drops invalid codes', () => {
    const result = normalizeFilters({ languages: ['en', 'invalid', 'es'] });
    expect(result.languages).toEqual(['en', 'es']);
  });

  it('deduplicates', () => {
    const result = normalizeFilters({ languages: ['en', 'English', 'EN'] });
    expect(result.languages).toEqual(['en']);
  });

  it('handles comma-separated string', () => {
    const result = normalizeFilters({ languages: 'en,es' });
    expect(result.languages).toEqual(['en', 'es']);
  });

  it('limits to MAX_ARRAY_ITEMS', () => {
    const manyLangs = Array(30).fill('en');
    const result = normalizeFilters({ languages: manyLangs });
    expect(result.languages?.length).toBeLessThanOrEqual(MAX_ARRAY_ITEMS);
  });
});

// ============================================
// normalizeFilters - Enum Fields
// ============================================

describe('normalizeFilters - roomType', () => {
  it.each(VALID_ROOM_TYPES.filter((t) => t !== 'any'))('accepts %s', (roomType) => {
    const result = normalizeFilters({ roomType });
    expect(result.roomType).toBe(roomType);
  });

  it('treats "any" as undefined', () => {
    const result = normalizeFilters({ roomType: 'any' });
    expect(result.roomType).toBeUndefined();
  });

  it('normalizes case', () => {
    const result = normalizeFilters({ roomType: 'private room' });
    expect(result.roomType).toBe('Private Room');
  });

  it('ignores invalid value', () => {
    const result = normalizeFilters({ roomType: 'InvalidType' });
    expect(result.roomType).toBeUndefined();
  });
});

describe('normalizeFilters - leaseDuration', () => {
  it.each(VALID_LEASE_DURATIONS.filter((d) => d !== 'any'))('accepts %s', (leaseDuration) => {
    const result = normalizeFilters({ leaseDuration });
    expect(result.leaseDuration).toBe(leaseDuration);
  });

  it('treats "any" as undefined', () => {
    const result = normalizeFilters({ leaseDuration: 'any' });
    expect(result.leaseDuration).toBeUndefined();
  });

  it('normalizes case', () => {
    const result = normalizeFilters({ leaseDuration: '6 MONTHS' });
    expect(result.leaseDuration).toBe('6 months');
  });
});

describe('normalizeFilters - genderPreference', () => {
  it.each(VALID_GENDER_PREFERENCES.filter((g) => g !== 'any'))('accepts %s', (genderPreference) => {
    const result = normalizeFilters({ genderPreference });
    expect(result.genderPreference).toBe(genderPreference);
  });

  it('treats "any" as undefined', () => {
    const result = normalizeFilters({ genderPreference: 'any' });
    expect(result.genderPreference).toBeUndefined();
  });

  it('normalizes case', () => {
    const result = normalizeFilters({ genderPreference: 'female_only' });
    expect(result.genderPreference).toBe('FEMALE_ONLY');
  });
});

describe('normalizeFilters - householdGender', () => {
  it.each(VALID_HOUSEHOLD_GENDERS.filter((g) => g !== 'any'))('accepts %s', (householdGender) => {
    const result = normalizeFilters({ householdGender });
    expect(result.householdGender).toBe(householdGender);
  });

  it('treats "any" as undefined', () => {
    const result = normalizeFilters({ householdGender: 'any' });
    expect(result.householdGender).toBeUndefined();
  });

  it('normalizes case', () => {
    const result = normalizeFilters({ householdGender: 'mixed' });
    expect(result.householdGender).toBe('MIXED');
  });
});

// ============================================
// normalizeFilters - Date
// ============================================

describe('normalizeFilters - moveInDate', () => {
  it('accepts valid future date', () => {
    const result = normalizeFilters({ moveInDate: tomorrow });
    expect(result.moveInDate).toBe(tomorrow);
  });

  it('accepts today', () => {
    const result = normalizeFilters({ moveInDate: today });
    expect(result.moveInDate).toBe(today);
  });

  it('accepts date within 2 years', () => {
    const result = normalizeFilters({ moveInDate: nextYear });
    expect(result.moveInDate).toBe(nextYear);
  });

  it('rejects past date', () => {
    const result = normalizeFilters({ moveInDate: '2000-01-01' });
    expect(result.moveInDate).toBeUndefined();
  });

  it('rejects date > 2 years in future', () => {
    const result = normalizeFilters({ moveInDate: farFuture });
    expect(result.moveInDate).toBeUndefined();
  });

  it('rejects invalid format', () => {
    const result = normalizeFilters({ moveInDate: '2025/01/01' });
    expect(result.moveInDate).toBeUndefined();
  });

  it('rejects invalid date (Feb 30)', () => {
    const result = normalizeFilters({ moveInDate: '2025-02-30' });
    expect(result.moveInDate).toBeUndefined();
  });

  it('trims whitespace', () => {
    const result = normalizeFilters({ moveInDate: `  ${tomorrow}  ` });
    expect(result.moveInDate).toBe(tomorrow);
  });
});

// ============================================
// normalizeFilters - Bounds
// ============================================

describe('normalizeFilters - bounds', () => {
  it('accepts valid bounds', () => {
    const result = normalizeFilters({
      bounds: { minLat: 37, maxLat: 38, minLng: -123, maxLng: -122 },
    });
    expect(result.bounds).toEqual({ minLat: 37, maxLat: 38, minLng: -123, maxLng: -122 });
  });

  it('clamps lat to [-90, 90]', () => {
    const result = normalizeFilters({
      bounds: { minLat: -100, maxLat: 100, minLng: 0, maxLng: 10 },
    });
    expect(result.bounds?.minLat).toBe(-90);
    expect(result.bounds?.maxLat).toBe(90);
  });

  it('clamps lng to [-180, 180]', () => {
    const result = normalizeFilters({
      bounds: { minLat: 0, maxLat: 10, minLng: -200, maxLng: 200 },
    });
    expect(result.bounds?.minLng).toBe(-180);
    expect(result.bounds?.maxLng).toBe(180);
  });

  it('throws on inverted lat', () => {
    expect(() =>
      normalizeFilters({
        bounds: { minLat: 40, maxLat: 30, minLng: 0, maxLng: 10 },
      })
    ).toThrow('minLat cannot exceed maxLat');
  });

  it('passes normal lat bounds through unchanged', () => {
    const result = normalizeFilters({
      bounds: { minLat: 30, maxLat: 40, minLng: 0, maxLng: 10 },
    });
    expect(result.bounds?.minLat).toBe(30);
    expect(result.bounds?.maxLat).toBe(40);
  });

  it('preserves antimeridian lng (does not swap)', () => {
    const result = normalizeFilters({
      bounds: { minLat: 0, maxLat: 10, minLng: 170, maxLng: -170 },
    });
    expect(result.bounds?.minLng).toBe(170);
    expect(result.bounds?.maxLng).toBe(-170);
  });

  it('returns undefined for incomplete bounds', () => {
    const result = normalizeFilters({
      bounds: { minLat: 37, maxLat: 38, minLng: -123 },
    });
    expect(result.bounds).toBeUndefined();
  });

  it('returns undefined for non-finite values', () => {
    const result = normalizeFilters({
      bounds: { minLat: NaN, maxLat: 38, minLng: -123, maxLng: -122 },
    });
    expect(result.bounds).toBeUndefined();
  });
});

// ============================================
// normalizeFilters - Sort
// ============================================

describe('normalizeFilters - sort', () => {
  it.each(VALID_SORT_OPTIONS)('accepts %s', (sort) => {
    const result = normalizeFilters({ sort });
    expect(result.sort).toBe(sort);
  });

  it('normalizes case', () => {
    const result = normalizeFilters({ sort: 'PRICE_ASC' });
    expect(result.sort).toBe('price_asc');
  });

  it('ignores invalid value', () => {
    const result = normalizeFilters({ sort: 'invalid_sort' });
    expect(result.sort).toBeUndefined();
  });

  it('trims whitespace', () => {
    const result = normalizeFilters({ sort: '  newest  ' });
    expect(result.sort).toBe('newest');
  });
});

// ============================================
// normalizeFilters - Pagination
// ============================================

describe('normalizeFilters - pagination', () => {
  it('uses defaults', () => {
    const result = normalizeFilters({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(DEFAULT_PAGE_SIZE);
  });

  it('accepts valid page', () => {
    const result = normalizeFilters({ page: 5 });
    expect(result.page).toBe(5);
  });

  it('clamps page < 1', () => {
    const result = normalizeFilters({ page: 0 });
    expect(result.page).toBe(1);
  });

  it('clamps page > MAX_SAFE_PAGE', () => {
    const result = normalizeFilters({ page: 999 });
    expect(result.page).toBe(MAX_SAFE_PAGE);
  });

  it('accepts valid limit', () => {
    const result = normalizeFilters({ limit: 24 });
    expect(result.limit).toBe(24);
  });

  it('clamps limit > MAX_PAGE_SIZE', () => {
    const result = normalizeFilters({ limit: 500 });
    expect(result.limit).toBe(MAX_PAGE_SIZE);
  });

  it('parses string page', () => {
    const result = normalizeFilters({ page: '3' });
    expect(result.page).toBe(3);
  });
});

// ============================================
// normalizeFilters - Idempotence
// ============================================

describe('normalizeFilters - idempotence', () => {
  it('normalizing twice gives same result', () => {
    const input = {
      query: '  downtown  ',
      minPrice: 500,
      maxPrice: 1000,
      amenities: ['wifi', 'Pool'],
      roomType: 'private room',
      languages: ['English', 'es'],
    };
    const once = normalizeFilters(input);
    const twice = normalizeFilters(once);
    expect(twice).toEqual(once);
  });
});

// ============================================
// validateFilters
// ============================================

describe('validateFilters', () => {
  it('returns success for valid input', () => {
    const result = validateFilters({ query: 'downtown', minPrice: 500 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query).toBe('downtown');
      expect(result.data.minPrice).toBe(500);
    }
  });

  it('returns success even for invalid input (graceful handling)', () => {
    const result = validateFilters({ minPrice: 'not a number' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.minPrice).toBeUndefined();
    }
  });

  // P1-13 FIX: validateFilters should return error for invalid price range
  it('returns error when minPrice exceeds maxPrice', () => {
    const result = validateFilters({ minPrice: 2000, maxPrice: 1000 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toContain('minPrice cannot exceed maxPrice');
    }
  });
});

// ============================================
// isEmptyFilters
// ============================================

describe('isEmptyFilters', () => {
  it('returns true for default filters', () => {
    const result = normalizeFilters({});
    expect(isEmptyFilters(result)).toBe(true);
  });

  it('returns false when query is set', () => {
    const result = normalizeFilters({ query: 'downtown' });
    expect(isEmptyFilters(result)).toBe(false);
  });

  it('returns false when price is set', () => {
    const result = normalizeFilters({ minPrice: 500 });
    expect(isEmptyFilters(result)).toBe(false);
  });

  it('returns false when amenities are set', () => {
    const result = normalizeFilters({ amenities: ['Wifi'] });
    expect(isEmptyFilters(result)).toBe(false);
  });

  it('ignores sort (not a filter)', () => {
    const result = normalizeFilters({ sort: 'price_asc' });
    expect(isEmptyFilters(result)).toBe(true);
  });

  it('ignores pagination (not a filter)', () => {
    const result = normalizeFilters({ page: 2, limit: 24 });
    expect(isEmptyFilters(result)).toBe(true);
  });
});

// ============================================
// filtersToSearchParams
// ============================================

describe('filtersToSearchParams', () => {
  it('converts filters to URLSearchParams', () => {
    const filters = normalizeFilters({
      query: 'downtown',
      minPrice: 500,
      maxPrice: 1000,
      amenities: ['Wifi', 'Pool'],
      roomType: 'Private Room',
      sort: 'price_asc',
      page: 2,
    });

    const params = filtersToSearchParams(filters);

    expect(params.get('q')).toBe('downtown');
    expect(params.get('minPrice')).toBe('500');
    expect(params.get('maxPrice')).toBe('1000');
    expect(params.get('amenities')).toBe('Pool,Wifi'); // sorted
    expect(params.get('roomType')).toBe('Private Room');
    expect(params.get('sort')).toBe('price_asc');
    expect(params.get('page')).toBe('2');
  });

  it('omits default pagination', () => {
    const filters = normalizeFilters({});
    const params = filtersToSearchParams(filters);

    expect(params.get('page')).toBeNull();
    expect(params.get('limit')).toBeNull();
  });

  it('includes bounds', () => {
    const filters = normalizeFilters({
      bounds: { minLat: 37, maxLat: 38, minLng: -123, maxLng: -122 },
    });
    const params = filtersToSearchParams(filters);

    expect(params.get('minLat')).toBe('37');
    expect(params.get('maxLat')).toBe('38');
    expect(params.get('minLng')).toBe('-123');
    expect(params.get('maxLng')).toBe('-122');
  });
});

// ============================================
// Security Tests
// ============================================

describe('normalizeFilters - security', () => {
  it('handles SQL injection in query', () => {
    const result = normalizeFilters({ query: "'; DROP TABLE listings; --" });
    expect(result.query).toBe("'; DROP TABLE listings; --");
    // The value is preserved but parameterized queries prevent injection
  });

  it('handles XSS in query', () => {
    const result = normalizeFilters({ query: '<script>alert("XSS")</script>' });
    expect(result.query).toBe('<script>alert("XSS")</script>');
    // The value is preserved but should be escaped on output
  });

  it('handles prototype pollution attempt', () => {
    const malicious = JSON.parse('{"__proto__": {"polluted": true}}');
    const result = normalizeFilters(malicious);
    expect((result as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it('handles extremely long query', () => {
    const longQuery = 'x'.repeat(1000);
    const result = normalizeFilters({ query: longQuery });
    expect(result.query).toBeUndefined(); // > MAX_QUERY_LENGTH
  });

  it('handles nested objects in amenities', () => {
    const result = normalizeFilters({
      amenities: [{ toString: () => 'Wifi' }],
    });
    expect(result.amenities).toBeUndefined(); // Non-string values ignored
  });
});
