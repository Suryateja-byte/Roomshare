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
    // Use domcontentloaded instead of networkidle — networkidle hangs in CI
    // when background requests (analytics, Unsplash images) keep the network busy
    await page.waitForLoadState("domcontentloaded");

    // Wait for any redirect to settle after hydration
    await expect(page).not.toHaveURL(/^[^?]*\/admin(?:\/|$)/, { timeout: 15_000 }).catch(() => {});

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
      // URL may be "http://localhost:3000" (no trailing slash) or "http://localhost:3000/"
      const urlPath = new URL(currentUrl).pathname;
      expect(
        currentUrl.includes("/login") || urlPath === "/"
      ).toBeTruthy();
    }
  });

  test("ABD-02: regular user cannot access admin API endpoints", async ({
    request,
  }) => {
    // Try to access admin-only operations via API
    const response = await request.get("/admin");

    // Should not return 200 with admin content
    // (302 redirect or 403 forbidden are acceptable)
    // Playwright follows redirects, so check either the final status or content
    const status = response.status();
    if (status === 200) {
      const text = await response.text();
      // Check for admin-specific UI elements (not raw HTML that includes JS chunk filenames).
      // Next.js SSR HTML includes chunk paths like "admin/error-xxx.js" which falsely match
      // broad regexes. Instead, check for actual admin dashboard UI text content.
      expect(text).not.toMatch(
        /Admin Dashboard<|>Manage Users<|>Admin Panel</i
      );
    }
    // Any non-200 is also acceptable (403, 404, etc.)
  });
});
