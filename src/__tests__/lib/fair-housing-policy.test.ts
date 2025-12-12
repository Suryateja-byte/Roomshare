import {
  checkFairHousingPolicy,
  POLICY_REFUSAL_MESSAGE,
  BLOCKED_CATEGORIES,
} from '@/lib/fair-housing-policy';

describe('fair-housing-policy', () => {
  describe('checkFairHousingPolicy', () => {
    describe('allowed queries (should pass)', () => {
      const allowedQueries = [
        'gym nearby',
        'grocery store',
        'indian restaurant nearby',
        'parks in the area',
        'public transit',
        'coffee shop',
        'pharmacy nearby',
        'hospital',
        'crossfit gym',
        'nepali food',
        'starbucks',
        'laundromat',
      ];

      test.each(allowedQueries)('allows: "%s"', (query) => {
        const result = checkFairHousingPolicy(query);
        expect(result.allowed).toBe(true);
        expect(result.blockedReason).toBeUndefined();
      });
    });

    describe('blocked queries - race/ethnicity', () => {
      const blockedQueries = [
        'white neighborhood',
        'black area',
        'asian community',
        'hispanic neighborhood',
        'where do Indians live',
        'where are the Chinese',
        'no blacks area',
        'avoid hispanics',
      ];

      test.each(blockedQueries)('blocks: "%s"', (query) => {
        const result = checkFairHousingPolicy(query);
        expect(result.allowed).toBe(false);
        expect(result.blockedReason).toBeDefined();
      });
    });

    describe('blocked queries - safety/crime', () => {
      const blockedQueries = [
        'safe neighborhood',
        'is this area safe',
        'crime rate',
        'dangerous area',
        'is it unsafe',
        'sketchy neighborhood',
        'bad area',
        'rough part of town',
        'violent crime',
      ];

      test.each(blockedQueries)('blocks: "%s"', (query) => {
        const result = checkFairHousingPolicy(query);
        expect(result.allowed).toBe(false);
        expect(result.blockedReason).toBeDefined();
      });
    });

    describe('blocked queries - religion', () => {
      const blockedQueries = [
        'christian neighborhood',
        'muslim area',
        'jewish community',
        'hindu neighborhood',
        'church free area',
        'mosque free neighborhood',
      ];

      test.each(blockedQueries)('blocks: "%s"', (query) => {
        const result = checkFairHousingPolicy(query);
        expect(result.allowed).toBe(false);
        expect(result.blockedReason).toBeDefined();
      });
    });

    describe('blocked queries - familial status', () => {
      const blockedQueries = [
        'no kids',
        'no children area',
        'adults only',
        'child free neighborhood',
        'no families',
        'singles only area',
      ];

      test.each(blockedQueries)('blocks: "%s"', (query) => {
        const result = checkFairHousingPolicy(query);
        expect(result.allowed).toBe(false);
        expect(result.blockedReason).toBeDefined();
      });
    });

    describe('blocked queries - disability', () => {
      const blockedQueries = [
        'no disabled',
        'no wheelchairs',
        'no handicapped',
        'able bodied residents',
        'normal people neighborhood',
      ];

      test.each(blockedQueries)('blocks: "%s"', (query) => {
        const result = checkFairHousingPolicy(query);
        expect(result.allowed).toBe(false);
        expect(result.blockedReason).toBeDefined();
      });
    });

    describe('blocked queries - school rankings', () => {
      const blockedQueries = [
        'best school district',
        'top schools ranking',
        'worst schools',
      ];

      test.each(blockedQueries)('blocks: "%s"', (query) => {
        const result = checkFairHousingPolicy(query);
        expect(result.allowed).toBe(false);
        expect(result.blockedReason).toBeDefined();
      });
    });

    describe('blocked queries - gentrification', () => {
      const blockedQueries = [
        'gentrifying area',
        'up and coming neighborhood',
        'property values increasing',
        'home values going up',
      ];

      test.each(blockedQueries)('blocks: "%s"', (query) => {
        const result = checkFairHousingPolicy(query);
        expect(result.allowed).toBe(false);
        expect(result.blockedReason).toBeDefined();
      });
    });

    describe('edge cases', () => {
      it('allows empty string', () => {
        const result = checkFairHousingPolicy('');
        expect(result.allowed).toBe(true);
      });

      it('allows very short queries', () => {
        const result = checkFairHousingPolicy('hi');
        expect(result.allowed).toBe(true);
      });

      it('is case insensitive', () => {
        const result = checkFairHousingPolicy('SAFE NEIGHBORHOOD');
        expect(result.allowed).toBe(false);
      });

      it('handles null/undefined gracefully', () => {
        // @ts-expect-error Testing null input
        const result1 = checkFairHousingPolicy(null);
        expect(result1.allowed).toBe(true);

        // @ts-expect-error Testing undefined input
        const result2 = checkFairHousingPolicy(undefined);
        expect(result2.allowed).toBe(true);
      });
    });

    describe('refusal message', () => {
      it('exports a refusal message', () => {
        expect(POLICY_REFUSAL_MESSAGE).toBeDefined();
        expect(typeof POLICY_REFUSAL_MESSAGE).toBe('string');
        expect(POLICY_REFUSAL_MESSAGE.length).toBeGreaterThan(0);
      });

      it('refusal message suggests alternatives', () => {
        expect(POLICY_REFUSAL_MESSAGE).toContain('gyms');
        expect(POLICY_REFUSAL_MESSAGE).toContain('restaurants');
        expect(POLICY_REFUSAL_MESSAGE).toContain('transit');
      });
    });

    describe('blocked categories', () => {
      it('exports all blocked categories', () => {
        expect(BLOCKED_CATEGORIES).toBeDefined();
        expect(Array.isArray(BLOCKED_CATEGORIES)).toBe(true);
        expect(BLOCKED_CATEGORIES.length).toBeGreaterThan(0);
      });

      it('includes expected categories', () => {
        expect(BLOCKED_CATEGORIES).toContain('safety-crime');
        expect(BLOCKED_CATEGORIES).toContain('race-neighborhood');
        expect(BLOCKED_CATEGORIES).toContain('religion-neighborhood');
        expect(BLOCKED_CATEGORIES).toContain('no-children');
      });
    });
  });
});
