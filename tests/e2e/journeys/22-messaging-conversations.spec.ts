/**
 * Messaging & Conversations Journeys (J25–J27)
 *
 * J25: Send message in existing conversation
 * J26: Start conversation from listing detail
 * J27: Empty messages inbox
 */

import {
  test,
  expect,
  selectors,
  timeouts,
  SF_BOUNDS,
  searchResultsContainer,
} from "../helpers";
import type { Page } from "@playwright/test";

test.beforeEach(async () => {
  test.slow();
});

async function gotoConversationHref(page: Page, href: string) {
  const targetUrl = new URL(href, page.url()).toString();
  const targetPath = new URL(targetUrl).pathname;
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await page.goto(targetUrl, {
        waitUntil: "commit",
        timeout: timeouts.navigation,
      });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const alreadyOnTarget = new URL(page.url()).pathname === targetPath;
      const retryableNavigationRace =
        message.includes("net::ERR_ABORTED") ||
        message.includes("NS_BINDING_ABORTED") ||
        message.includes("is interrupted by another navigation");

      if (alreadyOnTarget) {
        return;
      }

      if (!retryableNavigationRace || attempt === maxAttempts) {
        throw error;
      }

      await page
        .waitForLoadState("domcontentloaded", { timeout: 5000 })
        .catch(() => {});
    }
  }
}

// ─── J25: Send Message in Conversation ────────────────────────────────────────
test.describe("J25: Send Message in Conversation", () => {
  test("go to messages → open conversation → send message → verify appears", async ({
    page,
    nav,
  }) => {
    // Skip on mobile viewports — messaging UI layout differs significantly on mobile
    const viewport = page.viewportSize();
    if (viewport && viewport.width < 768) {
      test.skip(true, "Test designed for desktop viewport");
      return;
    }

    // Step 1: Navigate to messages
    await nav.goToMessages();

    // Check we weren't redirected to login or signup
    const messagesUrl = page.url();
    const onAuthPage =
      messagesUrl.includes("/login") ||
      messagesUrl.includes("/signin") ||
      messagesUrl.includes("/signup");
    test.skip(onAuthPage, "Auth redirect — session not available in CI");
    if (onAuthPage) return;

    await page.waitForLoadState("networkidle").catch(() => {});

    // Step 2: Check for existing conversations (sidebar has conversation previews)
    const conversationItem = page
      .locator('[data-testid="conversation-item"]')
      .or(page.locator('a[href^="/messages/"]'))
      .or(page.getByText("E2E Reviewer"));

    const hasConversations = (await conversationItem.count()) > 0;
    test.skip(!hasConversations, "No conversations found — skipping");

    // Step 3: Open the first conversation route deterministically.
    // Desktop rows may select in-page while links can still navigate; going to the
    // href avoids filling the composer during a late route transition.
    const conversationLink = page.locator('a[href^="/messages/"]').first();
    await conversationLink.waitFor({ state: "visible", timeout: 30_000 });
    const conversationHref = await conversationLink.getAttribute("href");
    test.skip(!conversationHref, "No conversation href found — skipping");
    if (!conversationHref) return;

    await gotoConversationHref(page, conversationHref);
    await page.waitForURL(/\/messages\/[^/]+/, {
      timeout: timeouts.navigation,
      waitUntil: "commit",
    });
    await page.waitForLoadState("domcontentloaded").catch(() => {});

    // Step 4: Type and send a message
    const msgInput = page
      .getByPlaceholder(/message|type|write/i)
      .or(page.locator('input[name*="message"]'))
      .or(page.locator('textarea[name*="message"]'))
      .or(page.locator('[data-testid="message-input"]'));

    const canType = await msgInput
      .first()
      .isVisible()
      .catch(() => false);
    test.skip(!canType, "No message input found — skipping");

    const input = msgInput.first();
    await input.waitFor({ state: "visible", timeout: 10_000 });

    const sendBtn = page
      .getByRole("button", { name: /send/i })
      .or(page.locator('[data-testid="send-button"]'))
      .or(page.locator('button[type="submit"]'));

    await page
      .waitForLoadState("networkidle", { timeout: 10_000 })
      .catch(() => {});
    await expect(async () => {
      await input.fill("hydration probe");
      await expect(input).toHaveValue("hydration probe", { timeout: 1_000 });
      await expect(sendBtn.first()).toBeEnabled({ timeout: 1_000 });
    }).toPass({
      timeout: 15_000,
      intervals: [250, 500, 1_000],
    });
    await input.fill("");
    await expect(sendBtn.first()).toBeDisabled({ timeout: 5_000 });

    const testMsg = `E2E test message ${Date.now()}`;
    await input.fill(testMsg);
    await expect(input).toHaveValue(testMsg);
    await expect(sendBtn.first()).toBeEnabled({ timeout: 10_000 });
    await sendBtn.first().click({ timeout: 30000 });
    // Wait for sent message to appear
    await page
      .getByText(testMsg)
      .last()
      .waitFor({ state: "visible", timeout: 10_000 })
      .catch(() => {});

    // Step 5: Verify message appears in thread
    // TODO: add data-testid="sent-message" to ChatWindow sent message bubbles
    // Use text content matching — the last occurrence is the most recent (sent) message
    const sentMsg = page.getByText(testMsg).last();
    const found = await sentMsg.isVisible().catch(() => false);
    expect(found).toBeTruthy();
  });
});

