#!/usr/bin/env node
/**
 * Validates critical filter scenarios for CI.
 * This script ensures filter normalization behavior hasn't regressed.
 *
 * Usage: node scripts/validate-filter-scenarios.js
 */

const { execSync } = require('child_process');

// Run validation through Jest which handles TypeScript compilation
const testCode = `
const { validateCriticalScenarios, CRITICAL_SCENARIOS } = require('@/lib/filter-regression');

describe('CI Filter Regression Validation', () => {
  it('all critical scenarios pass', () => {
    const results = validateCriticalScenarios();

    console.log('\\nCritical Scenarios Validation:');
    results.results.forEach(r => {
      const status = r.valid ? '✓' : '✗';
      console.log('  ' + status + ' ' + r.scenario);
      if (!r.valid) r.errors.forEach(e => console.log('    Error: ' + e));
    });
    console.log('\\nTotal: ' + results.results.length + ' scenarios');

    expect(results.allValid).toBe(true);
  });

  it('has minimum required critical scenarios', () => {
    expect(CRITICAL_SCENARIOS.length).toBeGreaterThanOrEqual(10);
  });
});
`;

// Write temp test file
const fs = require('fs');
const path = require('path');
const tempFile = path.join(__dirname, '../src/__tests__/.ci-filter-validation.test.ts');

fs.writeFileSync(tempFile, testCode);

try {
  console.log('Running critical filter scenario validation...\n');
  execSync(`npx jest ${tempFile} --no-coverage`, {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });
  console.log('\n✓ All critical filter scenarios validated successfully');
  process.exit(0);
} catch (error) {
  console.error('\n✗ Filter regression detected!');
  process.exit(1);
} finally {
  // Cleanup temp file
  try { fs.unlinkSync(tempFile); } catch (e) {}
}
