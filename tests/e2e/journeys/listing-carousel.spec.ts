/**
 * E2E Test Suite: Listing Card Carousel
 *
 * Tests the image carousel functionality on listing cards:
 * - Carousel navigation with next/prev buttons
 * - Dot indicator navigation
 * - URL stability (navigation doesn't change URL)
 * - Single image cards don't show carousel controls
 */

import { test, expect, selectors, timeouts, tags, searchResultsContainer } from "../helpers";

test.describe("Listing Card Carousel", () => {
  // Run as anonymous user
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page, nav }) => {
    // Navigate to search page with some results
    await nav.goToSearch();

    // Wait for listings to load
    await expect(searchResultsContainer(page).locator(selectors.listingCard).first()).toBeVisible({
      timeout: timeouts.navigation,
    });
  });

  test(`${tags.anon} - Carousel shows controls on hover`, async ({ page }) => {
    // Find a listing card with the carousel (has multiple images)
    const carouselRegion = searchResultsContainer(page)
      .locator('[aria-label^="Image carousel"]')
      .first();

    // Skip if no carousels found (no listings with multiple images)
    const carouselCount = await carouselRegion.count();
    if (carouselCount === 0) {
      test.skip();
      return;
    }

    // Initially, navigation buttons should be hidden (opacity-0)
    const nextButton = carouselRegion.locator(
      'button[aria-label="Next image"]',
    );
    await expect(nextButton).toHaveCount(1);

    // The button's parent container should have opacity-0 initially
    const controlsContainer = carouselRegion.locator(".pointer-events-none");
    const initialClasses = await controlsContainer.getAttribute("class");
    expect(initialClasses).toContain("opacity-0");

    // Hover over the carousel
    await carouselRegion.hover();
    await page.waitForTimeout(timeouts.animation);

    // Controls should now be visible (opacity-100)
    const hoveredClasses = await controlsContainer.getAttribute("class");
    expect(hoveredClasses).toContain("opacity-100");
  });

  test(`${tags.anon} - Clicking next button changes image`, async ({
    page,
  }) => {
    const carouselRegion = searchResultsContainer(page)
      .locator('[aria-label^="Image carousel"]')
      .first();

    const carouselCount = await carouselRegion.count();
    if (carouselCount === 0) {
      test.skip();
      return;
    }

    // Store the current URL
    const initialUrl = page.url();

    // Hover to show controls
    await carouselRegion.hover();
    await page.waitForTimeout(timeouts.animation);

    // Find the dots indicator - first dot should be selected
    const dots = carouselRegion.locator('[role="tab"]');
    const dotCount = await dots.count();
    expect(dotCount).toBeGreaterThan(1);

    // First dot should be selected
    const firstDot = dots.first();
    await expect(firstDot).toHaveAttribute("aria-selected", "true");

    // Click next button
    const nextButton = carouselRegion.locator(
      'button[aria-label="Next image"]',
    );
    await nextButton.click();
    await page.waitForTimeout(timeouts.animation);

    // Second dot should now be selected
    const secondDot = dots.nth(1);
    await expect(secondDot).toHaveAttribute("aria-selected", "true");
    await expect(firstDot).toHaveAttribute("aria-selected", "false");

    // URL should not have changed
    expect(page.url()).toBe(initialUrl);
  });

  test(`${tags.anon} - Clicking dot navigates to image`, async ({ page }) => {
    const carouselRegion = searchResultsContainer(page)
      .locator('[aria-label^="Image carousel"]')
      .first();

    const carouselCount = await carouselRegion.count();
    if (carouselCount === 0) {
      test.skip();
      return;
    }

    // Store the current URL
    const initialUrl = page.url();

    // Hover to make dots easier to click
    await carouselRegion.hover();
    await page.waitForTimeout(timeouts.animation);

    // Click the second dot
    const dots = carouselRegion.locator('[role="tab"]');
    const dotCount = await dots.count();
    expect(dotCount).toBeGreaterThan(1);

    const secondDot = dots.nth(1);
    await secondDot.click();
    await page.waitForTimeout(timeouts.animation);

    // Second dot should be selected
    await expect(secondDot).toHaveAttribute("aria-selected", "true");

    // URL should not have changed
    expect(page.url()).toBe(initialUrl);
  });

  test(`${tags.anon} - Previous button appears after navigation`, async ({
    page,
  }) => {
    const carouselRegion = searchResultsContainer(page)
      .locator('[aria-label^="Image carousel"]')
      .first();

    const carouselCount = await carouselRegion.count();
    if (carouselCount === 0) {
      test.skip();
      return;
    }

    // Hover to show controls
    await carouselRegion.hover();
    await page.waitForTimeout(timeouts.animation);

    // Initially, previous button should not exist (we're on first image)
    const prevButton = carouselRegion.locator(
      'button[aria-label="Previous image"]',
    );
    await expect(prevButton).toHaveCount(0);

    // Click next to go to second image
    const nextButton = carouselRegion.locator(
      'button[aria-label="Next image"]',
    );
    await nextButton.click();
    await page.waitForTimeout(timeouts.animation);

    // Keep hovering to ensure controls stay visible
    await carouselRegion.hover();

    // Previous button should now be visible
    await expect(prevButton).toHaveCount(1);
  });

  test(`${tags.anon} ${tags.a11y} - Carousel has proper ARIA attributes`, async ({
    page,
  }) => {
    const carouselRegion = searchResultsContainer(page)
      .locator('[aria-label^="Image carousel"]')
      .first();

    const carouselCount = await carouselRegion.count();
    if (carouselCount === 0) {
      test.skip();
      return;
    }

    // Check carousel region has proper role
    await expect(carouselRegion).toHaveAttribute("role", "region");
    await expect(carouselRegion).toHaveAttribute(
      "aria-roledescription",
      "carousel",
    );

    // Check slides have proper roles
    const slides = carouselRegion.locator('[aria-roledescription="slide"]');
    const slideCount = await slides.count();
    expect(slideCount).toBeGreaterThan(0);

    // First slide should have proper aria-label
    const firstSlide = slides.first();
    const slideLabel = await firstSlide.getAttribute("aria-label");
    expect(slideLabel).toMatch(/Image \d+ of \d+/);

    // Dot navigation should have tablist role
    const tablist = carouselRegion.locator('[role="tablist"]');
    await expect(tablist).toHaveAttribute("aria-label", "Image navigation");
  });

  test(`${tags.anon} - Cards with single image don't show carousel`, async ({
    page,
  }) => {
    // Look for listing cards
    const cards = searchResultsContainer(page).locator(selectors.listingCard);
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThan(0);

    // Check each card - those without carousel region should have a simple image
    const firstCard = cards.first();
    const hasCarousel = await firstCard
      .locator('[aria-label^="Image carousel"]')
      .count();
    const hasSimpleImage = await firstCard.locator("img").count();

    // Every card should have either a carousel or a simple image
    expect(hasCarousel > 0 || hasSimpleImage > 0).toBe(true);

    // If no carousel, it should just be a single image (no nav controls)
    if (hasCarousel === 0) {
      const navButtons = await firstCard
        .locator('button[aria-label*="image"]')
        .count();
      expect(navButtons).toBe(0);
    }
  });
});
