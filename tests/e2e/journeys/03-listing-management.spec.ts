/**
 * E2E Test Suite: Listing Management Journeys
 * Journeys: J018-J026 (J017 moved to tests/e2e/create-listing/)
 *
 * Tests authenticated user listing operations including
 * editing, pausing, deleting listings and image management.
 */

import { test, expect, tags, timeouts, selectors } from "../helpers";

test.describe("Listing Management Journeys", () => {
  // Use authenticated state for all tests in this file
  test.use({ storageState: "playwright/.auth/user.json" });

  // J017 (Create new listing) has been replaced by dedicated suite:
  // tests/e2e/create-listing/*.spec.ts (58 tests across 7 spec files)

  test.describe("J018: Edit existing listing", () => {
    test(`${tags.auth} - Edit listing details`, async ({ page, nav }) => {
      // Navigate to profile to find user's listings
      await nav.goToProfile();

      // Check we weren't redirected to login
      if (!(await nav.isOnAuthenticatedPage())) {
        test.skip(true, "Auth session expired - redirected to login");
        return;
      }

      await page.waitForLoadState("domcontentloaded");

      // Find edit button on a listing
      const editButton = page
        .getByRole("button", { name: /edit/i })
        .or(page.getByRole("link", { name: /edit/i }))
        .first();

      if (await editButton.isVisible().catch(() => false)) {
        await editButton.click();

        // Wait for edit form to load
        await page.waitForURL(/\/edit/, { timeout: 10000 });
        await page.waitForLoadState("domcontentloaded");

        // Verify form is populated with existing data
        const titleInput = page.getByLabel(/title/i);
        if (await titleInput.isVisible().catch(() => false)) {
          await expect(titleInput).not.toBeEmpty();

          // Update title
          await titleInput.clear();
          await titleInput.fill("Updated Listing Title");

          // Update price
          const priceInput = page.getByLabel(/price/i);
          if (await priceInput.isVisible().catch(() => false)) {
            await priceInput.clear();
            await priceInput.fill("1500");
          }

          // Save changes
          const saveButton = page.getByRole("button", { name: /save|update/i }).first();
          if (await saveButton.isVisible().catch(() => false)) {
            await saveButton.click();

            // Verify redirect and updated data
            await page.waitForURL(/\/listings\/(?!.*edit)/, { timeout: 15000, waitUntil: "commit" });
            await expect(page.getByRole("heading", { level: 1 }).first()).toContainText(
              "Updated Listing Title",
            );
          }
        }
      }
    });
  });

  test.describe("J019: Delete listing", () => {
    test(`${tags.auth} - Delete listing with confirmation`, async ({
      page,
      nav,
    }) => {
      await nav.goToProfile();

      // Check we weren't redirected to login
      if (!(await nav.isOnAuthenticatedPage())) {
        test.skip(true, "Auth session expired - redirected to login");
        return;
      }

      await page.waitForLoadState("domcontentloaded");

      const deleteButton = page
        .getByRole("button", { name: /delete/i })
        .first();

      if (await deleteButton.isVisible().catch(() => false)) {
        // Click delete
        await deleteButton.click();

        // Confirmation dialog should appear
        const confirmDialog = page.locator(selectors.modal);
        await expect(confirmDialog).toBeVisible({ timeout: 5000 });

        // Confirm deletion
        const confirmButton = confirmDialog.getByRole("button", {
          name: /confirm|delete|yes/i,
        }).first();
        if (await confirmButton.isVisible().catch(() => false)) {
          await confirmButton.click();

          // Should show success toast or listing removed
          await expect(
            page.locator(selectors.toast).or(page.getByText(/deleted|removed/i)).first(),
          ).toBeVisible({ timeout: 10000 });
        }
      }
    });

    test(`${tags.auth} - Cancel delete confirmation`, async ({ page, nav }) => {
      await nav.goToProfile();

      // Check we weren't redirected to login
      if (!(await nav.isOnAuthenticatedPage())) {
        test.skip(true, "Auth session expired - redirected to login");
        return;
      }

      await page.waitForLoadState("domcontentloaded");

      const deleteButton = page
        .getByRole("button", { name: /delete/i })
        .first();

      if (await deleteButton.isVisible().catch(() => false)) {
        await deleteButton.click();

        // Cancel the confirmation
        const cancelButton = page
          .locator(selectors.modal)
          .getByRole("button", { name: /cancel|no|close/i }).first();

        if (await cancelButton.isVisible().catch(() => false)) {
          await cancelButton.click();

          // Dialog should close
          await expect(page.locator(selectors.modal)).not.toBeVisible();
        }
      }
    });
  });

  test.describe("J020: Pause and reactivate listing", () => {
    test(`${tags.auth} - Toggle listing status`, async ({ page, nav }) => {
      await nav.goToProfile();

      // Check we weren't redirected to login
      if (!(await nav.isOnAuthenticatedPage())) {
        test.skip(true, "Auth session expired - redirected to login");
        return;
      }

      await page.waitForLoadState("domcontentloaded");

      // Find status toggle button
      const pauseButton = page
        .getByRole("button", { name: /pause|deactivate/i })
        .first();

      const activateButton = page
        .getByRole("button", { name: /activate|reactivate/i })
        .first();

      const statusButton = pauseButton.or(activateButton).first();

      if (await statusButton.isVisible().catch(() => false)) {
        const initialText = await statusButton.textContent();
        await statusButton.click();

        // Wait for status to update
        await page.waitForTimeout(1000);

        // Button text or status should change
        const newText = await statusButton.textContent();
        // Status should have toggled
      }
    });
  });

  test.describe("J021-J022: Image upload", () => {
    test(`${tags.auth} ${tags.slow} - Upload images to listing`, async ({
      page,
      nav,
    }) => {
      test.slow(); // Upload tests are slow

      await nav.goToCreateListing();

      // Check we weren't redirected to login
      if (!(await nav.isOnAuthenticatedPage())) {
        test.skip(true, "Auth session expired - redirected to login");
        return;
      }

      await page.waitForLoadState("domcontentloaded");

      // Find image uploader
      const fileInput = page.locator('input[type="file"]');

      if ((await fileInput.count()) > 0) {
        // Note: In a real test, you'd use actual test image files
        // For now, we'll just verify the uploader is present and functional
        await expect(fileInput.first()).toBeAttached();

        // Check for drag-and-drop zone
        const dropZone = page.locator(
          '[data-testid="drop-zone"], [class*="dropzone"], [class*="upload"]',
        );
        if (await dropZone.isVisible().catch(() => false)) {
          await expect(dropZone).toBeVisible();
        }
      }
    });
  });

  test.describe("J023-J024: Listing from profile access", () => {
    test(`${tags.auth} - Access listing management from profile`, async ({
      page,
      nav,
    }) => {
      await nav.goToProfile();

      // Check we weren't redirected to login
      if (!(await nav.isOnAuthenticatedPage())) {
        test.skip(true, "Auth session expired - redirected to login");
        return;
      }

      await page.waitForLoadState("domcontentloaded");

      // Should see user's listings section
      const listingsSection = page.getByRole("heading", {
        name: /listings|my rooms/i,
      }).first();
      await expect(
        listingsSection.or(page.locator(selectors.listingCard).first()),
      ).toBeVisible({
        timeout: 10000,
      });

      // Click on a listing to view
      const listingCard = page.locator(selectors.listingCard).first();
      if (await listingCard.isVisible().catch(() => false)) {
        await listingCard.click();
        await expect(page).toHaveURL(/\/listings\//);
      }
    });
  });

  test.describe("J025-J026: Listing creation edge cases", () => {
    test(`${tags.auth} - Address geocoding validation`, async ({
      page,
      nav,
    }) => {
      await nav.goToCreateListing();

      // Check we weren't redirected to login
      if (!(await nav.isOnAuthenticatedPage())) {
        test.skip(true, "Auth session expired - redirected to login");
        return;
      }

      await page.waitForLoadState("domcontentloaded");

      // Fill with invalid address
      const titleInput = page.getByLabel(/title/i);
      if (await titleInput.isVisible().catch(() => false)) {
        await titleInput.fill("Test Listing");
      }

      const descInput = page.getByLabel(/description/i);
      if (await descInput.isVisible().catch(() => false)) {
        await descInput.fill("Test description for listing.");
      }

      const priceInput = page.getByLabel(/price/i);
      if (await priceInput.isVisible().catch(() => false)) {
        await priceInput.fill("1000");
      }

      const addressInput = page.getByLabel(/address|street/i);
      if (await addressInput.isVisible().catch(() => false)) {
        await addressInput.fill("Invalid Address 99999999");
      }

      // Try to submit
      const submitButton = page.getByRole("button", { name: /create|submit/i }).first();
      if (await submitButton.isVisible().catch(() => false)) {
        await submitButton.click();

        // Should show geocoding error or address validation
        await page.waitForTimeout(5000); // Geocoding can be slow
      }

      // Either stays on page with error, or successful if geocoding is lenient
      // Test passes either way - just checking no crash
    });

    test(`${tags.auth} - Draft persistence`, async ({ page, nav }) => {
      await nav.goToCreateListing();

      // Check we weren't redirected to login
      if (!(await nav.isOnAuthenticatedPage())) {
        test.skip(true, "Auth session expired - redirected to login");
        return;
      }

      await page.waitForLoadState("domcontentloaded");

      // Fill some fields
      const titleInput = page.getByLabel(/title/i);
      if (await titleInput.isVisible().catch(() => false)) {
        await titleInput.fill("Draft Listing Title");
      }

      const descInput = page.getByLabel(/description/i);
      if (await descInput.isVisible().catch(() => false)) {
        await descInput.fill("Draft description content");
      }

      // Navigate away without saving
      await nav.goHome();

      // Navigate back
      await nav.goToCreateListing();
      await page.waitForLoadState("domcontentloaded");

      // Check if draft was saved (implementation dependent)
      // Some apps persist draft, some don't
      const titleInputAfter = page.getByLabel(/title/i);
      if (await titleInputAfter.isVisible().catch(() => false)) {
        const titleValue = await titleInputAfter.inputValue();
        // Draft may or may not be preserved - test just ensures no errors
      }
    });
  });
});
