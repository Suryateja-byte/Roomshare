/**
 * Search Input Mock Utilities
 *
 * Test fixtures and utilities for NearbyPlacesPanel search field edge cases.
 * Covers input normalization, Unicode, XSS payloads, and special characters.
 */

import type { NearbyPlace } from '@/types/nearby';

// ============================================================================
// Input Normalization Test Data
// ============================================================================

/**
 * Whitespace test cases
 */
export const WHITESPACE_INPUTS = {
  empty: '',
  singleSpace: ' ',
  multipleSpaces: '   ',
  leadingSpaces: '  coffee',
  trailingSpaces: 'coffee  ',
  leadingAndTrailing: '  coffee  ',
  internalMultipleSpaces: 'coffee   shop',
  tab: '\tcoffee',
  newline: 'coffee\n',
  carriageReturn: 'coffee\r',
  mixedWhitespace: ' \t coffee \n shop \r ',
} as const;

/**
 * Length boundary test cases
 */
export const LENGTH_INPUTS = {
  empty: '',
  oneChar: 'a',
  twoChars: 'ab', // Minimum to trigger search
  threeChars: 'abc',
  nearMax: 'a'.repeat(99),
  atMax: 'a'.repeat(100),
  overMax: 'a'.repeat(101),
  wayOverMax: 'a'.repeat(200),
} as const;

/**
 * Case sensitivity test cases
 */
export const CASE_INPUTS = {
  lowercase: 'indian grocery',
  uppercase: 'INDIAN GROCERY',
  mixedCase: 'InDiAn GrOcErY',
  titleCase: 'Indian Grocery',
  allCapsAbbrev: 'ATM',
  mixedAbbrev: 'Atm',
} as const;

// ============================================================================
// Unicode & International Text
// ============================================================================

/**
 * Unicode and international character test cases
 */
export const UNICODE_INPUTS = {
  // Diacritics
  diacriticsFrench: 'café',
  diacriticsSpanish: 'jalapeño',
  diacriticsGerman: 'Müller',
  diacriticsPortuguese: 'açaí',

  // Non-Latin scripts
  hindi: 'किराना',
  arabic: 'بقالة',
  chinese: '杂货店',
  japanese: 'スーパー',
  korean: '식료품점',
  russian: 'магазин',
  greek: 'μανάβικο',
  hebrew: 'מכולת',
  thai: 'ร้านขายของชำ',

  // Mixed scripts
  mixedLatinHindi: 'Indian किराना',
  mixedLatinChinese: 'Asian 杂货店',
  mixedLatinArabic: 'Halal بقالة',

  // RTL text
  rtlArabic: 'محل البقالة',
  rtlHebrew: 'חנות מכולת',
} as const;

/**
 * Emoji test cases
 */
export const EMOJI_INPUTS = {
  singleEmoji: '🍕',
  emojiWithText: 'pizza 🍕',
  textWithEmoji: '🛒 grocery',
  multipleEmojis: '🍕🍔🌮',
  emojiSequence: '👨‍👩‍👧‍👦',
  emojiWithFlag: '🇺🇸 store',
  emojiVariation: '☕️',
  emojiZWJ: '👨‍🍳 restaurant',
} as const;

// ============================================================================
// Special Characters & Punctuation
// ============================================================================

/**
 * Punctuation test cases
 */
export const PUNCTUATION_INPUTS = {
  hyphen: 'gas-station',
  underscore: 'coffee_shop',
  apostrophe: "McDonald's",
  quoteSingle: "'coffee'",
  quoteDouble: '"coffee"',
  questionMark: 'where is coffee?',
  exclamation: 'coffee!',
  comma: 'coffee, tea',
  period: 'Dr. Pepper',
  semicolon: 'coffee; tea',
  colon: 'time: 9am',
  ellipsis: 'coffee...',
  parentheses: '(coffee)',
  brackets: '[coffee]',
  braces: '{coffee}',
} as const;

/**
 * URL-sensitive characters (need proper encoding)
 */
export const URL_SENSITIVE_INPUTS = {
  ampersand: 'AT&T',
  hash: '#1 coffee',
  questionMark: 'coffee?type=best',
  percent: '100% organic',
  slash: '7/11',
  backslash: 'path\\to',
  equals: 'coffee=best',
  plus: 'coffee+tea',
  atSign: 'user@store',
  dollar: '$5 coffee',
  space: 'coffee shop',
  doubleAmpersand: 'coffee && tea',
  multipleSpecial: 'AT&T #1 100%',
} as const;

// ============================================================================
// Security Test Payloads
// ============================================================================

/**
 * XSS attack payloads - should be safely escaped
 */