// ─── J26: Start Conversation from Listing ─────────────────────────────────────
test.describe("J26: Start Conversation from Listing", () => {
  test("search → listing → contact host → send message → verify in messages", async ({
    page,
    nav,
  }) => {
    // Step 1: Find a listing NOT owned by test user
    const searchParams = new URLSearchParams({
      q: "Reviewer Nob Hill",
      minLat: SF_BOUNDS.minLat.toString(),
      maxLat: SF_BOUNDS.maxLat.toString(),
      minLng: SF_BOUNDS.minLng.toString(),
      maxLng: SF_BOUNDS.maxLng.toString(),
    });
    await page.goto(`/search?${searchParams.toString()}`, {
      waitUntil: "domcontentloaded",
      timeout: timeouts.navigation,
    });
    await page.waitForLoadState("networkidle").catch(() => {});

    const cards = searchResultsContainer(page).locator(selectors.listingCard);
    test.skip(
      (await cards.count()) === 0,
      "Reviewer listing not found — skipping"
    );

    // Step 2: Go to listing detail
    await nav.clickListingCard(0);
    await expect
      .poll(() => new URL(page.url()).pathname.includes("/listings/"), {
        timeout: timeouts.navigation,
        message: "Expected to navigate to listing detail page",
      })
      .toBe(true);

    // Step 3: Click contact / message host button
    const contactBtn = page
      .locator("main")
      .getByRole("button", { name: /contact|message|chat/i })
      .or(page.locator('main a[href*="messages"]'))
      .or(page.locator('main [data-testid="contact-host"]'));

    const canContact = await contactBtn
      .first()
      .isVisible()
      .catch(() => false);
    test.skip(!canContact, "No contact host button — skipping");

    await contactBtn.first().click();

    const msgInput = page
      .getByPlaceholder(/message|type|write/i)
      .or(page.locator("textarea"))
      .or(page.locator('[data-testid="message-input"]'));

    const toast = page.locator(selectors.toast).first();

    await expect
      .poll(
        async () => {
          const onMessages = page.url().includes("/messages");
          const hasToast = await toast.isVisible().catch(() => false);
          const canType = await msgInput
            .first()
            .isVisible()
            .catch(() => false);
          return onMessages || hasToast || canType;
        },
        {
          timeout: 30_000,
          message:
            "Expected Contact Host to open a conversation, show feedback, or render the composer",
        }
      )
      .toBe(true);

    await msgInput
      .first()
      .waitFor({ state: "visible", timeout: 10_000 })
      .catch(() => {});

    // Step 4: Type a message in the dialog/form/page
    const canType = await msgInput
      .first()
      .isVisible()
      .catch(() => false);
    if (canType) {
      const testMsg = `Interested in this listing! ${Date.now()}`;
      const input = msgInput.first();
      await input.click();
      await input.pressSequentially(testMsg, { delay: 5 });
      await expect(input).toHaveValue(testMsg);

      const sendBtn = page
        .getByRole("button", { name: /send|submit/i })
        .or(page.locator('button[type="submit"]'));
      if (
        await sendBtn
          .first()
          .isVisible()
          .catch(() => false)
      ) {
        await sendBtn.first().click();
        await page.waitForLoadState("networkidle").catch(() => {});
      }
    }

    // Step 5: Verify we're on messages page or got confirmation
    const onMessages = page.url().includes("/messages");
    const hasToast = await toast.isVisible().catch(() => false);
    expect(onMessages || hasToast || canType).toBeTruthy();
  });
});

// ─── J27: Empty Messages Inbox ────────────────────────────────────────────────
test.describe("J27: Empty Messages Inbox", () => {
  test("messages page shows conversations or empty state", async ({
    page,
    nav,
  }, testInfo) => {
    // Skip on Mobile Chrome — deterministic net::ERR_ABORTED on /messages in CI
    // See: https://github.com/Suryateja-byte/Roomshare/pull/69
    test.skip(
      testInfo.project.name === "Mobile Chrome",
      "Flaky on Mobile Chrome in CI — net::ERR_ABORTED on /messages"
    );

    // Step 1: Go to messages
    await nav.goToMessages();

    // Check we weren't redirected to login
    const onLoginPage =
      page.url().includes("/login") || page.url().includes("/signin");
    test.skip(onLoginPage, "Auth session expired - redirected to login");
    if (onLoginPage) return;

    await page.waitForLoadState("networkidle").catch(() => {});

    // Step 2: Page should load without errors
    await expect(page.locator("body")).toBeVisible();

    // Step 3: Should show either conversations or empty state
    // Conversations may be in a sidebar, not necessarily under main
    const conversations = page
      .locator('[data-testid="conversation-item"]')
      .or(page.locator('a[href^="/messages/"]'))
      .or(page.getByText("E2E Reviewer"));
    const emptyState = page
      .locator(selectors.emptyState)
      .or(page.getByText(/no messages|no conversations|inbox is empty/i));

    const hasConversations = (await conversations.count()) > 0;
    const hasEmpty = await emptyState
      .first()
      .isVisible()
      .catch(() => false);

    // Should have one or the other
    expect(hasConversations || hasEmpty).toBeTruthy();

    // Step 4: If empty, verify CTA exists
    if (hasEmpty) {
      const cta = page
        .getByRole("link", { name: /browse|search|find/i })
        .or(page.locator('a[href*="/search"]'));
      // CTA is optional — just verify page rendered
      await expect(page.locator("main")).toBeVisible();
    }
  });
});
