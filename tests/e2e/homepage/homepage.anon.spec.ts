/**
 * Homepage E2E Tests — Anonymous (unauthenticated) user
 *
 * Tests HP-01 through HP-08: hero section, trust indicators, features,
 * featured listings, search CTA, footer, and responsive layout.
 *
 * Runs under the `chromium-anon` project (no stored auth session).
 */

import { test, expect } from "../helpers";

test.describe("Homepage — Anonymous User", () => {
  test.beforeEach(async ({ page }) => {
    // Disable Framer Motion animations in CI — JS-driven animations
    // (requestAnimationFrame) don't reliably complete in headless browsers,
    // leaving elements at opacity:0 and failing toBeVisible assertions.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
  });

  test("HP-01: Hero section renders with heading and search CTA", async ({
    page,
  }) => {
    // The hero has heading text "Finding Your People, Not Just a Place"
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible({ timeout: 15000 });
    await expect(heading).toContainText(/finding.*people/i);

    // Check for the tagline subheading text
    await expect(
      page
        .getByText(/verified roommates/i)
        .or(page.getByText(/real listings/i))
        .or(page.getByText(/actually show up/i))
        .first()
    ).toBeVisible();

    // Check sign-up CTA for non-logged-in users
    await expect(
      page
        .getByRole("link", { name: /create an account/i })
        .or(page.getByRole("link", { name: /sign up/i }))
        .first()
    ).toBeVisible({ timeout: 10000 });
  });

  test("HP-02: Trust indicators visible", async ({ page }) => {
    // Check for trust/stat indicators — "No fees", "Verified users", "Flexible leases"
    // These appear in the sign-up CTA box for anon users
    await expect(
      page
        .getByText(/no fees/i)
        .or(page.getByText(/verified/i))
        .or(page.getByText(/flexible/i))
        .first()
    ).toBeVisible({ timeout: 10000 });
  });

  test("HP-03: Features section visible with feature cards", async ({
    page,
  }) => {
    // Features section heading — renamed to "Cozy Spaces, Real People"
    await expect(
      page
        .getByText(/cozy spaces/i)
        .or(page.getByText(/why roomshare/i))
        .or(page.getByText(/real people/i))
        .first()
    ).toBeVisible({ timeout: 10000 });

    // Check for at least one feature card description
    await expect(
      page
        .getByText(/no catfishing/i)
        .or(page.getByText(/matched on what matters/i))
        .or(page.getByText(/filters that actually/i))
        .first()
    ).toBeVisible();
  });

  test("HP-04: Featured listings section renders with listing cards", async ({
    page,
  }) => {
    test.slow();
    // Framer Motion uses whileInView + initial="hidden" for featured listings.
    // <MotionConfig reducedMotion="user"> (Providers.tsx:17) + _disableAnimations
    // fixture (emulates prefers-reduced-motion: reduce) makes transitions instant,
    // but IntersectionObserver must still fire to trigger the variant switch.
    // Use scrollIntoViewIfNeeded to reliably trigger IntersectionObserver.
    const section = page.locator('[data-testid="featured-listings-section"]');
    await section.waitFor({ state: "attached", timeout: 20_000 });
    await section.scrollIntoViewIfNeeded();
    // Wait for IntersectionObserver + Framer Motion whileInView to complete.
    // Double-rAF is unreliable in headless CI (50-200ms IO callback delay).
    // Instead, poll for the actual style change (opacity !== '0') which signals
    // the animation variant has been applied.
    await page.waitForFunction(
      () => {
        const el = document.querySelector(
          '[data-testid="featured-listings-section"] [data-testid="listing-card"]'
        );
        if (!el) {
          // No listing cards — may be empty state, which is also valid
          const emptyText = document.querySelector(
            '[data-testid="featured-listings-section"]'
          )?.textContent ?? '';
          return /latest curated spaces|be the first to share/i.test(emptyText);
        }
        return getComputedStyle(el).opacity !== '0';
      },
      { timeout: 20_000 }
    );

    await expect(
      page
        .locator('[data-testid="listing-card"]')
        .or(page.getByText(/latest curated spaces/i))
        .or(page.getByText(/be the first to share/i))
        .first()
    ).toBeVisible({ timeout: 20000 });
  });

  test("HP-05: Featured listing card click navigates to listing detail", async ({
    page,
  }) => {
    // Wait for listing cards to appear (may be empty state if no seed data)
    const listingCard = page.locator('[data-testid="listing-card"]').first();
    const hasCards = await listingCard
      .isVisible({ timeout: 20000 })
      .catch(() => false);

    if (hasCards) {
      // Find the link inside the listing card
      const cardLink = listingCard.locator('a[href*="/listings/"]').first();
      await expect(cardLink).toBeVisible({ timeout: 5000 });
      await cardLink.click();
      await page.waitForURL(/\/listings\//, { timeout: 15000 });
      await expect(page).toHaveURL(/\/listings\//);
    } else {
      // Empty state — "Be the First to List" with link to /listings/create
      const createLink = page
        .getByRole("link", { name: /list your room/i })
        .or(page.locator('a[href*="/listings/create"]'))
        .first();
      await expect(createLink).toBeVisible({ timeout: 10000 });
    }
  });

  test("HP-06: Search CTA navigates to /search", async ({ page }) => {
    // The bottom CTA section has a link pointing to /search
    const main = page.locator("main");
    const searchCta = main
      .getByRole("link", { name: /see rooms near you/i })
      .or(main.getByRole("link", { name: /browse listings/i }))
      .or(main.getByRole("link", { name: /view all listings/i }))
      .or(main.getByRole("link", { name: /search|find|explore/i }))
      .first();

    await expect(searchCta).toBeVisible({ timeout: 10000 });
    await searchCta.click();
    await page.waitForURL(/\/search/, { timeout: 15000 });
  });

  test("HP-07: Footer renders with links", async ({ page }) => {
    const footer = page.locator("footer").first();
    await expect(footer).toBeVisible({ timeout: 10000 });

    // Check for at least one link in the footer
    await expect(footer.getByRole("link").first()).toBeVisible();
  });

  test("HP-08: Page responsive — mobile viewport shows stacked layout", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    // Hero heading should still be visible at mobile size
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible({ timeout: 15000 });

    // Content should not overflow horizontally
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5); // small tolerance
  });
});
