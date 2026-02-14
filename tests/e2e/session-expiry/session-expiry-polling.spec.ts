/**
 * E2E Test Suite: Session Expiry — Polling Components
 * Test IDs: SE-P01..P03
 *
 * Tests how polling components respond to session expiry:
 * - NavbarClient: Unread count freezes, exponential backoff, no user notification
 * - SessionProvider: useSession() transitions to 'unauthenticated'
 * - ChatWindow (simple): Messages freeze, failed req/min with no error indicator
 *
 * References:
 *   NavbarClient.tsx:128-240 — Polls /api/messages/unread every 30s with backoff
 *   Providers.tsx:16-20 — SessionProvider refetchInterval=60, refetchOnWindowFocus=true
 */

import { test, expect, tags } from "../helpers";
import { expireSession } from "../helpers";

test.describe("Session Expiry: Polling Components", () => {
  test.use({ storageState: "playwright/.auth/user.json" });

  test.beforeEach(async () => {
    test.slow();
  });

  test.fixme(
    `${tags.auth} ${tags.sessionExpiry} - SE-P01: NavbarClient unread count freezes silently on session expiry`,
    async ({ page }) => {
      // FIXME: NavbarClient polls /api/messages/unread every 30s.
      // On 401, it uses exponential backoff but shows NO user notification.
      // After session expiry, the unread badge freezes at its last value.
      // Expected: Show stale-data indicator or redirect after N failures.

      await page.goto("/");
      await page.waitForLoadState("domcontentloaded");

      // Wait for initial navbar load
      await page.waitForTimeout(2000);

      // Expire session
      await expireSession(page);

      // Wait for backoff polling to fire (would need to wait 30+ seconds)
      // Currently: unread count freezes, no user notification
    },
  );

  test(
    `${tags.auth} ${tags.sessionExpiry} - SE-P02: SessionProvider detects expired session on window focus`,
    async ({ page }) => {
      await page.goto("/");
      await page.waitForLoadState("domcontentloaded");

      // Verify initially authenticated — look for user menu or account indicator
      const userMenu = page
        .getByRole("button", { name: /menu|profile|account/i })
        .or(page.locator('[data-testid="user-menu"]'))
        .or(page.locator('[aria-label*="user" i]'));

      const isAuthenticated = await userMenu
        .first()
        .isVisible({ timeout: 10000 })
        .catch(() => false);
      if (!isAuthenticated) {
        test.skip(true, "Not authenticated at start of test");
        return;
      }

      // Expire session and trigger SessionProvider refetch via focus event
      await expireSession(page, { triggerRefetch: true });

      // Navbar should reflect unauthenticated state — use auto-retry assertion
      // Give SessionProvider up to 30s — if focus event doesn't trigger immediate
      // refetch, the periodic refetch (60s interval) may take longer in CI.
      await expect(
        page.getByRole('link', { name: /log in|sign in/i })
          .or(page.getByRole('link', { name: /sign up/i }))
      ).toBeVisible({ timeout: 30_000 });
    },
  );

  test.fixme(
    `${tags.auth} ${tags.sessionExpiry} - SE-P03: ChatWindow simple polling freezes silently`,
    async ({ page }) => {
      // FIXME: The simple ChatWindow variant polls every 5s for new messages.
      // On session expiry, it generates ~12 failed requests/minute with
      // ZERO user notification. Messages freeze at last known state.
      // Expected: Detect repeated 401s, show reconnection error, stop polling.

      await page.goto("/messages");
      await page.waitForLoadState("domcontentloaded");

      const firstConvo = page.locator('a[href^="/messages/"]').first();
      if (!(await firstConvo.isVisible({ timeout: 10000 }).catch(() => false))) {
        test.skip(true, "No conversations available");
        return;
      }
      await firstConvo.click();
      await page.waitForURL(/\/messages\/.+/);

      // Expire session
      await expireSession(page);

      // Wait for polling to fire (5s interval)
      // Currently: messages freeze, no error indicator shown
    },
  );
});
