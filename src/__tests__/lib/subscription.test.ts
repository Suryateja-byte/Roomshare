/**
 * Tests for subscription tier utilities
 * Validates Pro vs Free feature gating logic
 */

import {
  isProUser,
  getSubscriptionTier,
  getNeighborhoodProFeatures,
  getProFeatureList,
  PRO_FEATURE_NAMES,
} from '@/lib/subscription';

describe('subscription', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment for each test
    process.env = { ...originalEnv };
    // Ensure dev override is not active by default
    delete process.env.NEXT_PUBLIC_FORCE_PRO_MODE;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('isProUser', () => {
    it('returns true for "pro" tier', () => {
      expect(isProUser('pro')).toBe(true);
    });

    it('returns false for "free" tier', () => {
      expect(isProUser('free')).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isProUser(undefined)).toBe(false);
    });

    it('returns false for null', () => {
      expect(isProUser(null)).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isProUser('')).toBe(false);
    });

    it('returns false for arbitrary string', () => {
      expect(isProUser('premium')).toBe(false);
      expect(isProUser('PRO')).toBe(false);
      expect(isProUser('Pro')).toBe(false);
    });

    describe('development override', () => {
      it('returns true when FORCE_PRO_MODE is true in development', () => {
        (process.env as Record<string, string>).NODE_ENV = 'development';
        process.env.NEXT_PUBLIC_FORCE_PRO_MODE = 'true';

        expect(isProUser('free')).toBe(true);
        expect(isProUser(undefined)).toBe(true);
        expect(isProUser(null)).toBe(true);
      });

      it('does not override in production even if env var is set', () => {
        (process.env as Record<string, string>).NODE_ENV = 'production';
        process.env.NEXT_PUBLIC_FORCE_PRO_MODE = 'true';

        expect(isProUser('free')).toBe(false);
        expect(isProUser(undefined)).toBe(false);
      });

      it('does not override when FORCE_PRO_MODE is not "true"', () => {
        (process.env as Record<string, string>).NODE_ENV = 'development';
        process.env.NEXT_PUBLIC_FORCE_PRO_MODE = 'false';

        expect(isProUser('free')).toBe(false);
      });
    });
  });

  describe('getSubscriptionTier', () => {
    it('returns "pro" for "pro" input', () => {
      expect(getSubscriptionTier('pro')).toBe('pro');
    });

    it('returns "free" for "free" input', () => {
      expect(getSubscriptionTier('free')).toBe('free');
    });

    it('returns "free" for undefined', () => {
      expect(getSubscriptionTier(undefined)).toBe('free');
    });

    it('returns "free" for null', () => {
      expect(getSubscriptionTier(null)).toBe('free');
    });

    it('returns "free" for unknown tier strings', () => {
      expect(getSubscriptionTier('premium')).toBe('free');
      expect(getSubscriptionTier('enterprise')).toBe('free');
      expect(getSubscriptionTier('')).toBe('free');
    });

    it('is case-sensitive (only lowercase "pro" matches)', () => {
      expect(getSubscriptionTier('Pro')).toBe('free');
      expect(getSubscriptionTier('PRO')).toBe('free');
    });
  });

  describe('getNeighborhoodProFeatures', () => {
    it('returns all features enabled for pro users', () => {
      const features = getNeighborhoodProFeatures('pro');

      expect(features.showInteractiveMap).toBe(true);
      expect(features.showCustomPlaceList).toBe(true);
      expect(features.showPerItemDistance).toBe(true);
      expect(features.enableListMapSync).toBe(true);
      expect(features.showWalkabilityRings).toBe(true);
      expect(features.showPlaceDetailsPanel).toBe(true);
    });

    it('returns all features disabled for free users', () => {
      const features = getNeighborhoodProFeatures('free');

      expect(features.showInteractiveMap).toBe(false);
      expect(features.showCustomPlaceList).toBe(false);
      expect(features.showPerItemDistance).toBe(false);
      expect(features.enableListMapSync).toBe(false);
      expect(features.showWalkabilityRings).toBe(false);
      expect(features.showPlaceDetailsPanel).toBe(false);
    });

    it('returns all features disabled for undefined tier', () => {
      const features = getNeighborhoodProFeatures(undefined);

      expect(features.showInteractiveMap).toBe(false);
      expect(features.showCustomPlaceList).toBe(false);
    });

    it('returns all features disabled for null tier', () => {
      const features = getNeighborhoodProFeatures(null);

      expect(features.showInteractiveMap).toBe(false);
    });

    it('returns consistent feature set structure', () => {
      const features = getNeighborhoodProFeatures('free');
      const keys = Object.keys(features);

      expect(keys).toEqual([
        'showInteractiveMap',
        'showCustomPlaceList',
        'showPerItemDistance',
        'enableListMapSync',
        'showWalkabilityRings',
        'showPlaceDetailsPanel',
      ]);
    });
  });

  describe('PRO_FEATURE_NAMES', () => {
    it('contains all expected feature names', () => {
      expect(PRO_FEATURE_NAMES.interactiveMap).toBeDefined();
      expect(PRO_FEATURE_NAMES.customList).toBeDefined();
      expect(PRO_FEATURE_NAMES.walkabilityRings).toBeDefined();
      expect(PRO_FEATURE_NAMES.placeDetails).toBeDefined();
    });

    it('values are non-empty strings', () => {
      Object.values(PRO_FEATURE_NAMES).forEach((name) => {
        expect(typeof name).toBe('string');
        expect(name.length).toBeGreaterThan(0);
      });
    });
  });

  describe('getProFeatureList', () => {
    it('returns an array of strings', () => {
      const list = getProFeatureList();
      expect(Array.isArray(list)).toBe(true);
      list.forEach((item) => {
        expect(typeof item).toBe('string');
      });
    });

    it('returns all values from PRO_FEATURE_NAMES', () => {
      const list = getProFeatureList();
      const expected = Object.values(PRO_FEATURE_NAMES);
      expect(list).toEqual(expected);
    });

    it('returns a non-empty list', () => {
      expect(getProFeatureList().length).toBeGreaterThan(0);
    });
  });
});
