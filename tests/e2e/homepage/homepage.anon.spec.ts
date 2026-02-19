/**
 * Homepage E2E Tests — Anonymous (unauthenticated) user
 *
 * Tests HP-01 through HP-08: hero section, trust indicators, features,
 * featured listings, search CTA, footer, and responsive layout.
 *
 * Runs under the `chromium-anon` project (no stored auth session).
 */

import { test, expect } from '../helpers';

test.describe('Homepage — Anonymous User', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
  });

  test('HP-01: Hero section renders with heading and search CTA', async ({ page }) => {
    // The hero has heading text "Love where you live."
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible({ timeout: 15000 });
    await expect(heading).toContainText(/love where/i);

    // Check for the tagline subheading text
    await expect(
      page.getByText(/curated spaces/i)
        .or(page.getByText(/compatible people/i))
        .or(page.getByText(/sanctuary/i))
        .first()
    ).toBeVisible();

    // Check Sign Up Free CTA for non-logged-in users
    await expect(
      page.getByRole('link', { name: /sign up/i })
        .or(page.getByText(/sign up free/i))
        .first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('HP-02: Trust indicators visible', async ({ page }) => {
    // Check for trust/stat indicators — "No fees", "Verified users", "Flexible leases"
    // These appear in the sign-up CTA box for anon users
    await expect(
      page.getByText(/no fees/i)
        .or(page.getByText(/verified/i))
        .or(page.getByText(/flexible/i))
        .first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('HP-03: Features section visible with feature cards', async ({ page }) => {
    // Features section heading: "Everything you need."
    await expect(
      page.getByText(/everything you need/i)
        .or(page.getByText(/verified trust/i))
        .first()
    ).toBeVisible({ timeout: 10000 });

    // Check for at least one feature card description
    await expect(
      page.getByText(/instant match/i)
        .or(page.getByText(/lifestyle fit/i))
        .or(page.getByText(/verified trust/i))
        .first()
    ).toBeVisible();
  });

  test('HP-04: Featured listings section renders with listing cards', async ({ page }) => {
    // FeaturedListings rendered via Suspense — wait for cards or empty state
    // Cards use data-testid="listing-card" and link to /listings/
    await expect(
      page.locator('[data-testid="listing-card"]')
        .or(page.locator('a[href*="/listings/"]'))
        .or(page.getByText(/newest listings/i))
        .or(page.getByText(/be the first to list/i))
        .first()
    ).toBeVisible({ timeout: 20000 });
  });

  test('HP-05: Featured listing card click navigates to listing detail', async ({ page }) => {
    // Wait for listing cards to appear (may be empty state if no seed data)
    const listingCard = page.locator('[data-testid="listing-card"]').first();
    const hasCards = await listingCard.isVisible({ timeout: 20000 }).catch(() => false);

    if (hasCards) {
      // Find the link inside the listing card
      const cardLink = listingCard.locator('a[href*="/listings/"]').first();
      await expect(cardLink).toBeVisible({ timeout: 5000 });
      await cardLink.click();
      await page.waitForURL(/\/listings\//, { timeout: 15000 });
      await expect(page).toHaveURL(/\/listings\//);
    } else {
      // Empty state — "Be the First to List" with link to /listings/create
      const createLink = page.getByRole('link', { name: /list your room/i })
        .or(page.locator('a[href*="/listings/create"]'))
        .first();
      await expect(createLink).toBeVisible({ timeout: 10000 });
    }
  });

  test('HP-06: Search CTA navigates to /search', async ({ page }) => {
    // The bottom CTA section has "Browse Listings" link pointing to /search
    const main = page.locator('main');
    const searchCta = main.getByRole('link', { name: /browse listings/i })
      .or(main.getByRole('link', { name: /view all listings/i }))
      .or(main.getByRole('link', { name: /search|find|explore/i }))
      .first();

    await expect(searchCta).toBeVisible({ timeout: 10000 });
    await searchCta.click();
    await page.waitForURL(/\/search/, { timeout: 15000 });
  });

  test('HP-07: Footer renders with links', async ({ page }) => {
    const footer = page.locator('footer').first();
    await expect(footer).toBeVisible({ timeout: 10000 });

    // Check for at least one link in the footer
    await expect(
      footer.getByRole('link').first()
    ).toBeVisible();
  });

  test('HP-08: Page responsive — mobile viewport shows stacked layout', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    // Hero heading should still be visible at mobile size
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible({ timeout: 15000 });

    // Content should not overflow horizontally
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5); // small tolerance
  });
});
