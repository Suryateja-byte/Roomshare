/**
 * Notifications Page -- E2E Tests (NF-01 through NF-14)
 *
 * Coverage: /notifications -- auth guard, rendering, filters,
 * mark-as-read, delete, navigation, empty state.
 *
 * Seed data (for testUser e2e-test@roomshare.dev):
 *   BOOKING_ACCEPTED "Booking Confirmed" (unread, link: /bookings)
 *   NEW_MESSAGE      "New Message"       (unread, link: /messages)
 *   BOOKING_CANCELLED "Booking Cancelled" (read, no link)
 *   NEW_REVIEW        "New Review"        (read, link: /listings/[id])
 *
 * Test ordering: read-only tests first (NF-01..NF-06, NF-10),
 * then mutation tests in careful sequence (NF-07..NF-14).
 * Mutations persist server-side, so ordering matters.
 *
 * IMPORTANT: Restricted to chromium project only. When multiple projects
 * (chromium + Mobile Chrome) run in the same shard, chromium's mutation
 * tests (delete, mark-read) modify the shared DB before Mobile Chrome's
 * read-only tests execute, causing "notification-item not found" failures.
 */

import { test, expect, timeouts } from "../helpers";

// ---------------------------------------------------------------------------
// Block 1: Read-only tests (no state mutation)
// ---------------------------------------------------------------------------
test.describe("NF: Read-only", () => {
  test.use({ storageState: "playwright/.auth/user.json" });

  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium',
      'Notifications: chromium-only (mutation tests modify shared DB state)');
    test.slow(); // 3x timeout for SSR pages
  });

  // NF-01: Unauthenticated redirect
  test("NF-01  unauthenticated user redirects to /login", async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();

    await page.goto("/notifications");
    await expect(page).toHaveURL(/\/login/, {
      timeout: timeouts.navigation,
    });

    await context.close();
  });

  // NF-02: Auth user sees notifications page with heading
  test("NF-02  auth user sees Notifications heading", async ({ page }) => {
    await page.goto("/notifications");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByTestId("notifications-page"),
    ).toBeVisible({ timeout: timeouts.navigation });

    await expect(
      page.getByRole("heading", { name: "Notifications", level: 1 }),
    ).toBeVisible();
  });

  // NF-03: Notification items rendered
  test("NF-03  notification items are rendered", async ({ page }) => {
    await page.goto("/notifications");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByTestId("notifications-page"),
    ).toBeVisible({ timeout: timeouts.navigation });

    const items = page.getByTestId("notification-item");
    await expect(items.first()).toBeVisible({ timeout: timeouts.action });

    const count = await items.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  // NF-04: Unread notifications have visual distinction
  test("NF-04  unread notifications have visual distinction", async ({
    page,
  }) => {
    await page.goto("/notifications");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByTestId("notification-item").first(),
    ).toBeVisible({ timeout: timeouts.action });

    // Find an unread notification by looking for mark-read-button
    // (only unread items have this button)
    const unreadItem = page
      .getByTestId("notification-item")
      .filter({ has: page.getByTestId("mark-read-button") })
      .first();

    await expect(unreadItem).toBeVisible({ timeout: 5_000 });

    // Unread items have bg-blue-50/30 class
    const classes = await unreadItem.getAttribute("class");
    expect(classes).toContain("bg-blue-50");

    // Title should be font-semibold (unread styling)
    const title = unreadItem.locator("h4");
    const titleClasses = await title.getAttribute("class");
    expect(titleClasses).toContain("font-semibold");
  });

  // NF-05: Read notifications differ from unread
  test("NF-05  read notifications lack unread styling", async ({ page }) => {
    await page.goto("/notifications");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByTestId("notification-item").first(),
    ).toBeVisible({ timeout: timeouts.action });

    // A read notification has NO mark-read-button
    const readItem = page
      .getByTestId("notification-item")
      .filter({ hasNot: page.getByTestId("mark-read-button") })
      .first();

    await expect(readItem).toBeVisible({ timeout: 5_000 });

    // Read items should NOT have blue background
    const classes = await readItem.getAttribute("class");
    expect(classes).not.toContain("bg-blue-50");

    // Title should be font-medium (read styling)
    const title = readItem.locator("h4");
    const titleClasses = await title.getAttribute("class");
    expect(titleClasses).toContain("font-medium");
  });

  // NF-06: Notification shows title, message preview, timestamp
  test("NF-06  notification shows title, message, timestamp", async ({
    page,
  }) => {
    await page.goto("/notifications");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByTestId("notification-item").first(),
    ).toBeVisible({ timeout: timeouts.action });

    const item = page.getByTestId("notification-item").first();

    // Title (h4 element)
    const title = item.locator("h4");
    await expect(title).toBeVisible();
    const titleText = await title.textContent();
    expect(titleText?.trim().length).toBeGreaterThan(0);

    // Message (second p element -- first child p after title)
    const message = item.locator("p.text-sm.text-zinc-500").first();
    await expect(message).toBeVisible();
    const messageText = await message.textContent();
    expect(messageText?.trim().length).toBeGreaterThan(0);

    // Timestamp (smaller text)
    const timestamp = item.locator("p.text-xs");
    await expect(timestamp).toBeVisible();
  });

  // NF-10: Click notification with link navigates
  test("NF-10  clicking linked notification title navigates", async ({
    page,
  }) => {
    await page.goto("/notifications");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByTestId("notification-item").first(),
    ).toBeVisible({ timeout: timeouts.action });

    // "Booking Confirmed" has link to /bookings
    const bookingNotification = page
      .getByTestId("notification-item")
      .filter({ hasText: "Booking Confirmed" });

    const linkElement = bookingNotification.locator("a").first();
    const isLinkVisible = await linkElement.isVisible().catch(() => false);

    if (isLinkVisible) {
      await linkElement.click();
      await expect(page).toHaveURL(/\/bookings/, {
        timeout: timeouts.navigation,
      });
    } else {
      // Fallback: try finding any notification with a link
      const anyLink = page
        .getByTestId("notification-item")
        .locator("a")
        .first();
      const hasAnyLink = await anyLink.isVisible().catch(() => false);
      test.skip(!hasAnyLink, "No linked notifications found");

      await anyLink.click();
      // Verify we navigated away from /notifications
      await page.waitForURL(/(?!\/notifications$)/, {
        timeout: timeouts.navigation,
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Block 2: Mutation tests (careful ordering, state persists)
// ---------------------------------------------------------------------------
test.describe("NF: Mutations", () => {
  test.use({ storageState: "playwright/.auth/user.json" });
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium',
      'Notifications: chromium-only (mutation tests modify shared DB state)');
    test.slow();
  });

  // NF-07: Mark single notification as read
  test("NF-07  mark single notification as read", async ({ page }) => {
    await page.goto("/notifications");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByTestId("notification-item").first(),
    ).toBeVisible({ timeout: timeouts.action });

    // Count mark-read-buttons before
    const markReadButtons = page.getByTestId("mark-read-button");
    const countBefore = await markReadButtons.count();
    test.skip(countBefore === 0, "No unread notifications to mark as read");

    // Click first mark-read-button
    await markReadButtons.first().click();

    // Wait for the button to disappear from that notification
    // (read items don't show mark-read-button)
    await expect(markReadButtons).toHaveCount(countBefore - 1, {
      timeout: timeouts.action,
    });
  });

  // NF-12: Unread filter shows only unread
  test("NF-12  unread filter shows only unread notifications", async ({
    page,
  }) => {
    await page.goto("/notifications");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByTestId("notification-item").first(),
    ).toBeVisible({ timeout: timeouts.action });

    const totalBefore = await page.getByTestId("notification-item").count();

    // Click the "Unread" filter button
    const filterTabs = page.getByTestId("filter-tabs");
    const unreadFilter = filterTabs.getByText(/^Unread/);
    await unreadFilter.click();

    // Wait for filter to apply
    await page.waitForTimeout(500);

    const unreadCount = await page.getByTestId("notification-item").count();

    // With NF-07 having marked one as read, we should have fewer unread
    // than total. At minimum, unread count should be less than or equal
    // to total and greater than 0 (we still have at least one unread).
    expect(unreadCount).toBeLessThanOrEqual(totalBefore);

    // Every visible item should have mark-read-button (all are unread)
    const visibleItems = page.getByTestId("notification-item");
    const visibleCount = await visibleItems.count();
    if (visibleCount > 0) {
      const markReadCount = await page.getByTestId("mark-read-button").count();
      expect(markReadCount).toBe(visibleCount);
    }

    // Switch back to All
    await filterTabs.getByText("All").click();
  });

  // NF-13: Filter state persists after marking read
  test("NF-13  marking read in unread filter removes from view", async ({
    page,
  }) => {
    await page.goto("/notifications");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByTestId("notification-item").first(),
    ).toBeVisible({ timeout: timeouts.action });

    // Switch to Unread filter
    const filterTabs = page.getByTestId("filter-tabs");
    await filterTabs.getByText(/^Unread/).click();
    await page.waitForTimeout(500);

    const unreadBefore = await page.getByTestId("notification-item").count();
    test.skip(unreadBefore === 0, "No unread notifications for filter test");

    // Mark first unread as read
    const markReadBtn = page.getByTestId("mark-read-button").first();
    await markReadBtn.click();

    // That notification should disappear from the filtered view
    await expect(page.getByTestId("notification-item")).toHaveCount(
      unreadBefore - 1,
      { timeout: timeouts.action },
    );
  });

  // NF-09: Delete notification
  test("NF-09  delete notification reduces count", async ({ page }) => {
    await page.goto("/notifications");
    await page.waitForLoadState("domcontentloaded");

    // Make sure we're on "All" filter
    const filterTabs = page.getByTestId("filter-tabs");
    await filterTabs.getByText("All").click();
    await page.waitForTimeout(300);

    await expect(
      page.getByTestId("notification-item").first(),
    ).toBeVisible({ timeout: timeouts.action });

    const countBefore = await page.getByTestId("notification-item").count();
    test.skip(countBefore === 0, "No notifications to delete");

    // Click delete on first notification
    const deleteBtn = page.getByTestId("delete-button").first();
    await deleteBtn.click();

    // Count should decrease
    await expect(page.getByTestId("notification-item")).toHaveCount(
      countBefore - 1,
      { timeout: timeouts.action },
    );
  });

  // NF-11: All filter shows all notifications
  test("NF-11  all filter shows all notifications", async ({ page }) => {
    await page.goto("/notifications");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByTestId("notifications-page"),
    ).toBeVisible({ timeout: timeouts.navigation });

    const filterTabs = page.getByTestId("filter-tabs");

    // Switch to Unread first
    await filterTabs.getByText(/^Unread/).click();
    await page.waitForTimeout(500);
    const unreadCount = await page.getByTestId("notification-item").count();

    // Switch to All
    await filterTabs.getByText("All").click();
    await page.waitForTimeout(500);
    const allCount = await page.getByTestId("notification-item").count();

    // All count should be >= unread count
    expect(allCount).toBeGreaterThanOrEqual(unreadCount);
  });

  // NF-08: Mark all as read
  test("NF-08  mark all as read removes all mark-read buttons", async ({
    page,
  }) => {
    await page.goto("/notifications");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByTestId("notifications-page"),
    ).toBeVisible({ timeout: timeouts.navigation });

    // Check for mark-all-read-button (only visible when unreadCount > 0)
    const markAllBtn = page.getByTestId("mark-all-read-button");
    const hasMarkAll = await markAllBtn.isVisible().catch(() => false);

    if (!hasMarkAll) {
      // Already all read -- verify no mark-read-buttons exist
      await expect(page.getByTestId("mark-read-button")).toHaveCount(0);
      return;
    }

    await markAllBtn.click();

    // All individual mark-read-buttons should disappear
    await expect(page.getByTestId("mark-read-button")).toHaveCount(0, {
      timeout: timeouts.action,
    });

    // The "Mark all read" button itself should disappear (unreadCount = 0)
    await expect(markAllBtn).not.toBeVisible({ timeout: timeouts.action });
  });

  // NF-14: Empty state after filtering unread (all marked as read)
  test("NF-14  unread filter shows empty state when all read", async ({
    page,
  }) => {
    await page.goto("/notifications");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByTestId("notifications-page"),
    ).toBeVisible({ timeout: timeouts.navigation });

    // Ensure all are read first (NF-08 already did this, but be safe)
    const markAllBtn = page.getByTestId("mark-all-read-button");
    const hasMarkAll = await markAllBtn.isVisible().catch(() => false);
    if (hasMarkAll) {
      await markAllBtn.click();
      await expect(markAllBtn).not.toBeVisible({ timeout: timeouts.action });
    }

    // Switch to Unread filter
    const filterTabs = page.getByTestId("filter-tabs");
    await filterTabs.getByText(/^Unread/).click();
    await page.waitForTimeout(500);

    // No notification items should be visible
    await expect(page.getByTestId("notification-item")).toHaveCount(0, {
      timeout: 5_000,
    });

    // Empty state text
    await expect(page.getByText("No unread notifications")).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByText("You're all caught up!")).toBeVisible({
      timeout: 5_000,
    });
  });
});
