/**
 * Production Filter Regression Framework
 *
 * Captures real-world filter patterns from production and replays them
 * in tests to detect behavioral regressions.
 *
 * Usage:
 * 1. In production: Call captureFilterScenario() on each search request
 * 2. Export scenarios periodically to a regression test file
 * 3. Run regression tests to verify behavior matches expected outcomes
 */

import { normalizeFilters, type FilterParams, type NormalizedFilters } from './filter-schema';

// ============================================
// Types
// ============================================

export interface FilterScenario {
  id: string;
  timestamp: string;
  rawInput: unknown;
  normalizedFilters: NormalizedFilters;
  resultCount: number;
  resultIds: string[];
  executionTimeMs: number;
  // Fingerprint of behavior for regression detection
  behaviorHash: string;
}

export interface RegressionReport {
  scenarioId: string;
  timestamp: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  expected: Partial<FilterScenario>;
  actual: Partial<FilterScenario>;
  diff?: Record<string, { expected: unknown; actual: unknown }>;
}

export interface RegressionSummary {
  totalScenarios: number;
  passed: number;
  failed: number;
  warnings: number;
  reports: RegressionReport[];
}

// ============================================
// Scenario Capture
// ============================================

/**
 * Creates a deterministic hash of filter behavior for regression detection.
 * Changes to this hash indicate a behavioral change.
 */
export function createBehaviorHash(
  filters: NormalizedFilters,
  resultIds: string[]
): string {
  // Sort result IDs for determinism
  const sortedIds = [...resultIds].sort();

  // Create a stable representation
  const data = {
    filters: JSON.stringify(filters),
    resultCount: sortedIds.length,
    firstResults: sortedIds.slice(0, 10),
    lastResults: sortedIds.slice(-10),
  };

  // Simple hash function (for production, use crypto)
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(16);
}

/**
 * Captures a filter scenario for regression testing.
 * Call this in production on each search request.
 */
export function captureFilterScenario(
  rawInput: unknown,
  resultIds: string[],
  executionTimeMs: number
): FilterScenario {
  const normalizedFilters = normalizeFilters(rawInput);

  return {
    id: `scenario-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    rawInput,
    normalizedFilters,
    resultCount: resultIds.length,
    resultIds,
    executionTimeMs,
    behaviorHash: createBehaviorHash(normalizedFilters, resultIds),
  };
}

// ============================================
// Scenario Storage (In-Memory for Tests)
// ============================================

// In-memory store for captured scenarios
const scenarioStore: Map<string, FilterScenario> = new Map();

export function storeScenario(scenario: FilterScenario): void {
  scenarioStore.set(scenario.id, scenario);
}

export function getScenario(id: string): FilterScenario | undefined {
  return scenarioStore.get(id);
}

export function getAllScenarios(): FilterScenario[] {
  return Array.from(scenarioStore.values());
}

export function clearScenarios(): void {
  scenarioStore.clear();
}

/**
 * Export scenarios to JSON for test fixtures
 */
export function exportScenarios(): string {
  const scenarios = getAllScenarios();
  return JSON.stringify(scenarios, null, 2);
}

/**
 * Import scenarios from JSON fixtures
 */
export function importScenarios(json: string): void {
  const scenarios: FilterScenario[] = JSON.parse(json);
  scenarios.forEach((s) => storeScenario(s));
}

// ============================================
// Regression Testing
// ============================================

export type FilterExecutor = (
  filters: NormalizedFilters
) => Promise<string[]> | string[];

/**
 * Runs a single scenario against the current implementation.
 */
export async function runScenario(
  scenario: FilterScenario,
  executor: FilterExecutor
): Promise<RegressionReport> {
  const startTime = performance.now();

  try {
    // Re-normalize to test normalization consistency
    const currentNormalized = normalizeFilters(scenario.rawInput);
    const currentResults = await executor(currentNormalized);
    const executionTime = performance.now() - startTime;

    // Check for normalization changes
    const normalizationMatch =
      JSON.stringify(currentNormalized) ===
      JSON.stringify(scenario.normalizedFilters);

    // Check for result count changes
    const countMatch = currentResults.length === scenario.resultCount;

    // Check behavior hash
    const currentHash = createBehaviorHash(currentNormalized, currentResults);
    const hashMatch = currentHash === scenario.behaviorHash;

    // Generate diff for failures
    const diff: Record<string, { expected: unknown; actual: unknown }> = {};

    if (!normalizationMatch) {
      diff.normalizedFilters = {
        expected: scenario.normalizedFilters,
        actual: currentNormalized,
      };
    }

    if (!countMatch) {
      diff.resultCount = {
        expected: scenario.resultCount,
        actual: currentResults.length,
      };
    }

    if (!hashMatch) {
      diff.behaviorHash = {
        expected: scenario.behaviorHash,
        actual: currentHash,
      };
    }

    // Determine status
    let status: 'pass' | 'fail' | 'warning' = 'pass';
    let message = 'Scenario passed';

    if (!normalizationMatch || !hashMatch) {
      status = 'fail';
      message = 'Behavioral regression detected';
    } else if (!countMatch) {
      // Count changes without hash change might be data-dependent
      status = 'warning';
      message = 'Result count changed (may be data-dependent)';
    }

    // Performance regression check
    if (executionTime > scenario.executionTimeMs * 2) {
      if (status === 'pass') {
        status = 'warning';
        message = 'Performance regression detected';
      }
      diff.executionTimeMs = {
        expected: scenario.executionTimeMs,
        actual: executionTime,
      };
    }

    return {
      scenarioId: scenario.id,
      timestamp: new Date().toISOString(),
      status,
      message,
      expected: {
        normalizedFilters: scenario.normalizedFilters,
        resultCount: scenario.resultCount,
        behaviorHash: scenario.behaviorHash,
      },
      actual: {
        normalizedFilters: currentNormalized,
        resultCount: currentResults.length,
        behaviorHash: currentHash,
      },
      diff: Object.keys(diff).length > 0 ? diff : undefined,
    };
  } catch (error) {
    return {
      scenarioId: scenario.id,
      timestamp: new Date().toISOString(),
      status: 'fail',
      message: `Execution error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      expected: { normalizedFilters: scenario.normalizedFilters },
      actual: {},
    };
  }
}

