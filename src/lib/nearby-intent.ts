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
  /** C3 FIX: Whether multiple brands were detected (e.g., "Starbucks or Dunkin") */
  multiBrandDetected?: boolean;
  /** C7 FIX: Whether query has mixed intent (nearby + info) - prefers LLM route */
  hasMixedIntent?: boolean;
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

  // C6 FIX: Parking
  parking: ['parking'],
  'parking lot': ['parking'],
  'parking garage': ['parking'],

  // B14 FIX: Emergency services
  police: ['police'],
  'police station': ['police'],
  fire: ['fire_station'],
  'fire station': ['fire_station'],

  // B14 FIX: Education
  school: ['school'],
  schools: ['school'],
  'elementary school': ['primary_school'],
  'primary school': ['primary_school'],
  'high school': ['secondary_school'],
  'secondary school': ['secondary_school'],
  university: ['university'],
  college: ['university'],
};

/**
 * B5 FIX: Internationalized keywords for common place types
 * Maps non-English terms to their English equivalents for detection
 */
const I18N_KEYWORDS: Record<string, string> = {
  // Japanese (Romanized)
  jimu: 'gym',
  suupaa: 'supermarket',
  resutoran: 'restaurant',
  kouen: 'park',
  eki: 'transit station',
  byouin: 'hospital',
  kusuriya: 'pharmacy',
  ginkō: 'bank',
  toshokan: 'library',

  // Spanish
  gimnasio: 'gym',
  supermercado: 'supermarket',
  restaurante: 'restaurant',
  parque: 'park',
  estación: 'transit station',
  estacion: 'transit station',
  farmacia: 'pharmacy',
  banco: 'bank',
  biblioteca: 'library',
  cafetería: 'cafe',
  cafeteria: 'cafe',
  panadería: 'bakery',
  panaderia: 'bakery',
  tienda: 'convenience store',
  escuela: 'school',
  universidad: 'university',
  policía: 'police',
  policia: 'police',
  bomberos: 'fire station',

  // Chinese (Pinyin)
  jianshenfa: 'gym',
  chaoshi: 'supermarket',
  canting: 'restaurant',
  gongyuan: 'park',
  chezhan: 'transit station',
  yiyuan: 'hospital',
  yaodian: 'pharmacy',
  yinhang: 'bank',
  tushuguan: 'library',
  kafei: 'cafe',
  xuexiao: 'school',
  daxue: 'university',
  jingcha: 'police',
  xiaofang: 'fire station',
};

/**
 * P1-B19 FIX: Non-romanized script keywords (Unicode)
 * Maps Unicode characters directly to English equivalents
 */
