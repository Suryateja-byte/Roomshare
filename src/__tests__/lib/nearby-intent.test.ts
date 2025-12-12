import { detectNearbyIntent, _testHelpers } from '@/lib/nearby-intent';

const { cleanQuery, hasLocationIntent, shouldUseTextSearch, extractPlaceTypes } = _testHelpers;

describe('nearby-intent', () => {
  describe('cleanQuery', () => {
    it('removes filler words', () => {
      expect(cleanQuery('find me a good gym nearby')).toBe('gym');
      expect(cleanQuery('where is the closest grocery store')).toBe('grocery store');
    });

    it('applies typo corrections', () => {
      expect(cleanQuery('chipolte nearby')).toBe('chipotle');
      expect(cleanQuery('starbuks')).toBe('starbucks');
      expect(cleanQuery('mcdonlds')).toBe("mcdonald's");
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
        const result = detectNearbyIntent('public transit?');
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
  });
});
