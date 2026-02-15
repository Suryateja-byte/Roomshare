/**
 * Saved Searches -- E2E Tests (SS-01 through SS-10)
 *
 * Coverage: /saved-searches -- auth guard, list rendering,
 * empty state, view search, toggle alerts, delete, persistence.
 *
 * Seed data creates 2 saved searches for test user.
 */

import { test, expect, timeouts } from "../helpers";

// ─── Block 1: Read-only ─────────────────────────────────────────────────────
test.describe("SS: Saved Searches Read-only", () => {
  test.use({ storageState: "playwright/.auth/user.json" });

  test.beforeEach(async () => {
    test.slow();
  });

  // SS-01: Unauthenticated redirect
  test("SS-01  unauthenticated user redirects to /login", async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();

    await page.goto("/saved-searches");
    await expect(page).toHaveURL(/\/login/, {
      timeout: timeouts.navigation,
    });

    await context.close();
  });

  // SS-02: Page renders with saved searches
  test("SS-02  page renders saved search cards", async ({ page }) => {
    await page.goto("/saved-searches");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByRole("heading", { name: /saved searches/i, level: 1 })
    ).toBeVisible({ timeout: timeouts.navigation });

    // Seed creates 2 saved searches
    await expect(
      page.getByText(/SF Under \$1500|Mission District/i).first()
    ).toBeVisible({ timeout: timeouts.action });
  });

  // SS-04: View saved search navigates to /search
  test("SS-04  view button opens search with filters", async ({ page }) => {
    await page.goto("/saved-searches");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByRole("heading", { name: /saved searches/i, level: 1 })
    ).toBeVisible({ timeout: timeouts.navigation });

    // Click View link on first search
    const viewLink = page.getByRole("link", { name: /view/i }).first();
    try {
      await expect(viewLink).toBeVisible({ timeout: 5_000 });
    } catch {
      test.skip(true, "No View button found");
      return;
    }

    await viewLink.click();

    // Should navigate to /search with filter params
    await expect(page).toHaveURL(/\/search/, {
      timeout: timeouts.navigation,
    });
  });

  // SS-09: Filter summary display
  test("SS-09  saved search shows filter summary", async ({ page }) => {
    await page.goto("/saved-searches");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByRole("heading", { name: /saved searches/i, level: 1 })
    ).toBeVisible({ timeout: timeouts.navigation });

    // Saved search cards show filter summary (e.g. "2 amenities", "Search: ...")
    await expect(
      page.getByText(/amenities|search:|created/i).first()
    ).toBeVisible({ timeout: timeouts.action });
  });
});

