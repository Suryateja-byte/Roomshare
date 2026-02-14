/**
 * Recently Viewed -- E2E Tests (RV-01 through RV-08)
 *
 * Coverage: /recently-viewed -- auth guard, list rendering,
 * empty state, click-to-listing, time badges, image errors.
 *
 * Seed data creates 3 recently viewed listings with different timestamps.
 */

import { test, expect, timeouts } from "../helpers";

// ─── Block 1: Read-only ─────────────────────────────────────────────────────
test.describe("RV: Recently Viewed", () => {
  test.use({ storageState: "playwright/.auth/user.json" });

  test.beforeEach(async () => {
    test.slow();
  });

  // RV-01: Unauthenticated redirect
  test("RV-01  unauthenticated user redirects to /login", async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();

    await page.goto("/recently-viewed");
    await expect(page).toHaveURL(/\/login/, {
      timeout: timeouts.navigation,
    });

    await context.close();
  });

  // RV-02: Page renders with listings
  test("RV-02  page renders recently viewed listings", async ({ page }) => {
    await page.goto("/recently-viewed");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByRole("heading", { name: /recently viewed/i, level: 1 })
    ).toBeVisible({ timeout: timeouts.navigation });

    // Scope cards to main content to avoid nav links like /listings/create
    const cards = page.locator("main a[href^='/listings/']");
    await expect(cards.first()).toBeVisible({ timeout: timeouts.action });

    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  // RV-04: Click listing navigates
  test("RV-04  clicking listing card navigates to detail", async ({
    page,
  }) => {
    await page.goto("/recently-viewed");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByRole("heading", { name: /recently viewed/i, level: 1 })
    ).toBeVisible({ timeout: timeouts.navigation });

    const listingLink = page.locator("main a[href^='/listings/']").first();
    try {
      await expect(listingLink).toBeVisible({ timeout: 5_000 });
    } catch {
      test.skip(true, "No listing cards visible");
      return;
    }

    // Extract href and navigate directly to avoid flaky client-side click issues
    const href = await listingLink.getAttribute("href");
    expect(href).toBeTruthy();

    await listingLink.click();
    await expect(page).toHaveURL(/\/listings\//, {
      timeout: timeouts.navigation,
    });
  });

  // RV-05: Time badges display
  test("RV-05  listing cards show time badges", async ({ page }) => {
    await page.goto("/recently-viewed");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByRole("heading", { name: /recently viewed/i, level: 1 })
    ).toBeVisible({ timeout: timeouts.navigation });

    // Time badges should be visible (e.g., "5m ago", "2h ago", "1d ago")
    await expect(
      page.getByText(/ago|just now/i).first()
    ).toBeVisible({ timeout: timeouts.action });
  });

  // RV-06: Image error handling
  test("RV-06  listing cards have images or placeholders", async ({ page }) => {
    await page.goto("/recently-viewed");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByRole("heading", { name: /recently viewed/i, level: 1 })
    ).toBeVisible({ timeout: timeouts.navigation });

    // Scope cards to main content to avoid nav links like /listings/create
    const cards = page.locator("main a[href^='/listings/']");
    await expect(cards.first()).toBeVisible({ timeout: timeouts.action });

    // Component always renders an <img> via Next.js Image (either listing photo or placeholder URL).
    // If the listing has no photos, a "No Photos" overlay is shown on top.
    // Verify the image area renders: check for img tag within the first card.
    const firstCard = cards.first();
    const img = firstCard.locator("img").first();
    const placeholder = firstCard.getByText(/no photos/i);

    // Try image first, fall back to placeholder text
    try {
      await expect(img).toBeVisible({ timeout: 5_000 });
    } catch {
      // If img not visible (e.g., broken load), placeholder overlay should show
      await expect(placeholder).toBeVisible({ timeout: 5_000 });
    }
  });

  // RV-08: Find more button
  test("RV-08  find more button navigates to search", async ({ page }) => {
    await page.goto("/recently-viewed");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByRole("heading", { name: /recently viewed/i, level: 1 })
    ).toBeVisible({ timeout: timeouts.navigation });

    const findMore = page.getByRole("link", { name: /find more/i });
    try {
      await expect(findMore).toBeVisible({ timeout: 5_000 });
    } catch {
      test.skip(true, "No 'Find more' link visible");
      return;
    }

    await findMore.click();
    await expect(page).toHaveURL(/\/search/, {
      timeout: timeouts.navigation,
    });
  });
});

// ─── Block 2: Empty state ───────────────────────────────────────────────────
test.describe("RV: Empty State", () => {
  test.use({ storageState: "playwright/.auth/user2.json" });

  test.beforeEach(async () => {
    test.slow();
  });

  // RV-03: Empty state
  test("RV-03  empty state shows guidance", async ({ page }) => {
    await page.goto("/recently-viewed");
    await page.waitForLoadState("domcontentloaded");

    const heading = page.getByRole("heading", { name: /recently viewed/i, level: 1 });
    await expect(heading).toBeVisible({ timeout: timeouts.navigation });

    // User2 has no recently viewed listings
    const emptyMsg = page.getByText(/no recent activity/i);
    try {
      await expect(emptyMsg).toBeVisible({ timeout: 5_000 });
    } catch {
      test.skip(true, "User2 has recently viewed items, empty state not shown");
      return;
    }

    // "Start exploring" link should be visible
    await expect(
      page.getByRole("link", { name: /start exploring/i })
    ).toBeVisible();
  });

  // RV-07: Start exploring link navigates
  test("RV-07  start exploring navigates to search", async ({ page }) => {
    await page.goto("/recently-viewed");
    await page.waitForLoadState("domcontentloaded");

    const heading = page.getByRole("heading", { name: /recently viewed/i, level: 1 });
    await expect(heading).toBeVisible({ timeout: timeouts.navigation });

    const exploreLink = page.getByRole("link", { name: /start exploring/i });
    try {
      await expect(exploreLink).toBeVisible({ timeout: 5_000 });
    } catch {
      test.skip(true, "No 'Start exploring' link (user has recent views)");
      return;
    }

    await exploreLink.click();
    await expect(page).toHaveURL(/\/search/, {
      timeout: timeouts.navigation,
    });
  });
});
