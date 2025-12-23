import {
  SUPPORTED_LANGUAGES,
  LANGUAGE_CODES,
  LANGUAGES_SORTED,
  isValidLanguageCode,
  getLanguageName,
  toLanguageCode,
  normalizeLanguages,
  LEGACY_NAME_TO_CODE,
  type LanguageCode,
} from '@/lib/languages';

describe('languages', () => {
  describe('SUPPORTED_LANGUAGES', () => {
    it('contains expected major languages', () => {
      expect(SUPPORTED_LANGUAGES.en).toBe('English');
      expect(SUPPORTED_LANGUAGES.es).toBe('Spanish');
      expect(SUPPORTED_LANGUAGES.zh).toBe('Mandarin Chinese');
      expect(SUPPORTED_LANGUAGES.hi).toBe('Hindi');
      expect(SUPPORTED_LANGUAGES.fr).toBe('French');
      expect(SUPPORTED_LANGUAGES.de).toBe('German');
    });

    it('contains South Asian languages', () => {
      expect(SUPPORTED_LANGUAGES.te).toBe('Telugu');
      expect(SUPPORTED_LANGUAGES.ta).toBe('Tamil');
      expect(SUPPORTED_LANGUAGES.bn).toBe('Bengali');
      expect(SUPPORTED_LANGUAGES.pa).toBe('Punjabi');
      expect(SUPPORTED_LANGUAGES.gu).toBe('Gujarati');
      expect(SUPPORTED_LANGUAGES.mr).toBe('Marathi');
      expect(SUPPORTED_LANGUAGES.kn).toBe('Kannada');
      expect(SUPPORTED_LANGUAGES.ml).toBe('Malayalam');
      expect(SUPPORTED_LANGUAGES.ur).toBe('Urdu');
    });

    it('contains approximately 50 languages', () => {
      const count = Object.keys(SUPPORTED_LANGUAGES).length;
      expect(count).toBeGreaterThanOrEqual(45);
      expect(count).toBeLessThanOrEqual(55);
    });
  });

  describe('LANGUAGE_CODES', () => {
    it('contains all language codes', () => {
      expect(LANGUAGE_CODES).toContain('en');
      expect(LANGUAGE_CODES).toContain('es');
      expect(LANGUAGE_CODES).toContain('te');
      expect(LANGUAGE_CODES).toContain('hi');
    });

    it('matches SUPPORTED_LANGUAGES keys', () => {
      expect(LANGUAGE_CODES.length).toBe(Object.keys(SUPPORTED_LANGUAGES).length);
    });
  });

  describe('LANGUAGES_SORTED', () => {
    it('is sorted alphabetically by name', () => {
      for (let i = 1; i < LANGUAGES_SORTED.length; i++) {
        const prev = LANGUAGES_SORTED[i - 1].name;
        const curr = LANGUAGES_SORTED[i].name;
        expect(prev.localeCompare(curr)).toBeLessThanOrEqual(0);
      }
    });

    it('contains code and name properties', () => {
      expect(LANGUAGES_SORTED[0]).toHaveProperty('code');
      expect(LANGUAGES_SORTED[0]).toHaveProperty('name');
    });
  });

  describe('isValidLanguageCode', () => {
    describe('valid codes', () => {
      const validCodes = ['en', 'es', 'zh', 'hi', 'te', 'ta', 'fr', 'de', 'ja', 'ko'];

      test.each(validCodes)('accepts valid code: "%s"', (code) => {
        expect(isValidLanguageCode(code)).toBe(true);
      });
    });

    describe('invalid codes', () => {
      const invalidCodes = [
        'English',
        'spanish',
        'HINDI',
        'xyz',
        '',
        '123',
        'english',
        'e',
        'eng',
      ];

      test.each(invalidCodes)('rejects invalid code: "%s"', (code) => {
        expect(isValidLanguageCode(code)).toBe(false);
      });
    });
  });

  describe('getLanguageName', () => {
    describe('from language codes', () => {
      const codeToName: [string, string][] = [
        ['en', 'English'],
        ['es', 'Spanish'],
        ['te', 'Telugu'],
        ['hi', 'Hindi'],
        ['zh', 'Mandarin Chinese'],
      ];

      test.each(codeToName)('code "%s" returns "%s"', (code, expectedName) => {
        expect(getLanguageName(code)).toBe(expectedName);
      });
    });

    describe('from legacy display names', () => {
      const names = ['English', 'Spanish', 'Hindi', 'Telugu'];

      test.each(names)('returns display name "%s" as-is', (name) => {
        expect(getLanguageName(name)).toBe(name);
      });
    });

    describe('unknown inputs', () => {
      it('returns unknown input as-is', () => {
        expect(getLanguageName('xyz')).toBe('xyz');
        expect(getLanguageName('UnknownLanguage')).toBe('UnknownLanguage');
      });
    });
  });

  describe('toLanguageCode', () => {
    describe('valid codes passthrough', () => {
      const validCodes: LanguageCode[] = ['en', 'es', 'te', 'hi'];

      test.each(validCodes)('passes through valid code: "%s"', (code) => {
        expect(toLanguageCode(code)).toBe(code);
      });
    });

    describe('legacy name conversion', () => {
      const conversions: [string, string][] = [
        ['English', 'en'],
        ['Spanish', 'es'],
        ['Mandarin', 'zh'],
        ['Mandarin Chinese', 'zh'],
        ['Hindi', 'hi'],
        ['Telugu', 'te'],
        ['Tamil', 'ta'],
        ['Bengali', 'bn'],
      ];

      test.each(conversions)('converts "%s" to "%s"', (input, expected) => {
        expect(toLanguageCode(input)).toBe(expected);
      });
    });

    describe('unknown inputs', () => {
      it('returns unknown input as-is', () => {
        expect(toLanguageCode('xyz')).toBe('xyz');
        expect(toLanguageCode('SomeLanguage')).toBe('SomeLanguage');
      });
    });
  });

  describe('normalizeLanguages', () => {
    it('converts mixed codes and names to codes', () => {
      const input = ['en', 'Spanish', 'te', 'Hindi'];
      const result = normalizeLanguages(input);
      expect(result).toEqual(['en', 'es', 'te', 'hi']);
    });

    it('filters out invalid entries', () => {
      const input = ['en', 'xyz', 'invalid', 'es'];
      const result = normalizeLanguages(input);
      expect(result).toEqual(['en', 'es']);
    });

    it('handles empty array', () => {
      expect(normalizeLanguages([])).toEqual([]);
    });

    it('handles all invalid entries', () => {
      const input = ['xyz', 'abc', 'invalid'];
      const result = normalizeLanguages(input);
      expect(result).toEqual([]);
    });

    it('deduplication is not performed (passthrough behavior)', () => {
      const input = ['en', 'en', 'es'];
      const result = normalizeLanguages(input);
      expect(result).toEqual(['en', 'en', 'es']);
    });
  });

  describe('LEGACY_NAME_TO_CODE', () => {
    it('maps common legacy names', () => {
      expect(LEGACY_NAME_TO_CODE['English']).toBe('en');
      expect(LEGACY_NAME_TO_CODE['Spanish']).toBe('es');
      expect(LEGACY_NAME_TO_CODE['Mandarin']).toBe('zh');
      expect(LEGACY_NAME_TO_CODE['Mandarin Chinese']).toBe('zh');
    });

    it('includes South Asian language names', () => {
      expect(LEGACY_NAME_TO_CODE['Telugu']).toBe('te');
      expect(LEGACY_NAME_TO_CODE['Tamil']).toBe('ta');
      expect(LEGACY_NAME_TO_CODE['Punjabi']).toBe('pa');
      expect(LEGACY_NAME_TO_CODE['Gujarati']).toBe('gu');
    });
  });
});
