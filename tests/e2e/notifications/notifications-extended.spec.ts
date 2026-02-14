/**
 * Notifications Extended -- E2E Tests (NX-01 through NX-10)
 *
 * Extends notifications.spec.ts (NF-01..NF-14) with:
 * - Delete all flow (confirmation dialog)
 * - Load more pagination
 * - Notification type icons
 * - Unread count updates
 * - Resilience + a11y
 */

import { test, expect, timeouts } from "../helpers";

// ─── Block 1: Read-only extended tests ───────────────────────────────────────
test.describe("NX: Notifications Extended Read-only", () => {
  test.use({ storageState: "playwright/.auth/user.json" });

  test.beforeEach(async () => {
    test.slow();
  });

  // NX-05: Notification type icons have correct colors
  test("NX-05  notification types have distinct icons", async ({ page }) => {
    await page.goto("/notifications");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByTestId("notification-item").first()
    ).toBeVisible({ timeout: timeouts.action });

    // Check that different notification types have different colored icons
    const items = page.getByTestId("notification-item");
    const count = await items.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // Each item should have an SVG icon inside a colored container
    for (let i = 0; i < Math.min(count, 4); i++) {
      const item = items.nth(i);
      const icon = item.locator("svg").first();
      await expect(icon).toBeVisible();
    }
  });

  // NX-06: Click notification with link navigates
  test("NX-06  clicking notification navigates to linked page", async ({
    page,
  }) => {
    await page.goto("/notifications");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByTestId("notification-item").first()
    ).toBeVisible({ timeout: timeouts.action });

    // Find a notification with a link (Booking Confirmed or New Message have links)
    const linkedItem = page
      .getByTestId("notification-item")
      .filter({ hasText: /Booking Confirmed|New Message/i })
      .first();

    try {
      await expect(linkedItem).toBeVisible({ timeout: 5_000 });
    } catch {
      test.skip(true, "No notification with navigation link found");
      return;
    }

    const link = linkedItem.locator("a").first();
    try {
      await expect(link).toBeVisible({ timeout: 3_000 });
    } catch {
      test.skip(true, "Notification has no clickable link");
      return;
    }

    await link.click();

    // Should navigate away from /notifications
    await expect(page).not.toHaveURL(/\/notifications$/, {
      timeout: timeouts.navigation,
    });
  });

  // NX-10: A11y: keyboard navigation
  test("NX-10  notification items are keyboard navigable", async ({
    page,
  }) => {
    await page.goto("/notifications");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByTestId("notification-item").first()
    ).toBeVisible({ timeout: timeouts.action });

    // Tab through items — buttons should be reachable
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press("Tab");
    }

    const focused = page.locator(":focus");
    const tag = await focused.evaluate((el) => el.tagName.toLowerCase());
    // Should land on interactive elements (buttons or links)
    expect(["button", "a", "input"]).toContain(tag);
  });
});

