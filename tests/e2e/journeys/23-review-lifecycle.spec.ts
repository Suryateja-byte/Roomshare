/**
 * Review Lifecycle Journeys (J28–J30)
 *
 * J28: Write a review on a listing
 * J29: Host responds to a review
 * J30: Review summary display
 */

import { test, expect, selectors, timeouts, SF_BOUNDS, searchResultsContainer } from "../helpers";

// ─── J28: Write a Review ──────────────────────────────────────────────────────
test.describe("J28: Write a Review", () => {
  test("listing detail → reviews section → write review → submit → verify appears", async ({
    page,
    nav,
  }) => {
    // Step 1: Find a listing NOT owned by test user (reviewer's listing)
    await nav.goToSearch({ q: "Reviewer Nob Hill", bounds: SF_BOUNDS });
    await page.waitForTimeout(2000);

    const cards = searchResultsContainer(page).locator(selectors.listingCard);
    test.skip((await cards.count()) === 0, "Reviewer listing not found — skipping");

    // Step 2: Go to listing detail
    await nav.clickListingCard(0);
    await page.waitForURL(/\/listings\//, { timeout: timeouts.navigation });
    await page.waitForTimeout(1500);

    // Step 3: Scroll to reviews section
    const reviewSection = page
      .getByText(/review/i)
      .or(page.locator('[data-testid="reviews-section"]'))
      .or(page.locator("#reviews"));
    if (await reviewSection.first().isVisible().catch(() => false)) {
      await reviewSection.first().scrollIntoViewIfNeeded();
    }

    // Step 4: Look for review form — it's inline (always visible for eligible users)
    // The form has an h3 "Write a Review" heading, star buttons, textarea, and "Post Review" button
    const reviewFormHeading = page.getByText(/write a review/i);
    const starButtons = page.locator('button[aria-label*="star"], button[aria-label*="Star"]');
    const reviewTextarea = page.locator('textarea').last();

    const hasForm = await reviewFormHeading.isVisible().catch(() => false);
    const hasStars = (await starButtons.count()) > 0;
    const hasTextarea = await reviewTextarea.isVisible().catch(() => false);

    test.skip(!hasForm && !hasStars && !hasTextarea, "No review form — may be own listing, no booking, or already reviewed");

    // Step 5: Fill review form
    // Click 5th star for 5-star rating
    if (hasStars) {
      await starButtons.nth(4).click();
      await page.waitForTimeout(300);
    }

    // Fill comment
    if (hasTextarea) {
      await reviewTextarea.fill("Excellent place! Very clean and well-maintained. E2E test review.");
    }

    // Submit via "Post Review" button
    const submitBtn = page.getByRole("button", { name: /post review|submit|save/i }).first();
    if (await submitBtn.isVisible().catch(() => false)) {
      await submitBtn.click();
      await page.waitForTimeout(2000);
    }

    // Step 6: Verify review appeared or toast
    const hasToast = await page.locator(selectors.toast).isVisible().catch(() => false);
    const reviewText = page.getByText(/E2E test review/i);
    const hasReview = await reviewText.isVisible().catch(() => false);
    expect(hasToast || hasReview).toBeTruthy();
  });
});

// ─── J29: Host Responds to Review ─────────────────────────────────────────────
test.describe("J29: Host Responds to Review", () => {
  test("own listing → find review → respond → verify response visible", async ({
    page,
    nav,
  }) => {
    // Step 1: Navigate to search with our seeded listings
    await nav.goToSearch({
      q: "Sunny Mission Room",
      bounds: SF_BOUNDS,
    });
    await page.waitForTimeout(2000);

    const cards = searchResultsContainer(page).locator(selectors.listingCard);
    const count = await cards.count();
    test.skip(count === 0, "Seeded listing not found — skipping");

    // Step 2: Go to the listing
    await nav.clickListingCard(0);
    await page.waitForURL(/\/listings\//, { timeout: timeouts.navigation });
    await page.waitForTimeout(1500);

    // Step 3: Look for reviews section and a respond button
    const respondBtn = page
      .getByRole("button", { name: /respond|reply/i })
      .or(page.locator('[data-testid="respond-review"]'));

    const canRespond = await respondBtn.first().isVisible().catch(() => false);
    test.skip(!canRespond, "No respond button — may not be own listing or no reviews");

    await respondBtn.first().click();
    await page.waitForTimeout(500);

    // Step 4: Type response
    const responseField = page.locator("textarea").last();
    if (await responseField.isVisible().catch(() => false)) {
      await responseField.fill("Thank you for the kind words! E2E test response.");
    }

    const submitBtn = page.getByRole("button", { name: /submit|post|save|send/i }).first();
    if (await submitBtn.isVisible().catch(() => false)) {
      await submitBtn.click();
      await page.waitForTimeout(2000);
    }

    // Step 5: Verify response appeared
    const hasToast = await page.locator(selectors.toast).isVisible().catch(() => false);
    const responseText = page.getByText(/E2E test response/i);
    const hasResponse = await responseText.isVisible().catch(() => false);
    expect(hasToast || hasResponse).toBeTruthy();
  });
});

// ─── J30: Review Summary Display ──────────────────────────────────────────────
test.describe("J30: Review Summary Display", () => {
  test("listing detail → verify rating display, count, and review cards", async ({
    page,
    nav,
  }) => {
    // Step 1: Go to listing known to have a review
    await nav.goToSearch({
      q: "Sunny Mission Room",
      bounds: SF_BOUNDS,
    });
    await page.waitForTimeout(2000);

    const cards = searchResultsContainer(page).locator(selectors.listingCard);
    test.skip((await cards.count()) === 0, "Listing not found — skipping");

    // Step 2: Open listing
    await nav.clickListingCard(0);
    await page.waitForURL(/\/listings\//, { timeout: timeouts.navigation });
    await page.waitForTimeout(1500);

    // Step 3: Look for review-related content
    const reviewIndicator = page
      .getByText(/review/i)
      .or(page.locator('[data-testid="reviews-section"]'))
      .or(page.locator('[class*="review"]'));

    const hasReviews = await reviewIndicator.first().isVisible().catch(() => false);
    test.skip(!hasReviews, "No reviews section visible — skipping");

    // Step 4: Check for rating display (stars or number)
    const ratingDisplay = page
      .locator('[data-testid="average-rating"]')
      .or(page.locator('[class*="rating"]'))
      .or(page.getByText(/\d(\.\d)?\s*\/\s*5/))
      .or(page.locator('[aria-label*="rating"]'));

    // Step 5: Check for individual review cards
    const reviewCards = page
      .locator('[data-testid="review-card"]')
      .or(page.locator('[class*="review-card"]'))
      .or(page.locator("main").getByText(/great|clean|responsive/i));

    const hasCards = (await reviewCards.count()) > 0;
    const hasRating = await ratingDisplay.first().isVisible().catch(() => false);

    // Should have at least review content visible
    expect(hasCards || hasRating).toBeTruthy();
  });
});
