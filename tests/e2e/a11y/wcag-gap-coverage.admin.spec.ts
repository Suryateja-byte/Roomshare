/**
 * E2E Accessibility — Gap Coverage (Admin Pages)
 *
 * axe-core WCAG 2.1 AA scans for admin pages:
 * /admin, /admin/listings, /admin/users, /admin/reports, /admin/verifications, /admin/audit
 */

import { test, expect } from "@playwright/test";
import {
  runAxeScan,
  filterViolations,
  logViolations,
} from "../helpers/a11y-helpers";

test.describe("axe-core Gap Coverage — Admin Pages", () => {
  test.use({ storageState: "playwright/.auth/admin.json" });

  test.beforeEach(async () => {
    test.slow();
  });

  const adminPages = [
    { name: "Admin Dashboard", url: "/admin" },
    { name: "Admin Listings", url: "/admin/listings" },
    { name: "Admin Users", url: "/admin/users" },
    { name: "Admin Reports", url: "/admin/reports" },
    { name: "Admin Verifications", url: "/admin/verifications" },
    { name: "Admin Audit", url: "/admin/audit" },
  ];

  for (const { name, url } of adminPages) {
    test(`${name} (${url}) passes WCAG 2.1 AA`, async ({ page }) => {
      const response = await page.goto(url);
      await page.waitForLoadState("domcontentloaded");

      // Skip if redirected away (no admin auth available)
      const currentUrl = page.url();
      if (
        currentUrl.includes("/login") ||
        (response && response.status() >= 400)
      ) {
        test.skip(true, `Admin auth not available — redirected from ${url}`);
        return;
      }

      const results = await runAxeScan(page);
      const violations = filterViolations(results.violations);

      logViolations(name, violations);
      expect(violations).toHaveLength(0);
    });
  }
});
