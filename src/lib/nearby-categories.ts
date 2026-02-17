/**
 * Category filtering configuration for the Nearby Places API.
 *
 * Extracted from the nearby route to keep the route handler focused on
 * request/response logic while this module owns all category data.
 */

import type { NearbyPlace } from "@/types/nearby";

// ============================================================================
// CATEGORY FILTERING CONFIGURATION
// Blocklists and allowlists to filter out irrelevant results from Radar API
// ============================================================================

export interface CategoryFilter {
  /** Terms in name that indicate the place should be EXCLUDED */
  blocklist: string[];
  /** Known chains that DEFINITELY belong to this category (always include) */
  allowedChains: string[];
  /** Terms in name that indicate the place BELONGS to this category */
  allowedTerms: string[];
  /** If true, REQUIRE the place to have an allowed term or be a known chain */
  requireAllowedTerms?: boolean;
}

export const CATEGORY_FILTERS: Record<string, CategoryFilter> = {
  // Pharmacy: Exclude cannabis dispensaries, include known pharmacy chains
  // STRICT: Must have pharmacy-related terms or be a known chain
  pharmacy: {
    blocklist: [
      "dispensary",
      "cannabis",
      "marijuana",
      "weed",
      "recreational",
      "mmj",
      "thc",
      "cbd",
      "hemp",
      "green dragon",
      "livwell",
      "lova",
      "herbs 4 you",
      "higher grade",
      "pure marijuana",
      "rocky mountain high",
      "nobo",
      "medicine man",
      "starbuds",
      "lightshade",
      "native roots",
      "the green solution",
      "green dot",
      "terrapin",
      "l'eagle",
      "the clinic",
      "diego pellicer",
      "buddy boy",
      "good chemistry",
      "local product",
      "market perceptions",
      "amch",
    ],
    allowedChains: [
      "cvs",
      "walgreens",
      "rite aid",
      "walmart pharmacy",
      "kroger pharmacy",
      "costco pharmacy",
      "target pharmacy",
      "safeway pharmacy",
      "albertsons",
      "publix pharmacy",
      "heb pharmacy",
      "meijer pharmacy",
      "wegmans pharmacy",
      "alto pharmacy",
      "capsule pharmacy",
      "amazon pharmacy",
      "express scripts",
    ],
    allowedTerms: [
      "pharmacy",
      "pharmacie",
      "drug store",
      "drugstore",
      "rx",
      "prescription",
    ],
    requireAllowedTerms: true,
  },

  // Grocery: Exclude liquor stores, cannabis shops, convenience stores (unless chains)
  // STRICT: Must have grocery-related terms or be a known chain
  "food-grocery": {
    blocklist: [
      "liquor",
      "wine",
      "spirits",
      "dispensary",
      "cannabis",
      "marijuana",
      "tobacco",
      "smoke shop",
      "vape",
      "head shop",
      "credit union",
      "bank",
      "cleaning",
      "concierge",
      "healing",
      "studio",
      "energy",
      "consulting",
      "resources",
      "acuity",
      "solutions",
      "services",
      "agency",
    ],
    allowedChains: [
      "walmart",
      "kroger",
      "safeway",
      "albertsons",
      "publix",
      "heb",
      "meijer",
      "trader joe",
      "whole foods",
      "costco",
      "sam's club",
      "aldi",
      "lidl",
      "wegmans",
      "food lion",
      "giant",
      "stop & shop",
      "hannaford",
      "sprouts",
      "natural grocers",
      "king soopers",
      "ralphs",
      "vons",
      "lucky",
      "99 ranch",
      "h mart",
      "ranch 99",
      "mitsuwa",
      "patel brothers",
      "target",
      "choice market",
      "whole foods market",
    ],
    allowedTerms: [
      "grocery",
      "supermarket",
      "market",
      "food mart",
      "grocer",
      "foods",
      "produce",
      "fruit",
      "vegetable",
      "meat",
      "deli",
      "bakery",
    ],
    requireAllowedTerms: true,
  },
  supermarket: {
    blocklist: [
      "liquor",
      "wine",
      "spirits",
      "dispensary",
      "cannabis",
      "marijuana",
    ],
    allowedChains: [
      "walmart",
      "kroger",
      "safeway",
      "albertsons",
      "publix",
      "heb",
      "meijer",
      "trader joe",
      "whole foods",
      "costco",
      "sam's club",
      "aldi",
      "lidl",
      "king soopers",
      "target",
    ],
    allowedTerms: ["supermarket", "grocery", "market", "foods"],
    requireAllowedTerms: true,
  },

  // Fitness: Exclude nightclubs, bars with "club" in name
  // STRICT: Must have fitness-related terms or be a known chain
  gym: {
    blocklist: [
      "night club",
      "nightclub",
      "bar",
      "pub",
      "lounge",
      "casino",
      "strip club",
      "gentlemen",
      "dispensary",
      "cannabis",
    ],
    allowedChains: [
      "planet fitness",
      "la fitness",
      "24 hour fitness",
      "anytime fitness",
      "gold's gym",
      "equinox",
      "lifetime fitness",
      "orangetheory",
      "f45",
      "crossfit",
      "ymca",
      "ywca",
      "crunch fitness",
      "snap fitness",
      "world gym",
      "blink fitness",
      "retro fitness",
      "esporta",
    ],
    allowedTerms: [
      "gym",
      "fitness",
      "workout",
      "crossfit",
      "yoga",
      "pilates",
      "training",
      "athletic",
      "sports club",
      "health club",
      "recreation center",
      "rec center",
      "exercise",
      "weights",
      "boxing",
      "martial arts",
      "climbing",
      "swim",
    ],
    requireAllowedTerms: true,
  },
  "fitness-recreation": {
    blocklist: ["night club", "nightclub", "bar", "pub", "lounge", "casino"],
    allowedChains: [
      "planet fitness",
      "la fitness",
      "24 hour fitness",
      "anytime fitness",
      "gold's gym",
      "equinox",
      "lifetime fitness",
      "orangetheory",
      "f45",
    ],
    allowedTerms: [
      "fitness",
      "gym",
      "recreation",
      "sports",
      "athletic",
      "yoga",
      "pilates",
      "exercise",
      "training",
      "workout",
    ],
    requireAllowedTerms: true,
  },

  // Restaurants: Exclude bars, nightclubs, liquor stores
  restaurant: {
    blocklist: [
      "bar & grill only",
      "nightclub",
      "strip club",
      "gentlemen",
      "liquor store",
      "dispensary",
      "cannabis",
      "smoke shop",
    ],
    allowedChains: [],
    allowedTerms: [
      "restaurant",
      "cafe",
      "diner",
      "bistro",
      "eatery",
      "grill",
      "kitchen",
      "pizzeria",
      "steakhouse",
      "sushi",
      "taco",
      "burger",
      "sandwich",
    ],
  },
  "food-beverage": {
    blocklist: [
      "liquor store",
      "wine shop",
      "dispensary",
      "cannabis",
      "smoke shop",
      "tobacco",
      "vape shop",
    ],
    allowedChains: [],
    allowedTerms: [],
  },

  // Gas Stations: Exclude auto repair shops that aren't gas stations
  // STRICT: Must have gas-related terms or be a known chain
  "gas-station": {
    blocklist: [
      "auto repair",
      "mechanic",
      "tire shop",
      "car wash only",
      "oil change",
      "dispensary",
      "cannabis",
    ],
    allowedChains: [
      "shell",
      "chevron",
      "exxon",
      "mobil",
      "bp",
      "texaco",
      "76",
      "arco",
      "valero",
      "marathon",
      "speedway",
      "circle k",
      "quicktrip",
      "wawa",
      "sheetz",
      "racetrac",
      "pilot",
      "flying j",
      "loves",
      "ta",
      "petro",
      "sinclair",
      "phillips 66",
      "conoco",
      "citgo",
      "sunoco",
      "gulf",
      "murphy usa",
      "casey's",
      "kum & go",
      "kwik trip",
      "maverik",
      "maverick",
      "mavrik",
      "holiday",
      "royal farms",
      "united dairy farmers",
      "giant eagle getgo",
      "kroger fuel",
      "safeway fuel",
      "costco gas",
      "sam's club fuel",
      "buc-ee's",
      "7-eleven",
      "alta convenience",
    ],
    allowedTerms: [
      "gas",
      "fuel",
      "petrol",
      "gas station",
      "filling station",
      "service station",
      "convenience",
      "petroleum",
    ],
    requireAllowedTerms: true,
  },

  // Shopping: Exclude cannabis shops, adult stores
  "shopping-retail": {
    blocklist: [
      "dispensary",
      "cannabis",
      "marijuana",
      "adult",
      "xxx",
      "sex shop",
      "smoke shop",
      "tobacco",
      "vape shop",
      "head shop",
      "liquor",
    ],
    allowedChains: [],
    allowedTerms: [],
  },
};

