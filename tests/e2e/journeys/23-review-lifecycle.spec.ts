/**
 * Review Lifecycle Journeys (J28–J30)
 *
 * J28: Write a review on a listing
 * J29: Host responds to a review
 * J30: Review summary display
 */

import { test, expect, selectors, timeouts, SF_BOUNDS } from "../helpers";

// ─── J28: Write a Review ──────────────────────────────────────────────────────
test.describe("J28: Write a Review", () => {
  test("listing detail → reviews section → write review → submit → verify appears", async ({
    page,
    nav,
  }) => {
    // Step 1: Find a listing
    await nav.goToSearch({ bounds: SF_BOUNDS });
    await page.waitForTimeout(2000);

    const cards = page.locator(selectors.listingCard);
    test.skip((await cards.count()) === 0, "No listings — skipping");

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

    // Step 4: Look for "Write a review" button or form
    const writeBtn = page
      .getByRole("button", { name: /write.*review|add.*review|leave.*review/i })
      .or(page.locator('[data-testid="write-review"]'));

    const canWrite = await writeBtn.first().isVisible().catch(() => false);
    test.skip(!canWrite, "No write review button — may be own listing or already reviewed");

    await writeBtn.first().click();
    await page.waitForTimeout(1000);

    // Step 5: Fill review form
    // Star rating
    const stars = page.locator('[data-testid="star-rating"] button, [role="radio"], [aria-label*="star"]');
    if ((await stars.count()) > 0) {
      await stars.nth(4).click(); // 5 stars
    }

    // Comment
    const commentField = page
      .locator("textarea")
      .or(page.getByPlaceholder(/review|comment|feedback/i));
    if (await commentField.first().isVisible().catch(() => false)) {
      await commentField.first().fill("Excellent place! Very clean and well-maintained. E2E test review.");
    }

    // Submit
    const submitBtn = page.getByRole("button", { name: /submit|post|save/i }).first();
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

    const cards = page.locator(selectors.listingCard);
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

    const cards = page.locator(selectors.listingCard);
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
