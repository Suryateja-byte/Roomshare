/**
 * Radar API Response Fixtures for Testing
 *
 * Contains mock data for various Radar API response scenarios:
 * - Standard success responses
 * - Missing/partial fields
 * - XSS payloads
 * - Unicode content
 * - Edge cases
 */

import type { RadarSearchResponse, RadarPlace, NearbyPlace } from '@/types/nearby';

// ============================================================================
// Standard Success Fixtures
// ============================================================================

export const mockRadarPlace: RadarPlace = {
  _id: 'place_123',
  name: 'Patel Brothers',
  location: {
    type: 'Point',
    coordinates: [-122.4194, 37.7749], // [lng, lat]
  },
  categories: ['food-grocery'],
  chain: {
    name: 'Patel Brothers',
    slug: 'patel-brothers',
  },
  formattedAddress: '123 Main St, San Francisco, CA 94102',
};

export const mockRadarResponse: RadarSearchResponse = {
  meta: {
    code: 200,
  },
  places: [
    mockRadarPlace,
    {
      _id: 'place_456',
      name: 'India Bazaar',
      location: {
        type: 'Point',
        coordinates: [-122.4089, 37.7851],
      },
      categories: ['food-grocery'],
      formattedAddress: '456 Market St, San Francisco, CA 94103',
    },
    {
      _id: 'place_789',
      name: 'Shalimar Restaurant',
      location: {
        type: 'Point',
        coordinates: [-122.4156, 37.7879],
      },
      categories: ['indian-restaurant'],
      chain: {
        name: 'Shalimar',
        slug: 'shalimar',
      },
      formattedAddress: '789 Geary St, San Francisco, CA 94109',
    },
  ],
};

// Normalized NearbyPlace fixtures (after API transformation)
export const mockNearbyPlaces: NearbyPlace[] = [
  {
    id: 'place_123',
    name: 'Patel Brothers',
    address: '123 Main St, San Francisco, CA 94102',
    category: 'food-grocery',
    chain: 'Patel Brothers',
    location: { lat: 37.7749, lng: -122.4194 },
    distanceMiles: 0.5,
  },
  {
    id: 'place_456',
    name: 'India Bazaar',
    address: '456 Market St, San Francisco, CA 94103',
    category: 'food-grocery',
    location: { lat: 37.7851, lng: -122.4089 },
    distanceMiles: 0.8,
  },
  {
    id: 'place_789',
    name: 'Shalimar Restaurant',
    address: '789 Geary St, San Francisco, CA 94109',
    category: 'indian-restaurant',
    chain: 'Shalimar',
    location: { lat: 37.7879, lng: -122.4156 },
    distanceMiles: 1.2,
  },
];

// ============================================================================
// Missing/Partial Field Fixtures
// ============================================================================

export const mockRadarPlaceMissingAddress: RadarPlace = {
  _id: 'place_no_addr',
  name: 'Mystery Store',
  location: {
    type: 'Point',
    coordinates: [-122.42, 37.78],
  },
  categories: ['shopping'],
  // formattedAddress is undefined
};

export const mockRadarPlaceEmptyName: RadarPlace = {
  _id: 'place_empty_name',
  name: '',
  location: {
    type: 'Point',
    coordinates: [-122.43, 37.79],
  },
  categories: ['food-beverage'],
  formattedAddress: '100 Empty St',
};

export const mockRadarPlaceWhitespaceName: RadarPlace = {
  _id: 'place_whitespace',
  name: '   ',
  location: {
    type: 'Point',
    coordinates: [-122.44, 37.80],
  },
  categories: ['gas-station'],
  formattedAddress: '200 Whitespace Ave',
};

export const mockRadarPlaceEmptyCategories: RadarPlace = {
  _id: 'place_no_cats',
  name: 'Uncategorized Place',
  location: {
    type: 'Point',
    coordinates: [-122.45, 37.81],
  },
  categories: [],
  formattedAddress: '300 No Category Blvd',
};

