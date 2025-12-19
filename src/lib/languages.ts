/**
 * Canonical Language List
 *
 * Single source of truth for supported languages in RoomShare.
 * Stores ISO 639-1 language codes with display names.
 *
 * Used for:
 * - "Languages spoken in the house" (lister selection)
 * - "Can communicate in" (seeker filter)
 * - Listing card display
 */

/**
 * Supported languages with ISO 639-1 codes and display names.
 * Approximately 50 languages covering major world languages,
 * South Asian, East Asian, Middle Eastern, African, and European languages.
 */
export const SUPPORTED_LANGUAGES = {
  // Major world languages
  en: 'English',
  es: 'Spanish',
  zh: 'Mandarin Chinese',
  hi: 'Hindi',
  ar: 'Arabic',
  pt: 'Portuguese',
  ru: 'Russian',
  ja: 'Japanese',
  de: 'German',
  fr: 'French',
  ko: 'Korean',
  vi: 'Vietnamese',
  it: 'Italian',
  nl: 'Dutch',
  pl: 'Polish',
  tr: 'Turkish',
  th: 'Thai',

  // South Asian languages
  te: 'Telugu',
  ta: 'Tamil',
  bn: 'Bengali',
  pa: 'Punjabi',
  gu: 'Gujarati',
  mr: 'Marathi',
  kn: 'Kannada',
  ml: 'Malayalam',
  ur: 'Urdu',
  ne: 'Nepali',
  si: 'Sinhala',

  // East Asian / Southeast Asian
  yue: 'Cantonese',
  tl: 'Tagalog',
  id: 'Indonesian',
  ms: 'Malay',
  my: 'Burmese',
  km: 'Khmer',

  // Middle Eastern
  fa: 'Persian',
  he: 'Hebrew',

  // African
  sw: 'Swahili',
  am: 'Amharic',
  yo: 'Yoruba',
  ha: 'Hausa',
  ig: 'Igbo',

  // European
  uk: 'Ukrainian',
  cs: 'Czech',
  ro: 'Romanian',
  el: 'Greek',
  hu: 'Hungarian',
  sv: 'Swedish',
  da: 'Danish',
  no: 'Norwegian',
  fi: 'Finnish',
  sk: 'Slovak',
  bg: 'Bulgarian',
  sr: 'Serbian',
  hr: 'Croatian',
} as const;

/**
 * Type for valid language codes
 */
export type LanguageCode = keyof typeof SUPPORTED_LANGUAGES;

/**
 * Array of all valid language codes (for iteration)
 */
export const LANGUAGE_CODES = Object.keys(SUPPORTED_LANGUAGES) as LanguageCode[];

/**
 * Array of language entries sorted alphabetically by display name
 * Useful for rendering in UI dropdowns and chip selectors
 */
export const LANGUAGES_SORTED = LANGUAGE_CODES
  .map((code) => ({
    code,
    name: SUPPORTED_LANGUAGES[code],
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

/**
 * Check if a string is a valid language code
 */
export function isValidLanguageCode(code: string): code is LanguageCode {
  return code in SUPPORTED_LANGUAGES;
}

/**
 * Get display name for a language code
 * Returns the code itself if not found (for backwards compatibility)
 */
export function getLanguageName(code: string): string {
  if (isValidLanguageCode(code)) {
    return SUPPORTED_LANGUAGES[code];
  }
  // Handle legacy display names stored directly
  if (Object.values(SUPPORTED_LANGUAGES).includes(code as typeof SUPPORTED_LANGUAGES[LanguageCode])) {
    return code;
  }
  return code;
}

/**
 * Mapping from legacy display names to codes (for migration)
 */
export const LEGACY_NAME_TO_CODE: Record<string, LanguageCode> = {
  English: 'en',
  Spanish: 'es',
  Mandarin: 'zh',
  'Mandarin Chinese': 'zh',
  Hindi: 'hi',
  French: 'fr',
  Arabic: 'ar',
  Portuguese: 'pt',
  Russian: 'ru',
  Japanese: 'ja',
  German: 'de',
  Korean: 'ko',
  Vietnamese: 'vi',
  Italian: 'it',
  Dutch: 'nl',
  Polish: 'pl',
  Turkish: 'tr',
  Thai: 'th',
  Telugu: 'te',
  Tamil: 'ta',
  Bengali: 'bn',
  Punjabi: 'pa',
  Gujarati: 'gu',
  Marathi: 'mr',
  Kannada: 'kn',
  Malayalam: 'ml',
  Urdu: 'ur',
};

const LEGACY_NAME_TO_CODE_LOWER: Record<string, LanguageCode> = Object.fromEntries(
  Object.entries(LEGACY_NAME_TO_CODE).map(([name, code]) => [name.toLowerCase(), code])
);

/**
 * Convert a language (code or legacy name) to its code
 * Returns the input if no mapping found
 */
export function toLanguageCode(input: string): string {
  const normalized = input.trim();
  if (!normalized) {
    return normalized;
  }
  const lower = normalized.toLowerCase();
  // Already a valid code
  if (isValidLanguageCode(lower)) {
    return lower;
  }
  // Try legacy name mapping
  const code = LEGACY_NAME_TO_CODE[normalized] ?? LEGACY_NAME_TO_CODE_LOWER[lower];
  if (code) {
    return code;
  }
  // Return as-is (unknown language)
  return normalized;
}

/**
 * Validate and normalize an array of languages
 * Converts legacy names to codes, filters invalid entries
 */
export function normalizeLanguages(languages: string[]): LanguageCode[] {
  return languages
    .map(toLanguageCode)
    .filter(isValidLanguageCode);
}
