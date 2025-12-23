/**
 * Tests for the Production Filter Regression Framework
 */

import {
  captureFilterScenario,
  createBehaviorHash,
  storeScenario,
  getScenario,
  getAllScenarios,
  clearScenarios,
  exportScenarios,
  importScenarios,
  runScenario,
  runRegressionSuite,
  ScenarioSampler,
  createGoldenScenario,
  validateGoldenScenario,
  validateCriticalScenarios,
  CRITICAL_SCENARIOS,
  type FilterScenario,
  type FilterExecutor,
  type GoldenScenario,
} from '@/lib/filter-regression';
import { normalizeFilters } from '@/lib/filter-schema';
import { ACTIVE_LISTINGS, applyFilters } from '../fixtures/listings';

describe('Filter Regression Framework', () => {
  beforeEach(() => {
    clearScenarios();
  });

  // ============================================
  // Scenario Capture Tests
  // ============================================

  describe('captureFilterScenario', () => {
    it('captures a filter scenario with all required fields', () => {
      const rawInput = { minPrice: 500, maxPrice: 2000 };
      const resultIds = ['id-1', 'id-2', 'id-3'];

      const scenario = captureFilterScenario(rawInput, resultIds, 10);

      expect(scenario.id).toBeDefined();
      expect(scenario.timestamp).toBeDefined();
      expect(scenario.rawInput).toEqual(rawInput);
      expect(scenario.normalizedFilters).toBeDefined();
      expect(scenario.resultCount).toBe(3);
      expect(scenario.resultIds).toEqual(resultIds);
      expect(scenario.executionTimeMs).toBe(10);
      expect(scenario.behaviorHash).toBeDefined();
    });

    it('normalizes the filter input', () => {
      const rawInput = { minPrice: 2000, maxPrice: 500 }; // Inverted
      const scenario = captureFilterScenario(rawInput, [], 5);

      // Should be swapped by normalizer
      expect(scenario.normalizedFilters.minPrice).toBeLessThanOrEqual(
        scenario.normalizedFilters.maxPrice!
      );
    });

    it('generates unique IDs for each scenario', () => {
      const ids = new Set<string>();

      for (let i = 0; i < 100; i++) {
        const scenario = captureFilterScenario({}, [], 1);
        expect(ids.has(scenario.id)).toBe(false);
        ids.add(scenario.id);
      }
    });
  });

  // ============================================
  // Behavior Hash Tests
  // ============================================

  describe('createBehaviorHash', () => {
    it('produces consistent hash for same input', () => {
      const filters = normalizeFilters({ maxPrice: 1000 });
      const resultIds = ['a', 'b', 'c'];

      const hash1 = createBehaviorHash(filters, resultIds);
      const hash2 = createBehaviorHash(filters, resultIds);

      expect(hash1).toBe(hash2);
    });

    it('produces different hash for different results', () => {
      const filters = normalizeFilters({ maxPrice: 1000 });

      const hash1 = createBehaviorHash(filters, ['a', 'b', 'c']);
      const hash2 = createBehaviorHash(filters, ['a', 'b', 'd']);

      expect(hash1).not.toBe(hash2);
    });

    it('produces different hash for different filters', () => {
      const resultIds = ['a', 'b', 'c'];

      const hash1 = createBehaviorHash(
        normalizeFilters({ maxPrice: 1000 }),
        resultIds
      );
      const hash2 = createBehaviorHash(
        normalizeFilters({ maxPrice: 2000 }),
        resultIds
      );

      expect(hash1).not.toBe(hash2);
    });

    it('is order-independent for result IDs', () => {
      const filters = normalizeFilters({});

      const hash1 = createBehaviorHash(filters, ['a', 'b', 'c']);
      const hash2 = createBehaviorHash(filters, ['c', 'b', 'a']);

      expect(hash1).toBe(hash2);
    });
  });

  // ============================================
  // Scenario Storage Tests
  // ============================================

  describe('scenario storage', () => {
    it('stores and retrieves scenarios', () => {
      const scenario = captureFilterScenario({ minPrice: 100 }, ['id-1'], 5);
      storeScenario(scenario);

      const retrieved = getScenario(scenario.id);
      expect(retrieved).toEqual(scenario);
    });

    it('returns undefined for unknown scenario', () => {
      expect(getScenario('unknown-id')).toBeUndefined();
    });

    it('clears all scenarios', () => {
      storeScenario(captureFilterScenario({}, [], 1));
      storeScenario(captureFilterScenario({}, [], 1));

      expect(getAllScenarios().length).toBe(2);

      clearScenarios();

      expect(getAllScenarios().length).toBe(0);
    });

    it('exports and imports scenarios as JSON', () => {
      const scenario1 = captureFilterScenario({ minPrice: 100 }, ['a'], 5);
      const scenario2 = captureFilterScenario({ maxPrice: 500 }, ['b'], 10);
      storeScenario(scenario1);
      storeScenario(scenario2);

      const json = exportScenarios();
      clearScenarios();

      expect(getAllScenarios().length).toBe(0);

      importScenarios(json);

      expect(getAllScenarios().length).toBe(2);
      expect(getScenario(scenario1.id)).toBeDefined();
      expect(getScenario(scenario2.id)).toBeDefined();
    });
  });

  // ============================================
  // Regression Testing
  // ============================================

  describe('runScenario', () => {
    const mockExecutor: FilterExecutor = (filters) => {
      const results = applyFilters(ACTIVE_LISTINGS, filters);
      return results.map((r) => r.id);
    };

    it('passes when behavior matches', async () => {
      // Create scenario with current behavior
      const filters = { maxPrice: 2000 };
      const currentResults = applyFilters(
        ACTIVE_LISTINGS,
        normalizeFilters(filters)
      );

      const scenario = captureFilterScenario(
        filters,
        currentResults.map((r) => r.id),
        10
      );

      const report = await runScenario(scenario, mockExecutor);

      expect(report.status).toBe('pass');
    });

    it('fails when normalization changes', async () => {
      // Create scenario with manually modified normalized filters
      const scenario: FilterScenario = {
        id: 'test-scenario',
        timestamp: new Date().toISOString(),
        rawInput: { maxPrice: 2000 },
        normalizedFilters: {
          // Manually set a different normalization result
          maxPrice: 9999,
          page: 1,
          limit: 12,
        },
        resultCount: 10,
        resultIds: [],
        executionTimeMs: 10,
        behaviorHash: 'fake-hash',
      };

      const report = await runScenario(scenario, mockExecutor);

      expect(report.status).toBe('fail');
      expect(report.diff?.normalizedFilters).toBeDefined();
    });

    it('handles execution errors gracefully', async () => {
      const errorExecutor: FilterExecutor = () => {
        throw new Error('Database connection failed');
      };

      const scenario = captureFilterScenario({}, [], 1);
      const report = await runScenario(scenario, errorExecutor);

      expect(report.status).toBe('fail');
      expect(report.message).toContain('Execution error');
    });
  });

  describe('runRegressionSuite', () => {
    it('runs all stored scenarios', async () => {
      const mockExecutor: FilterExecutor = (filters) => {
        return applyFilters(ACTIVE_LISTINGS, filters).map((r) => r.id);
      };

      // Create scenarios matching current behavior
      for (let i = 0; i < 5; i++) {
        const filters = { maxPrice: 1000 + i * 500 };
        const results = applyFilters(ACTIVE_LISTINGS, normalizeFilters(filters));
        const scenario = captureFilterScenario(
          filters,
          results.map((r) => r.id),
          10
        );
        storeScenario(scenario);
      }

      const summary = await runRegressionSuite(mockExecutor);

      expect(summary.totalScenarios).toBe(5);
      expect(summary.passed).toBe(5);
      expect(summary.failed).toBe(0);
    });
  });

  // ============================================
  // Scenario Sampler Tests
  // ============================================

  describe('ScenarioSampler', () => {
    it('samples scenarios into buckets by filter characteristics', () => {
      const sampler = new ScenarioSampler(5, 100);

      // Add scenarios with different filter combinations
      sampler.sample(captureFilterScenario({ minPrice: 100 }, [], 1));
      sampler.sample(captureFilterScenario({ amenities: ['Wifi'] }, [], 1));
      sampler.sample(captureFilterScenario({ bounds: { minLat: 0, maxLat: 1, minLng: 0, maxLng: 1 } }, [], 1));

      const stats = sampler.getCoverageStats();
      expect(Object.keys(stats).length).toBeGreaterThanOrEqual(3);
    });

    it('respects per-bucket limit', () => {
      const sampler = new ScenarioSampler(3, 100);

      // Add many scenarios with same filter type
      for (let i = 0; i < 10; i++) {
        sampler.sample(captureFilterScenario({ minPrice: i * 100 }, [], 1));
      }

      const stats = sampler.getCoverageStats();
      expect(stats['price']).toBe(3);
    });

    it('respects total limit', () => {
      const sampler = new ScenarioSampler(100, 10);

      for (let i = 0; i < 50; i++) {
        sampler.sample(captureFilterScenario({}, [], 1));
      }

      const scenarios = sampler.getScenarios();
      expect(scenarios.length).toBeLessThanOrEqual(10);
    });

    it('clears all samples', () => {
      const sampler = new ScenarioSampler();
      sampler.sample(captureFilterScenario({}, [], 1));
      sampler.sample(captureFilterScenario({}, [], 1));

      sampler.clear();

      expect(sampler.getScenarios().length).toBe(0);
    });
  });

  // ============================================
  // Golden Scenario Tests
  // ============================================

  describe('Golden Scenarios', () => {
    it('creates golden scenario with current normalization', () => {
      const golden = createGoldenScenario(
        'test',
        'Test scenario',
        { minPrice: 500 }
      );

      expect(golden.name).toBe('test');
      expect(golden.description).toBe('Test scenario');
      expect(golden.input).toEqual({ minPrice: 500 });
      expect(golden.expectedNormalized).toEqual(normalizeFilters({ minPrice: 500 }));
    });

    it('validates golden scenario against current implementation', () => {
      const golden = createGoldenScenario(
        'test',
        'Test scenario',
        { maxPrice: 2000 }
      );

      const result = validateGoldenScenario(golden);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('detects mismatch in golden scenario', () => {
      const golden: GoldenScenario = {
        name: 'test',
        description: 'Test scenario',
        input: { maxPrice: 2000 },
        expectedNormalized: { maxPrice: 9999, page: 1, limit: 12 }, // Wrong expected value
      };

      const result = validateGoldenScenario(golden);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // Critical Scenarios Tests
  // ============================================

  describe('Critical Scenarios', () => {
    it('has all required critical scenarios', () => {
      expect(CRITICAL_SCENARIOS.length).toBeGreaterThanOrEqual(10);

      const names = CRITICAL_SCENARIOS.map((s) => s.name);
      expect(names).toContain('empty-filters');
      expect(names).toContain('basic-price-filter');
      expect(names).toContain('inverted-price-range');
      expect(names).toContain('antimeridian-crossing');
      expect(names).toContain('malformed-input');
    });

    it('all critical scenarios validate successfully', () => {
      const results = validateCriticalScenarios();

      expect(results.allValid).toBe(true);

      results.results.forEach((result) => {
        expect(result.valid).toBe(true);
      });
    });

    it('empty-filters scenario normalizes correctly', () => {
      const scenario = CRITICAL_SCENARIOS.find((s) => s.name === 'empty-filters');
      const result = validateGoldenScenario(scenario!);

      expect(result.valid).toBe(true);
    });

    it('inverted-price-range scenario swaps correctly', () => {
      const scenario = CRITICAL_SCENARIOS.find(
        (s) => s.name === 'inverted-price-range'
      );
      const normalized = normalizeFilters(scenario!.input);

      expect(normalized.minPrice).toBeLessThanOrEqual(normalized.maxPrice!);
    });

    it('antimeridian-crossing scenario preserves longitude order', () => {
      const scenario = CRITICAL_SCENARIOS.find(
        (s) => s.name === 'antimeridian-crossing'
      );
      const normalized = normalizeFilters(scenario!.input);

      // Antimeridian crossing: minLng (170) > maxLng (-150) should be preserved
      expect(normalized.bounds?.minLng).toBe(170);
      expect(normalized.bounds?.maxLng).toBe(-150);
    });

    it('extreme-values scenario clamps correctly', () => {
      const scenario = CRITICAL_SCENARIOS.find((s) => s.name === 'extreme-values');
      const normalized = normalizeFilters(scenario!.input);

      expect(normalized.minPrice).toBeGreaterThanOrEqual(0);
      expect(normalized.bounds?.minLat).toBeGreaterThanOrEqual(-90);
      expect(normalized.bounds?.maxLat).toBeLessThanOrEqual(90);
    });
  });
});
