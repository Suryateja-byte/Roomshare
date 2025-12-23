import {
  checkListingLanguageCompliance,
  LANGUAGE_EXCLUSION_PATTERN_COUNT,
  LANGUAGE_WORD_COUNT,
} from '@/lib/listing-language-guard';
import { SUPPORTED_LANGUAGES } from '@/lib/languages';

describe('listing-language-guard', () => {
  describe('checkListingLanguageCompliance', () => {
    describe('allowed descriptions (should pass)', () => {
      const allowedDescriptions = [
        'Beautiful room in a friendly household. We speak Spanish and English at home.',
        'Looking for a roommate to share our home. Telugu and Hindi spoken in the house.',
        'Spacious room available. The household primarily communicates in Mandarin.',
        'Great location near downtown. We enjoy cooking and watching movies together.',
        'Furnished room with private bathroom. Utilities included.',
        'Available immediately. No pets please. Close to public transit.',
        'Spanish and English spoken - feel free to practice either language!',
        'Our household speaks multiple languages including Korean and Japanese.',
        'We have speakers of Hindi and Telugu in the house.',
        'The primary language at home is French but we also speak English.',
        'Multicultural household with diverse language backgrounds.',
      ];

      test.each(allowedDescriptions)('allows: "%s"', (description) => {
        const result = checkListingLanguageCompliance(description);
        expect(result.allowed).toBe(true);
        expect(result.message).toBeUndefined();
      });
    });

    describe('blocked - "<language> only" patterns', () => {
      const blockedDescriptions = [
        'English only household',
        'Spanish only speakers please',
        'Chinese only roommates wanted',
        'Hindi only please',
        'Mandarin only home',
        'Telugu only household',
        'Tamil only speakers',
        'Korean only environment',
        'Japanese only preferred',
      ];

      test.each(blockedDescriptions)('blocks: "%s"', (description) => {
        const result = checkListingLanguageCompliance(description);
        expect(result.allowed).toBe(false);
        expect(result.message).toBeDefined();
        expect(result.message).toContain('Languages spoken in the house');
      });
    });

    describe('blocked - "only <language>" patterns', () => {
      const blockedDescriptions = [
        'Only English speaking household',
        'Only Spanish speakers allowed',
        'Only Mandarin is spoken here',
        'Only Hindi speakers please',
      ];

      test.each(blockedDescriptions)('blocks: "%s"', (description) => {
        const result = checkListingLanguageCompliance(description);
        expect(result.allowed).toBe(false);
        expect(result.message).toBeDefined();
      });
    });

    describe('blocked - "no <language> speakers" patterns', () => {
      const blockedDescriptions = [
        'No English speakers',
        'No Spanish speaking please',
        'No Hindi speakers wanted',
        'No Chinese speakers',
        'No Mandarin speakers please',
        'No Telugu speaking roommates',
      ];

      test.each(blockedDescriptions)('blocks: "%s"', (description) => {
        const result = checkListingLanguageCompliance(description);
        expect(result.allowed).toBe(false);
        expect(result.message).toBeDefined();
      });
    });

    describe('blocked - "must speak <language>" patterns', () => {
      const blockedDescriptions = [
        'Must speak English',
        'Must speak Spanish fluently',
        'You must know English',
        'Required to speak Hindi',
        'Have to speak Mandarin',
        'Must be fluent in English',
      ];

      test.each(blockedDescriptions)('blocks: "%s"', (description) => {
        const result = checkListingLanguageCompliance(description);
        expect(result.allowed).toBe(false);
        expect(result.message).toBeDefined();
      });
    });

    describe('blocked - "<language> required" patterns', () => {
      const blockedDescriptions = [
        'English required',
        'Spanish is required',
        'English is mandatory',
        'Hindi is necessary',
        'Mandarin required for communication',
      ];

      test.each(blockedDescriptions)('blocks: "%s"', (description) => {
        const result = checkListingLanguageCompliance(description);
        expect(result.allowed).toBe(false);
        expect(result.message).toBeDefined();
      });
    });

    describe('blocked - "fluent/native <language>" patterns', () => {
      const blockedDescriptions = [
        'Fluent English only',
        'Native English speakers only',
        'Fluent Spanish required',
        'Native Hindi speakers only',
      ];

      test.each(blockedDescriptions)('blocks: "%s"', (description) => {
        const result = checkListingLanguageCompliance(description);
        expect(result.allowed).toBe(false);
        expect(result.message).toBeDefined();
      });
    });

    describe('edge cases', () => {
      it('allows empty string', () => {
        const result = checkListingLanguageCompliance('');
        expect(result.allowed).toBe(true);
      });

      it('allows very short descriptions', () => {
        const result = checkListingLanguageCompliance('Nice room');
        expect(result.allowed).toBe(true);
      });

      it('is case insensitive', () => {
        const result = checkListingLanguageCompliance('ENGLISH ONLY HOUSEHOLD');
        expect(result.allowed).toBe(false);
      });

      it('handles mixed case', () => {
        const result = checkListingLanguageCompliance('English Only Please');
        expect(result.allowed).toBe(false);
      });

      it('handles null/undefined gracefully', () => {
        // @ts-expect-error Testing null input
        const result1 = checkListingLanguageCompliance(null);
        expect(result1.allowed).toBe(true);

        // @ts-expect-error Testing undefined input
        const result2 = checkListingLanguageCompliance(undefined);
        expect(result2.allowed).toBe(true);
      });

      it('handles non-string input gracefully', () => {
        // @ts-expect-error Testing number input
        const result = checkListingLanguageCompliance(12345);
        expect(result.allowed).toBe(true);
      });
    });

    describe('refusal message', () => {
      it('returns appropriate message for blocked content', () => {
        const result = checkListingLanguageCompliance('English only household');
        expect(result.allowed).toBe(false);
        expect(result.message).toContain('exclusionary terms');
        expect(result.message).toContain('Languages spoken in the house');
      });

      it('does not reveal which pattern was matched', () => {
        const result = checkListingLanguageCompliance('English only household');
        expect(result.message).not.toContain('English only');
      });
    });

    describe('pattern coverage', () => {
      it('has multiple patterns', () => {
        expect(LANGUAGE_EXCLUSION_PATTERN_COUNT).toBeGreaterThan(3);
      });

      it('covers major languages', () => {
        const languages = ['English', 'Spanish', 'Hindi', 'Chinese', 'Mandarin'];

        for (const lang of languages) {
          const result = checkListingLanguageCompliance(`${lang} only household`);
          expect(result.allowed).toBe(false);
        }
      });

      it('covers all SUPPORTED_LANGUAGES', () => {
        // Every language in SUPPORTED_LANGUAGES should be blocked when used with "only"
        Object.values(SUPPORTED_LANGUAGES).forEach((langName) => {
          const result = checkListingLanguageCompliance(
            `${langName} only household`
          );
          expect(result.allowed).toBe(false);
        });
      });

      it('has sufficient language word count for 54 languages', () => {
        // Should have at least 54 unique words (one per language, plus multi-word names)
        expect(LANGUAGE_WORD_COUNT).toBeGreaterThanOrEqual(54);
      });
    });

    describe('hyphenated patterns', () => {
      it('blocks hyphenated "<language>-only" patterns', () => {
        const hyphenatedPatterns = [
          'English-only household',
          'Spanish-only speakers please',
          'Hindi-only environment',
          'This is a Telugu-only home',
          'Mandarin-only household wanted',
        ];

        hyphenatedPatterns.forEach((desc) => {
          const result = checkListingLanguageCompliance(desc);
          expect(result.allowed).toBe(false);
        });
      });

      it('blocks hyphenated "only-<language>" patterns', () => {
        const hyphenatedPatterns = [
          'only-English speakers',
          'only-Spanish household',
        ];

        hyphenatedPatterns.forEach((desc) => {
          const result = checkListingLanguageCompliance(desc);
          expect(result.allowed).toBe(false);
        });
      });
    });

    describe('generic phrase false positive prevention', () => {
      it('does not false-positive on "language only" without specific language', () => {
        const genericPhrases = [
          'We use one language only for communication',
          'Language only matters for household activities',
        ];

        genericPhrases.forEach((desc) => {
          const result = checkListingLanguageCompliance(desc);
          expect(result.allowed).toBe(true);
        });
      });

      it('does not false-positive on generic communication phrases', () => {
        const genericPhrases = [
          'We communicate clearly',
          'Good communication is important',
          'Communication is key in our household',
          'We value open communication',
        ];

        genericPhrases.forEach((desc) => {
          const result = checkListingLanguageCompliance(desc);
          expect(result.allowed).toBe(true);
        });
      });
    });

    describe('false positive prevention', () => {
      const shouldNotBlock = [
        'We prefer to communicate in English for convenience',
        'English is commonly spoken in our household',
        'Feel free to speak Spanish or English',
        'Our primary language is Hindi but English is also fine',
        'Most communication happens in English',
        'I speak fluent English and basic Spanish',
        'English speaking household, but all are welcome',
        'Looking for someone who can speak with us in Telugu',
        'We would love someone who speaks Korean',
      ];

      test.each(shouldNotBlock)('does not block: "%s"', (description) => {
        const result = checkListingLanguageCompliance(description);
        expect(result.allowed).toBe(true);
      });
    });
  });
});
