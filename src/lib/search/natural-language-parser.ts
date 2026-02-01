/**
 * Natural Language Search Parser
 *
 * Extracts structured filter params from natural language queries
 * using pattern matching and keyword extraction (no LLM needed).
 *
 * Examples:
 *   "furnished room under $1000 in Austin" →
 *     { location: "Austin", maxPrice: "1000", amenities: ["Furnished"] }
 *
 *   "pet friendly entire place $800-$1200" →
 *     { minPrice: "800", maxPrice: "1200", houseRules: ["Pets allowed"], roomType: "Entire Place" }
 */

export interface ParsedNLQuery {
  location: string;
  minPrice?: string;
  maxPrice?: string;
  roomType?: string;
  amenities: string[];
  houseRules: string[];
  leaseDuration?: string;
}

interface PatternRule {
  pattern: RegExp;
  extract: (match: RegExpMatchArray) => Partial<ParsedNLQuery>;
}

const PRICE_PATTERNS: PatternRule[] = [
  {
    // "under $1000", "below $1000", "less than $1000", "max $1000"
    pattern: /(?:under|below|less than|max|up to|at most)\s*\$?\s*(\d[\d,]*)/i,
    extract: (m) => ({ maxPrice: m[1].replace(/,/g, '') }),
  },
  {
    // "over $800", "above $800", "more than $800", "min $800", "at least $800"
    pattern: /(?:over|above|more than|min|at least|starting at|from)\s*\$?\s*(\d[\d,]*)/i,
    extract: (m) => ({ minPrice: m[1].replace(/,/g, '') }),
  },
  {
    // "$800-$1200", "$800 to $1200", "$800–$1200"
    pattern: /\$?\s*(\d[\d,]*)\s*[-–to]+\s*\$?\s*(\d[\d,]*)/i,
    extract: (m) => ({
      minPrice: m[1].replace(/,/g, ''),
      maxPrice: m[2].replace(/,/g, ''),
    }),
  },
  {
    // "between $800 and $1200"
    pattern: /between\s*\$?\s*(\d[\d,]*)\s*(?:and|&)\s*\$?\s*(\d[\d,]*)/i,
    extract: (m) => ({
      minPrice: m[1].replace(/,/g, ''),
      maxPrice: m[2].replace(/,/g, ''),
    }),
  },
];

const ROOM_TYPE_PATTERNS: PatternRule[] = [
  {
    pattern: /\b(?:private\s+room|private)\b/i,
    extract: () => ({ roomType: 'Private Room' }),
  },
  {
    pattern: /\b(?:shared\s+room|shared)\b/i,
    extract: () => ({ roomType: 'Shared Room' }),
  },
  {
    pattern: /\b(?:entire\s+place|whole\s+place|entire\s+home|full\s+apartment|studio)\b/i,
    extract: () => ({ roomType: 'Entire Place' }),
  },
];

const AMENITY_PATTERNS: { pattern: RegExp; value: string }[] = [
  { pattern: /\b(?:wifi|wi-fi|internet)\b/i, value: 'Wifi' },
  { pattern: /\b(?:ac|air\s*condition(?:ing|ed)?)\b/i, value: 'AC' },
  { pattern: /\b(?:parking|garage)\b/i, value: 'Parking' },
  { pattern: /\b(?:washer|laundry)\b/i, value: 'Washer' },
  { pattern: /\b(?:dryer)\b/i, value: 'Dryer' },
  { pattern: /\b(?:kitchen|cook)\b/i, value: 'Kitchen' },
  { pattern: /\b(?:gym|fitness)\b/i, value: 'Gym' },
  { pattern: /\b(?:pool|swimming)\b/i, value: 'Pool' },
  { pattern: /\b(?:furnished|furniture)\b/i, value: 'Furnished' },
];