/**
 * Runs all stored scenarios and generates a summary report.
 */
export async function runRegressionSuite(
  executor: FilterExecutor
): Promise<RegressionSummary> {
  const scenarios = getAllScenarios();
  const reports: RegressionReport[] = [];

  for (const scenario of scenarios) {
    const report = await runScenario(scenario, executor);
    reports.push(report);
  }

  return {
    totalScenarios: scenarios.length,
    passed: reports.filter((r) => r.status === 'pass').length,
    failed: reports.filter((r) => r.status === 'fail').length,
    warnings: reports.filter((r) => r.status === 'warning').length,
    reports,
  };
}

// ============================================
// Scenario Sampling
// ============================================

/**
 * Samples scenarios based on filter characteristics.
 * Ensures diverse coverage without storing every request.
 */
export class ScenarioSampler {
  private buckets: Map<string, FilterScenario[]> = new Map();
  private maxPerBucket: number;
  private maxTotal: number;

  constructor(maxPerBucket = 10, maxTotal = 1000) {
    this.maxPerBucket = maxPerBucket;
    this.maxTotal = maxTotal;
  }

  /**
   * Creates a bucket key based on filter characteristics.
   */
  private getBucketKey(filters: NormalizedFilters): string {
    const parts: string[] = [];

    if (filters.query) parts.push('q');
    if (filters.minPrice !== undefined || filters.maxPrice !== undefined) parts.push('price');
    if (filters.roomType) parts.push('room');
    if (filters.amenities && filters.amenities.length > 0) parts.push('amen');
    if (filters.houseRules && filters.houseRules.length > 0) parts.push('rules');
    if (filters.languages && filters.languages.length > 0) parts.push('lang');
    if (filters.bounds) parts.push('geo');
    if (filters.genderPreference) parts.push('gender');
    if (filters.leaseDuration) parts.push('lease');
    if (filters.moveInDate) parts.push('date');

    return parts.sort().join('-') || 'empty';
  }

  /**
   * Attempts to add a scenario to the sample set.
   * Returns true if added, false if rejected.
   */
  sample(scenario: FilterScenario): boolean {
    // Check total limit
    let totalCount = 0;
    this.buckets.forEach((bucket) => (totalCount += bucket.length));
    if (totalCount >= this.maxTotal) {
      return false;
    }

    const key = this.getBucketKey(scenario.normalizedFilters);

    if (!this.buckets.has(key)) {
      this.buckets.set(key, []);
    }

    const bucket = this.buckets.get(key)!;

    // Check bucket limit
    if (bucket.length >= this.maxPerBucket) {
      // Replace random entry to maintain diversity
      const replaceIndex = Math.floor(Math.random() * bucket.length);
      bucket[replaceIndex] = scenario;
      return true;
    }

    bucket.push(scenario);
    return true;
  }

