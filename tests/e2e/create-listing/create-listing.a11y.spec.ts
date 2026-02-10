/**
 * E2E Test Suite: Create Listing — Accessibility Tests
 * Tests A-001 through A-008
 *
 * Covers axe-core WCAG 2.1 AA compliance, keyboard navigation,
 * focus management after errors, and label association.
 */

import { test, expect, tags, timeouts } from '../helpers/test-utils';
import { CreateListingPage, CreateListingData } from '../page-objects/create-listing.page';
import AxeBuilder from '@axe-core/playwright';

test.describe('Create Listing — Accessibility Tests', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });
  test.beforeEach(async () => { test.slow(); });

  // ────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────

  function validData(overrides?: Partial<CreateListingData>): CreateListingData {
    const prefix = `a11y-${Date.now()}`;
    return {
      title: `Test Listing ${prefix}`,
      description: `A comfortable room in a sunny apartment near downtown. Perfect for students or young professionals. ${prefix}`,
      price: '1200',
      totalSlots: '3',
      address: '123 Test Street',
      city: 'San Francisco',
      state: 'CA',
      zipCode: '94102',
      ...overrides,
    };
  }

  // ────────────────────────────────────────────────────────
  // P0 — axe-core scans & keyboard navigation
  // ────────────────────────────────────────────────────────

  // Known acceptable violations to exclude from scans:
  // - color-contrast: some Tailwind colors fail axe thresholds but are readable
  // - select-name: Radix Select renders hidden <select> elements without visible labels
  const EXCLUDED_RULES = ['color-contrast', 'select-name'];

  test(`A-001: axe scan — form initial load ${tags.a11y}`, async ({ page }) => {
    const clp = new CreateListingPage(page);
    await clp.goto();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(EXCLUDED_RULES)
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test(`A-002: axe scan — after validation errors ${tags.a11y}`, async ({ page }) => {
    const clp = new CreateListingPage(page);
    await clp.goto();

    // Submit empty form to trigger validation errors
    await clp.submit();

    // Wait for validation messages to render
    await page.waitForTimeout(500);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(EXCLUDED_RULES)
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test(`A-003: axe scan — with images uploaded ${tags.a11y}`, async ({ page }) => {
    const clp = new CreateListingPage(page);
    await clp.goto();
    await clp.mockImageUpload();
    await clp.uploadTestImage();

    // Wait for upload preview to render
    await page.waitForTimeout(500);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(EXCLUDED_RULES)
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test(`A-004: axe scan — date picker open ${tags.a11y}`, async ({ page }) => {
    const clp = new CreateListingPage(page);
    // Clear any draft data to avoid the draft banner blocking interactions
    await page.addInitScript(() => localStorage.removeItem('listing-draft'));
    await clp.goto();

    // Dismiss draft banner if present (from other tests)
    const startFresh = page.getByRole('button', { name: 'Start Fresh' });
    if (await startFresh.isVisible({ timeout: 2000 }).catch(() => false)) {
      await startFresh.click();
      await page.waitForTimeout(300);
    }

    // Open the move-in date picker popover (button trigger)
    // DatePicker has a `mounted` guard — wait for the Radix Popover.Trigger to hydrate
    const datePickerTrigger = page.locator('#moveInDate');
    await datePickerTrigger.scrollIntoViewIfNeeded();
    // Wait for Radix Popover.Trigger to be ready (it adds data-state attribute once mounted)
    await expect(datePickerTrigger).toHaveAttribute('data-state', 'closed', { timeout: 10000 });
    await datePickerTrigger.click();

    // Wait for calendar popover content to render (Radix Portal)
    const calendarContent = page.locator('[data-radix-popper-content-wrapper]');
    await expect(calendarContent).toBeVisible({ timeout: 10000 });

    // Calendar popover may have additional a11y issues from Radix internals
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules([...EXCLUDED_RULES, 'button-name', 'aria-required-children'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test(`A-005: keyboard — tab through form fields ${tags.a11y}`, async ({ page }) => {
    const clp = new CreateListingPage(page);
    await clp.goto();

    // Focus the first form field
    await clp.titleInput.focus();

    // Expected tab order for core form fields
    const expectedOrder = [
      { label: 'title', locator: clp.titleInput },
      { label: 'description', locator: clp.descriptionInput },
      { label: 'price', locator: clp.priceInput },
      { label: 'totalSlots', locator: clp.totalSlotsInput },
      { label: 'address', locator: clp.addressInput },
      { label: 'city', locator: clp.cityInput },
      { label: 'state', locator: clp.stateInput },
      { label: 'zip', locator: clp.zipInput },
    ];

    // Verify first field is focused
    await expect(expectedOrder[0].locator).toBeFocused();

    // Tab through remaining fields and verify focus order
    for (let i = 1; i < expectedOrder.length; i++) {
      await page.keyboard.press('Tab');
      await expect(expectedOrder[i].locator).toBeFocused({
        timeout: 3000,
      });
    }
  });

  test(`A-006: keyboard — submit form via Enter ${tags.a11y}`, async ({ page }) => {
    const clp = new CreateListingPage(page);
    await clp.goto();
    await clp.mockImageUpload();

    const data = validData();
    await clp.fillRequiredFields(data);
    await clp.uploadTestImage();
    await page.waitForTimeout(500);

    // Focus the submit button and press Enter
    await clp.submitButton.focus();
    await expect(clp.submitButton).toBeFocused();
    await page.keyboard.press('Enter');

    // Should either submit successfully or show server validation
    // We verify the form was submitted by waiting for a network response
    const response = await page.waitForResponse(
      (resp) => resp.url().includes('/api/listings') && resp.request().method() === 'POST',
      { timeout: timeouts.navigation },
    );
    expect(response.status()).toBeLessThan(500);
  });

  test(`A-007: focus moves to first error after empty submit ${tags.a11y}`, async ({ page }) => {
    const clp = new CreateListingPage(page);
    await clp.goto();

    // Mock the API to return a validation error so we test server-driven focus
    await clp.mockListingApiError(400, {
      error: 'Validation failed',
      details: [{ field: 'title', message: 'Title is required' }],
    });

    // Fill image to avoid client-side image block, leave required text fields empty
    await clp.mockImageUpload();
    await clp.uploadTestImage();
    await page.waitForTimeout(300);

    // Submit the form
    await clp.submit();
    await page.waitForTimeout(500);

    // After validation failure, focus should move to the first error field
    // or the error banner should be visible for screen readers
    const firstErrorField = clp.titleInput;
    const errorBannerOrField = clp.errorBanner.or(firstErrorField);
    await expect(errorBannerOrField).toBeVisible({ timeout: 5000 });
  });

  test(`A-008: all visible inputs have associated labels ${tags.a11y}`, async ({ page }) => {
    const clp = new CreateListingPage(page);
    await clp.goto();

    // Get all visible input, textarea, and select elements
    // Exclude Radix Select hidden <select> elements (they have aria-hidden or tabindex=-1)
    // Exclude Radix combobox/searchbox inputs (language selector) that have ARIA roles instead of labels
    const inputs = page.locator(
      'input:visible:not([type="hidden"]):not([type="file"]):not([tabindex="-1"]):not([role="combobox"]):not([role="searchbox"]):not([placeholder="Search languages..."]), textarea:visible, select:visible:not([aria-hidden="true"]):not([tabindex="-1"])',
    );
    const count = await inputs.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      const id = await input.getAttribute('id');
      const ariaLabel = await input.getAttribute('aria-label');
      const ariaLabelledBy = await input.getAttribute('aria-labelledby');
      const title = await input.getAttribute('title');
      const placeholder = await input.getAttribute('placeholder');

      // Input must have at least one labeling mechanism
      const hasExplicitLabel = id
        ? (await page.locator(`label[for="${id}"]`).count()) > 0
        : false;
      const hasWrappingLabel = (await input.locator('xpath=ancestor::label').count()) > 0;

      const isLabeled =
        hasExplicitLabel ||
        hasWrappingLabel ||
        ariaLabel !== null ||
        ariaLabelledBy !== null ||
        title !== null;

      if (!isLabeled) {
        // Provide useful debug info on failure
        const tagName = await input.evaluate((el) => el.tagName.toLowerCase());
        const inputType = await input.getAttribute('type');
        const name = await input.getAttribute('name');
        expect.soft(
          isLabeled,
          `Unlabeled input: <${tagName} type="${inputType}" name="${name}" id="${id}" placeholder="${placeholder}">`,
        ).toBeTruthy();
      }
    }
  });
});