const UNICODE_KEYWORDS: Record<string, string> = {
  // Chinese (Simplified)
  '咖啡': 'cafe',
  '咖啡厅': 'cafe',
  '咖啡馆': 'cafe',
  '餐厅': 'restaurant',
  '餐馆': 'restaurant',
  '饭店': 'restaurant',
  '超市': 'supermarket',
  '超级市场': 'supermarket',
  '健身房': 'gym',
  '健身中心': 'gym',
  '公园': 'park',
  '地铁': 'subway',
  '地铁站': 'subway station',
  '火车站': 'train station',
  '医院': 'hospital',
  '药店': 'pharmacy',
  '药房': 'pharmacy',
  '银行': 'bank',
  '图书馆': 'library',
  '学校': 'school',
  '大学': 'university',
  '警察局': 'police',
  '消防站': 'fire station',
  '停车场': 'parking',
  '洗衣店': 'laundry',
  '便利店': 'convenience store',
  '酒吧': 'bar',
  '面包店': 'bakery',

  // Chinese (Traditional) - only add unique characters
  '咖啡廳': 'cafe',
  '餐廳': 'restaurant',
  '超級市場': 'supermarket',
  // Note: '健身中心' removed - identical to simplified form (already at line 191)
  '地鐵站': 'subway station',
  '醫院': 'hospital',
  '藥店': 'pharmacy',
  '圖書館': 'library',
  '學校': 'school',
  '大學': 'university',

  // Japanese (Hiragana/Katakana) - only unique entries
  'ジム': 'gym',
  'カフェ': 'cafe',
  'コーヒー': 'cafe',
  'レストラン': 'restaurant',
  'スーパー': 'supermarket',
  'コンビニ': 'convenience store',
  'えき': 'transit station',
  '駅': 'transit station',
  'びょういん': 'hospital',
  'くすりや': 'pharmacy',
  '薬局': 'pharmacy',
  'ぎんこう': 'bank',
  'としょかん': 'library',
  '図書館': 'library',
  'こうえん': 'park',

  // Korean
  '카페': 'cafe',
  '커피숍': 'cafe',
  '식당': 'restaurant',
  '레스토랑': 'restaurant',
  '슈퍼마켓': 'supermarket',
  '마트': 'supermarket',
  '헬스장': 'gym',
  '체육관': 'gym',
  '공원': 'park',
  '지하철역': 'subway station',
  '역': 'transit station',
  '병원': 'hospital',
  '약국': 'pharmacy',
  '은행': 'bank',
  '도서관': 'library',
  '학교': 'school',
  '대학교': 'university',
  '경찰서': 'police',
  '주차장': 'parking',
  '세탁소': 'laundry',
  '편의점': 'convenience store',

  // Arabic
  'مقهى': 'cafe',
  'مطعم': 'restaurant',
  'سوبرماركت': 'supermarket',
  'صالة رياضية': 'gym',
  'حديقة': 'park',
  'محطة': 'transit station',
  'مستشفى': 'hospital',
  'صيدلية': 'pharmacy',
  'بنك': 'bank',
  'مكتبة': 'library',
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
 * C5 FIX: Patterns that should route to LLM instead of Places API.
 * These are informational queries that Places API cannot answer.
 */
const LLM_ONLY_PATTERNS = [
  // Time/hours queries - Places API doesn't return hours in initial response
  /\b(what|when)\s+(time|hour)/i,
  /\b(how late|how early)\b/i,
  /\b(open|close|closing|opening)\s+(time|hour|at)\b/i,
  /\bhours\s+(of|for)\b/i,
  /\bwhen\s+(does|do|is|are)\b.*\b(open|close)\b/i,
  // Pricing queries
  /\b(how much|price|cost|fee|expensive|cheap|afford)\b/i,
  // Review/recommendation queries (need LLM judgment)
  /\b(is\s+it\s+good|any\s+good|recommend|worth|review|rating)\b/i,
  // Comparison queries
  /\b(which\s+is\s+better|compare|versus|vs)\b/i,
  // Availability queries
  /\b(busy|crowded|wait\s+time|reservation|book)\b/i,
];

/**
 * C7 FIX: Patterns that indicate informational intent.
 * Used to detect mixed intent (nearby + info) queries.
 * P1-B16 FIX: Added distance query patterns
 */
const INFO_INTENT_PATTERNS = [
  /\b(what|when)\s+(time|hour)/i,
  /\b(how late|how early)\b/i,
  /\b(open|close|closing|opening)\b/i,
  /\bhours\b/i,
  /\b(how much|price|cost|fee)\b/i,
  /\b(good|best|recommend|worth|review|rating)\b/i,
  /\b(compare|versus|vs)\b/i,
  /\b(busy|crowded|wait|reservation)\b/i,
  // P1-B16 FIX: Distance queries need LLM context
  /\bhow\s+far\b/i,
  /\bhow\s+long\b.*\b(walk|drive|get)\b/i,
  /\b(distance|travel\s+time)\b/i,
  /\bminutes?\s+(away|from|to)\b/i,
];

/**
 * P1-B15 FIX: Patterns indicating listing-specific context.
 * When user asks about "parking here" or "this building", it's about the listing,
 * not a nearby search. Route to LLM for listing-specific answers.
 */
const LISTING_CONTEXT_PATTERNS = [
  /\b(this|the)\s+(listing|apartment|place|building|unit|property)\b/i,
  /\b(here|this place)\b/i,
  /\bdoes\s+(it|this)\s+have\b/i,
  /\bis\s+there\s+parking\s+(here|included|available)\b/i,
  /\bparking\s+(included|available|spot|space)\b/i,
  /\b(amenities|features)\b/i,
];

/**
 * P2-B24 FIX: Negation patterns that should NOT trigger nearby search.
 * "I don't need a gym" or "no restaurants please" should not search.
 */
const NEGATION_PATTERNS = [
  /\b(don'?t|do\s+not|doesn'?t|does\s+not)\s+(need|want|like|care)\b/i,
  /\b(no|without|not\s+looking\s+for)\s+(gym|restaurant|cafe|park|grocery|store|transit)\b/i,
  /\b(skip|avoid|stay\s+away\s+from)\b/i,
];

/**
 * C7 FIX: Checks if query has both nearby AND informational intent.
 * These queries should prefer LLM route since Places API can't answer the info part.
 */
function hasMixedIntentQuery(query: string): boolean {
  const lowerQuery = query.toLowerCase();

  // Check if query has a place type
  const hasPlaceComponent = Object.keys(PLACE_TYPE_MAP).some((key) =>
    lowerQuery.includes(key)
  );

  // Check if query also has informational component
  const hasInfoComponent = INFO_INTENT_PATTERNS.some((pattern) =>
    pattern.test(query)
  );

  return hasPlaceComponent && hasInfoComponent;
}

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
 * C3 FIX: Pattern to detect multi-brand queries.
 * These queries ask for multiple specific brands (e.g., "Starbucks or Dunkin")
 * and may not work well with single text search.
 */
const MULTI_BRAND_PATTERN = /\b(starbucks|dunkin|mcdonald|chipotle|panera|subway|whole\s*foods|trader\s*joe|target|walmart|costco|cvs|walgreens|planet\s*fitness|equinox|orangetheory)\b.*\b(or|and|vs|versus)\b.*\b(starbucks|dunkin|mcdonald|chipotle|panera|subway|whole\s*foods|trader\s*joe|target|walmart|costco|cvs|walgreens|planet\s*fitness|equinox|orangetheory)\b/i;

/**
 * C3 FIX: Checks if query contains multiple brand names.
 */
function hasMultipleBrands(query: string): boolean {
  return MULTI_BRAND_PATTERN.test(query);
}

/**
 * Common typo corrections for better search results.
 * B22 FIX: Added more common typos
 * C14 FIX: Expanded typo dictionary with more variations
 */
const TYPO_CORRECTIONS: Record<string, string> = {
  // Brand names
  chipolte: 'chipotle',
  chipoltle: 'chipotle',
  mcdonlds: "mcdonald's",
  mcdonalds: "mcdonald's",
  starbuks: 'starbucks',
  starbux: 'starbucks',
  wendys: "wendy's",
  chikfila: 'chick-fil-a',
  'chick fil a': 'chick-fil-a',
  'chickfila': 'chick-fil-a',
  dunkins: "dunkin'",
  'dunkin donuts': "dunkin'",
  panara: 'panera',
  subways: 'subway',
  traderjoes: "trader joe's",
  'trader joes': "trader joe's",
  wholefoods: 'whole foods',

  // Restaurant typos
  resteraunt: 'restaurant',
  restaraunt: 'restaurant',
  resturant: 'restaurant',
  restraunt: 'restaurant',
  restuarant: 'restaurant',
  restrant: 'restaurant',
  restauraunt: 'restaurant',

  // Grocery typos
  grocey: 'grocery',
  groecry: 'grocery',
  grocry: 'grocery',
  groccery: 'grocery',

  // Pharmacy typos
  pharmcy: 'pharmacy',
  pharmasy: 'pharmacy',
  farmacy: 'pharmacy',
  pharamcy: 'pharmacy',

  // Laundromat typos
  laundramat: 'laundromat',
  laundrmat: 'laundromat',
  laundrymat: 'laundromat',
  laudromat: 'laundromat',

  // Coffee typos
  coffe: 'coffee',
  coffie: 'coffee',
  cofee: 'coffee',
  coffea: 'coffee',

  // C14 FIX: Additional common typos
  convience: 'convenience',
  conveience: 'convenience',
  conveniance: 'convenience',
  libary: 'library',
  libray: 'library',
  hosptal: 'hospital',
  hosptial: 'hospital',
  transporation: 'transportation',
  trasit: 'transit',
  tranist: 'transit',
  bakrey: 'bakery',
  bakry: 'bakery',
  bkaery: 'bakery',
  dentis: 'dentist',
  docter: 'doctor',
  doctr: 'doctor',
  supermaket: 'supermarket',
  supermakret: 'supermarket',
};

/**
 * Cleans and normalizes a query string.
 * B5 FIX: Now also translates i18n keywords to English equivalents
 * P1-B19 FIX: Now also handles Unicode (non-romanized) keywords
 */
function cleanQuery(query: string): string {
  let cleaned = query.toLowerCase().trim();

  // P1-B19 FIX: Apply Unicode translations first (handles Chinese, Japanese, Korean, Arabic)
  for (const [unicodeWord, englishWord] of Object.entries(UNICODE_KEYWORDS)) {
    if (cleaned.includes(unicodeWord.toLowerCase())) {
      cleaned = cleaned.replace(unicodeWord.toLowerCase(), englishWord);
    }
  }

  // B5 FIX: Apply i18n translations (romanized non-English)
  for (const [i18nWord, englishWord] of Object.entries(I18N_KEYWORDS)) {
    cleaned = cleaned.replace(new RegExp(`\\b${i18nWord}\\b`, 'gi'), englishWord);
  }

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
 * P1-B15 FIX: Now checks for listing context patterns
 * P2-B24 FIX: Now checks for negation patterns
 */
function hasLocationIntent(query: string): boolean {
  const lowerQuery = query.toLowerCase();

  // C5 FIX: Check for LLM-only patterns FIRST - these should NOT trigger Places
  // Even if they mention places, they're asking for info Places API can't provide
  for (const pattern of LLM_ONLY_PATTERNS) {
    if (pattern.test(query)) {
      return false; // Route to LLM instead of Places
    }
  }

  // P1-B15 FIX: Check for listing-specific context
  // "Is there parking here?" refers to the listing, not nearby parking lots
  for (const pattern of LISTING_CONTEXT_PATTERNS) {
    if (pattern.test(query)) {
      return false; // Route to LLM for listing-specific answers
    }
  }

  // P2-B24 FIX: Check for negation patterns
  // "I don't need a gym" should not trigger nearby search
  for (const pattern of NEGATION_PATTERNS) {
    if (pattern.test(query)) {
      return false; // Route to LLM, not a search request
    }
  }

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
 * B4 FIX: Now collects ALL matching types using Set to handle multi-intent queries
 * e.g., "gym or coffee" returns ['gym', 'cafe']
 */
function extractPlaceTypes(query: string): string[] | null {
  const cleaned = cleanQuery(query);
  const matchedTypes = new Set<string>();

  // Direct match (exact query matches a key)
  if (PLACE_TYPE_MAP[cleaned]) {
    PLACE_TYPE_MAP[cleaned].forEach((type) => matchedTypes.add(type));
  }

  // Find ALL matching place types within the query (not just first match)
  for (const [keyword, types] of Object.entries(PLACE_TYPE_MAP)) {
    if (cleaned.includes(keyword)) {
      types.forEach((type) => matchedTypes.add(type));
    }
  }

  // Return null if no matches, otherwise return unique types array
  return matchedTypes.size > 0 ? Array.from(matchedTypes) : null;
}

/**
 * P2-B25 FIX: Detects if message contains code blocks.
 * Code blocks should not be processed as nearby queries.
 */
function containsCodeBlock(message: string): boolean {
  // Markdown code blocks (``` or ```)
  if (/```[\s\S]*```/.test(message)) return true;
  // Inline code (`code`)
  if (/`[^`]+`/.test(message)) return true;
  // Common code patterns
  if (/\b(function|const|let|var|import|export|class|return)\s+\w+/.test(message)) return true;
  // JSON-like patterns
  if (/\{\s*["']?\w+["']?\s*:/.test(message)) return true;
  return false;
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

  // P2-B25 FIX: Skip code blocks entirely - they're not location queries
  if (containsCodeBlock(message)) {
    return {
      isNearbyQuery: false,
      searchType: 'text',
      normalizedQuery: '',
    };
  }

  const normalizedQuery = cleanQuery(message);

  // C7 FIX: Check for mixed intent queries (nearby + info) early
  // These should be routed to LLM for comprehensive answers
  const hasMixedIntent = hasMixedIntentQuery(message);

  // Check if this is a location/nearby query
  if (!hasLocationIntent(message)) {
    return {
      isNearbyQuery: false,
      searchType: 'text',
      normalizedQuery,
      // C7 FIX: Include mixed intent flag
      hasMixedIntent,
    };
  }

  // C3 FIX: Check for multi-brand queries first
  const multiBrandDetected = hasMultipleBrands(message);

  // C7 FIX: If mixed intent detected, prefer LLM route by marking as non-nearby
  // This allows the chat to route to LLM which can answer "what time does X close"
  if (hasMixedIntent) {
    return {
      isNearbyQuery: false,
      searchType: 'text',
      normalizedQuery,
      hasMixedIntent,
      multiBrandDetected,
    };
  }

  // Check if we should use text search (specific cuisine, brand, etc.)
  if (shouldUseTextSearch(message)) {
    return {
      isNearbyQuery: true,
      searchType: 'text',
      textQuery: normalizedQuery || message.replace(/[?!.,]/g, '').trim(),
      normalizedQuery,
      // C3 FIX: Include multi-brand flag for UI to handle
      multiBrandDetected,
      hasMixedIntent,
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
      hasMixedIntent,
    };
  }

  // Fallback to text search for unrecognized place queries
  return {
    isNearbyQuery: true,
    searchType: 'text',
    textQuery: normalizedQuery || message.replace(/[?!.,]/g, '').trim(),
    normalizedQuery,
    hasMixedIntent,
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
  hasMultipleBrands,
  // C7 FIX: Export mixed intent helpers for testing
  hasMixedIntentQuery,
  // P2-B25 FIX: Export code block detection for testing
  containsCodeBlock,
  PLACE_TYPE_MAP,
  LOCATION_KEYWORDS,
  TEXT_SEARCH_PATTERNS,
  MULTI_BRAND_PATTERN,
  // C7 FIX: Export info intent patterns for testing
  INFO_INTENT_PATTERNS,
  TYPO_CORRECTIONS,
  I18N_KEYWORDS,
  // P1-B19 FIX: Export Unicode keywords for testing
  UNICODE_KEYWORDS,
  // P1-B15 FIX: Export listing context patterns for testing
  LISTING_CONTEXT_PATTERNS,
  // P2-B24 FIX: Export negation patterns for testing
  NEGATION_PATTERNS,
};