export const mockRadarPlaceNoChain: RadarPlace = {
  _id: 'place_no_chain',
  name: 'Independent Store',
  location: {
    type: 'Point',
    coordinates: [-122.46, 37.82],
  },
  categories: ['shopping-mall'],
  formattedAddress: '400 Independent Way',
  // chain is undefined
};

// ============================================================================
// Long Content Fixtures
// ============================================================================

export const mockRadarPlaceLongName: RadarPlace = {
  _id: 'place_long_name',
  name: 'A'.repeat(500), // 500-char name
  location: {
    type: 'Point',
    coordinates: [-122.47, 37.83],
  },
  categories: ['food-grocery'],
  formattedAddress: '500 Long Name St',
};

export const mockRadarPlaceLongAddress: RadarPlace = {
  _id: 'place_long_addr',
  name: 'Normal Store',
  location: {
    type: 'Point',
    coordinates: [-122.48, 37.84],
  },
  categories: ['pharmacy'],
  formattedAddress: 'B'.repeat(300), // 300-char address
};

// ============================================================================
// Unicode/International Content Fixtures
// ============================================================================

export const mockRadarPlaceTelugu: RadarPlace = {
  _id: 'place_telugu',
  name: 'తెలుగు స్టోర్', // Telugu script
  location: {
    type: 'Point',
    coordinates: [-122.49, 37.85],
  },
  categories: ['food-grocery'],
  formattedAddress: '600 తెలుగు వీధి, San Francisco',
};

export const mockRadarPlaceHindi: RadarPlace = {
  _id: 'place_hindi',
  name: 'हिंदी दुकान', // Hindi script
  location: {
    type: 'Point',
    coordinates: [-122.50, 37.86],
  },
  categories: ['indian-restaurant'],
  formattedAddress: '700 हिंदी मार्ग, San Francisco',
};

export const mockRadarPlaceArabic: RadarPlace = {
  _id: 'place_arabic',
  name: 'متجر عربي', // Arabic script
  location: {
    type: 'Point',
    coordinates: [-122.51, 37.87],
  },
  categories: ['food-grocery'],
  formattedAddress: '800 شارع عربي, San Francisco',
};

export const mockRadarPlaceEmoji: RadarPlace = {
  _id: 'place_emoji',
  name: 'Coffee Shop ☕🍕🎉',
  location: {
    type: 'Point',
    coordinates: [-122.52, 37.88],
  },
  categories: ['food-beverage'],
  formattedAddress: '900 Emoji Lane 🏠',
};

export const mockRadarPlaceChinese: RadarPlace = {
  _id: 'place_chinese',
  name: '中国商店',
  location: {
    type: 'Point',
    coordinates: [-122.53, 37.89],
  },
  categories: ['food-grocery'],
  formattedAddress: '1000 中国街, San Francisco',
};

// ============================================================================
// XSS Payload Fixtures (for security testing)
// ============================================================================

export const mockRadarPlaceXSSScript: RadarPlace = {
  _id: 'place_xss_script',
  name: '<script>alert("XSS")</script>',
  location: {
    type: 'Point',
    coordinates: [-122.54, 37.90],
  },
  categories: ['food-grocery'],
  formattedAddress: '<script>document.cookie</script>',
};

export const mockRadarPlaceXSSImgOnerror: RadarPlace = {
  _id: 'place_xss_img',
  name: '<img src="x" onerror="alert(1)">',
  location: {
    type: 'Point',
    coordinates: [-122.55, 37.91],
  },
  categories: ['shopping'],
  formattedAddress: '<img src=x onerror=alert(1)>',
};

export const mockRadarPlaceXSSEventHandler: RadarPlace = {
  _id: 'place_xss_event',
  name: 'Store" onclick="alert(1)" data-x="',
  location: {
    type: 'Point',
    coordinates: [-122.56, 37.92],
  },
  categories: ['gym'],
  formattedAddress: '123 Main" onmouseover="alert(1)" x="',
};

