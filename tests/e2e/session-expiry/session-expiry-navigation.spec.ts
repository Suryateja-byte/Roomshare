/**
 * E2E Test Suite: Session Expiry — Navigation & Redirects
 * Test IDs: SE-N01..N05
 *
 * Tests server-side redirect behavior when navigating to protected
 * pages with an expired session (cookie cleared before navigation).
 *
 * References:
 *   src/app/messages/page.tsx:10-11 — redirect('/login')
 *   src/app/bookings/page.tsx:15 — redirect('/login')
 *   src/app/settings/page.tsx:18 — redirect('/login?callbackUrl=/settings')
 *   src/app/profile/page.tsx:10 — redirect('/login')
 *   src/auth.config.ts:14-29 — Middleware authorized callback (protects /dashboard)
 */

import { test, expect, tags } from "../helpers";
import { expectLoginRedirect } from "../helpers";

test.describe("Session Expiry: Navigation & Redirects", () => {
  test.use({ storageState: "playwright/.auth/user.json" });

  test.beforeEach(async () => {
    test.slow();
  });

  test(
    `${tags.auth} ${tags.sessionExpiry} - SE-N01: Navigate to /bookings with expired cookie redirects to /login`,
    async ({ page }) => {
      // Clear all auth cookies to simulate expired session
      for (const cookie of ["authjs.session-token", "authjs.csrf-token", "authjs.callback-url"]) {
        await page.context().clearCookies({ name: cookie });
      }

      // Navigate to protected page
      await page.goto("/bookings");

      // Server-side auth check should redirect to /login
      await expectLoginRedirect(page);
    },
  );

  test(
    `${tags.auth} ${tags.sessionExpiry} - SE-N02: Navigate to /messages with expired cookie redirects to /login`,
    async ({ page }) => {
      for (const cookie of ["authjs.session-token", "authjs.csrf-token", "authjs.callback-url"]) {
        await page.context().clearCookies({ name: cookie });
      }
      await page.goto("/messages");
      await expectLoginRedirect(page);
    },
  );

  test(
    `${tags.auth} ${tags.sessionExpiry} - SE-N03: Navigate to /settings with expired cookie preserves callbackUrl`,
    async ({ page }) => {
      for (const cookie of ["authjs.session-token", "authjs.csrf-token", "authjs.callback-url"]) {
        await page.context().clearCookies({ name: cookie });
      }
      await page.goto("/settings");

      // /settings page explicitly uses redirect('/login?callbackUrl=/settings')
      await expectLoginRedirect(page, "/settings");
    },
  );

  test(
    `${tags.auth} ${tags.sessionExpiry} - SE-N04: Navigate to /profile with expired cookie redirects to /login`,
    async ({ page }) => {
      for (const cookie of ["authjs.session-token", "authjs.csrf-token", "authjs.callback-url"]) {
        await page.context().clearCookies({ name: cookie });
      }
      await page.goto("/profile");
      await expectLoginRedirect(page);
    },
  );

  test(
    `${tags.auth} ${tags.sessionExpiry} - SE-N05: Full round-trip — expire, login redirect, callbackUrl preserved`,
    async ({ page }) => {
      // Start on a protected page (settings has callbackUrl)
      await page.goto("/settings");
      await page.waitForLoadState("domcontentloaded");

      // Verify we're on settings (authenticated)
      await expect(page).toHaveURL(/\/settings/, { timeout: 10000 });

      // Clear session cookies (same pattern as SE-N01..N04)
      for (const cookie of ["authjs.session-token", "authjs.csrf-token", "authjs.callback-url"]) {
        await page.context().clearCookies({ name: cookie });
      }

      // Try navigating to settings again — should redirect to login
      await page.goto("/settings");
      await expectLoginRedirect(page, "/settings");

      // Verify the login page loaded and has a form
      await expect(
        page.getByRole("heading", { name: /log in|sign in|welcome/i }),
      ).toBeVisible({ timeout: 10000 });
    },
  );
});
