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
 *
 * DYNAMIC PATTERN GENERATION: Patterns are built from the canonical
 * SUPPORTED_LANGUAGES list to ensure all 54 languages are covered.
 */

import { SUPPORTED_LANGUAGES, LEGACY_NAME_TO_CODE } from '@/lib/languages';

export interface LanguageComplianceResult {
  allowed: boolean;
  message?: string;
}

/**
 * Generate comprehensive list of language names for pattern matching.
 * Only excludes GENERIC tokens (not actual language names like "chinese").
 */
function generateLanguageWordList(): string[] {
  const languageWords = new Set<string>();

  // Only exclude truly generic tokens - NOT actual language names
  const EXCLUDED_WORDS = new Set([
    'language',
    'languages',
    'speaker',
    'speakers',
    'speaking',
  ]);

  // Add all display names from SUPPORTED_LANGUAGES
  Object.values(SUPPORTED_LANGUAGES).forEach((name) => {
    const lowerName = name.toLowerCase();
    languageWords.add(lowerName);
    // Split multi-word names (e.g., "Mandarin Chinese")
    lowerName.split(/\s+/).forEach((word) => {
      if (word.length > 3 && !EXCLUDED_WORDS.has(word)) {
        languageWords.add(word);
      }
    });
  });

  // Add legacy name keys (e.g., "Mandarin" -> "zh")
  Object.keys(LEGACY_NAME_TO_CODE).forEach((name) => {
    const lowerName = name.toLowerCase();
    languageWords.add(lowerName);
  });

  // Sort by length descending for proper regex alternation
  // (longer matches should be tried first to avoid partial matches)
  return Array.from(languageWords).sort((a, b) => b.length - a.length);
}

const LANGUAGE_WORDS = generateLanguageWordList();

/**
 * Build a regex pattern using the generated language word list.
 * Escapes special regex characters in language names.
 */
function buildLanguagePattern(template: (langs: string) => string): RegExp {
  const escapedLangs = LANGUAGE_WORDS.map((lang) =>
    lang.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  ).join('|');
  return new RegExp(template(escapedLangs), 'i');
}

/**
 * Patterns that indicate discriminatory language requirements in listings.
 * Dynamically generated from the canonical SUPPORTED_LANGUAGES list.
 *
 * Supports both space and hyphen separators (e.g., "English only" and "English-only")
 */
const LANGUAGE_EXCLUSION_PATTERNS: RegExp[] = [
  // "<language> only" or "<language>-only" patterns
  buildLanguagePattern((langs) => `\\b(${langs})(?:\\s|-)+only\\b`),

  // "only <language>" or "only-<language>" patterns
  buildLanguagePattern((langs) => `\\bonly(?:\\s|-)+(${langs})\\b`),

  // "no <language> speakers" patterns
  buildLanguagePattern(
    (langs) => `\\bno\\s+(${langs})\\s*(speakers?|speaking)?\\b`
  ),

  // "must speak <language>" patterns (strict requirement)
  buildLanguagePattern(
    (langs) =>
      `\\b(must|required?\\s+to|have\\s+to)\\s+(speak|know|be\\s+fluent\\s+in)\\s+(${langs})\\b`
  ),

  // "<language> required" patterns
  buildLanguagePattern(
    (langs) => `\\b(${langs})\\s+(is\\s+)?(required|mandatory|necessary)\\b`
  ),

  // "fluent <language> required" patterns
  buildLanguagePattern(
    (langs) =>
      `\\b(fluent|native)\\s+(${langs})\\s+(only|required|speakers?\\s+only)\\b`
  ),
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
 * Number of patterns for testing purposes
 */
export const LANGUAGE_EXCLUSION_PATTERN_COUNT = LANGUAGE_EXCLUSION_PATTERNS.length;

/**
 * Number of unique language words covered by patterns (for testing)
 */
export const LANGUAGE_WORD_COUNT = LANGUAGE_WORDS.length;
