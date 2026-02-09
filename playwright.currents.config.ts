import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

/**
 * Currents orchestration config — subset of projects for CI.
 *
 * pwc-p orchestration does NOT respect --project CLI flags; it distributes
 * every project defined in the config. This file limits the project list
 * to the ones we actually want to run under orchestration:
 *   - chromium, chromium-anon, Mobile Chrome (Chromium-engine)
 *   - firefox-anon, webkit-anon (cross-browser smoke, anon only)
 *
 * Full firefox/webkit/Mobile Safari authenticated runs are excluded
 * to keep per-shard execution time within the timeout budget.
 */

const allowedProjects = new Set([
  'setup',
  'chromium',
  'chromium-anon',
  'Mobile Chrome',
  'firefox-anon',
  'webkit-anon',
]);

export default defineConfig({
  ...baseConfig,
  projects: baseConfig.projects?.filter((p) => p.name && allowedProjects.has(p.name)) ?? [],
});