// Strong blocklist terms that should NEVER be overridden by allowed terms
// These indicate the place is definitely NOT in a consumer-facing category
const STRONG_BLOCKLIST_TERMS = [
  "resources",
  "consulting",
  "services",
  "solutions",
  "agency",
  "llc",
  "inc",
  "corp",
  "credit union",
  "bank",
  "insurance",
  "real estate",
  "cleaning",
  "concierge",
  "healing",
  "acuity",
  "company",
  "association",
  "hvac",
  "mounting",
  "archiving",
  "data recovery",
  "telecommunications",
  "cable tv",
];

/**
 * Filter places based on category-specific blocklists and allowlists.
 * Returns true if the place should be INCLUDED in results.
 */
export function shouldIncludePlace(
  place: NearbyPlace,
  requestedCategories: string[],
): boolean {
  const nameLower = place.name.toLowerCase();
  const chainLower = place.chain?.toLowerCase() || "";

  for (const category of requestedCategories) {
    const filter = CATEGORY_FILTERS[category];
    if (!filter) continue;

    // ALLOWLIST CHECK: known chain for this category → always include
    const isKnownChain =
      chainLower &&
      filter.allowedChains.some((chain) => chainLower.includes(chain));
    if (isKnownChain) return true;

    const nameMatchesAllowedChain = filter.allowedChains.some((chain) =>
      nameLower.includes(chain),
    );
    if (nameMatchesAllowedChain) return true;

    const hasAllowedTerm = filter.allowedTerms.some((term) =>
      nameLower.includes(term),
    );
    const hasBlockedTerm = filter.blocklist.some((term) =>
      nameLower.includes(term),
    );
    const hasStrongBlockedTerm = STRONG_BLOCKLIST_TERMS.some((term) =>
      nameLower.includes(term),
    );

    if (hasStrongBlockedTerm) return false;
    if (hasBlockedTerm && !hasAllowedTerm) return false;
    if (filter.requireAllowedTerms && !hasAllowedTerm) return false;
  }

  return true;
}

