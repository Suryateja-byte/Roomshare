/**
 * Client-side intent detection for nearby place queries.
 *
 * Detects when a user is asking about nearby places and determines
 * whether to use type-based (Nearby Search) or text-based (Text Search).
 *
 * Type-based search is more efficient for common place types like "gym" or "park".
 * Text-based search is used for specific queries like "Nepali restaurant" or "CrossFit".
 */

export interface NearbyIntentResult {
  /** Whether this is a nearby places query */
  isNearbyQuery: boolean;
  /** Type of search to perform */
  searchType: 'type' | 'text';
  /** Valid Google place types for Nearby Search */
  includedTypes?: string[];
  /** Text query for Text Search */
  textQuery?: string;
  /** The cleaned/normalized query */
  normalizedQuery: string;
}

/**
 * Valid Google place types for Nearby Search.
 * Only use types that are confirmed valid in Google Places API.
 *
 * @see https://developers.google.com/maps/documentation/places/web-service/supported_types
 */
const PLACE_TYPE_MAP: Record<string, string[]> = {
  // Fitness
  gym: ['gym'],
  fitness: ['gym'],
  'fitness center': ['gym'],
  workout: ['gym'],

  // Food & Drink
  restaurant: ['restaurant'],
  restaurants: ['restaurant'],
  cafe: ['cafe'],
  coffee: ['cafe'],
  'coffee shop': ['cafe'],
  bakery: ['bakery'],
  bar: ['bar'],

  // Shopping
  grocery: ['supermarket'],
  groceries: ['supermarket'],
  supermarket: ['supermarket'],
  'grocery store': ['supermarket'],

  // Health
  pharmacy: ['pharmacy'],
  drugstore: ['pharmacy'],
  hospital: ['hospital'],
  doctor: ['doctor'],
  dentist: ['dentist'],
  clinic: ['hospital'],

  // Transit
  transit: ['transit_station'],
  'transit station': ['transit_station'],
  'bus stop': ['bus_station'],
  'bus station': ['bus_station'],
  subway: ['subway_station'],
  'subway station': ['subway_station'],
  train: ['train_station'],
  'train station': ['train_station'],
  metro: ['subway_station'],

  // Recreation
  park: ['park'],
  parks: ['park'],
  library: ['library'],
  museum: ['museum'],
  movie: ['movie_theater'],
  cinema: ['movie_theater'],
  theater: ['movie_theater'],

  // Services
  bank: ['bank'],
  atm: ['atm'],
  laundry: ['laundry'],
  laundromat: ['laundry'],
  'dry cleaner': ['laundry'],
  'post office': ['post_office'],
  gas: ['gas_station'],
  'gas station': ['gas_station'],

  // Convenience
  convenience: ['convenience_store'],
  'convenience store': ['convenience_store'],
  liquor: ['liquor_store'],
  'liquor store': ['liquor_store'],
};

/**
 * Keywords that indicate a nearby/location query.
 */
const LOCATION_KEYWORDS = [
  'nearby',
  'near',
  'close',
  'closest',
  'nearest',
  'around',
  'find',
  'where',
  'looking for',
  'any',
  'is there',
  'are there',
  'walking distance',
  'minutes away',
  'minutes walk',
];

/**
 * Words to remove from queries for cleaner matching.
 */
const FILLER_WORDS = [
  'the',
  'a',
  'an',
  'any',
  'some',
  'good',
  'best',
  'great',
  'nice',
  'nearby',
  'near',
  'here',
  'close',
  'closest',
  'nearest',
  'around',
  'find',
  'me',
  'please',
  'can',
  'you',
  'is',
  'are',
  'there',
  'where',
  'i',
  'want',
  'need',
  'looking',
  'for',
  'to',
];

/**
 * Patterns that indicate text search should be used instead of type search.
 * These queries are too specific for generic place types.
 */
const TEXT_SEARCH_PATTERNS = [
  // Specific cuisines
  /\b(nepali|indian|thai|chinese|japanese|korean|vietnamese|mexican|italian|greek|ethiopian|mediterranean|middle\s*eastern|lebanese|persian)\s*(food|restaurant|cuisine)?/i,

  // Specific food types
  /\b(sushi|ramen|pho|tacos|pizza|burgers?|bbq|barbeque|seafood|vegan|vegetarian|halal|kosher)/i,

  // Brand names / chains
  /\b(starbucks|mcdonalds|subway|chipotle|panera|whole\s*foods|trader\s*joe|target|walmart|costco|cvs|walgreens|planet\s*fitness|equinox|orangetheory|crossfit|peloton)/i,

  // Specific activities
  /\b(crossfit|yoga|pilates|spinning|boxing|martial\s*arts|swimming|pool|tennis|basketball|soccer)/i,

  // Specialty stores
  /\b(organic|natural|health\s*food|farmers?\s*market|butcher|fish\s*market|wine\s*shop|pet\s*store|hardware|home\s*depot|lowes)/i,

  // Specific service types
  /\b(urgent\s*care|walk\s*in\s*clinic|dermatologist|pediatrician|optometrist|chiropractor)/i,

  // Ethnic grocery stores
  /\b(indian\s*grocery|asian\s*grocery|mexican\s*grocery|international\s*market|ethnic\s*food)/i,
];

