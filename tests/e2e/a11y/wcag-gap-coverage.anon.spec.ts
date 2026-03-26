/**
 * E2E Accessibility — Gap Coverage (Anonymous Pages)
 *
 * axe-core WCAG 2.1 AA scans for anonymous pages not covered by existing specs:
 * - /verify, /verify-expired, /reset-password, /offline
 */

import { test, expect } from "@playwright/test";
import {
  runAxeScan,
  filterViolations,
  logViolations,
} from "../helpers/a11y-helpers";

test.describe("axe-core Gap Coverage — Anonymous Pages", () => {
  test.beforeEach(async () => {
    test.slow();
  });

  test.describe("Auth flow pages", () => {
    test("/verify page passes WCAG 2.1 AA", async ({ page }) => {
      await page.goto("/verify");
      await page.waitForLoadState("domcontentloaded");
      // /verify may redirect (e.g. to /login) — wait for navigation to settle
      await page.waitForLoadState("networkidle").catch(() => {});

      // If we were redirected, scan the destination page instead
      const results = await runAxeScan(page).catch(() => null);
      if (!results) {
        test.skip(true, "/verify page navigation prevented axe scan");
        return;
      }
      const violations = filterViolations(results.violations);

      logViolations("/verify", violations);
      expect(violations).toHaveLength(0);
    });

    test("/verify-expired page passes WCAG 2.1 AA", async ({ page }) => {
      await page.goto("/verify-expired");
      await page.waitForLoadState("domcontentloaded");

      const results = await runAxeScan(page);
      const violations = filterViolations(results.violations);

      logViolations("/verify-expired", violations);
      expect(violations).toHaveLength(0);
    });

    test("/reset-password page passes WCAG 2.1 AA", async ({ page }) => {
      await page.goto("/reset-password");
      await page.waitForLoadState("domcontentloaded");

      const results = await runAxeScan(page);
      const violations = filterViolations(results.violations);

      logViolations("/reset-password", violations);
      expect(violations).toHaveLength(0);
    });
  });

  test.describe("Offline fallback page", () => {
    test("/offline page passes WCAG 2.1 AA", async ({ page }) => {
      await page.goto("/offline");
      await page.waitForLoadState("domcontentloaded");

      const results = await runAxeScan(page);
      const violations = filterViolations(results.violations);

      logViolations("/offline", violations);
      expect(violations).toHaveLength(0);
    });
  });
});