/**
 * Common search terms mapped to Radar categories.
 * When users search for category keywords like "gym", route to Places Search API
 * instead of Autocomplete (which only finds places literally named "gym").
 */
export const KEYWORD_CATEGORY_MAP: Record<string, string[]> = {
  // Fitness
  gym: ["gym", "fitness-recreation"],
  fitness: ["gym", "fitness-recreation"],
  workout: ["gym", "fitness-recreation"],

  // Food & Dining
  restaurant: ["restaurant", "food-beverage"],
  food: ["food-beverage", "restaurant"],
  pizza: ["pizza", "restaurant"],
  burger: ["burger-joint", "restaurant"],
  sushi: ["sushi-restaurant", "restaurant"],
  chinese: ["chinese-restaurant", "restaurant"],
  mexican: ["mexican-restaurant", "restaurant"],
  italian: ["italian-restaurant", "restaurant"],
  thai: ["thai-restaurant", "restaurant"],
  indian: ["indian-restaurant", "restaurant"],

  // Coffee & Drinks
  coffee: ["coffee-shop", "cafe"],
  cafe: ["cafe", "coffee-shop"],
  tea: ["tea-room", "cafe"],
  bar: ["bar", "nightlife"],

  // Shopping
  grocery: ["food-grocery", "supermarket"],
  supermarket: ["supermarket", "food-grocery"],
  shopping: ["shopping-retail"],

  // Health
  pharmacy: ["pharmacy"],
  drugstore: ["pharmacy"],
  doctor: ["doctor", "health-medicine"],
  hospital: ["hospital", "health-medicine"],
  dentist: ["dentist", "health-medicine"],

  // Services
  bank: ["bank", "financial-service"],
  atm: ["atm", "financial-service"],
  gas: ["gas-station"],
  "gas station": ["gas-station"],
  parking: ["parking"],
  hotel: ["hotel", "lodging"],
};
