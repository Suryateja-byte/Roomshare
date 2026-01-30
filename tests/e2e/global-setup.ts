import { execFileSync } from 'child_process';
import path from 'path';

/**
 * Playwright global setup — seeds E2E test data before any tests run.
 */
export default async function globalSetup() {
  console.log('[global-setup] Running E2E seed...');
  try {
    execFileSync('node', ['scripts/seed-e2e.js'], {
      cwd: path.resolve(__dirname, '../..'),
      stdio: 'inherit',
      timeout: 30000,
    });
  } catch (e) {
    console.warn('[global-setup] Seed failed (non-fatal):', (e as Error).message);
  }
}