/**
 * Common typo corrections for better search results.
 */
const TYPO_CORRECTIONS: Record<string, string> = {
  chipolte: 'chipotle',
  mcdonlds: "mcdonald's",
  starbuks: 'starbucks',
  wendys: "wendy's",
  chikfila: 'chick-fil-a',
  'chick fil a': 'chick-fil-a',
  dunkins: "dunkin'",
  resteraunt: 'restaurant',
  restaraunt: 'restaurant',
  resturant: 'restaurant',
  grocey: 'grocery',
  groecry: 'grocery',
  pharmcy: 'pharmacy',
  pharmasy: 'pharmacy',
  laundramat: 'laundromat',
  laundrmat: 'laundromat',
  coffe: 'coffee',
  coffie: 'coffee',
};

/**
 * Cleans and normalizes a query string.
 */
function cleanQuery(query: string): string {
  let cleaned = query.toLowerCase().trim();

  // Apply typo corrections
  for (const [typo, correction] of Object.entries(TYPO_CORRECTIONS)) {
    cleaned = cleaned.replace(new RegExp(`\\b${typo}\\b`, 'gi'), correction);
  }

  // Remove punctuation
  cleaned = cleaned.replace(/[?!.,;:'"]/g, '');

  // Remove filler words
  const words = cleaned.split(/\s+/);
  const filtered = words.filter((word) => !FILLER_WORDS.includes(word));

  return filtered.join(' ').trim();
}

/**
 * Checks if a query indicates a nearby/location search.
 */
function hasLocationIntent(query: string): boolean {
  const lowerQuery = query.toLowerCase();

  // Check for location keywords
  for (const keyword of LOCATION_KEYWORDS) {
    if (lowerQuery.includes(keyword)) {
      return true;
    }
  }

  // Check if query is just a place type (e.g., "gym?" or "grocery")
  const cleaned = cleanQuery(query);
  if (PLACE_TYPE_MAP[cleaned]) {
    return true;
  }

  // Check for question patterns about places
  if (/\b(gym|restaurant|cafe|park|hospital|pharmacy|grocery|store|station)\b/i.test(query)) {
    return true;
  }

  return false;
}

/**
 * Checks if query should use Text Search instead of type-based Nearby Search.
 */
function shouldUseTextSearch(query: string): boolean {
  for (const pattern of TEXT_SEARCH_PATTERNS) {
    if (pattern.test(query)) {
      return true;
    }
  }
  return false;
}

/**
 * Extracts place types from a cleaned query.
 */
function extractPlaceTypes(query: string): string[] | null {
  const cleaned = cleanQuery(query);

  // Direct match
  if (PLACE_TYPE_MAP[cleaned]) {
    return PLACE_TYPE_MAP[cleaned];
  }

  // Try to find a matching place type within the query
  for (const [keyword, types] of Object.entries(PLACE_TYPE_MAP)) {
    if (cleaned.includes(keyword)) {
      return types;
    }
  }

  return null;
}

/**
 * Detects nearby place intent from a user message.
 *
 * @param message - The user's message
 * @returns NearbyIntentResult with detection results
 */
export function detectNearbyIntent(message: string): NearbyIntentResult {
  if (!message || typeof message !== 'string') {
    return {
      isNearbyQuery: false,
      searchType: 'text',
      normalizedQuery: '',
    };
  }

  const normalizedQuery = cleanQuery(message);

  // Check if this is a location/nearby query
  if (!hasLocationIntent(message)) {
    return {
      isNearbyQuery: false,
      searchType: 'text',
      normalizedQuery,
    };
  }

  // Check if we should use text search (specific cuisine, brand, etc.)
  if (shouldUseTextSearch(message)) {
    return {
      isNearbyQuery: true,
      searchType: 'text',
      textQuery: normalizedQuery || message.replace(/[?!.,]/g, '').trim(),
      normalizedQuery,
    };
  }

  // Try to extract place types for type-based search
  const placeTypes = extractPlaceTypes(message);

  if (placeTypes) {
    return {
      isNearbyQuery: true,
      searchType: 'type',
      includedTypes: placeTypes,
      normalizedQuery,
    };
  }

  // Fallback to text search for unrecognized place queries
  return {
    isNearbyQuery: true,
    searchType: 'text',
    textQuery: normalizedQuery || message.replace(/[?!.,]/g, '').trim(),
    normalizedQuery,
  };
}

/**
 * Exported for testing purposes.
 */
export const _testHelpers = {
  cleanQuery,
  hasLocationIntent,
  shouldUseTextSearch,
  extractPlaceTypes,
  PLACE_TYPE_MAP,
  LOCATION_KEYWORDS,
  TEXT_SEARCH_PATTERNS,
  TYPO_CORRECTIONS,
};