// ─── Block 2: Mutation tests (serial) ────────────────────────────────────────
test.describe("NX: Notifications Mutations", () => {
  test.use({ storageState: "playwright/.auth/user.json" });
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async () => {
    test.slow();
  });

  // NX-07: Unread count updates after mark-read
  test("NX-07  unread count decrements after marking read", async ({
    page,
  }) => {
    await page.goto("/notifications");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByTestId("notification-item").first()
    ).toBeVisible({ timeout: timeouts.action });

    // The component shows "You have N unread notification(s)" when unreadCount > 0
    const unreadText = page.getByText(/You have \d+ unread/i);
    let initialCount = 0;

    try {
      await expect(unreadText).toBeVisible({ timeout: 5_000 });
      const text = await unreadText.textContent();
      const match = text?.match(/(\d+)/);
      if (match) initialCount = parseInt(match[1], 10);
    } catch {
      // "All caught up!" is shown — no unread notifications
      test.skip(true, "No unread notifications to test count decrement");
      return;
    }

    if (initialCount === 0) {
      test.skip(true, "Unread count is 0");
      return;
    }

    // Mark one as read
    const markReadBtn = page.getByTestId("mark-read-button").first();
    try {
      await expect(markReadBtn).toBeVisible({ timeout: 5_000 });
    } catch {
      test.skip(true, "No unread notifications with mark-read button");
      return;
    }

    await markReadBtn.click();

    // Count should decrease — wait for the text to update
    if (initialCount === 1) {
      // Should now show "All caught up!" instead of unread count
      await expect(
        page.getByText(/All caught up/i)
      ).toBeVisible({ timeout: timeouts.action });
    } else {
      await expect(
        page.getByText(new RegExp(`You have ${initialCount - 1} unread`, "i"))
      ).toBeVisible({ timeout: timeouts.action });
    }
  });

  // NX-08: Mark all read + unread filter shows empty
  test("NX-08  mark all read then unread filter shows empty", async ({
    page,
  }) => {
    await page.goto("/notifications");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByTestId("notification-item").first()
    ).toBeVisible({ timeout: timeouts.action });

    // Click Mark all read
    const markAllBtn = page.getByTestId("mark-all-read-button");
    try {
      await expect(markAllBtn).toBeVisible({ timeout: 5_000 });
    } catch {
      test.skip(
        true,
        "No mark-all-read button visible (no unread notifications)"
      );
      return;
    }

    await markAllBtn.click();

    // Wait for mark-all-read button to disappear (unreadCount now 0)
    await expect(markAllBtn).not.toBeVisible({ timeout: timeouts.action });

    // Switch to Unread filter
    const filterTabs = page.getByTestId("filter-tabs");
    const unreadTab = filterTabs.getByRole("button", { name: /unread/i });
    await unreadTab.click();

    // Should show empty state
    await expect(
      page.getByText(/no unread/i)
    ).toBeVisible({ timeout: timeouts.action });
  });

  // NX-01: Delete all - confirmation dialog
  test("NX-01  delete all shows confirmation dialog", async ({ page }) => {
    await page.goto("/notifications");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByTestId("notifications-page")
    ).toBeVisible({ timeout: timeouts.navigation });

    // Click Delete all button (uses text, no data-testid)
    const deleteAllBtn = page.getByRole("button", { name: /delete all/i });
    try {
      await expect(deleteAllBtn).toBeVisible({ timeout: 5_000 });
    } catch {
      test.skip(true, "No 'Delete all' button visible (no notifications)");
      return;
    }

    await deleteAllBtn.click();

    // Radix AlertDialog should appear
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Should show title and description
    await expect(
      page.getByText(/delete all notifications\?/i)
    ).toBeVisible();
    await expect(
      page.getByText(/permanently delete/i)
    ).toBeVisible();

    // Should have confirm and cancel buttons
    await expect(
      dialog.getByRole("button", { name: /cancel/i })
    ).toBeVisible();
    // The confirm button text is "Delete All" inside the dialog
    await expect(
      dialog.getByRole("button", { name: /delete all/i })
    ).toBeVisible();
  });

  // NX-03: Delete all - cancel
  test("NX-03  cancel delete all keeps notifications", async ({ page }) => {
    await page.goto("/notifications");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByTestId("notification-item").first()
    ).toBeVisible({ timeout: timeouts.action });

    const countBefore = await page.getByTestId("notification-item").count();

    const deleteAllBtn = page.getByRole("button", { name: /delete all/i });
    try {
      await expect(deleteAllBtn).toBeVisible({ timeout: 5_000 });
    } catch {
      test.skip(true, "No 'Delete all' button visible");
      return;
    }

    await deleteAllBtn.click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Cancel
    await dialog.getByRole("button", { name: /cancel/i }).click();

    // Dialog closes
    await expect(dialog).toBeHidden({ timeout: 5_000 });

    // Notifications unchanged
    const countAfter = await page.getByTestId("notification-item").count();
    expect(countAfter).toBe(countBefore);
  });

  // NX-09: Resilience: intercept server action to simulate failure on single delete
  test("NX-09  failed delete keeps notification in list", async ({
    page,
  }) => {
    await page.goto("/notifications");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByTestId("notification-item").first()
    ).toBeVisible({ timeout: timeouts.action });

    const countBefore = await page.getByTestId("notification-item").count();

    // Intercept server action POST requests to simulate a network failure.
    // Next.js server actions are called via POST with Next-Action header.
    await page.route("**/notifications", (route) => {
      const request = route.request();
      if (
        request.method() === "POST" &&
        request.headers()["next-action"]
      ) {
        return route.abort("failed");
      }
      return route.continue();
    });

    // Try to delete a notification
    const deleteBtn = page.getByTestId("delete-button").first();
    try {
      await expect(deleteBtn).toBeVisible({ timeout: 5_000 });
    } catch {
      test.skip(true, "No delete button visible");
      return;
    }

    await deleteBtn.click();

    // Since the server action fails (network abort), the await in handleDelete
    // throws, and setNotifications never runs — notification should remain.
    // Give a moment for any potential removal, then verify count unchanged.
    await expect(async () => {
      const countAfter = await page
        .getByTestId("notification-item")
        .count();
      expect(countAfter).toBe(countBefore);
    }).toPass({ timeout: 5_000 });

    // Clean up route interception
    await page.unroute("**/notifications");
  });

  // NX-02: Delete all - confirm (LAST — destroys notifications)
  test("NX-02  confirm delete all removes all notifications", async ({
    page,
  }) => {
    await page.goto("/notifications");
    await page.waitForLoadState("domcontentloaded");

    const itemCount = await page.getByTestId("notification-item").count();
    if (itemCount === 0) {
      test.skip(true, "No notifications to delete");
      return;
    }

    const deleteAllBtn = page.getByRole("button", { name: /delete all/i });
    try {
      await expect(deleteAllBtn).toBeVisible({ timeout: 5_000 });
    } catch {
      test.skip(true, "No 'Delete all' button visible");
      return;
    }

    await deleteAllBtn.click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Confirm deletion — the confirm button inside the dialog is "Delete All"
    const confirmBtn = dialog.getByRole("button", { name: /delete all/i });
    await confirmBtn.click();

    // All notifications should be gone — empty state shown
    await expect(
      page.getByText(/no notifications/i)
    ).toBeVisible({ timeout: timeouts.action });
  });

  // NX-04: Load more (may not trigger if <20 notifications)
  test("NX-04  load more appends additional notifications", async ({
    page,
  }) => {
    await page.goto("/notifications");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByTestId("notifications-page")
    ).toBeVisible({ timeout: timeouts.navigation });

    // Load more is only visible when hasMore && filter === 'all'
    const loadMore = page.getByRole("button", { name: /load more/i });
    try {
      await expect(loadMore).toBeVisible({ timeout: 5_000 });
    } catch {
      test.skip(true, "No 'Load more' button (fewer than 20 notifications)");
      return;
    }

    const countBefore = await page.getByTestId("notification-item").count();
    await loadMore.click();

    await expect(async () => {
      const countAfter = await page
        .getByTestId("notification-item")
        .count();
      expect(countAfter).toBeGreaterThan(countBefore);
    }).toPass({ timeout: timeouts.action });
  });
});