export const XSS_PAYLOADS = {
  scriptTag: '<script>alert("xss")</script>',
  imgOnerror: '<img src=x onerror=alert("xss")>',
  svgOnload: '<svg onload=alert("xss")>',
  iframeTag: '<iframe src="javascript:alert(1)">',
  eventHandler: '<div onclick="alert(1)">click</div>',
  encodedScript: '&lt;script&gt;alert(1)&lt;/script&gt;',
  unicodeEscape: '\u003cscript\u003ealert(1)\u003c/script\u003e',
  jsProtocol: 'javascript:alert(1)',
  dataUri: 'data:text/html,<script>alert(1)</script>',
  entityEncoded: '&#60;script&#62;alert(1)&#60;/script&#62;',
  mixedEncoding: '<scr<script>ipt>alert(1)</script>',
  nullByte: 'coffee\x00<script>alert(1)</script>',
} as const;

/**
 * SQL injection payloads - should be treated as plain text
 */
export const SQL_PAYLOADS = {
  simpleOr: "' OR '1'='1",
  dropTable: "'; DROP TABLE places; --",
  unionSelect: "' UNION SELECT * FROM users --",
  semicolonCommand: "; SELECT * FROM places",
  commentedOut: "coffee'--",
  quotedString: "coffee' AND '1'='1",
} as const;

/**
 * Control characters - should be stripped/sanitized
 */
export const CONTROL_CHAR_INPUTS = {
  nullChar: 'coffee\x00shop',
  bellChar: 'coffee\x07shop',
  backspace: 'coffee\x08shop',
  formFeed: 'coffee\x0Cshop',
  escapeChar: 'coffee\x1Bshop',
  deleteChar: 'coffee\x7Fshop',
} as const;

// ============================================================================
// Query Result Expectation Test Data
// ============================================================================

/**
 * Brand name queries
 */
export const BRAND_QUERIES = {
  walmart: 'Walmart',
  costco: 'Costco',
  target: 'Target',
  mcdonalds: "McDonald's",
  starbucks: 'Starbucks',
  cvs: 'CVS',
  walgreens: 'Walgreens',
} as const;

/**
 * Common typo test cases
 */
export const TYPO_QUERIES = {
  coffeeTypo: 'coffe',
  pharmacyTypo: 'phamacy',
  restaurantTypo: 'resturant',
  groceryTypo: 'groery',
} as const;

/**
 * Plural vs singular test cases
 */
export const PLURAL_QUERIES = {
  gymSingular: 'gym',
  gymPlural: 'gyms',
  storeSingular: 'store',
  storePlural: 'stores',
  restaurantSingular: 'restaurant',
  restaurantPlural: 'restaurants',
} as const;

// ============================================================================
// Mock Response Generators
// ============================================================================

/**
 * Create a mock NearbyPlace with custom overrides
 */
export function createMockPlace(id: string, overrides: Partial<NearbyPlace> = {}): NearbyPlace {
  return {
    id,
    name: `Place ${id}`,
    address: '123 Test St, City, ST 12345',
    category: 'food-grocery',
    location: { lat: 37.7749, lng: -122.4194 },
    distanceMiles: 0.5,
    ...overrides,
  };
}

/**
 * Create mock response with multiple places
 */
export function createMockPlacesResponse(count: number, queryPrefix = 'place') {
  const places = Array.from({ length: count }, (_, i) =>
    createMockPlace(`${queryPrefix}-${i + 1}`, {
      distanceMiles: (i + 1) * 0.1,
    })
  );
  return {
    places,
    meta: { count: places.length, cached: false },
  };
}

/**
 * Create empty results response
 */
export function createEmptyResponse() {
  return {
    places: [],
    meta: { count: 0, cached: false },
  };
}

/**
 * Create error response
 */
export function createErrorResponse(error: string, details?: string, status = 400) {
  return {
    ok: false,
    status,
    json: async () => ({ error, details }),
  };
}

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Generate a string of specified length with a pattern
 */
export function generateString(length: number, pattern = 'a'): string {
  return pattern.repeat(Math.ceil(length / pattern.length)).slice(0, length);
}

/**
 * Check if a string is properly URL-encoded
 */
export function isProperlyUrlEncoded(input: string, encoded: string): boolean {
  // Decode and verify it matches original
  try {
    const decoded = decodeURIComponent(encoded);
    return decoded === input;
  } catch {
    return false;
  }
}

/**
 * Create a mock fetch that tracks calls
 */
export function createTrackingMockFetch() {
  const calls: Array<{ url: string; body: unknown }> = [];

  const mockFn = jest.fn(async (url: string, options?: RequestInit) => {
    let body: unknown = null;
    if (options?.body) {
      try {
        body = JSON.parse(options.body as string);
      } catch {
        body = options.body;
      }
    }
    calls.push({ url, body });

    return {
      ok: true,
      status: 200,
      json: async () => createMockPlacesResponse(1),
    };
  });

  return {
    mockFn,
    calls,
    getLastCall: () => calls[calls.length - 1],
    getCallCount: () => calls.length,
    reset: () => {
      calls.length = 0;
      mockFn.mockClear();
    },
  };
}

/**
 * Wait for a specified time (for timing tests)
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