export const mockRadarPlaceXSSHref: RadarPlace = {
  _id: 'place_xss_href',
  name: 'Click Me',
  location: {
    type: 'Point',
    coordinates: [-122.57, 37.93],
  },
  categories: ['pharmacy'],
  formattedAddress: '<a href="javascript:alert(1)">Click</a>',
};

// ============================================================================
// Special Characters & Edge Cases
// ============================================================================

export const mockRadarPlaceSpecialChars: RadarPlace = {
  _id: 'place_special',
  name: 'ATM? & Bank < > " \' $100',
  location: {
    type: 'Point',
    coordinates: [-122.58, 37.94],
  },
  categories: ['finance'],
  formattedAddress: '123 Main St #5 & Suite "A"',
};

export const mockRadarPlaceNewlines: RadarPlace = {
  _id: 'place_newlines',
  name: 'Store\nWith\nNewlines',
  location: {
    type: 'Point',
    coordinates: [-122.59, 37.95],
  },
  categories: ['shopping'],
  formattedAddress: '123\nMain\nSt',
};

// ============================================================================
// Duplicate Detection Fixtures
// ============================================================================

export const mockRadarResponseWithDuplicates: RadarSearchResponse = {
  meta: { code: 200 },
  places: [
    mockRadarPlace,
    mockRadarPlace, // Exact duplicate
    {
      ...mockRadarPlace,
      _id: 'place_123_dupe', // Same data, different ID
    },
  ],
};

// ============================================================================
// Empty & Error Response Fixtures
// ============================================================================

export const mockRadarEmptyResponse: RadarSearchResponse = {
  meta: { code: 200 },
  places: [],
};

export const mockRadarErrorResponse = {
  meta: {
    code: 400,
    message: 'Invalid parameters',
  },
  places: [],
};

export const mockRadarRateLimitResponse = {
  meta: {
    code: 429,
    message: 'Rate limit exceeded',
  },
};

export const mockRadarAuthErrorResponse = {
  meta: {
    code: 401,
    message: 'Unauthorized',
  },
};

export const mockRadarForbiddenResponse = {
  meta: {
    code: 403,
    message: 'Access denied',
  },
};

// ============================================================================
// Large Response Fixtures
// ============================================================================

export function generateMockPlaces(count: number): RadarPlace[] {
  return Array.from({ length: count }, (_, i) => ({
    _id: `place_gen_${i}`,
    name: `Generated Store ${i}`,
    location: {
      type: 'Point' as const,
      coordinates: [-122.4 + (i * 0.001), 37.7 + (i * 0.001)] as [number, number],
    },
    categories: ['food-grocery'],
    formattedAddress: `${i} Generated St, San Francisco, CA`,
  }));
}

export const mockRadarLargeResponse: RadarSearchResponse = {
  meta: { code: 200 },
  places: generateMockPlaces(50),
};

// ============================================================================
// Coordinate Edge Cases
// ============================================================================

export const mockRadarPlaceAtOrigin: RadarPlace = {
  _id: 'place_origin',
  name: 'Gulf of Guinea Store',
  location: {
    type: 'Point',
    coordinates: [0, 0], // Origin
  },
  categories: ['food-grocery'],
  formattedAddress: 'Origin Point',
};

export const mockRadarPlaceNorthPole: RadarPlace = {
  _id: 'place_north_pole',
  name: 'Arctic Store',
  location: {
    type: 'Point',
    coordinates: [0, 90], // North Pole
  },
  categories: ['food-grocery'],
  formattedAddress: 'North Pole',
};

export const mockRadarPlaceSouthPole: RadarPlace = {
  _id: 'place_south_pole',
  name: 'Antarctic Store',
  location: {
    type: 'Point',
    coordinates: [0, -90], // South Pole
  },
  categories: ['food-grocery'],
  formattedAddress: 'South Pole',
};

export const mockRadarPlaceAntimeridian: RadarPlace = {
  _id: 'place_antimeridian',
  name: 'Date Line Store',
  location: {
    type: 'Point',
    coordinates: [180, 0], // International Date Line
  },
  categories: ['food-grocery'],
  formattedAddress: 'International Date Line',
};

