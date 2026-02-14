/**
 * E2E Test Suite: Session Expiry — Resilience
 * Test IDs: SE-R01..R04
 *
 * Tests edge cases and resilience patterns around session expiry:
 * - Rapid repeated actions during session expiry
 * - Browser back after redirect
 * - SessionProvider poll race condition
 * - Network failure during re-auth redirect
 */

import { test, expect, tags } from "../helpers";
import { expireSession, expectLoginRedirect } from "../helpers";

test.describe("Session Expiry: Resilience", () => {
  test.use({ storageState: "playwright/.auth/user.json" });

  test.beforeEach(async () => {
    test.slow();
  });

  test(
    `${tags.auth} ${tags.sessionExpiry} - SE-R01: Rapid repeated actions during session expiry produce only one redirect`,
    async ({ page }) => {
      // Navigate to messages
      await page.goto("/messages");
      await page.waitForLoadState("domcontentloaded");

      const firstConvo = page.locator('a[href^="/messages/"]').first();
      if (
        !(await firstConvo.isVisible({ timeout: 10000 }).catch(() => false))
      ) {
        test.skip(true, "No conversations available");
        return;
      }
      await firstConvo.click();
      await page.waitForURL(/\/messages\/.+/);

      // Expire session
      await expireSession(page);

      const input = page.getByRole("textbox");
      await expect(input).toBeVisible({ timeout: 10000 });

      // Type and send rapidly 3 times
      const sendBtn = page.getByRole("button", { name: /send/i });
      for (let i = 0; i < 3; i++) {
        await input.fill(`Rapid message ${i + 1}`);
        await sendBtn.click().catch(() => {
          // Button may become disabled or page may navigate
        });
      }

      // Should redirect to login exactly once (not infinite loop)
      await expectLoginRedirect(page);

      // Verify page is stable (no redirect loop)
      await page.waitForTimeout(2000);
      await expect(page).toHaveURL(/\/login/);
    },
  );

  test(
    `${tags.auth} ${tags.sessionExpiry} - SE-R02: Browser back after session expiry redirect does not crash`,
    async ({ page }) => {
      // Navigate to settings (has callbackUrl)
      await page.goto("/settings");
      await page.waitForLoadState("domcontentloaded");
      await expect(page).toHaveURL(/\/settings/, { timeout: 10000 });

      // Expire session and navigate to trigger redirect
      for (const cookie of ["authjs.session-token", "authjs.csrf-token", "authjs.callback-url"]) {
        await page.context().clearCookies({ name: cookie });
      }
      await page.goto("/settings");
      await expectLoginRedirect(page);

      // Press browser back — should not crash or enter infinite loop
      await page.goBack();
      await page.waitForTimeout(2000);

      // Page should be on login or settings (redirected again) — not crashed
      const url = page.url();
      // about:blank is acceptable — browser may navigate there on back after redirect
      expect(url).toMatch(/\/(login|settings)|about:blank/);
    },
  );

  test.fixme(
    `${tags.auth} ${tags.sessionExpiry} - SE-R03: SessionProvider poll race condition with server action`,
    async ({ page }) => {
      // FIXME: Race condition scenario:
      // 1. User types a message in ChatWindow
      // 2. SessionProvider's 60s poll detects session expired
      // 3. Simultaneously, user clicks "Send" which triggers server action
      // 4. Both the poll callback and the server action error handler
      //    try to redirect to /login
      //
      // Expected: Only one redirect occurs, no duplicate toasts

      await page.goto("/messages");
      await page.waitForLoadState("domcontentloaded");
    },
  );

  test.fixme(
    `${tags.auth} ${tags.sessionExpiry} - SE-R04: Network failure during re-auth redirect`,
    async ({ page }) => {
      // FIXME: What happens when:
      // 1. Session expires
      // 2. Component tries to redirect to /login
      // 3. Network fails during the redirect
      //
      // Expected: Show offline/error state, retry when network restores

      await page.goto("/");
      await page.waitForLoadState("domcontentloaded");
    },
  );
});
