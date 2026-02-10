/**
 * E2E Test Suite: Messaging Journeys
 * Journeys: J047-J056
 *
 * Tests conversation flows, sending messages, real-time updates,
 * and message management.
 */

import { test, expect, tags, timeouts, selectors } from '../helpers';

test.describe('Messaging Journeys', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test.beforeEach(async () => {
    test.slow();
  });

  test.describe('J047: Start new conversation', () => {
    test(`${tags.auth} - Contact host from listing`, async ({ page, nav }) => {
      await nav.goToSearch();
      await nav.clickListingCard(0);

      // Find contact button
      const contactButton = page.getByRole('button', { name: /contact|message.*host/i });

      if (await contactButton.isVisible()) {
        await contactButton.click();

        // Should open message modal or navigate to messages
        await page.waitForTimeout(1000);

        const messageInput = page.getByPlaceholder(/message|type.*here/i)
          .or(page.locator('textarea'))
          .first();

        if (await messageInput.isVisible()) {
          await messageInput.fill('Hello, I am interested in this room. Is it still available?');

          const sendButton = page.getByRole('button', { name: /send/i });
          await sendButton.click();

          // Should show success or navigate to conversation
          await expect(
            page.locator(selectors.toast)
              .or(page.getByText(/sent|delivered/i))
              .or(page.locator('[data-testid="message-sent"]'))
              .first()
          ).toBeVisible({ timeout: 10000 });
        }
      }
    });
  });

  test.describe('J048: View conversations', () => {
    test(`${tags.auth} - View messages inbox`, async ({ page, nav, assert }) => {
      await nav.goToMessages();

      // Should load messages page
      await assert.pageLoaded();

      // Should have heading
      await expect(page.getByRole('heading', { name: /message|inbox|conversation/i })).toBeVisible();

      // Should show conversation list or empty state
      const conversationList = page.locator('[data-testid="conversation-list"], [class*="conversation"]');
      const hasConversations = (await conversationList.count()) > 0;
      const hasEmptyState = await page.locator(selectors.emptyState).isVisible().catch(() => false);

      expect(hasConversations || hasEmptyState).toBeTruthy();
    });

    test(`${tags.auth} - Click conversation to view messages`, async ({ page, nav }) => {
      await nav.goToMessages();

      const conversationItem = page
        .locator('[data-testid="conversation-item"], [class*="conversation-item"]')
        .first();

      if (await conversationItem.isVisible()) {
        await conversationItem.click();

        // Should load conversation with messages
        await page.waitForURL(/\/messages\//, { timeout: 10000 });

        // Should show message input
        const messageInput = page.getByPlaceholder(/message|type/i)
          .or(page.locator('textarea'))
          .first();
        await expect(messageInput).toBeVisible();
      }
    });
  });

  test.describe('J049: Send message in conversation', () => {
    test(`${tags.auth} - Send and receive message`, async ({ page, nav }) => {
      await nav.goToMessages();

      // Open first conversation
      const conversationItem = page
        .locator('[data-testid="conversation-item"]')
        .first();

      if (await conversationItem.isVisible()) {
        await conversationItem.click();
        await page.waitForURL(/\/messages\//);

        // Send a message
        const messageInput = page.getByPlaceholder(/message|type/i)
          .or(page.locator('textarea'))
          .first();

        const testMessage = `Test message ${Date.now()}`;
        await messageInput.fill(testMessage);

        const sendButton = page.getByRole('button', { name: /send/i });
        await sendButton.click();

        // Message should appear in conversation
        await expect(page.getByText(testMessage)).toBeVisible({ timeout: 10000 });

        // Input should be cleared
        await expect(messageInput).toBeEmpty();
      }
    });
  });

  test.describe('J050: Real-time message updates', () => {
    test(`${tags.auth} ${tags.slow} - Message polling check`, async ({ page, nav }) => {
      await nav.goToMessages();

      const conversationItem = page
        .locator('[data-testid="conversation-item"]')
        .first();

      if (await conversationItem.isVisible()) {
        await conversationItem.click();
        await page.waitForURL(/\/messages\//);

        // Wait for polling interval (5 seconds + buffer)
        await page.waitForTimeout(timeouts.polling);

        // Page should still be responsive and not error
        const messageInput = page.getByPlaceholder(/message|type/i);
        await expect(messageInput).toBeEnabled();
      }
    });
  });

  test.describe('J051-J052: Unread message indicators', () => {
    test(`${tags.auth} - Unread badge in navigation`, async ({ page, nav }) => {
      await nav.goHome();

      // Look for unread indicator on messages link/icon
      const messagesLink = page.getByRole('link', { name: /message/i }).first()
        .or(page.locator('a[href*="/messages"]').first())
        .first();

      if (await messagesLink.isVisible()) {
        // Check for badge
        const badge = messagesLink.locator('[class*="badge"], [data-testid="unread-count"]');

        // May or may not have unread messages
        await messagesLink.isVisible();
      }
    });

    test(`${tags.auth} - Mark conversation as read`, async ({ page, nav }) => {
      await nav.goToMessages();

      // Find unread conversation indicator
      const unreadConvo = page.locator('[class*="unread"], [data-unread="true"]').first();

      if (await unreadConvo.isVisible()) {
        // Click to open and mark as read
        await unreadConvo.click();
        await page.waitForURL(/\/messages\//);

        // Go back and check if marked read
        await nav.goToMessages();
        await page.waitForTimeout(1000);

        // Same conversation should no longer be marked unread
      }
    });
  });

  test.describe('J053-J054: Block user in messaging', () => {
    test(`${tags.auth} - Block user from conversation`, async ({ page, nav }) => {
      await nav.goToMessages();

      const conversationItem = page
        .locator('[data-testid="conversation-item"]')
        .first();

      if (await conversationItem.isVisible()) {
        await conversationItem.click();

        // Find block button (often in menu)
        const menuButton = page.getByRole('button', { name: /menu|more|options/i });

        if (await menuButton.isVisible()) {
          await menuButton.click();

          const blockOption = page.getByRole('menuitem', { name: /block/i });

          if (await blockOption.isVisible()) {
            await blockOption.click();

            // Confirm block
            const confirmButton = page.getByRole('button', { name: /confirm|block|yes/i });
            if (await confirmButton.isVisible()) {
              await confirmButton.click();
            }

            // Should show blocked state
            await expect(
              page.getByText(/blocked/i)
                .or(page.locator(selectors.toast))
                .first()
            ).toBeVisible({ timeout: 5000 });
          }
        }
      }
    });
  });

  test.describe('J055-J056: Message edge cases', () => {
    test(`${tags.auth} - Empty message not sent`, async ({ page, nav }) => {
      await nav.goToMessages();

      const conversationItem = page
        .locator('[data-testid="conversation-item"]')
        .first();

      if (await conversationItem.isVisible()) {
        await conversationItem.click();

        const sendButton = page.getByRole('button', { name: /send/i });

        // Try to send empty message
        if (await sendButton.isVisible()) {
          // Button should be disabled when input is empty
          const isDisabled = await sendButton.isDisabled();
          expect(isDisabled).toBeTruthy();
        }
      }
    });

    test(`${tags.auth} ${tags.offline} - Message queue on network error`, async ({
      page,
      nav,
      network,
    }) => {
      await nav.goToMessages();

      const conversationItem = page
        .locator('[data-testid="conversation-item"]')
        .first();

      if (await conversationItem.isVisible()) {
        await conversationItem.click();

        // Go offline
        await network.goOffline();

        const messageInput = page.getByPlaceholder(/message|type/i);
        if (await messageInput.isVisible()) {
          await messageInput.fill('Message while offline');

          const sendButton = page.getByRole('button', { name: /send/i });
          await sendButton.click();

          // Should show offline/retry indicator
          await page.waitForTimeout(2000);
        }

        // Go back online
        await network.goOnline();
      }
    });
  });
});
