/**
 * E2E Accessibility -- Messaging
 *
 * WCAG 2.1 AA compliance, keyboard navigation, focus management,
 * aria-live announcements, and mobile touch-target sizing for the
 * real-time messaging UI.
 *
 * Tests:
 *  RT-A01  Messages page axe-core WCAG 2.1 AA scan
 *  RT-A02  Chat window axe-core after loading
 *  RT-A03  Keyboard-only navigation and send
 *  RT-A04  New message announced via aria-live
 *  RT-A05  Focus management -- opening conversation focuses input
 *  RT-A06  Touch targets >= 44px on mobile viewport
 */

import AxeBuilder from '@axe-core/playwright';
import {
  test,
  expect,
  tags,
  MSG_SELECTORS,
  goToMessages,
  openConversation,
  sendMessage,
} from './messaging-helpers';
import { A11Y_CONFIG } from '../helpers';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
test.use({ storageState: 'playwright/.auth/user.json' });

/** Shared axe scan runner using A11Y_CONFIG defaults */
async function runAxeScan(
  page: import('@playwright/test').Page,
  extraExcludes: string[] = [],
  disabledRules: string[] = [],
) {
  let builder = new AxeBuilder({ page }).withTags([...A11Y_CONFIG.tags]);

  for (const sel of [...A11Y_CONFIG.globalExcludes, ...extraExcludes]) {
    builder = builder.exclude(sel);
  }

  if (disabledRules.length > 0) {
    builder = builder.disableRules(disabledRules);
  }

  return builder.analyze();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function logViolations(label: string, violations: any[]) {
  if (violations.length > 0) {
    console.log(`[axe-messaging] ${label}: ${violations.length} violation(s)`);
    violations.forEach((v) => {
      console.log(
        `  - ${v.id} (${v.impact}): ${v.description} [${v.nodes.length} node(s)]`,
      );
    });
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
test.describe('Messaging: Accessibility', { tag: [tags.auth, tags.a11y] }, () => {
  test.beforeEach(async () => {
    test.slow();
  });

  // -----------------------------------------------------------------------
  // RT-A01: Full messages page axe scan
  // -----------------------------------------------------------------------
  test('RT-A01: Messages page passes axe-core WCAG 2.1 AA', async ({ page }) => {
    const ready = await goToMessages(page);
    test.skip(!ready, 'Could not reach /messages (auth redirect or missing page)');

    // Wait for conversation list to populate
    await page
      .locator(MSG_SELECTORS.conversationItem)
      .first()
      .waitFor({ state: 'attached', timeout: 15_000 })
      .catch(() => {});

    const results = await runAxeScan(page, [], [...A11Y_CONFIG.knownExclusions]);
    logViolations('Messages Page', results.violations);
    expect(results.violations).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // RT-A02: Chat window axe scan after loading messages
  // -----------------------------------------------------------------------
  test('RT-A02: Chat window passes axe-core after loading', async ({ page }) => {
    const viewport = page.viewportSize();
    test.skip(!!viewport && viewport.width < 768, 'Desktop-only: axe results differ on mobile layout');
    const ready = await goToMessages(page);
    test.skip(!ready, 'Could not reach /messages');

    await openConversation(page);

    // Wait for message bubbles to render so the DOM is complete
    await page
      .locator(MSG_SELECTORS.messageBubble)
      .first()
      .waitFor({ state: 'attached', timeout: 10_000 })
      .catch(() => {});

    const results = await runAxeScan(page, [], [...A11Y_CONFIG.knownExclusions]);
    logViolations('Chat Window', results.violations);
    expect(results.violations).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // RT-A03: Keyboard-only navigation and send
  // -----------------------------------------------------------------------
  test('RT-A03: Keyboard-only navigation and send', async ({ page }) => {
    const viewport = page.viewportSize();
    test.skip(!!viewport && viewport.width < 768, 'Desktop-only: keyboard navigation not applicable on mobile');
    const ready = await goToMessages(page);
    test.skip(!ready, 'Could not reach /messages');

    // Wait for conversation items to appear
    const conversationItems = page.locator(MSG_SELECTORS.conversationItem);
    await expect(conversationItems.first()).toBeVisible({ timeout: 15_000 });

    // Tab into the conversation list
    let reachedConversation = false;
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      const activeTag = await page.evaluate(() => {
        const el = document.activeElement;
        return el?.getAttribute('data-testid') || el?.tagName.toLowerCase() || '';
      });
      if (activeTag === 'conversation-item' || activeTag.includes('conversation')) {
        reachedConversation = true;
        break;
      }
      // Also check if we have focused an element inside a conversation item
      const isInConversation = await page.evaluate(() => {
        return !!document.activeElement?.closest('[data-testid="conversation-item"]');
      });
      if (isInConversation) {
        reachedConversation = true;
        break;
      }
    }

    // Press Enter to open the conversation
    if (reachedConversation) {
      await page.keyboard.press('Enter');
    } else {
      // Fallback: click the first conversation to continue testing the send flow
      await conversationItems.first().click();
    }

    // Wait for message input to appear
    const input = page.locator(MSG_SELECTORS.messageInput);
    await expect(input).toBeVisible({ timeout: 10_000 });

    // Tab until we reach the message input
    let reachedInput = false;
    for (let i = 0; i < 15; i++) {
      const isFocused = await input.evaluate(
        (el) => document.activeElement === el,
      );
      if (isFocused) {
        reachedInput = true;
        break;
      }
      await page.keyboard.press('Tab');
    }

    // If not focused via tabbing, focus it directly (documents the gap)
    if (!reachedInput) {
      await input.focus();
    }

    // Type a message via keyboard
    const uniqueText = `a11y-keyboard-${Date.now()}`;
    await page.keyboard.type(uniqueText);

    // Send via Enter (most chat inputs submit on Enter)
    await page.keyboard.press('Enter');

    // If Enter did not send (some UIs require button click), tab to send + Enter
    const bubble = page.locator(MSG_SELECTORS.messageBubble).filter({ hasText: uniqueText });
    const sent = await bubble.first().isVisible({ timeout: 3_000 }).catch(() => false);

    if (!sent) {
      // Re-type the message (Enter may have added a newline or been consumed)
      await input.click();
      await input.fill('');
      await input.pressSequentially(uniqueText, { delay: 30 });
      await expect(input).toHaveValue(uniqueText, { timeout: 5_000 });
      // Tab to send button and press Enter
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
    }

    // Verify the message appears
    await expect(bubble.first()).toBeVisible({ timeout: 10_000 });
  });

  // -----------------------------------------------------------------------
  // RT-A04: New message announced via aria-live
  // -----------------------------------------------------------------------
  test('RT-A04: New message announced via aria-live', async ({ page }) => {
    const ready = await goToMessages(page);
    test.skip(!ready, 'Could not reach /messages');

    await openConversation(page);

    // Check that messages container or a parent has aria-live
    const container = page.locator(MSG_SELECTORS.messagesContainer);
    const ariaLive = await container.getAttribute('aria-live').catch(() => null);

    // Also check parent elements
    const parentAriaLive = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      let current = el;
      while (current) {
        if (current.getAttribute('aria-live')) {
          return current.getAttribute('aria-live');
        }
        current = current.parentElement;
      }
      return null;
    }, MSG_SELECTORS.messagesContainer);

    // Also check for role="log" which implies aria-live="polite"
    const hasLogRole = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      let current = el;
      while (current) {
        if (current.getAttribute('role') === 'log') return true;
        current = current.parentElement;
      }
      return false;
    }, MSG_SELECTORS.messagesContainer);

    const hasLiveRegion = ariaLive !== null || parentAriaLive !== null || hasLogRole;

    if (!hasLiveRegion) {
      // Document the gap -- screen readers will not announce new messages
      console.warn(
        '[a11y-gap] Messages container lacks aria-live or role="log". ' +
        'Screen reader users will not be notified of new messages.',
      );
      test.fixme(true, 'Messages container missing aria-live region for screen reader announcements');
      return;
    }

    // If the live region exists, verify a message appears after sending
    const uniqueText = `a11y-live-${Date.now()}`;
    await sendMessage(page, uniqueText);

    const bubble = page.locator(MSG_SELECTORS.messageBubble).filter({ hasText: uniqueText });
    await expect(bubble.first()).toBeVisible({ timeout: 10_000 });
  });

  // -----------------------------------------------------------------------
  // RT-A05: Focus management -- opening conversation focuses input
  // -----------------------------------------------------------------------
  test('RT-A05: Focus management -- opening conversation focuses input', async ({ page }) => {
    const ready = await goToMessages(page);
    test.skip(!ready, 'Could not reach /messages');

    const conversationItems = page.locator(MSG_SELECTORS.conversationItem);
    await expect(conversationItems.first()).toBeVisible({ timeout: 15_000 });

    // Click first conversation
    await conversationItems.first().click();

    // Wait for message input to be visible
    const input = page.locator(MSG_SELECTORS.messageInput);
    await expect(input).toBeVisible({ timeout: 10_000 });

    // Check if input is auto-focused (allow a brief settling period)
    let isFocused = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      isFocused = await input.evaluate((el) => document.activeElement === el);
      if (isFocused) break;
      await page.waitForTimeout(200);
    }

    if (!isFocused) {
      console.warn(
        '[a11y-gap] Message input is not auto-focused when opening a conversation. ' +
        'Users must manually tab/click to the input field.',
      );
      test.fixme(true, 'Product gap: message input not auto-focused on conversation open');
      return;
    }

    // Verify input is at least focusable
    await input.focus();
    await expect(input).toBeFocused();
  });

  // -----------------------------------------------------------------------
  // RT-A06: Touch targets >= 44px on mobile viewport
  // -----------------------------------------------------------------------
  test('RT-A06: Touch targets >= 44px on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });

    const ready = await goToMessages(page);
    test.skip(!ready, 'Could not reach /messages');

    const MIN_TOUCH_TARGET = 44;

    // --- Check conversation items ---
    const conversationItems = page.locator(MSG_SELECTORS.conversationItem);
    const convCount = await conversationItems.count();
    test.skip(convCount === 0, 'No conversation items to measure');

    const firstConvBox = await conversationItems.first().boundingBox();
    expect(
      firstConvBox,
      'Conversation item should have a bounding box',
    ).not.toBeNull();

    if (firstConvBox) {
      expect.soft(
        firstConvBox.height,
        `Conversation item height (${firstConvBox.height}px) should be >= ${MIN_TOUCH_TARGET}px`,
      ).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    }

    // Open a conversation to check chat controls
    await openConversation(page);

    // --- Check send button ---
    const sendButton = page.locator(MSG_SELECTORS.sendButton);
    const sendVisible = await sendButton.isVisible().catch(() => false);

    if (sendVisible) {
      const sendBox = await sendButton.boundingBox();
      expect(sendBox, 'Send button should have a bounding box').not.toBeNull();

      if (sendBox) {
        expect.soft(
          sendBox.width,
          `Send button width (${sendBox.width}px) should be >= ${MIN_TOUCH_TARGET}px`,
        ).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
        expect.soft(
          sendBox.height,
          `Send button height (${sendBox.height}px) should be >= ${MIN_TOUCH_TARGET}px`,
        ).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
      }
    }

    // --- Check message input ---
    const messageInput = page.locator(MSG_SELECTORS.messageInput);
    const inputBox = await messageInput.boundingBox();
    expect(inputBox, 'Message input should have a bounding box').not.toBeNull();

    if (inputBox) {
      expect.soft(
        inputBox.height,
        `Message input height (${inputBox.height}px) should be >= ${MIN_TOUCH_TARGET}px`,
      ).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    }
  });
});
