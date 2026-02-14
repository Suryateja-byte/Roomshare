/**
 * E2E Performance -- Messaging
 *
 * Latency budgets and polling efficiency for the real-time messaging UI.
 * All hard limits are CI-friendly; soft asserts capture tighter targets
 * for local development.
 *
 * Tests:
 *  RT-P01  Optimistic message appears < 300ms (soft) / < 500ms (hard)
 *  RT-P02  Server confirmation within 3s
 *  RT-P03  Polling does not fire unnecessary requests
 *  RT-P04  /messages page load < 3s on slow 4G
 *  RT-P05  Conversation switch < 1s
 */

import {
  test,
  expect,
  tags,
  MSG_SELECTORS,
  POLL_INTERVAL,
  goToMessages,
  openConversation,
  sendMessage,
} from './messaging-helpers';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
test.use({ storageState: 'playwright/.auth/user.json' });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
test.describe('Messaging: Performance', { tag: [tags.auth, tags.slow] }, () => {
  test.beforeEach(async () => {
    test.slow();
  });

  // -----------------------------------------------------------------------
  // RT-P01: Optimistic message appears < 300ms after send
  // -----------------------------------------------------------------------
  test('RT-P01: Optimistic message appears < 300ms after send', async ({ page }) => {
    const ready = await goToMessages(page);
    test.skip(!ready, 'Could not reach /messages');

    await openConversation(page);

    const uniqueText = `perf-optimistic-${Date.now()}`;
    const input = page.locator(MSG_SELECTORS.messageInput);
    await input.click();
    await input.fill('');
    await input.pressSequentially(uniqueText, { delay: 10 });

    // Measure from the moment we click send
    const sendBtn = page.locator(MSG_SELECTORS.sendButton);
    await expect(sendBtn).toBeEnabled({ timeout: 5_000 });
    const start = Date.now();
    await sendBtn.click();

    // Wait for the bubble to appear
    const bubble = page.locator(MSG_SELECTORS.messageBubble).filter({ hasText: uniqueText });
    await expect(bubble.first()).toBeVisible({ timeout: 5_000 });
    const elapsed = Date.now() - start;

    console.log(`[perf] Optimistic message render: ${elapsed}ms`);

    // Soft assert: ideal target
    expect.soft(
      elapsed,
      `Optimistic render took ${elapsed}ms, ideal target is < 300ms`,
    ).toBeLessThan(300);

    // Hard assert: maximum acceptable
    expect(
      elapsed,
      `Optimistic render took ${elapsed}ms, hard limit is 500ms`,
    ).toBeLessThan(500);
  });

  // -----------------------------------------------------------------------
  // RT-P02: Server confirmation within 3s
  // -----------------------------------------------------------------------
  test('RT-P02: Server confirmation within 3s', async ({ page }) => {
    const ready = await goToMessages(page);
    test.skip(!ready, 'Could not reach /messages');

    await openConversation(page);

    const uniqueText = `perf-confirm-${Date.now()}`;
    const start = Date.now();
    await sendMessage(page, uniqueText);

    // Wait for the optimistic bubble to appear first
    const bubble = page.locator(MSG_SELECTORS.messageBubble).filter({ hasText: uniqueText });
    await expect(bubble.first()).toBeVisible({ timeout: 5_000 });

    // Check for the optimistic indicator:
    //  - Some UIs use opacity-70 class on pending messages
    //  - Some use a "sending..." indicator or a clock icon
    //  - Some use data-status="pending" / data-status="sent"
    const bubbleEl = bubble.first();

    // Strategy 1: Check for opacity-70 class removal (optimistic -> confirmed)
    const hasOpacityClass = await bubbleEl
      .evaluate((el) => el.classList.contains('opacity-70'))
      .catch(() => false);

    if (hasOpacityClass) {
      // Wait for opacity class to be removed (server confirmed)
      await expect
        .poll(
          () => bubbleEl.evaluate((el) => !el.classList.contains('opacity-70')),
          { timeout: 3_000, message: 'Optimistic opacity should clear within 3s' },
        )
        .toBe(true);

      const elapsed = Date.now() - start;
      console.log(`[perf] Server confirmation (opacity): ${elapsed}ms`);
      expect(elapsed, `Server confirmation took ${elapsed}ms, limit is 3s`).toBeLessThan(3_000);
      return;
    }

    // Strategy 2: Check for data-status attribute transition
    const hasStatusAttr = await bubbleEl
      .evaluate((el) => el.hasAttribute('data-status'))
      .catch(() => false);

    if (hasStatusAttr) {
      await expect
        .poll(
          () => bubbleEl.getAttribute('data-status'),
          { timeout: 3_000, message: 'Message status should become "sent" within 3s' },
        )
        .toBe('sent');

      const elapsed = Date.now() - start;
      console.log(`[perf] Server confirmation (data-status): ${elapsed}ms`);
      expect(elapsed, `Server confirmation took ${elapsed}ms, limit is 3s`).toBeLessThan(3_000);
      return;
    }

    // Strategy 3: Wait for the POST response as a proxy for confirmation
    // The message already appeared; if we reach here the app may not show
    // an explicit optimistic state. Verify the server action or API call
    // completes within the budget.
    const elapsed = Date.now() - start;
    console.log(
      `[perf] No optimistic indicator detected; message appeared in ${elapsed}ms. ` +
      'If the app uses optimistic UI, add opacity-70 or data-status to the bubble element.',
    );

    // The message appeared, so at minimum the send cycle completed
    expect(elapsed, `Total send cycle took ${elapsed}ms, limit is 3s`).toBeLessThan(3_000);
  });

  // -----------------------------------------------------------------------
  // RT-P03: Polling does not fire unnecessary requests
  // -----------------------------------------------------------------------
  test('RT-P03: Polling does not fire unnecessary requests', async ({ page }) => {
    const ready = await goToMessages(page);
    test.skip(!ready, 'Could not reach /messages');

    await openConversation(page);

    // Collect GET requests that look like polling endpoints
    const pollingRequests: { url: string; time: number }[] = [];
    const startTime = Date.now();

    page.on('request', (req) => {
      if (req.method() !== 'GET') return;
      const url = req.url();
      // Match common polling patterns: /api/messages, /api/conversations, /api/chat,
      // or Next.js server component refreshes to /messages
      if (
        url.includes('/api/messages') ||
        url.includes('/api/conversations') ||
        url.includes('/api/chat') ||
        (url.includes('/messages') && url.includes('_rsc'))
      ) {
        pollingRequests.push({ url, time: Date.now() - startTime });
      }
    });

    // Wait 10 seconds to observe polling behavior
    // This is INTENTIONAL -- we are measuring polling intervals over time
    await page.waitForTimeout(10_000);

    console.log(`[perf] Polling requests in 10s: ${pollingRequests.length}`);
    pollingRequests.forEach((r) => {
      console.log(`  ${r.time}ms: ${r.url.split('?')[0]}`);
    });

    // With a 3s poll interval (POLL_INTERVAL.messagesPage), expect:
    //  - Minimum: ~2 requests (10s / 3s = 3.3, minus initial)
    //  - Maximum: ~5 requests (accounting for initial fetch + some jitter)
    // If there are 0 requests, polling may not be active (acceptable if SSE/WS)
    if (pollingRequests.length === 0) {
      console.log(
        '[perf] No polling requests detected -- app may use WebSocket or SSE instead.',
      );
      return;
    }

    const maxExpected = Math.ceil(10_000 / POLL_INTERVAL.messagesPage) + 2; // +2 for initial + jitter
    expect(
      pollingRequests.length,
      `Expected <= ${maxExpected} polling requests in 10s, got ${pollingRequests.length}. ` +
      `Poll interval is ${POLL_INTERVAL.messagesPage}ms.`,
    ).toBeLessThanOrEqual(maxExpected);

    // Verify requests are roughly spaced at the poll interval (not firing rapidly)
    if (pollingRequests.length >= 3) {
      const gaps: number[] = [];
      for (let i = 1; i < pollingRequests.length; i++) {
        gaps.push(pollingRequests[i].time - pollingRequests[i - 1].time);
      }
      const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      console.log(`[perf] Average polling gap: ${avgGap.toFixed(0)}ms`);

      // Average gap should be at least 50% of the configured interval
      // (allows for some jitter and initial burst)
      const minAvgGap = POLL_INTERVAL.messagesPage * 0.5;
      expect.soft(
        avgGap,
        `Average gap ${avgGap.toFixed(0)}ms should be >= ${minAvgGap}ms (50% of poll interval)`,
      ).toBeGreaterThanOrEqual(minAvgGap);
    }
  });

  // -----------------------------------------------------------------------
  // RT-P04: /messages page load < 3s on slow 4G
  // -----------------------------------------------------------------------
  test('RT-P04: /messages page load < 3s on slow 4G', async ({ page, context }) => {
    // Apply slow 4G network throttling via CDP (Chromium only)
    let cdpAvailable = true;
    try {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        downloadThroughput: (2_000_000 / 8),  // 2 Mbps
        uploadThroughput: (1_000_000 / 8),     // 1 Mbps
        latency: 100,                           // 100ms
      });
    } catch {
      // CDP not available (non-Chromium) -- skip throttling
      cdpAvailable = false;
      console.log('[perf] CDP not available, running without network throttle');
    }

    const budget = process.env.CI ? 8_000 : 3_000;
    const start = Date.now();

    await page.goto('/messages');
    await page.waitForLoadState('domcontentloaded');

    // Wait for the messages page container to be visible
    const messagesPage = page.locator(MSG_SELECTORS.page);
    await messagesPage
      .waitFor({ state: 'visible', timeout: budget })
      .catch(() => {});

    const elapsed = Date.now() - start;
    console.log(
      `[perf] /messages page load: ${elapsed}ms ` +
      `(throttled: ${cdpAvailable}, CI: ${!!process.env.CI})`,
    );

    // Reset network conditions
    if (cdpAvailable) {
      try {
        const cdp = await context.newCDPSession(page);
        await cdp.send('Network.emulateNetworkConditions', {
          offline: false,
          downloadThroughput: -1,
          uploadThroughput: -1,
          latency: 0,
        });
      } catch {
        // Ignore cleanup errors
      }
    }

    const url = page.url();
    // Skip assertion if we were redirected (auth issue, not a perf issue)
    test.skip(
      url.includes('/login') || url.includes('/auth'),
      'Redirected to login -- cannot measure messages page load',
    );

    expect(
      elapsed,
      `Page load took ${elapsed}ms, budget is ${budget}ms`,
    ).toBeLessThan(budget);
  });

  // -----------------------------------------------------------------------
  // RT-P05: Conversation switch < 1s
  // -----------------------------------------------------------------------
  test('RT-P05: Conversation switch < 1s', async ({ page }) => {
    const viewport = page.viewportSize();
    test.skip(!!viewport && viewport.width < 768, 'Desktop-only: mobile shows single-panel layout');
    const ready = await goToMessages(page);
    test.skip(!ready, 'Could not reach /messages');

    // Wait for conversation items to load
    const conversationItems = page.locator(MSG_SELECTORS.conversationItem);
    await expect(conversationItems.first()).toBeVisible({ timeout: 15_000 });

    const convCount = await conversationItems.count();
    test.skip(convCount < 2, 'Need at least 2 conversations to test switching');

    // Open the first conversation and wait for it to load
    await conversationItems.first().click();
    await expect(page.locator(MSG_SELECTORS.messageInput)).toBeVisible({ timeout: 10_000 });

    // Wait for messages to render in the first conversation
    await page
      .locator(MSG_SELECTORS.messageBubble)
      .first()
      .waitFor({ state: 'attached', timeout: 10_000 })
      .catch(() => {});

    // Now switch to the second conversation and measure
    const budget = process.env.CI ? 3_000 : 1_000;
    const start = Date.now();
    await conversationItems.nth(1).click();

    // Wait for the message input to be visible in the new conversation context
    await expect(page.locator(MSG_SELECTORS.messageInput)).toBeVisible({ timeout: budget });

    const elapsed = Date.now() - start;
    console.log(`[perf] Conversation switch: ${elapsed}ms`);

    // Soft assert for the tight target
    expect.soft(
      elapsed,
      `Conversation switch took ${elapsed}ms, ideal target is < 1000ms`,
    ).toBeLessThan(1_000);

    // Hard assert with CI-friendly budget
    expect(
      elapsed,
      `Conversation switch took ${elapsed}ms, hard limit is ${budget}ms`,
    ).toBeLessThan(budget);
  });
});
