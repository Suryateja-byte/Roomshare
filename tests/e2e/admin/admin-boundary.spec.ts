/**
 * Admin Boundary Tests — Regular authenticated user access
 *
 * Verifies that authenticated non-admin users cannot access admin pages.
 * This covers the authorization boundary between regular users and admins.
 *
 * Gap: admin-actions.admin.spec.ts tests unauthenticated access (AA-15),
 * but no test existed for authenticated regular user trying admin pages.
 *
 * Uses regular user auth state (not admin).
 */

import { test, expect, timeouts } from "../helpers";

test.describe("Admin Boundary — Regular User", () => {
  test.use({ storageState: "playwright/.auth/user.json" });

  test.beforeEach(async () => {
    test.slow();
  });

  test("ABD-01: regular user cannot access /admin dashboard", async ({
    page,
  }) => {
    await page.goto("/admin");
    await page.waitForLoadState("domcontentloaded");

    // Regular user should be redirected away from admin
    // (either to /login, home, or shown a 403/unauthorized message)
    const currentUrl = page.url();
    const isOnAdmin =
      currentUrl.includes("/admin") &&
      !currentUrl.includes("/login") &&
      !currentUrl.includes("/unauthorized");

    if (isOnAdmin) {
      // If still on /admin, there should be an access denied message
      const accessDenied = page
        .getByText(/unauthorized|forbidden|access denied|not authorized/i)
        .first();
      await expect(accessDenied).toBeVisible({ timeout: timeouts.navigation });
    } else {
      // Redirected away — this is the expected behavior
      expect(
        currentUrl.includes("/login") || currentUrl.endsWith("/")
      ).toBeTruthy();
    }
  });

  test("ABD-02: regular user cannot access admin API endpoints", async ({
    request,
  }) => {
    // Try to access admin-only operations
    const response = await request.get("/admin");

    // Should not return 200 with admin content
    // (302 redirect or 403 forbidden are acceptable)
    if (response.status() === 200) {
      const text = await response.text();
      // If it returns HTML, it should not contain admin dashboard content
      expect(text).not.toMatch(/admin.*dashboard|manage.*users/i);
    }
  });
});