  /**
   * Returns all sampled scenarios.
   */
  getScenarios(): FilterScenario[] {
    const result: FilterScenario[] = [];
    this.buckets.forEach((bucket) => result.push(...bucket));
    return result;
  }

  /**
   * Returns bucket statistics for coverage analysis.
   */
  getCoverageStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    this.buckets.forEach((bucket, key) => {
      stats[key] = bucket.length;
    });
    return stats;
  }

  /**
   * Clears all sampled scenarios.
   */
  clear(): void {
    this.buckets.clear();
  }
}

// ============================================
// Golden File Testing
// ============================================

export interface GoldenScenario {
  name: string;
  description: string;
  input: unknown;
  expectedNormalized: NormalizedFilters;
  // Optional: expected result characteristics
  expectedMinResults?: number;
  expectedMaxResults?: number;
}

/**
 * Creates a golden scenario for regression testing.
 */
export function createGoldenScenario(
  name: string,
  description: string,
  input: unknown
): GoldenScenario {
  return {
    name,
    description,
    input,
    expectedNormalized: normalizeFilters(input),
  };
}

/**
 * Validates a golden scenario against current implementation.
 */
export function validateGoldenScenario(
  golden: GoldenScenario
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  try {
    const current = normalizeFilters(golden.input);
    const expected = golden.expectedNormalized;

    // Deep comparison
    const currentStr = JSON.stringify(current);
    const expectedStr = JSON.stringify(expected);

    if (currentStr !== expectedStr) {
      errors.push(
        `Normalization mismatch:\nExpected: ${expectedStr}\nActual: ${currentStr}`
      );
    }
  } catch (error) {
    errors.push(
      `Normalization error: ${error instanceof Error ? error.message : 'Unknown'}`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================
// Pre-defined Critical Scenarios
// ============================================

export const CRITICAL_SCENARIOS: GoldenScenario[] = [
  createGoldenScenario(
    'empty-filters',
    'Empty filter object should normalize cleanly',
    {}
  ),
  createGoldenScenario(
    'basic-price-filter',
    'Simple price range filter',
    { minPrice: 500, maxPrice: 2000 }
  ),
  createGoldenScenario(
    'inverted-price-range',
    'Inverted price range should be swapped',
    { minPrice: 2000, maxPrice: 500 }
  ),
  createGoldenScenario(
    'complex-filter-combo',
    'Multiple filters combined',
    {
      minPrice: 800,
      maxPrice: 2500,
      roomType: 'Private Room',
      amenities: ['Wifi', 'AC'],
      languages: ['en', 'es'],
      sort: 'price_asc',
    }
  ),
  createGoldenScenario(
    'geographic-bounds',
    'Geographic bounds filter',
    {
      bounds: {
        minLat: 37.7,
        maxLat: 37.85,
        minLng: -122.5,
        maxLng: -122.35,
      },
    }
  ),
  createGoldenScenario(
    'antimeridian-crossing',
    'Bounds crossing antimeridian should NOT swap longitude',
    {
      bounds: {
        minLat: 30,
        maxLat: 60,
        minLng: 170,
        maxLng: -150,
      },
    }
  ),
  createGoldenScenario(
    'case-insensitive-enum',
    'Enum values should be case-insensitive',
    { roomType: 'private room', sort: 'PRICE_ASC' }
  ),
  createGoldenScenario(
    'array-deduplication',
    'Duplicate array values should be deduplicated',
    { amenities: ['Wifi', 'wifi', 'WIFI', 'AC', 'ac'] }
  ),
  createGoldenScenario(
    'malformed-input',
    'Malformed input should not crash',
    { minPrice: 'not-a-number', amenities: 'not-an-array' }
  ),
  createGoldenScenario(
    'extreme-values',
    'Extreme values should be clamped',
    {
      minPrice: -1000,
      maxPrice: 99999999,
      bounds: { minLat: -200, maxLat: 200, minLng: -400, maxLng: 400 },
    }
  ),
];

/**
 * Runs all critical scenarios and returns validation results.
 */
export function validateCriticalScenarios(): {
  allValid: boolean;
  results: Array<{ scenario: string; valid: boolean; errors: string[] }>;
} {
  const results = CRITICAL_SCENARIOS.map((scenario) => {
    const validation = validateGoldenScenario(scenario);
    return {
      scenario: scenario.name,
      valid: validation.valid,
      errors: validation.errors,
    };
  });

  return {
    allValid: results.every((r) => r.valid),
    results,
  };
}
