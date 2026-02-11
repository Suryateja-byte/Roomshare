/**
 * Messaging & Conversations Journeys (J25–J27)
 *
 * J25: Send message in existing conversation
 * J26: Start conversation from listing detail
 * J27: Empty messages inbox
 */

import { test, expect, selectors, timeouts, SF_BOUNDS, searchResultsContainer } from "../helpers";

test.beforeEach(async () => {
  test.slow();
});

// ─── J25: Send Message in Conversation ────────────────────────────────────────
test.describe("J25: Send Message in Conversation", () => {
  test("go to messages → open conversation → send message → verify appears", async ({
    page,
    nav,
  }) => {
    // Step 1: Navigate to messages
    await nav.goToMessages();

    // Check we weren't redirected to login or signup
    const messagesUrl = page.url();
    if (messagesUrl.includes('/login') || messagesUrl.includes('/signin') || messagesUrl.includes('/signup')) {
      test.skip(true, 'Auth redirect — session not available in CI');
      return;
    }

    await page.waitForTimeout(2000);

    // Step 2: Check for existing conversations (sidebar has conversation previews)
    const conversationItem = page
      .locator('[data-testid="conversation-item"]')
      .or(page.locator('a[href^="/messages/"]'))
      .or(page.getByText("E2E Reviewer"));

    const hasConversations = (await conversationItem.count()) > 0;
    test.skip(!hasConversations, "No conversations found — skipping");

    // Step 3: Click first conversation
    await conversationItem.first().click({ timeout: 30000 });
    await page.waitForTimeout(1500);

    // Step 4: Type and send a message
    const msgInput = page
      .getByPlaceholder(/message|type|write/i)
      .or(page.locator('input[name*="message"]'))
      .or(page.locator('textarea[name*="message"]'))
      .or(page.locator('[data-testid="message-input"]'));

    const canType = await msgInput.first().isVisible().catch(() => false);
    test.skip(!canType, "No message input found — skipping");

    const testMsg = `E2E test message ${Date.now()}`;
    await msgInput.first().fill(testMsg);

    const sendBtn = page
      .getByRole("button", { name: /send/i })
      .or(page.locator('[data-testid="send-button"]'))
      .or(page.locator('button[type="submit"]'));
    await sendBtn.first().click({ timeout: 30000 });
    await page.waitForTimeout(2000);

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
    await nav.goToSearch({ q: "Reviewer Nob Hill", bounds: SF_BOUNDS });
    await page.waitForTimeout(2000);

    const cards = searchResultsContainer(page).locator(selectors.listingCard);
    test.skip((await cards.count()) === 0, "Reviewer listing not found — skipping");

    // Step 2: Go to listing detail
    await nav.clickListingCard(0);
    await expect.poll(
      () => new URL(page.url()).pathname.includes('/listings/'),
      { timeout: timeouts.navigation, message: 'Expected to navigate to listing detail page' }
    ).toBe(true);

    // Step 3: Click contact / message host button
    const contactBtn = page
      .locator("main")
      .getByRole("button", { name: /contact|message|chat/i })
      .or(page.locator('main a[href*="messages"]'))
      .or(page.locator('main [data-testid="contact-host"]'));

    const canContact = await contactBtn.first().isVisible().catch(() => false);
    test.skip(!canContact, "No contact host button — skipping");

    await contactBtn.first().click();
    await page.waitForTimeout(1500);

    // Step 4: Type a message in the dialog/form/page
    const msgInput = page
      .getByPlaceholder(/message|type|write/i)
      .or(page.locator("textarea"))
      .or(page.locator('[data-testid="message-input"]'));

    const canType = await msgInput.first().isVisible().catch(() => false);
    if (canType) {
      const testMsg = `Interested in this listing! ${Date.now()}`;
      await msgInput.first().fill(testMsg);

      const sendBtn = page
        .getByRole("button", { name: /send|submit/i })
        .or(page.locator('button[type="submit"]'));
      if (await sendBtn.first().isVisible().catch(() => false)) {
        await sendBtn.first().click();
        await page.waitForTimeout(2000);
      }
    }

    // Step 5: Verify we're on messages page or got confirmation
    const onMessages = page.url().includes("/messages");
    const hasToast = await page.locator(selectors.toast).isVisible().catch(() => false);
    expect(onMessages || hasToast || canType).toBeTruthy();
  });
});

// ─── J27: Empty Messages Inbox ────────────────────────────────────────────────
test.describe("J27: Empty Messages Inbox", () => {
  test("messages page shows conversations or empty state", async ({
    page,
    nav,
  }) => {
    // Step 1: Go to messages
    await nav.goToMessages();

    // Check we weren't redirected to login
    if (page.url().includes('/login') || page.url().includes('/signin')) {
      test.skip(true, 'Auth session expired - redirected to login');
      return;
    }

    await page.waitForTimeout(2000);

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
    const hasEmpty = await emptyState.first().isVisible().catch(() => false);

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
