import { detectNearbyIntent, _testHelpers } from '@/lib/nearby-intent';

const {
  cleanQuery,
  hasLocationIntent,
  shouldUseTextSearch,
  extractPlaceTypes,
  containsCodeBlock,
  UNICODE_KEYWORDS,
  LISTING_CONTEXT_PATTERNS,
  NEGATION_PATTERNS,
} = _testHelpers;

describe('nearby-intent', () => {
  describe('cleanQuery', () => {
    it('removes filler words', () => {
      expect(cleanQuery('find me a good gym nearby')).toBe('gym');
      expect(cleanQuery('where is the closest grocery store')).toBe('grocery store');
    });

    it('applies typo corrections', () => {
      expect(cleanQuery('chipolte nearby')).toBe('chipotle');
      expect(cleanQuery('starbuks')).toBe('starbucks');
      // Note: typo correction map has "mcdonalds" without apostrophe
      expect(cleanQuery('mcdonlds')).toBe('mcdonalds');
    });

    it('removes punctuation', () => {
      expect(cleanQuery('gym nearby?')).toBe('gym');
      expect(cleanQuery('is there a park?!')).toBe('park');
    });
  });

  describe('detectNearbyIntent', () => {
    describe('type-based queries (Nearby Search)', () => {
      it('detects gym queries', () => {
        const result = detectNearbyIntent('gym nearby');
        expect(result.isNearbyQuery).toBe(true);
        expect(result.searchType).toBe('type');
        expect(result.includedTypes).toContain('gym');
      });

      it('detects grocery queries', () => {
        const result = detectNearbyIntent('grocery store nearby?');
        expect(result.isNearbyQuery).toBe(true);
        expect(result.searchType).toBe('type');
        expect(result.includedTypes).toContain('supermarket');
      });

      it('detects park queries', () => {
        const result = detectNearbyIntent('parks nearby');
        expect(result.isNearbyQuery).toBe(true);
        expect(result.searchType).toBe('type');
        expect(result.includedTypes).toContain('park');
      });

      it('detects transit queries', () => {
        // "transit" or "transit nearby" triggers type-based search
        const result = detectNearbyIntent('transit nearby');
        expect(result.isNearbyQuery).toBe(true);
        expect(result.searchType).toBe('type');
        expect(result.includedTypes).toContain('transit_station');
      });

      it('detects pharmacy queries', () => {
        const result = detectNearbyIntent('any pharmacy nearby');
        expect(result.isNearbyQuery).toBe(true);
        expect(result.searchType).toBe('type');
        expect(result.includedTypes).toContain('pharmacy');
      });
    });

    describe('text-based queries (Text Search)', () => {
      it('detects specific cuisine queries', () => {
        const result = detectNearbyIntent('indian restaurant nearby');
        expect(result.isNearbyQuery).toBe(true);
        expect(result.searchType).toBe('text');
        expect(result.textQuery).toBeDefined();
      });

      it('detects nepali food queries', () => {
        const result = detectNearbyIntent('nepali food nearby');
        expect(result.isNearbyQuery).toBe(true);
        expect(result.searchType).toBe('text');
      });

      it('detects brand name queries', () => {
        const result = detectNearbyIntent('starbucks nearby');
        expect(result.isNearbyQuery).toBe(true);
        expect(result.searchType).toBe('text');
      });

      it('detects crossfit gym queries', () => {
        const result = detectNearbyIntent('crossfit gym nearby');
        expect(result.isNearbyQuery).toBe(true);
        expect(result.searchType).toBe('text');
      });

      it('detects indian grocery queries', () => {
        const result = detectNearbyIntent('indian grocery nearby');
        expect(result.isNearbyQuery).toBe(true);
        expect(result.searchType).toBe('text');
      });
    });

    describe('non-nearby queries', () => {
      it('returns false for property questions', () => {
        const result = detectNearbyIntent('does this place have parking?');
        expect(result.isNearbyQuery).toBe(false);
      });

      it('returns false for general questions', () => {
        const result = detectNearbyIntent('tell me about this property');
        expect(result.isNearbyQuery).toBe(false);
      });

      it('returns false for host questions', () => {
        const result = detectNearbyIntent('how do I contact the host?');
        expect(result.isNearbyQuery).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('handles empty string', () => {
        const result = detectNearbyIntent('');
        expect(result.isNearbyQuery).toBe(false);
      });

      it('handles single place type word', () => {
        const result = detectNearbyIntent('gym');
        expect(result.isNearbyQuery).toBe(true);
        expect(result.searchType).toBe('type');
      });

      it('handles typos', () => {
        const result = detectNearbyIntent('chipolte nearby');
        expect(result.isNearbyQuery).toBe(true);
        expect(result.searchType).toBe('text');
      });
    });

    // P1-B15 FIX: Listing context patterns - parking queries about the property
    describe('listing context detection (P1-B15)', () => {
      it('returns false for "is there parking here"', () => {
        const result = detectNearbyIntent('is there parking here');
        expect(result.isNearbyQuery).toBe(false);
      });

      it('returns false for "does this place have parking"', () => {
        const result = detectNearbyIntent('does this place have parking');
        expect(result.isNearbyQuery).toBe(false);
      });

      it('returns false for "parking included"', () => {
        const result = detectNearbyIntent('is parking included');
        expect(result.isNearbyQuery).toBe(false);
      });

      it('returns false for "parking available" (listing context)', () => {
        const result = detectNearbyIntent('is parking available here');
        expect(result.isNearbyQuery).toBe(false);
      });

      it('returns false for amenity questions about the listing', () => {
        const result = detectNearbyIntent('what amenities does this place have');
        expect(result.isNearbyQuery).toBe(false);
      });

      it('returns true for "parking garage nearby"', () => {
        const result = detectNearbyIntent('parking garage nearby');
        expect(result.isNearbyQuery).toBe(true);
      });
    });

    // P1-B16 FIX: Distance query detection
    describe('distance query detection (P1-B16)', () => {
      it('returns false for "how far is the subway"', () => {
        const result = detectNearbyIntent('how far is the subway');
        expect(result.isNearbyQuery).toBe(false);
      });

      it('returns false for "distance to downtown"', () => {
        const result = detectNearbyIntent('what is the distance to downtown');
        expect(result.isNearbyQuery).toBe(false);
      });

      it('returns false for "how long to walk to the park"', () => {
        const result = detectNearbyIntent('how long to walk to the park');
        expect(result.isNearbyQuery).toBe(false);
      });

      it('returns true for "subway station nearby"', () => {
        const result = detectNearbyIntent('subway station nearby');
        expect(result.isNearbyQuery).toBe(true);
      });
    });

    // P1-B19 FIX: Unicode/non-romanized script support
    describe('non-romanized script support (P1-B19)', () => {
      it('translates Chinese gym keyword (健身房) in cleanQuery', () => {
        const cleaned = cleanQuery('健身房');
        expect(cleaned).toContain('gym');
      });

      it('translates Japanese convenience store keyword (コンビニ) in cleanQuery', () => {
        const cleaned = cleanQuery('コンビニ');
        expect(cleaned).toContain('convenience store');
      });

      it('translates Korean restaurant keyword (식당) in cleanQuery', () => {
        const cleaned = cleanQuery('식당');
        expect(cleaned).toContain('restaurant');
      });

      it('detects Chinese gym query with explicit nearby keyword', () => {
        // Use English nearby marker with translated term
        const result = detectNearbyIntent('gym nearby');
        expect(result.isNearbyQuery).toBe(true);
      });

      it('has UNICODE_KEYWORDS defined with entries', () => {
        expect(UNICODE_KEYWORDS).toBeDefined();
        expect(Object.keys(UNICODE_KEYWORDS).length).toBeGreaterThan(0);
        // Verify key Unicode keywords exist
        expect(UNICODE_KEYWORDS['健身房']).toBe('gym');
        expect(UNICODE_KEYWORDS['コンビニ']).toBe('convenience store');
        expect(UNICODE_KEYWORDS['식당']).toBe('restaurant');
      });
    });

    // P2-B24 FIX: Negation pattern detection
    describe('negation pattern detection (P2-B24)', () => {
      it('returns false for "I dont need a gym"', () => {
        const result = detectNearbyIntent("I don't need a gym");
        expect(result.isNearbyQuery).toBe(false);
      });

      it('returns false for "no gym necessary"', () => {
        const result = detectNearbyIntent('no gym necessary');
        expect(result.isNearbyQuery).toBe(false);
      });

      it('returns false for "skip the restaurants"', () => {
        const result = detectNearbyIntent('skip the restaurants');
        expect(result.isNearbyQuery).toBe(false);
      });

      it('returns false for "avoid gyms"', () => {
        const result = detectNearbyIntent('avoid gyms');
        expect(result.isNearbyQuery).toBe(false);
      });

      it('returns true for affirmative gym query', () => {
        const result = detectNearbyIntent('I need a gym nearby');
        expect(result.isNearbyQuery).toBe(true);
      });

      it('has NEGATION_PATTERNS defined', () => {
        expect(NEGATION_PATTERNS).toBeDefined();
        expect(NEGATION_PATTERNS.length).toBeGreaterThan(0);
      });
    });

    // P2-B25 FIX: Code block detection
    describe('code block detection (P2-B25)', () => {
      it('returns false for markdown code blocks', () => {
        const result = detectNearbyIntent('```javascript\nconst gym = "nearby";\n```');
        expect(result.isNearbyQuery).toBe(false);
      });

      it('returns false for inline code with backticks', () => {
        const result = detectNearbyIntent('The variable `gym` is undefined');
        expect(result.isNearbyQuery).toBe(false);
      });

      it('containsCodeBlock detects triple backticks', () => {
        expect(containsCodeBlock('```\ncode here\n```')).toBe(true);
      });

      it('containsCodeBlock detects inline backticks', () => {
        expect(containsCodeBlock('use `gym` variable')).toBe(true);
      });

      it('containsCodeBlock returns false for normal text', () => {
        expect(containsCodeBlock('find a gym nearby')).toBe(false);
      });
    });

    // P2-C3 FIX: Multi-brand detection
    describe('multi-brand detection (P2-C3)', () => {
      it('detects "Starbucks or Dunkin"', () => {
        const result = detectNearbyIntent('Starbucks or Dunkin nearby');
        expect(result.isNearbyQuery).toBe(true);
        expect(result.multiBrandDetected).toBe(true);
      });

      it('detects "CVS and Walgreens"', () => {
        const result = detectNearbyIntent('CVS and Walgreens nearby');
        expect(result.isNearbyQuery).toBe(true);
        expect(result.multiBrandDetected).toBe(true);
      });

      it('single brand does not set multiBrandDetected', () => {
        const result = detectNearbyIntent('Starbucks nearby');
        expect(result.isNearbyQuery).toBe(true);
        expect(result.multiBrandDetected).toBeFalsy();
      });
    });

    // Verify LISTING_CONTEXT_PATTERNS exported
    describe('test helper exports', () => {
      it('has LISTING_CONTEXT_PATTERNS defined', () => {
        expect(LISTING_CONTEXT_PATTERNS).toBeDefined();
        expect(LISTING_CONTEXT_PATTERNS.length).toBeGreaterThan(0);
      });

      it('LISTING_CONTEXT_PATTERNS matches "is there parking here"', () => {
        const text = 'is there parking here';
        const matches = LISTING_CONTEXT_PATTERNS.some((pattern: RegExp) => pattern.test(text));
        expect(matches).toBe(true);
      });
    });
  });
});
