
const { validateCriticalScenarios, CRITICAL_SCENARIOS } = require('@/lib/filter-regression');

describe('CI Filter Regression Validation', () => {
  it('all critical scenarios pass', () => {
    const results = validateCriticalScenarios();

    console.log('\nCritical Scenarios Validation:');
    results.results.forEach(r => {
      const status = r.valid ? '✓' : '✗';
      console.log('  ' + status + ' ' + r.scenario);
      if (!r.valid) r.errors.forEach(e => console.log('    Error: ' + e));
    });
    console.log('\nTotal: ' + results.results.length + ' scenarios');

    expect(results.allValid).toBe(true);
  });

  it('has minimum required critical scenarios', () => {
    expect(CRITICAL_SCENARIOS.length).toBeGreaterThanOrEqual(10);
  });
});
