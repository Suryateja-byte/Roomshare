/**
 * E2E Test Suite: Session Expiry — Messaging
 * Test IDs: SE-C01..C03
 *
 * Validates ChatWindow and MessagesPageClient session expiry handling:
 * - Draft save to sessionStorage on SESSION_EXPIRED
 * - Toast notification ("Your session has expired")
 * - Redirect to /login?callbackUrl=/messages/{id}
 * - Draft restoration on re-mount
 *
 * References:
 *   ChatWindow.tsx:379-387 — SESSION_EXPIRED handler
 *   ChatWindow.tsx:167-177 — Draft restoration on mount
 *   MessagesPageClient.tsx:211-213 — SESSION_EXPIRED redirect
 */

import { test, expect, tags } from "../helpers";
import { expireSession, expectLoginRedirect } from "../helpers";

test.describe("Session Expiry: Messaging", () => {
  test.use({ storageState: "playwright/.auth/user.json" });

  test.beforeEach(async () => {
    test.slow();
  });

  test(`${tags.auth} ${tags.sessionExpiry} - SE-C01: ChatWindow saves draft and redirects on session expiry during send`, async ({
    page,
  }) => {
    // 1. Navigate to messages page
    await page.goto("/messages");
    await page.waitForLoadState("domcontentloaded");

    // Click first conversation if available
    const firstConvo = page.locator('a[href^="/messages/"]').first();
    if (
      !(await firstConvo.isVisible({ timeout: 10000 }).catch(() => false))
    ) {
      test.skip(true, "No conversations available for test");
      return;
    }
    await firstConvo.click();
    await page.waitForURL(/\/messages\/.+/);

    const conversationId = page.url().split("/messages/")[1]?.split("?")[0];

    // 2. Type a message
    const input = page.getByRole("textbox");
    await expect(input).toBeVisible({ timeout: 10000 });
    await input.fill("Test message before session expiry");

    // 3. Expire session before sending
    await expireSession(page);

    // 4. Click send
    const sendBtn = page.getByRole("button", { name: /send/i });
    await sendBtn.click();

    // 5. Verify toast notification about session expiry
    await expect(
      page.locator("[data-sonner-toast]").filter({ hasText: /session.*expired/i }),
    ).toBeVisible({ timeout: 10000 });

    // 6. Verify redirect to login with callbackUrl
    await expectLoginRedirect(page, `/messages/${conversationId}`);
  });

  test(`${tags.auth} ${tags.sessionExpiry} - SE-C02: Draft restored after re-auth`, async ({
    page,
  }) => {
    const testDraft = "My important unsent message";

    // Navigate to a conversation
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

    const conversationId = page.url().split("/messages/")[1]?.split("?")[0];

    // Pre-set draft in sessionStorage (simulating a prior session expiry save)
    await page.evaluate(
      ({ id, draft }) => {
        sessionStorage.setItem(`chat_draft_${id}`, draft);
      },
      { id: conversationId, draft: testDraft },
    );

    // Reload to trigger the useEffect draft restoration
    await page.reload();
    await page.waitForLoadState("domcontentloaded");

    // Verify the input has the draft content restored
    const input = page.getByRole("textbox");
    await expect(input).toHaveValue(testDraft, { timeout: 10000 });

    // Verify restoration toast appeared
    await expect(
      page.locator("[data-sonner-toast]").filter({ hasText: /draft.*restored/i }),
    ).toBeVisible({ timeout: 10000 });
  });

  test(`${tags.auth} ${tags.sessionExpiry} - SE-C03: MessagesPageClient redirects on session expiry`, async ({
    page,
  }) => {
    // Expire session before navigating to messages
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await expireSession(page);

    // Navigate to messages — server-side auth() finds no session → redirect
    await page.goto("/messages");

    // Should redirect AWAY from /messages. The redirect chain may land on /login
    // or / (if the login page further redirects when session is invalid).
    // The test's purpose: unauthenticated users cannot stay on /messages.
    await page.waitForLoadState("domcontentloaded");
    const url = page.url();
    expect(url).not.toMatch(/\/messages/);
  });
});
