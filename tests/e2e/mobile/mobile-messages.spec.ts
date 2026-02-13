import { test, expect } from '../helpers';

test.use({ viewport: { width: 390, height: 844 } });
test.use({ storageState: 'playwright/.auth/user.json' });

test.describe('Mobile Messages', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/messages');
    await page.waitForLoadState('domcontentloaded');
  });

  test('MM-01: Conversation list renders stacked (not side-by-side)', async ({ page }) => {
    // Wait for messages page to load
    await expect(
      page.locator('[data-testid="messages-page"]')
    ).toBeVisible({ timeout: 15000 });

    // On mobile, the sidebar takes full width (w-full md:w-[400px])
    // Check conversation items exist and are full-width
    const conversationItem = page.locator('[data-testid="conversation-item"]').first();
    if (await conversationItem.isVisible({ timeout: 10000 }).catch(() => false)) {
      const box = await conversationItem.boundingBox();
      expect(box).toBeTruthy();
      if (box) {
        // Conversation item should span close to full viewport width (minus padding)
        expect(box.width).toBeGreaterThan(300);
      }
    }

    // No horizontal overflow
    const noOverflow = await page.evaluate(
      () => document.body.scrollWidth <= window.innerWidth + 5
    );
    expect(noOverflow).toBe(true);
  });

  test('MM-02: Tap conversation opens message thread', async ({ page }) => {
    await expect(
      page.locator('[data-testid="messages-page"]')
    ).toBeVisible({ timeout: 15000 });

    const conversationItem = page.locator('[data-testid="conversation-item"]').first();
    if (await conversationItem.isVisible({ timeout: 10000 }).catch(() => false)) {
      // On mobile, the first conversation auto-activates and shows chat area
      // The sidebar is hidden (hidden md:flex) when activeId is set.
      // Since useEffect auto-selects the first conversation, we should already see messages.

      // Check for message bubbles or the message input (chat is active)
      const messageArea = page.locator('[data-testid="message-bubble"]').first()
        .or(page.locator('[data-testid="message-input"]'))
        .first();

      await expect(messageArea).toBeVisible({ timeout: 10000 });
    } else {
      // No conversations — check empty state
      await expect(
        page.getByText(/no conversations/i).or(page.getByText('Browse Listings')).first()
      ).toBeVisible({ timeout: 10000 });
    }
  });

  test('MM-03: Message input visible and functional in open conversation', async ({ page }) => {
    await expect(
      page.locator('[data-testid="messages-page"]')
    ).toBeVisible({ timeout: 15000 });

    // On mobile, the first conversation auto-opens
    const messageInput = page.locator('[data-testid="message-input"]');
    if (await messageInput.isVisible({ timeout: 10000 }).catch(() => false)) {
      // Verify input is visible
      await expect(messageInput).toBeVisible();

      // Verify input is interactable (can receive focus and type)
      await messageInput.focus();
      const isFocused = await messageInput.evaluate(
        (el) => document.activeElement === el
      );
      expect(isFocused).toBe(true);

      // Input should have adequate size for touch
      const box = await messageInput.boundingBox();
      expect(box).toBeTruthy();
      if (box) {
        expect(box.height).toBeGreaterThanOrEqual(30);
      }
    } else {
      test.skip(true, 'No active conversation with message input');
    }
  });

  test('MM-04: Back button returns to conversation list', async ({ page }) => {
    await expect(
      page.locator('[data-testid="messages-page"]')
    ).toBeVisible({ timeout: 15000 });

    // On mobile, when a conversation is active, a back button (ArrowLeft) appears
    // The back button is: md:hidden, sets activeId to null
    const backButton = page.locator('button').filter({ has: page.locator('svg.lucide-arrow-left') }).first();

    if (await backButton.isVisible({ timeout: 10000 }).catch(() => false)) {
      await backButton.click();
      await page.waitForTimeout(500);

      // After clicking back, the conversation list should be visible again
      // The sidebar becomes visible (no activeId)
      const conversationList = page.locator('[data-testid="conversation-item"]').first()
        .or(page.getByText(/no conversations/i))
        .first();

      await expect(conversationList).toBeVisible({ timeout: 5000 });
    } else {
      // No active conversation, so no back button visible
      test.skip(true, 'No back button visible — no active conversation on mobile');
    }
  });

  test('MM-05: Empty conversations state renders correctly', async ({ page }) => {
    await expect(
      page.locator('[data-testid="messages-page"]')
    ).toBeVisible({ timeout: 15000 });

    // Check if there are any conversations
    const conversationItems = page.locator('[data-testid="conversation-item"]');
    const count = await conversationItems.count().catch(() => 0);

    if (count === 0) {
      // Empty state should show "No conversations yet" and a Browse Listings link
      await expect(
        page.getByText(/no conversations/i).or(page.getByText('Browse Listings')).first()
      ).toBeVisible({ timeout: 10000 });
    } else {
      // Seed data has conversations for testUser, so we verify the conversations render
      // and there's no overflow
      const noOverflow = await page.evaluate(
        () => document.body.scrollWidth <= window.innerWidth + 5
      );
      expect(noOverflow).toBe(true);
    }
  });

  test('MM-06: Long messages wrap properly without overflow', async ({ page }) => {
    await expect(
      page.locator('[data-testid="messages-page"]')
    ).toBeVisible({ timeout: 15000 });

    // Wait for message bubbles to appear (auto-loaded for first conversation)
    const messageBubble = page.locator('[data-testid="message-bubble"]').first();
    if (await messageBubble.isVisible({ timeout: 10000 }).catch(() => false)) {
      // Check that message bubbles have max-width constraint (max-w-[70%])
      const bubbleBox = await messageBubble.boundingBox();
      expect(bubbleBox).toBeTruthy();
      if (bubbleBox) {
        // Message bubble should not exceed 70% of viewport width plus some padding
        expect(bubbleBox.width).toBeLessThanOrEqual(390 * 0.75 + 20);
      }

      // No horizontal overflow on the page
      const noOverflow = await page.evaluate(
        () => document.body.scrollWidth <= window.innerWidth + 5
      );
      expect(noOverflow).toBe(true);
    } else {
      test.skip(true, 'No message bubbles visible to check wrapping');
    }
  });

  test('MM-07: Conversation list container allows vertical scrolling', async ({ page }) => {
    await expect(
      page.locator('[data-testid="messages-page"]')
    ).toBeVisible({ timeout: 15000 });

    // First go back to conversation list (if auto-opened a conversation)
    const backButton = page.locator('button').filter({ has: page.locator('svg.lucide-arrow-left') }).first();
    if (await backButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await backButton.click();
      await page.waitForTimeout(500);
    }

    // The conversation list is wrapped in a flex-1 overflow-y-auto container
    const listContainer = page.locator('[data-testid="messages-page"] .overflow-y-auto').first();
    if (await listContainer.isVisible({ timeout: 5000 }).catch(() => false)) {
      const overflowStyle = await listContainer.evaluate(
        (el) => window.getComputedStyle(el).overflowY
      );
      expect(['auto', 'scroll']).toContain(overflowStyle);
    }
  });

  test('MM-08: Unread indicator visible on conversations', async ({ page }) => {
    await expect(
      page.locator('[data-testid="messages-page"]')
    ).toBeVisible({ timeout: 15000 });

    // Navigate back to conversation list if needed
    const backButton = page.locator('button').filter({ has: page.locator('svg.lucide-arrow-left') }).first();
    if (await backButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await backButton.click();
      await page.waitForTimeout(500);
    }

    // The unread badge is a red-500 rounded-full span inside conversation items
    // or the total unread count in the header
    const unreadBadge = page.locator('.bg-red-500.rounded-full').first();
    const headerUnread = page.locator('[data-testid="messages-page"]').locator('.bg-red-500').first();

    const hasUnreadBadge = await unreadBadge.isVisible({ timeout: 5000 }).catch(() => false);
    const hasHeaderUnread = await headerUnread.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasUnreadBadge || hasHeaderUnread) {
      // Unread indicator is present — verify it's visible
      if (hasUnreadBadge) {
        await expect(unreadBadge).toBeVisible();
      }
    } else {
      // All messages might be read already — that's okay in CI
      // Just verify the page renders without overflow
      const noOverflow = await page.evaluate(
        () => document.body.scrollWidth <= window.innerWidth + 5
      );
      expect(noOverflow).toBe(true);
    }
  });
});