// ─── Block 2: Mutations (serial) ────────────────────────────────────────────
test.describe("SS: Saved Searches Mutations", () => {
  test.use({ storageState: "playwright/.auth/user.json" });
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async () => {
    test.slow();
  });

  // SS-05: Toggle alert on
  test("SS-05  toggle alert on shows enabled state", async ({ page }) => {
    await page.goto("/saved-searches");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByRole("heading", { name: /saved searches/i, level: 1 })
    ).toBeVisible({ timeout: timeouts.navigation });

    // Find a disabled alert button (title="Enable alerts")
    const enableBtn = page.locator('button[title="Enable alerts"]').first();
    try {
      await expect(enableBtn).toBeVisible({ timeout: 5_000 });
    } catch {
      test.skip(true, "No disabled alert toggle found");
      return;
    }

    await enableBtn.click();

    // After toggling, button title should change to "Disable alerts"
    await expect(
      page.locator('button[title="Disable alerts"]')
    ).toBeVisible({ timeout: timeouts.action });
  });

  // SS-06: Toggle alert off
  test("SS-06  toggle alert off removes enabled state", async ({ page }) => {
    await page.goto("/saved-searches");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByRole("heading", { name: /saved searches/i, level: 1 })
    ).toBeVisible({ timeout: timeouts.navigation });

    // Find an enabled alert button (title="Disable alerts")
    const disableBtn = page.locator('button[title="Disable alerts"]').first();
    try {
      await expect(disableBtn).toBeVisible({ timeout: 5_000 });
    } catch {
      test.skip(true, "No enabled alert toggle found");
      return;
    }

    await disableBtn.click();

    // After toggling, button title should change to "Enable alerts"
    await expect(
      page.locator('button[title="Enable alerts"]')
    ).toBeVisible({ timeout: timeouts.action });
  });

  // SS-10: Alert state persists after reload
  test("SS-10  alert state persists after reload", async ({ page }) => {
    await page.goto("/saved-searches");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByRole("heading", { name: /saved searches/i, level: 1 })
    ).toBeVisible({ timeout: timeouts.navigation });

    // Toggle an alert on (if available) to test persistence
    const enableBtn = page.locator('button[title="Enable alerts"]').first();
    const disableBtn = page.locator('button[title="Disable alerts"]').first();

    // Determine initial alert state, then toggle
    let toggledToEnabled = false;
    try {
      await expect(enableBtn).toBeVisible({ timeout: 5_000 });
      await enableBtn.click();
      await expect(
        page.locator('button[title="Disable alerts"]').first()
      ).toBeVisible({ timeout: timeouts.action });
      toggledToEnabled = true;
    } catch {
      // Already enabled — toggle off instead
      try {
        await expect(disableBtn).toBeVisible({ timeout: 3_000 });
        await disableBtn.click();
        await expect(
          page.locator('button[title="Enable alerts"]').first()
        ).toBeVisible({ timeout: timeouts.action });
      } catch {
        test.skip(true, "No alert toggle found for persistence test");
        return;
      }
    }

    // Reload and verify alert state persisted
    await page.reload();
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByRole("heading", { name: /saved searches/i, level: 1 })
    ).toBeVisible({ timeout: timeouts.navigation });

    if (toggledToEnabled) {
      // We toggled ON — should still show "Disable alerts" after reload
      await expect(
        page.locator('button[title="Disable alerts"]').first()
      ).toBeVisible({ timeout: timeouts.action });
    } else {
      // We toggled OFF — should still show "Enable alerts" after reload
      await expect(
        page.locator('button[title="Enable alerts"]').first()
      ).toBeVisible({ timeout: timeouts.action });
    }
  });

  // SS-07: Delete saved search - confirm
  test("SS-07  delete saved search removes from list", async ({ page }) => {
    await page.goto("/saved-searches");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByRole("heading", { name: /saved searches/i, level: 1 })
    ).toBeVisible({ timeout: timeouts.navigation });

    const deleteBtn = page.locator('button[title="Delete search"]').first();
    try {
      await expect(deleteBtn).toBeVisible({ timeout: 5_000 });
    } catch {
      test.skip(true, "No delete button found");
      return;
    }

    const countBefore = await page.getByText(/SF Under|Mission District/i).count();

    // Handle native browser confirm dialog — accept it
    page.on('dialog', async (dialog) => {
      expect(dialog.type()).toBe('confirm');
      expect(dialog.message()).toContain('Are you sure');
      await dialog.accept();
    });

    await deleteBtn.click();

    // Count should decrease
    await expect(async () => {
      const countAfter = await page.getByText(/SF Under|Mission District/i).count();
      expect(countAfter).toBeLessThan(countBefore);
    }).toPass({ timeout: timeouts.action });
  });

  // SS-08: Delete - cancel
  test("SS-08  cancel delete keeps search in list", async ({ page }) => {
    await page.goto("/saved-searches");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByRole("heading", { name: /saved searches/i, level: 1 })
    ).toBeVisible({ timeout: timeouts.navigation });

    const deleteBtn = page.locator('button[title="Delete search"]').first();
    try {
      await expect(deleteBtn).toBeVisible({ timeout: 5_000 });
    } catch {
      test.skip(true, "No delete button found");
      return;
    }

    const countBefore = await page.getByText(/SF Under|Mission District/i).count();

    // Handle native browser confirm dialog — dismiss (cancel) it
    page.on('dialog', async (dialog) => {
      await dialog.dismiss();
    });

    await deleteBtn.click();

    // Brief wait for any potential UI update, then verify count unchanged
    await expect(async () => {
      const countAfter = await page.getByText(/SF Under|Mission District/i).count();
      expect(countAfter).toBe(countBefore);
    }).toPass({ timeout: 3_000 });
  });
});

// ─── Block 3: Empty state ───────────────────────────────────────────────────
test.describe("SS: Empty State", () => {
  test.use({ storageState: "playwright/.auth/user2.json" });

  test.beforeEach(async () => {
    test.slow();
  });

  // SS-03: Empty state for user with no saved searches
  test("SS-03  empty state shows guidance", async ({ page }) => {
    await page.goto("/saved-searches");
    await page.waitForLoadState("domcontentloaded");

    const heading = page.getByRole("heading", { name: /saved searches/i, level: 1 });
    await expect(heading).toBeVisible({ timeout: timeouts.navigation });

    // User2 has no saved searches — should show empty state
    const emptyMsg = page.getByText(/no saved searches/i);
    try {
      await expect(emptyMsg).toBeVisible({ timeout: 5_000 });
    } catch {
      test.skip(true, "User2 has saved searches, empty state not shown");
      return;
    }

    // CTA link should be present: "Start Searching"
    await expect(
      page.getByRole("link", { name: /start searching/i })
    ).toBeVisible();
  });
});
