/**
 * Listing Language Compliance Guard
 *
 * Narrow guardrail specifically for listing descriptions to prevent
 * language-related discriminatory phrasing.
 *
 * This is SEPARATE from the Fair Housing Policy gate (which handles
 * neighborhood chat queries). This module only checks listing descriptions
 * for obvious exclusionary language patterns.
 *
 * NOTE: This is intentionally minimal - we don't want false positives
 * that block legitimate descriptions. The language selection UI is the
 * proper way to indicate household languages.
 */

export interface LanguageComplianceResult {
  allowed: boolean;
  message?: string;
}

/**
 * Patterns that indicate discriminatory language requirements in listings.
 * These are narrow and specific to avoid false positives.
 */
const LANGUAGE_EXCLUSION_PATTERNS: RegExp[] = [
  // "<language> only" patterns
  /\b(english|spanish|chinese|mandarin|hindi|arabic|french|german|japanese|korean|vietnamese|tagalog|telugu|tamil|bengali|punjabi|gujarati|marathi|urdu)\s+only\b/i,

  // "only <language>" patterns
  /\bonly\s+(english|spanish|chinese|mandarin|hindi|arabic|french|german|japanese|korean|vietnamese|tagalog|telugu|tamil|bengali|punjabi|gujarati|marathi|urdu)\b/i,

  // "no <language> speakers" patterns
  /\bno\s+(english|spanish|chinese|mandarin|hindi|arabic|french|german|japanese|korean|vietnamese|tagalog|telugu|tamil|bengali|punjabi|gujarati|marathi|urdu)\s*(speakers?|speaking)?\b/i,

  // "must speak <language>" patterns (strict requirement)
  /\b(must|required?\s+to|have\s+to)\s+(speak|know|be\s+fluent\s+in)\s+(english|spanish|chinese|mandarin|hindi|arabic|french|german)\b/i,

  // "<language> required" patterns
  /\b(english|spanish|chinese|mandarin|hindi)\s+(is\s+)?(required|mandatory|necessary)\b/i,

  // "fluent <language> required" patterns
  /\b(fluent|native)\s+(english|spanish|chinese|mandarin|hindi)\s+(only|required|speakers?\s+only)\b/i,
];

/**
 * Generic refusal message that doesn't reveal which pattern was matched.
 * Directs users to use the language selection UI instead.
 */
const REFUSAL_MESSAGE =
  'Please describe communication needs without exclusionary terms like "only" or "required". ' +
  'Use the "Languages spoken in the house" field to indicate household languages.';

/**
 * Check if a listing description contains language-related discriminatory phrasing.
 *
 * @param description - The listing description text
 * @returns Result with allowed=false if discriminatory patterns found
 */
export function checkListingLanguageCompliance(
  description: string
): LanguageComplianceResult {
  if (!description || typeof description !== 'string') {
    return { allowed: true };
  }

  const normalizedDescription = description.toLowerCase().trim();

  // Skip very short descriptions
  if (normalizedDescription.length < 10) {
    return { allowed: true };
  }

  for (const pattern of LANGUAGE_EXCLUSION_PATTERNS) {
    if (pattern.test(normalizedDescription)) {
      return {
        allowed: false,
        message: REFUSAL_MESSAGE,
      };
    }
  }

  return { allowed: true };
}

/**
 * List of patterns for testing purposes
 */
export const LANGUAGE_EXCLUSION_PATTERN_COUNT = LANGUAGE_EXCLUSION_PATTERNS.length;
