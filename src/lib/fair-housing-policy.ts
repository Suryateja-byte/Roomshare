/**
 * Fair Housing Policy Gate
 *
 * Blocks queries that could lead to Fair Housing Act violations.
 * Protected classes under FHA: race, color, religion, national origin,
 * sex, familial status, and disability.
 *
 * This gate prevents searching for areas based on demographics or
 * safety/crime data that could be used for discriminatory housing decisions.
 */

export interface PolicyCheckResult {
  allowed: boolean;
  blockedReason?: string;
}

/**
 * Standard refusal message for blocked queries.
 * Does not reveal which specific pattern was matched to avoid gaming.
 */
export const POLICY_REFUSAL_MESSAGE =
  "I can help you find specific amenities like gyms, restaurants, or transit stations. What would you like me to search for?";

/**
 * Patterns that indicate potentially discriminatory housing queries.
 * These are checked case-insensitively against the user's query.
 */
const BLOCKED_PATTERNS: Array<{ pattern: RegExp; category: string }> = [
  // Race/Ethnicity + Neighborhood context
  {
    pattern:
      /\b(white|black|asian|hispanic|latino|african|chinese|indian|arab|jewish|muslim|christian)\s*(neighborhood|area|community|district|zone)/i,
    category: 'race-neighborhood',
  },
  {
    pattern:
      /\b(where\s+do|where\s+are|live\s+near|live\s+with)\s*(whites?|blacks?|asians?|hispanics?|latinos?|africans?|indians?|chinese|arabs?|jews?|muslims?|christians?)/i,
    category: 'demographic-location',
  },
  {
    pattern:
      /\b(no|without|avoid)\s*(whites?|blacks?|asians?|hispanics?|latinos?|africans?|indians?|chinese|arabs?|jews?|muslims?|christians?)/i,
    category: 'demographic-exclusion',
  },

  // Safety/Crime queries (can be proxies for racial discrimination)
  {
    pattern: /\b(safe|safety|unsafe|dangerous|crime|criminal|hood|ghetto)\s*(area|neighborhood|community|zone|district)?/i,
    category: 'safety-crime',
  },
  {
    pattern: /\b(crime\s*rate|violent|shooting|robbery|burglary|theft)\s*(area|neighborhood)?/i,
    category: 'crime-statistics',
  },
  {
    pattern: /\b(bad|sketchy|rough|scary)\s*(area|neighborhood|part\s*of\s*town)/i,
    category: 'negative-area',
  },
  {
    pattern: /\b(good|nice|upscale)\s*(area|neighborhood)\b/i,
    category: 'positive-area-vague',
  },

  // Religion + Neighborhood
  {
    pattern:
      /\b(christian|muslim|jewish|hindu|buddhist|catholic|protestant|mormon|sikh)\s*(neighborhood|area|community)/i,
    category: 'religion-neighborhood',
  },
  {
    pattern: /\b(church|mosque|synagogue|temple|gurdwara)\s*free\s*(area|neighborhood)?/i,
    category: 'religion-free',
  },

  // Familial Status
  {
    pattern: /\b(no\s*(kids?|children|families|babies|toddlers))/i,
    category: 'no-children',
  },
  {
    pattern: /\b(adults?\s*only|child\s*free|kid\s*free|family\s*free)\s*(area|neighborhood|community)?/i,
    category: 'adults-only',
  },
  {
    pattern: /\b(singles?\s*only|couples?\s*only)\s*(area|neighborhood)?/i,
    category: 'singles-only',
  },

  // Disability
  {
    pattern:
      /\b(no\s*(disabled|handicapped|wheelchairs?|blind|deaf|mentally\s*ill))/i,
    category: 'no-disability',
  },
  {
    pattern: /\b(normal|able[-\s]?bodied)\s*(people|residents|neighbors)/i,
    category: 'ableist',
  },

  // Sex/Gender in neighborhood context
  {
    pattern: /\b(men\s*only|women\s*only|male\s*only|female\s*only)\s*(area|neighborhood)/i,
    category: 'gender-only-area',
  },

  // National Origin / Immigration
  {
    pattern: /\b(american\s*only|citizens?\s*only|no\s*immigrants?|no\s*foreigners?)/i,
    category: 'citizenship',
  },

  // School district rankings (often used as proxy for demographics)
  {
    pattern: /\b(best|worst|top|bottom)\s*(school\s*district|schools?\s*ranking)/i,
    category: 'school-ranking',
  },

  // Property value / gentrification queries (can indicate steering)
  {
    pattern: /\b(property\s*values?|home\s*values?)\s*(going\s*up|increasing|decreasing|going\s*down)/i,
    category: 'property-value-trends',
  },
  {
    pattern: /\b(gentrifying|gentrification|up\s*and\s*coming)/i,
    category: 'gentrification',
  },
];

/**
 * Checks if a query violates Fair Housing policy.
 *
 * @param query - The user's search query
 * @returns PolicyCheckResult with allowed=false if blocked
 */
export function checkFairHousingPolicy(query: string): PolicyCheckResult {
  if (!query || typeof query !== 'string') {
    return { allowed: true };
  }

  const normalizedQuery = query.toLowerCase().trim();

  // Skip very short queries
  if (normalizedQuery.length < 3) {
    return { allowed: true };
  }

  for (const { pattern, category } of BLOCKED_PATTERNS) {
    if (pattern.test(normalizedQuery)) {
      // No logging here - logging happens via /api/metrics with privacy protections
      return {
        allowed: false,
        blockedReason: category,
      };
    }
  }

  return { allowed: true };
}

/**
 * List of categories for testing purposes.
 */
export const BLOCKED_CATEGORIES = [
  'race-neighborhood',
  'demographic-location',
  'demographic-exclusion',
  'safety-crime',
  'crime-statistics',
  'negative-area',
  'positive-area-vague',
  'religion-neighborhood',
  'religion-free',
  'no-children',
  'adults-only',
  'singles-only',
  'no-disability',
  'ableist',
  'gender-only-area',
  'citizenship',
  'school-ranking',
  'property-value-trends',
  'gentrification',
] as const;

export type BlockedCategory = (typeof BLOCKED_CATEGORIES)[number];
