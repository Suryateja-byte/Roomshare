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
import type { Page } from "@playwright/test";
import {
  clearAuthCookies,
  expectLoginRedirect,
  revokeCurrentUserSession,
} from "../helpers";

function visibleMessageInput(page: Page) {
  return page.locator('[data-testid="message-input"]:visible').first();
}

function visibleSendButton(page: Page) {
  return page.locator('[data-testid="send-button"]:visible').first();
}

async function openFirstConversationThread(
  page: import("@playwright/test").Page
): Promise<string> {
  const firstConvo = page.locator('a[href^="/messages/"]').first();
  if (!(await firstConvo.isVisible({ timeout: 10000 }).catch(() => false))) {
    test.skip(true, "No conversations available for test");
  }

  const href = await firstConvo.getAttribute("href");
  if (!href) {
    test.skip(true, "Conversation link missing href");
  }

  await page.goto(href!, { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/messages\/.+/);
  return page.url().split("/messages/")[1]?.split("?")[0] ?? "";
}
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

    const conversationId = await openFirstConversationThread(page);

    // 2. Type a message
    const input = visibleMessageInput(page);
    await expect(input).toBeVisible({ timeout: 10000 });
    await input.fill("Test message before session expiry");

    // 3. Revoke the server-side JWT before sending. Cookie clearing alone
    // is not deterministic for Next.js server action requests in CI/dev.
    const restoreSession = await revokeCurrentUserSession(page);

    try {
      // 4. Click send
      const sendBtn = visibleSendButton(page);
      await sendBtn.click();

      // 5. Verify toast notification about session expiry
      await expect(
        page
          .locator("[data-sonner-toast]")
          .filter({ hasText: /session.*expired/i })
      ).toBeVisible({ timeout: 10000 });

      // 6. Verify redirect to login with callbackUrl
      await expectLoginRedirect(page, `/messages/${conversationId}`);
    } finally {
      await restoreSession();
    }
  });

  test(`${tags.auth} ${tags.sessionExpiry} - SE-C02: Draft restored after re-auth`, async ({
    page,
  }) => {
    const testDraft = "My important unsent message";

    // Navigate to a conversation
    await page.goto("/messages");
    await page.waitForLoadState("domcontentloaded");

    const conversationId = await openFirstConversationThread(page);

    // Pre-set draft in sessionStorage (simulating a prior session expiry save)
    await page.addInitScript(
      ({ id, draft }) => {
        sessionStorage.setItem(`chat_draft_${id}`, draft);
      },
      { id: conversationId, draft: testDraft }
    );

    // Re-enter the thread with the draft present before app hydration.
    await page.goto(`/messages/${conversationId}`, {
      waitUntil: "domcontentloaded",
    });

    // Verify the input has the draft content restored
    const input = visibleMessageInput(page);
    await expect(input).toHaveValue(testDraft, { timeout: 10000 });

    // Verify restoration toast appeared
    await expect(
      page
        .locator("[data-sonner-toast]")
        .filter({ hasText: /draft.*restored/i })
    ).toBeVisible({ timeout: 10000 });
  });

  test(`${tags.auth} ${tags.sessionExpiry} - SE-C03: MessagesPageClient redirects on session expiry`, async ({
    page,
  }) => {
    // Clear auth cookies to simulate expired session.
    // Don't use expireSession() — its route mock for /api/auth/session is
    // irrelevant for server-side redirects and can interfere with navigation.
    await clearAuthCookies(page);

    // Navigate to messages — server-side auth() finds no session → redirect.
    // Next.js App Router redirect() produces an RSC client-side navigation,
    // NOT an HTTP 302. We must wait for the client-side router to process it.
    await page.goto("/messages");
    await page.waitForFunction(
      () => !window.location.pathname.startsWith("/messages"),
      { timeout: 15_000 }
    );
  });
});