export const mockRadarPlacePreciseCoords: RadarPlace = {
  _id: 'place_precise',
  name: 'Precise Location Store',
  location: {
    type: 'Point',
    coordinates: [-122.41941261291504, 37.77492950439453], // Many decimal places
  },
  categories: ['food-grocery'],
  formattedAddress: '123 Precise Ave',
};

// ============================================================================
// Category-Specific Fixtures
// ============================================================================

export const mockCategoryFixtures: Record<string, RadarPlace[]> = {
  'food-grocery': [
    mockRadarPlace,
    mockRadarPlaceTelugu,
    mockRadarPlaceHindi,
  ],
  'indian-restaurant': [
    {
      _id: 'rest_1',
      name: 'Taj Mahal Restaurant',
      location: { type: 'Point', coordinates: [-122.42, 37.78] },
      categories: ['indian-restaurant'],
      formattedAddress: '100 Curry Lane',
    },
  ],
  'shopping-mall': [
    {
      _id: 'mall_1',
      name: 'Westfield Mall',
      location: { type: 'Point', coordinates: [-122.43, 37.79] },
      categories: ['shopping-mall'],
      chain: { name: 'Westfield', slug: 'westfield' },
      formattedAddress: '865 Market St',
    },
  ],
  'gas-station': [
    {
      _id: 'gas_1',
      name: 'Shell',
      location: { type: 'Point', coordinates: [-122.44, 37.80] },
      categories: ['gas-station'],
      chain: { name: 'Shell', slug: 'shell' },
      formattedAddress: '200 Gas Ave',
    },
  ],
  gym: [
    {
      _id: 'gym_1',
      name: '24 Hour Fitness',
      location: { type: 'Point', coordinates: [-122.45, 37.81] },
      categories: ['gym'],
      chain: { name: '24 Hour Fitness', slug: '24-hour-fitness' },
      formattedAddress: '300 Fitness Blvd',
    },
  ],
  pharmacy: [
    {
      _id: 'pharm_1',
      name: 'CVS Pharmacy',
      location: { type: 'Point', coordinates: [-122.46, 37.82] },
      categories: ['pharmacy'],
      chain: { name: 'CVS', slug: 'cvs' },
      formattedAddress: '400 Health St',
    },
  ],
};

// ============================================================================
// Test Request Fixtures
// ============================================================================

export const mockValidSearchRequest = {
  listingLat: 37.7749,
  listingLng: -122.4194,
  categories: ['food-grocery'],
  radiusMeters: 1609,
  limit: 20,
};

export const mockSearchRequestWithQuery = {
  ...mockValidSearchRequest,
  query: 'indian',
};

export const mockSearchRequestLargeRadius = {
  ...mockValidSearchRequest,
  radiusMeters: 8046, // 5 mi
};

// ============================================================================
// Fetch Mock Helpers
// ============================================================================

export function createMockFetchResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => data,
    text: async () => JSON.stringify(data),
    headers: new Headers({ 'Content-Type': 'application/json' }),
  } as Response;
}

export function createMockFetchError(status: number, message: string): Response {
  return createMockFetchResponse({ meta: { code: status, message } }, status);
}

export function setupFetchMock(response: Response | (() => Response)) {
  const mockFetch = jest.fn(() =>
    Promise.resolve(typeof response === 'function' ? response() : response)
  );
  global.fetch = mockFetch;
  return mockFetch;
}

export function setupFetchMockOnce(response: Response) {
  const mockFetch = jest.fn().mockResolvedValueOnce(response);
  global.fetch = mockFetch;
  return mockFetch;
}

export function setupFetchMockSequence(responses: Response[]) {
  const mockFetch = jest.fn();
  responses.forEach((response, index) => {
    mockFetch.mockResolvedValueOnce(response);
  });
  global.fetch = mockFetch;
  return mockFetch;
}

export function resetFetchMock() {
  if (jest.isMockFunction(global.fetch)) {
    (global.fetch as jest.Mock).mockReset();
  }
}

