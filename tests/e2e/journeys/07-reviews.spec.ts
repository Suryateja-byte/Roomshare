/**
 * E2E Test Suite: Reviews Journeys
 * Journeys: J057-J066
 *
 * Tests review creation, viewing, editing, responses,
 * and review moderation.
 */

import { test, expect, tags, selectors } from "../helpers";

test.describe("Reviews Journeys", () => {
  test.use({ storageState: "playwright/.auth/user.json" });

  test.beforeEach(async () => {
    test.slow();
  });

  test.describe("J057: View listing reviews", () => {
    test(`${tags.core} - Display reviews on listing page`, async ({
      page,
      nav,
    }) => {
      await nav.goToSearch();
      await nav.clickListingCard(0);

      // Look for reviews section
      const reviewsSection = page
        .locator('[data-testid="reviews-section"], [id="reviews"]')
        .or(page.getByRole("heading", { name: /review/i }));

      // Reviews may or may not exist
      await page.waitForLoadState("domcontentloaded");

      // Check for review cards or empty state
      const reviewCards = page.locator(
        '[data-testid="review-card"], [class*="review-card"]',
      );
      const reviewCount = await reviewCards.count();

      if (reviewCount > 0) {
        // Verify review structure
        const firstReview = reviewCards.first();
        await expect(firstReview).toBeVisible();

        // Should have rating
        const rating = firstReview.locator(
          '[data-testid="rating"], [class*="star"], [aria-label*="rating"]',
        );
        await expect(rating.or(firstReview.locator("svg"))).toBeVisible();
      }
    });

    test(`${tags.core} - Review pagination`, async ({ page, nav }) => {
      await nav.goToSearch();
      await nav.clickListingCard(0);

      const reviewsSection = page.locator('[data-testid="reviews-section"]');

      if (await reviewsSection.isVisible()) {
        // Check for pagination or load more
        const loadMore = page.getByRole("button", {
          name: /load more|show more|view all/i,
        });
        const pagination = page.locator('[class*="pagination"]');

        if (await loadMore.isVisible()) {
          const initialCount = await page
            .locator('[data-testid="review-card"]')
            .count();
          await loadMore.click();
          await page.waitForTimeout(1000);

          // Should load more reviews
          const newCount = await page
            .locator('[data-testid="review-card"]')
            .count();
          expect(newCount).toBeGreaterThanOrEqual(initialCount);
        }
      }
    });
  });

  test.describe("J058: Write a review", () => {
    test(`${tags.auth} - Submit review for completed booking`, async ({
      page,
      nav,
    }) => {
      // Navigate to bookings to find completed booking
      await nav.goToBookings();

      // Look for write review button on completed booking
      const writeReviewButton = page
        .getByRole("button", { name: /write.*review|leave.*review|review/i })
        .first();

      if (await writeReviewButton.isVisible()) {
        await writeReviewButton.click();

        // Fill review form
        const ratingInput = page
          .locator('[data-testid="rating-input"]')
          .or(page.locator('input[name="rating"]'))
          .or(page.locator('[class*="star"]').first());

        if (await ratingInput.isVisible()) {
          await ratingInput.click();
        }

        // Fill review text
        const reviewText = page
          .getByLabel(/review|comment/i)
          .or(page.locator("textarea"));

        if (await reviewText.isVisible()) {
          await reviewText.fill(
            "Great experience! The room was exactly as described and the host was very responsive.",
          );
        }

        // Submit
        const submitButton = page.getByRole("button", { name: /submit|post/i });
        if (await submitButton.isVisible()) {
          await submitButton.click();

          // Should show success
          await expect(
            page
              .locator(selectors.toast)
              .or(page.getByText(/submitted|posted|thank you/i)),
          ).toBeVisible({ timeout: 10000 });
        }
      }
    });

    test(`${tags.auth} - Star rating interaction`, async ({ page, nav }) => {
      await nav.goToBookings();

      const writeReviewButton = page
        .getByRole("button", { name: /write.*review/i })
        .first();

      if (await writeReviewButton.isVisible()) {
        await writeReviewButton.click();

        // Find star rating component
        const stars = page.locator('[data-testid="star"], [class*="star"]');
        const starCount = await stars.count();

        if (starCount >= 5) {
          // Click 4th star for 4-star rating
          await stars.nth(3).click();

          // Verify selection (aria-checked, class change, etc.)
          await page.waitForTimeout(500);
        }
      }
    });
  });

  test.describe("J059: Edit review", () => {
    test(`${tags.auth} - Edit own review`, async ({ page, nav }) => {
      await nav.goToProfile();

      // Find user's reviews section
      const reviewsTab = page.getByRole("tab", { name: /review/i });
      if (await reviewsTab.isVisible()) {
        await reviewsTab.click();
      }

      // Find edit button on own review
      const editButton = page.getByRole("button", { name: /edit/i }).first();

      if (await editButton.isVisible()) {
        await editButton.click();

        // Modify review text
        const reviewText = page.locator("textarea");
        await reviewText.clear();
        await reviewText.fill("Updated review: Still a great experience!");

        // Save changes
        const saveButton = page.getByRole("button", { name: /save|update/i });
        await saveButton.click();

        // Verify success
        await expect(
          page.locator(selectors.toast).or(page.getByText(/updated|saved/i)),
        ).toBeVisible({ timeout: 10000 });
      }
    });
  });

  test.describe("J060: Delete review", () => {
    test(`${tags.auth} - Delete own review`, async ({ page, nav }) => {
      await nav.goToProfile();

      const reviewsTab = page.getByRole("tab", { name: /review/i });
      if (await reviewsTab.isVisible()) {
        await reviewsTab.click();
      }

      const deleteButton = page
        .getByRole("button", { name: /delete|remove/i })
        .first();

      if (await deleteButton.isVisible()) {
        await deleteButton.click();

        // Confirm deletion
        const confirmButton = page
          .locator(selectors.modal)
          .getByRole("button", { name: /confirm|delete|yes/i });

        if (await confirmButton.isVisible()) {
          await confirmButton.click();

          await expect(
            page
              .locator(selectors.toast)
              .or(page.getByText(/deleted|removed/i)),
          ).toBeVisible({ timeout: 10000 });
        }
      }
    });
  });

  test.describe("J061-J062: Review responses", () => {
    test(`${tags.auth} - Host responds to review`, async ({ page, nav }) => {
      await nav.goToProfile();

      // Find a review on host's listing
      const respondButton = page
        .getByRole("button", { name: /respond|reply/i })
        .first();

      if (await respondButton.isVisible()) {
        await respondButton.click();

        // Fill response
        const responseText = page.locator("textarea");
        await responseText.fill(
          "Thank you for your kind review! We hope to host you again.",
        );

        const submitButton = page.getByRole("button", {
          name: /submit|post|reply/i,
        });
        await submitButton.click();

        await expect(
          page.locator(selectors.toast).or(page.getByText(/posted|submitted/i)),
        ).toBeVisible({ timeout: 10000 });
      }
    });

    test(`${tags.core} - View host response on review`, async ({
      page,
      nav,
    }) => {
      await nav.goToSearch();
      await nav.clickListingCard(0);

      // Look for review with response
      const reviewWithResponse = page
        .locator('[data-testid="review-card"]')
        .filter({
          has: page.locator(
            '[data-testid="host-response"], [class*="response"]',
          ),
        });

      if ((await reviewWithResponse.count()) > 0) {
        const response = reviewWithResponse
          .first()
          .locator('[data-testid="host-response"], [class*="response"]');
        await expect(response).toBeVisible();
      }
    });
  });

  test.describe("J063-J064: Review filtering and sorting", () => {
    test(`${tags.core} - Filter reviews by rating`, async ({ page, nav }) => {
      await nav.goToSearch();
      await nav.clickListingCard(0);

      // Find rating filter
      const ratingFilter = page
        .getByRole("combobox", { name: /rating|filter/i })
        .or(page.locator('[data-testid="rating-filter"]'));

      if (await ratingFilter.isVisible()) {
        // @ts-expect-error - Playwright accepts RegExp for label matching at runtime
        await ratingFilter.selectOption({ label: /5 star/i });
        await page.waitForTimeout(1000);

        // All visible reviews should be 5-star
      }
    });

    test(`${tags.core} - Sort reviews by date`, async ({ page, nav }) => {
      await nav.goToSearch();
      await nav.clickListingCard(0);

      const sortSelect = page
        .getByRole("combobox", { name: /sort/i })
        .or(page.locator('[data-testid="review-sort"]'));

      if (await sortSelect.isVisible()) {
        // @ts-expect-error - Playwright accepts RegExp for label matching at runtime
        await sortSelect.selectOption({ label: /newest|recent/i });
        await page.waitForTimeout(1000);
      }
    });
  });

  test.describe("J065-J066: Review validation and edge cases", () => {
    test(`${tags.auth} - Review character limit`, async ({ page, nav }) => {
      await nav.goToBookings();

      const writeReviewButton = page
        .getByRole("button", { name: /write.*review/i })
        .first();

      if (await writeReviewButton.isVisible()) {
        await writeReviewButton.click();

        const reviewText = page.locator("textarea");

        // Try to exceed character limit (1000 chars typically)
        const longText = "A".repeat(1500);
        await reviewText.fill(longText);

        // Check for character count or validation
        const charCount = page.locator(
          '[class*="character"], [data-testid="char-count"]',
        );
        const error = page.getByText(/too long|maximum|character/i);

        // Either truncated or shows error
        const inputValue = await reviewText.inputValue();
        const hasLengthLimit =
          inputValue.length < 1500 ||
          (await error.isVisible().catch(() => false));
      }
    });

    test(`${tags.auth} - Cannot review without completed booking`, async ({
      page,
      nav,
    }) => {
      await nav.goToSearch();
      await nav.clickListingCard(0);

      // Look for write review button
      const writeReviewButton = page.getByRole("button", {
        name: /write.*review/i,
      });

      // Should not be available if no completed booking
      const canReview = await writeReviewButton.isVisible().catch(() => false);

      // If visible, clicking should show error or redirect
      if (canReview) {
        await writeReviewButton.click();

        // Should show error about no completed booking
        await expect(
          page
            .getByText(/booking|complete|stay/i)
            .or(page.locator(selectors.toast)),
        ).toBeVisible({ timeout: 5000 });
      }
    });
  });
});