const HOUSE_RULE_PATTERNS: { pattern: RegExp; value: string }[] = [
  { pattern: /\b(?:pet\s*(?:friendly|ok|allowed)?|pets?\s*(?:friendly|ok|allowed)|dog|cat)\b/i, value: 'Pets allowed' },
  { pattern: /\b(?:smoking\s*(?:ok|allowed)|smoker)\b/i, value: 'Smoking allowed' },
  { pattern: /\b(?:couple[s']?\s*(?:ok|allowed|friendly)?)\b/i, value: 'Couples allowed' },
  { pattern: /\b(?:guest[s']?\s*(?:ok|allowed))\b/i, value: 'Guests allowed' },
];

const LEASE_PATTERNS: PatternRule[] = [
  {
    pattern: /\b(?:month[\s-]to[\s-]month|mtm|monthly)\b/i,
    extract: () => ({ leaseDuration: 'Month-to-month' }),
  },
  {
    pattern: /\b(?:short[\s-]term|temporary|temp)\b/i,
    extract: () => ({ leaseDuration: 'Month-to-month' }),
  },
  {
    pattern: /\b(?:flexible|flex)\b/i,
    extract: () => ({ leaseDuration: 'Flexible' }),
  },
  {
    pattern: /\b3\s*month/i,
    extract: () => ({ leaseDuration: '3 months' }),
  },
  {
    pattern: /\b6\s*month/i,
    extract: () => ({ leaseDuration: '6 months' }),
  },
  {
    pattern: /\b(?:12\s*month|1\s*year|yearly|annual)\b/i,
    extract: () => ({ leaseDuration: '12 months' }),
  },
];

// Words/phrases to strip from input before treating remainder as location
const STRIP_PATTERNS = [
  // Price patterns
  /(?:under|below|less than|max|up to|at most|over|above|more than|min|at least|starting at|from|between)\s*\$?\s*\d[\d,]*(?:\s*(?:and|&|[-–to]+)\s*\$?\s*\d[\d,]*)*/gi,
  /\$\s*\d[\d,]*/g,
  // Connectors
  /\b(?:in|near|around|close to|by|with|has|and|a|an|the|for|that|is|are)\b/gi,
  // Room types
  /\b(?:private\s+room|shared\s+room|entire\s+place|whole\s+place|entire\s+home|full\s+apartment|studio|room)\b/gi,
  // Amenities
  /\b(?:wifi|wi-fi|internet|ac|air\s*condition(?:ing|ed)?|parking|garage|washer|laundry|dryer|kitchen|cook|gym|fitness|pool|swimming|furnished|furniture)\b/gi,
  // House rules
  /\b(?:pet\s*(?:friendly|ok|allowed)?|pets?\s*(?:friendly|ok|allowed)|dog|cat|smoking\s*(?:ok|allowed)|smoker|couple[s']?\s*(?:ok|allowed|friendly)?|guest[s']?\s*(?:ok|allowed))\b/gi,
  // Lease
  /\b(?:month[\s-]to[\s-]month|mtm|monthly|short[\s-]term|temporary|temp|flexible|flex|\d+\s*months?|yearly|annual)\b/gi,
  // "no smoking" etc.
  /\b(?:no\s+\w+)\b/gi,
];

/**
 * Parse a natural language search query into structured filter params.
 * Returns null if no structured data was extracted (treat as plain location).
 */
export function parseNaturalLanguageQuery(input: string): ParsedNLQuery | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const result: ParsedNLQuery = {
    location: '',
    amenities: [],
    houseRules: [],
  };

  let hasStructuredData = false;

  // Extract prices
  for (const rule of PRICE_PATTERNS) {
    const match = trimmed.match(rule.pattern);
    if (match) {
      Object.assign(result, rule.extract(match));
      hasStructuredData = true;
      break; // Use first price pattern match
    }
  }

  // Extract room type
  for (const rule of ROOM_TYPE_PATTERNS) {
    const match = trimmed.match(rule.pattern);
    if (match) {
      Object.assign(result, rule.extract(match));
      hasStructuredData = true;
      break;
    }
  }

  // Extract amenities
  for (const { pattern, value } of AMENITY_PATTERNS) {
    if (pattern.test(trimmed)) {
      result.amenities.push(value);
      hasStructuredData = true;
    }
  }

  // Extract house rules
  for (const { pattern, value } of HOUSE_RULE_PATTERNS) {
    if (pattern.test(trimmed)) {
      result.houseRules.push(value);
      hasStructuredData = true;
    }
  }

  // Extract lease duration
  for (const rule of LEASE_PATTERNS) {
    const match = trimmed.match(rule.pattern);
    if (match) {
      Object.assign(result, rule.extract(match));
      hasStructuredData = true;
      break;
    }
  }

  if (!hasStructuredData) return null;

  // Extract location: strip all recognized patterns from input
  let locationCandidate = trimmed;
  for (const pattern of STRIP_PATTERNS) {
    locationCandidate = locationCandidate.replace(pattern, ' ');
  }
  // Clean up whitespace and trailing punctuation
  result.location = locationCandidate.replace(/\s+/g, ' ').replace(/^[\s,]+|[\s,]+$/g, '').trim();

  return result;
}

/**
 * Convert parsed NL query to URL search params.
 */
export function nlQueryToSearchParams(parsed: ParsedNLQuery): URLSearchParams {
  const params = new URLSearchParams();

  if (parsed.location) params.set('q', parsed.location);
  if (parsed.minPrice) params.set('minPrice', parsed.minPrice);
  if (parsed.maxPrice) params.set('maxPrice', parsed.maxPrice);
  if (parsed.roomType) params.set('roomType', parsed.roomType);
  if (parsed.amenities.length > 0) params.set('amenities', parsed.amenities.join(','));
  if (parsed.houseRules.length > 0) params.set('houseRules', parsed.houseRules.join(','));
  if (parsed.leaseDuration) params.set('leaseDuration', parsed.leaseDuration);

  return params;
}