// ============================================================================
// Malformed Response Fixtures (for defensive parsing tests)
// ============================================================================

/**
 * Coordinates as strings instead of numbers (schema drift simulation)
 */
export const mockRadarPlaceNumericStrings = {
  _id: 'place_numeric_strings',
  name: 'String Coords Store',
  location: {
    type: 'Point',
    coordinates: ['-122.4194', '37.7749'] as unknown as [number, number], // Strings!
  },
  categories: ['food-grocery'],
  formattedAddress: '123 String St',
};

/**
 * Place with null location (missing coordinates entirely)
 */
export const mockRadarPlaceNullLocation = {
  _id: 'place_null_location',
  name: 'No Location Store',
  location: null,
  categories: ['shopping'],
  formattedAddress: '456 Nowhere Ave',
};

/**
 * Place with undefined location
 */
export const mockRadarPlaceUndefinedLocation = {
  _id: 'place_undefined_location',
  name: 'Undefined Location Store',
  categories: ['food-grocery'],
  formattedAddress: '789 Missing Coords St',
  // location is undefined
};

/**
 * Place with empty coordinates array
 */
export const mockRadarPlaceEmptyCoordinates = {
  _id: 'place_empty_coords',
  name: 'Empty Coords Store',
  location: {
    type: 'Point',
    coordinates: [] as number[],
  },
  categories: ['food-grocery'],
  formattedAddress: '101 Empty Array St',
};

/**
 * 200 response with error field (Radar API quirk)
 */
export const mockRadarResponseWithError = {
  meta: { code: 200 },
  error: 'Unexpected error occurred',
  places: [],
};

/**
 * HTML error response (e.g., from CDN/proxy)
 */
export const mockHtmlErrorResponse = '<html><body>502 Bad Gateway</body></html>';

/**
 * Malformed JSON response
 */
export const mockMalformedJsonResponse = '{"meta": {"code": 200}, "places": [';

/**
 * Response with extra-large payload simulation
 */
export function generateLargePayload(sizeInBytes: number): string {
  const basePlace = JSON.stringify(mockRadarPlace);
  const placesNeeded = Math.ceil(sizeInBytes / basePlace.length);
  const places = generateMockPlaces(placesNeeded);
  return JSON.stringify({ meta: { code: 200 }, places });
}

/**
 * Response with count mismatch (meta.count doesn't match places.length)
 */
export const mockRadarResponseCountMismatch = {
  meta: { code: 200, count: 10 }, // Claims 10 results
  places: generateMockPlaces(3), // Only 3 actual results
};

/**
 * Response with places as non-array
 */
export const mockRadarResponsePlacesNotArray = {
  meta: { code: 200 },
  places: 'not an array',
};

/**
 * Response with nested null objects
 */
export const mockRadarPlaceNestedNulls = {
  _id: 'place_nested_nulls',
  name: 'Nested Nulls Store',
  location: {
    type: 'Point',
    coordinates: [-122.4194, 37.7749],
  },
  categories: null,
  chain: null,
  formattedAddress: null,
};

/**
 * Response with coordinates as object instead of array
 */
export const mockRadarPlaceCoordinatesObject = {
  _id: 'place_coords_object',
  name: 'Object Coords Store',
  location: {
    type: 'Point',
    coordinates: { lng: -122.4194, lat: 37.7749 } as unknown as [number, number],
  },
  categories: ['food-grocery'],
  formattedAddress: '200 Object St',
};

/**
 * Response with address parts only (no formattedAddress)
 */
export const mockRadarPlaceAddressParts = {
  _id: 'place_addr_parts',
  name: 'Parts Address Store',
  location: {
    type: 'Point',
    coordinates: [-122.4194, 37.7749],
  },
  categories: ['food-grocery'],
  // No formattedAddress, but has parts
  addressNumber: '123',
  street: 'Main St',
  city: 'San Francisco',
  state: 'CA',
  postalCode: '94102',
};
