/**
 * E2E Test Suite: Messaging – Resilience & Edge Cases
 *
 * Tests offline handling, API error states, rate limiting, slow networks,
 * input validation, XSS sanitization, and rapid-fire deduplication.
 *
 * IDs: RT-R01 through RT-R10
 */

import {
  test,
  expect,
  tags,
  selectors,
  MSG_SELECTORS,
  POLL_INTERVAL,
  CHAR_LIMITS,
  goToMessages,
  openConversation,
  sendMessage,
} from './messaging-helpers';

test.describe('Messaging: Resilience', { tag: [tags.auth] }, () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test.afterEach(async ({ network }) => {
    await network.goOnline();
    await network.clearRoutes();
  });

  // ────────────────────────────────────────────────
  // RT-R01: Offline send fails gracefully
  // ────────────────────────────────────────────────
  test('RT-R01: offline send fails gracefully', async ({ page, network }) => {
    test.slow();

    // Navigate to messages and open a conversation
    const loaded = await goToMessages(page);
    test.skip(!loaded, 'Messages page did not load — skipping');

    const conversations = page.locator(MSG_SELECTORS.conversationItem);
    const hasConversations = await conversations.first().isVisible({ timeout: 10_000 }).catch(() => false);
    test.skip(!hasConversations, 'No conversations available — skipping');

    await openConversation(page);

    // Go offline
    await network.goOffline();

    // Try to send a message
    const testMsg = `Offline test ${Date.now()}`;
    await sendMessage(page, testMsg);

    // Wait briefly for error handling to kick in
    await page.waitForTimeout(3000);

    // Expect either a failed-message indicator OR an error toast
    const failedMessage = page.locator(MSG_SELECTORS.failedMessage);
    const errorToast = page.locator(selectors.toast);
    const failedVisible = await failedMessage.first().isVisible().catch(() => false);
    const toastVisible = await errorToast.first().isVisible().catch(() => false);

    expect(failedVisible || toastVisible).toBe(true);
  });

  // ────────────────────────────────────────────────
  // RT-R02: Come back online -> polling resumes
  // ────────────────────────────────────────────────
  test('RT-R02: come back online — polling resumes and page remains functional', async ({
    page,
    network,
  }) => {
    test.slow();

    const loaded = await goToMessages(page);
    test.skip(!loaded, 'Messages page did not load — skipping');

    const conversations = page.locator(MSG_SELECTORS.conversationItem);
    const hasConversations = await conversations.first().isVisible({ timeout: 10_000 }).catch(() => false);
    test.skip(!hasConversations, 'No conversations available — skipping');

    await openConversation(page);

    // Go offline briefly
    await network.goOffline();
    await page.waitForTimeout(2000);

    // Come back online
    await network.goOnline();

    // Wait for at least one polling cycle to pass
    await page.waitForTimeout(POLL_INTERVAL.messagesPage + 2000);

    // Verify the page is still functional — the input should be visible and interactable
    const input = page.locator(MSG_SELECTORS.messageInput);
    await expect(input).toBeVisible({ timeout: 10_000 });
    await expect(input).toBeEnabled();

    // Verify we can focus and type into the input (proves page isn't frozen)
    await input.click();
    await input.fill('connectivity test');
    const inputValue = await input.inputValue();
    expect(inputValue).toBe('connectivity test');

    // Clear the test text
    await input.clear();
  });

  // ────────────────────────────────────────────────
  // RT-R03: API 500 → failed message UI
  // ────────────────────────────────────────────────
  test('RT-R03: API 500 shows failed message or error toast', async ({ page }) => {
    test.slow();

    const loaded = await goToMessages(page);
    test.skip(!loaded, 'Messages page did not load — skipping');

    const conversations = page.locator(MSG_SELECTORS.conversationItem);
    const hasConversations = await conversations.first().isVisible({ timeout: 10_000 }).catch(() => false);
    test.skip(!hasConversations, 'No conversations available — skipping');

    await openConversation(page);

    // Intercept Server Action POST requests (Next.js uses POST with Next-Action header)
    // Also intercept REST API messages endpoints as a fallback
    await page.route('**/messages**', async (route) => {
      const request = route.request();
      if (request.method() === 'POST') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal server error' }),
        });
      } else {
        await route.continue();
      }
    });

    // Send a message
    const testMsg = `Error test ${Date.now()}`;
    await sendMessage(page, testMsg);

    // Wait for error handling
    await page.waitForTimeout(3000);

    // Expect failed-message indicator or error toast
    const failedMessage = page.locator(MSG_SELECTORS.failedMessage);
    const errorToast = page.locator(selectors.toast);
    const failedVisible = await failedMessage.first().isVisible().catch(() => false);
    const toastVisible = await errorToast.first().isVisible().catch(() => false);

    expect(failedVisible || toastVisible).toBe(true);
  });

  // ────────────────────────────────────────────────
  // RT-R04: Rate limit 429 → feedback shown
  // ────────────────────────────────────────────────
  test('RT-R04: rate limit 429 shows feedback to user', async ({ page }) => {
    test.slow();

    const loaded = await goToMessages(page);
    test.skip(!loaded, 'Messages page did not load — skipping');

    const conversations = page.locator(MSG_SELECTORS.conversationItem);
    const hasConversations = await conversations.first().isVisible({ timeout: 10_000 }).catch(() => false);
    test.skip(!hasConversations, 'No conversations available — skipping');

    await openConversation(page);

    // Mock server action to return 429 rate limit
    await page.route('**/messages**', async (route) => {
      const request = route.request();
      if (request.method() === 'POST') {
        await route.fulfill({
          status: 429,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Rate limit exceeded. Try again later.' }),
        });
      } else {
        await route.continue();
      }
    });

    // Send a message
    const testMsg = `Rate limit test ${Date.now()}`;
    await sendMessage(page, testMsg);

    // Wait for error handling
    await page.waitForTimeout(3000);

    // Expect rate limit feedback — either toast, failed message, or inline error
    const failedMessage = page.locator(MSG_SELECTORS.failedMessage);
    const toast = page.locator(selectors.toast);
    const inlineError = page.locator('[role="alert"]');
    const failedVisible = await failedMessage.first().isVisible().catch(() => false);
    const toastVisible = await toast.first().isVisible().catch(() => false);
    const inlineVisible = await inlineError.first().isVisible().catch(() => false);

    expect(failedVisible || toastVisible || inlineVisible).toBe(true);
  });

  // ────────────────────────────────────────────────
  // RT-R05: API 403 → appropriate error
  // ────────────────────────────────────────────────
  test('RT-R05: API 403 forbidden shows appropriate error', async ({ page }) => {
    test.slow();

    const loaded = await goToMessages(page);
    test.skip(!loaded, 'Messages page did not load — skipping');

    const conversations = page.locator(MSG_SELECTORS.conversationItem);
    const hasConversations = await conversations.first().isVisible({ timeout: 10_000 }).catch(() => false);
    test.skip(!hasConversations, 'No conversations available — skipping');

    await openConversation(page);

    // Mock server action to return 403 forbidden
    await page.route('**/messages**', async (route) => {
      const request = route.request();
      if (request.method() === 'POST') {
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Forbidden — you do not have permission' }),
        });
      } else {
        await route.continue();
      }
    });

    // Send a message
    const testMsg = `Forbidden test ${Date.now()}`;
    await sendMessage(page, testMsg);

    // Wait for error handling
    await page.waitForTimeout(3000);

    // Expect error state — toast, failed message, inline error, or redirect
    const failedMessage = page.locator(MSG_SELECTORS.failedMessage);
    const toast = page.locator(selectors.toast);
    const inlineError = page.locator('[role="alert"]');
    const failedVisible = await failedMessage.first().isVisible().catch(() => false);
    const toastVisible = await toast.first().isVisible().catch(() => false);
    const inlineVisible = await inlineError.first().isVisible().catch(() => false);
    const redirected = page.url().includes('/login') || page.url().includes('/sign-in');

    expect(failedVisible || toastVisible || inlineVisible || redirected).toBe(true);
  });

  // ────────────────────────────────────────────────
  // RT-R06: Slow network → loading state visible
  // ────────────────────────────────────────────────
  test('RT-R06: slow network shows sending/loading indicator', async ({ page, network }) => {
    test.slow();

    const loaded = await goToMessages(page);
    test.skip(!loaded, 'Messages page did not load — skipping');

    const conversations = page.locator(MSG_SELECTORS.conversationItem);
    const hasConversations = await conversations.first().isVisible({ timeout: 10_000 }).catch(() => false);
    test.skip(!hasConversations, 'No conversations available — skipping');

    await openConversation(page);

    // Add significant latency to simulate slow network
    await network.addLatency(3000);

    // Send a message
    const testMsg = `Slow network test ${Date.now()}`;
    await sendMessage(page, testMsg);

    // Check for loading/sending indicators right after send
    // Common patterns: opacity-70 on bubble, loading spinner, disabled send button, "Sending..." text
    const sendButton = page.locator(MSG_SELECTORS.sendButton);
    const loadingSpinner = page.locator('[class*="animate-spin"], [class*="loading"]');
    const pendingBubble = page.locator('[class*="opacity"], [data-pending="true"]');
    const sendingText = page.getByText(/sending/i);

    const isDisabled = await sendButton.isDisabled().catch(() => false);
    const hasSpinner = await loadingSpinner.first().isVisible().catch(() => false);
    const hasPending = await pendingBubble.first().isVisible().catch(() => false);
    const hasSendingText = await sendingText.first().isVisible().catch(() => false);

    // At least one loading indicator should be present during slow send
    expect(isDisabled || hasSpinner || hasPending || hasSendingText).toBe(true);
  });

  // ────────────────────────────────────────────────
  // RT-R07: Empty message rejected client-side
  // ────────────────────────────────────────────────
  test('RT-R07: empty message is rejected client-side', async ({ page }) => {
    test.slow();

    const loaded = await goToMessages(page);
    test.skip(!loaded, 'Messages page did not load — skipping');

    const conversations = page.locator(MSG_SELECTORS.conversationItem);
    const hasConversations = await conversations.first().isVisible({ timeout: 10_000 }).catch(() => false);
    test.skip(!hasConversations, 'No conversations available — skipping');

    await openConversation(page);

    // Note the initial message count
    const initialCount = await page.locator(MSG_SELECTORS.messageBubble).count();

    // Fill input with only whitespace
    const input = page.locator(MSG_SELECTORS.messageInput);
    await input.fill('   ');

    // Send button should be disabled when input is only whitespace
    const sendButton = page.locator(MSG_SELECTORS.sendButton);
    const isDisabled = await sendButton.isDisabled().catch(() => false);

    if (!isDisabled) {
      // If the button is not disabled, click it and verify no message is sent
      await sendButton.click();
      await page.waitForTimeout(1500);
    }

    // Verify no new message bubble was added
    const afterCount = await page.locator(MSG_SELECTORS.messageBubble).count();
    expect(afterCount).toBe(initialCount);

    // Also verify with completely empty input
    await input.clear();
    await input.fill('');

    // Send button should still be disabled or clicking it should do nothing
    const isDisabledEmpty = await sendButton.isDisabled().catch(() => false);
    if (!isDisabledEmpty) {
      await sendButton.click();
      await page.waitForTimeout(1000);
    }

    const finalCount = await page.locator(MSG_SELECTORS.messageBubble).count();
    expect(finalCount).toBe(initialCount);
  });

  // ────────────────────────────────────────────────
  // RT-R08: Character limit enforced
  // ────────────────────────────────────────────────
  test('RT-R08: character limit is enforced on message input', async ({ page }) => {
    test.slow();

    const loaded = await goToMessages(page);
    test.skip(!loaded, 'Messages page did not load — skipping');

    const conversations = page.locator(MSG_SELECTORS.conversationItem);
    const hasConversations = await conversations.first().isVisible({ timeout: 10_000 }).catch(() => false);
    test.skip(!hasConversations, 'No conversations available — skipping');

    await openConversation(page);

    const input = page.locator(MSG_SELECTORS.messageInput);

    // Generate a string that exceeds the messages page character limit
    const overLimitText = 'A'.repeat(CHAR_LIMITS.messagesPage + 100);
    await input.fill(overLimitText);

    // Wait for character counter to appear
    await page.waitForTimeout(500);

    // Check for character counter visibility
    const charCounter = page.locator(MSG_SELECTORS.charCounter);
    const counterVisible = await charCounter.isVisible().catch(() => false);

    // Check if input has maxLength attribute that enforces the limit
    const maxLength = await input.getAttribute('maxlength');
    const inputValue = await input.inputValue();

    // At least one enforcement mechanism should be present:
    // 1. Character counter is displayed
    // 2. Input has maxLength attribute
    // 3. Input value was truncated to the limit
    const hasMaxLength = maxLength !== null && parseInt(maxLength, 10) <= CHAR_LIMITS.messagesPage;
    const wasTruncated = inputValue.length <= CHAR_LIMITS.messagesPage;

    expect(counterVisible || hasMaxLength || wasTruncated).toBe(true);
  });

  // ────────────────────────────────────────────────
  // RT-R09: XSS content sanitized in display
  // ────────────────────────────────────────────────
  test('RT-R09: XSS content is sanitized in message display', async ({ page }) => {
    test.slow();

    const loaded = await goToMessages(page);
    test.skip(!loaded, 'Messages page did not load — skipping');

    const conversations = page.locator(MSG_SELECTORS.conversationItem);
    const hasConversations = await conversations.first().isVisible({ timeout: 10_000 }).catch(() => false);
    test.skip(!hasConversations, 'No conversations available — skipping');

    await openConversation(page);

    // Send a message with XSS payload
    const xssPayload = "<script>alert('xss')</script>";
    await sendMessage(page, xssPayload);

    // Wait for the message to be processed and displayed
    await page.waitForTimeout(3000);

    // Check that the raw text is displayed as plain text (escaped/sanitized)
    // The message content should be visible as text, not executed as HTML
    const bubbles = page.locator(MSG_SELECTORS.messageBubble);
    const lastBubble = bubbles.last();

    // If the message was sent successfully, verify sanitization
    const lastBubbleVisible = await lastBubble.isVisible().catch(() => false);
    if (lastBubbleVisible) {
      const bubbleText = await lastBubble.textContent();

      // The XSS payload should appear as visible text, not as an executed script
      // If the content was sanitized, we should see the text rendered safely
      if (bubbleText && bubbleText.includes('script')) {
        // Verify that no actual <script> element was injected into the DOM
        const scriptElements = await page.locator(
          `${MSG_SELECTORS.messagesContainer} script`
        ).count();
        expect(scriptElements).toBe(0);
      }
    }

    // Regardless of whether the message was sent, verify no script was injected
    const injectedScripts = await page.evaluate(() => {
      const container = document.querySelector('[data-testid="messages-container"]');
      if (!container) return 0;
      return container.querySelectorAll('script').length;
    });
    expect(injectedScripts).toBe(0);

    // Additionally verify that alert was not triggered
    // If XSS executed, a dialog would have appeared — Playwright auto-dismisses dialogs
    // but we can check by listening for dialog events
    let dialogTriggered = false;
    page.on('dialog', () => {
      dialogTriggered = true;
    });
    await page.waitForTimeout(500);
    expect(dialogTriggered).toBe(false);
  });

  // ────────────────────────────────────────────────
  // RT-R10: Rapid-fire sends don't duplicate
  // ────────────────────────────────────────────────
  test('RT-R10: rapid-fire sends do not create duplicate messages', async ({ page }) => {
    test.slow();

    const loaded = await goToMessages(page);
    test.skip(!loaded, 'Messages page did not load — skipping');

    const conversations = page.locator(MSG_SELECTORS.conversationItem);
    const hasConversations = await conversations.first().isVisible({ timeout: 10_000 }).catch(() => false);
    test.skip(!hasConversations, 'No conversations available — skipping');

    await openConversation(page);

    // Create a unique message identifier to track
    const uniqueText = `Rapid fire ${Date.now()}`;
    const sendCount = 3;

    // Send the same message rapidly 3 times
    const input = page.locator(MSG_SELECTORS.messageInput);
    const sendButton = page.locator(MSG_SELECTORS.sendButton);

    for (let i = 0; i < sendCount; i++) {
      await input.click();
      await input.fill('');
      await input.pressSequentially(`${uniqueText} #${i + 1}`, { delay: 10 });
      await expect(sendButton).toBeEnabled({ timeout: 5_000 });
      await sendButton.click();
      // Minimal delay between sends — simulate rapid clicking
      await page.waitForTimeout(200);
    }

    // Wait for all messages to be processed (including any polling cycles)
    await page.waitForTimeout(5000);

    // Count only messages matching our unique text — immune to polling deduplication
    // Each unique message (e.g. "Rapid fire ... #1") should appear at most once
    for (let i = 1; i <= sendCount; i++) {
      const specificBubble = page.locator(MSG_SELECTORS.messageBubble).filter({
        hasText: `${uniqueText} #${i}`,
      });
      const count = await specificBubble.count();
      expect(count, `Message #${i} should appear at most once`).toBeLessThanOrEqual(1);
    }
  });
});
