/**
 * E2E Test Suite: Create Listing – Resilience & Edge Cases
 *
 * Tests API failure handling, rate limiting, auth expiry, abuse prevention,
 * double-submit protection, timeouts, and malformed responses.
 *
 * IDs: R-001 through R-011
 */

import { test, expect, tags, timeouts } from '../helpers/test-utils';
import { CreateListingPage, CreateListingData } from '../page-objects/create-listing.page';
import type { ListingData } from '../helpers/data-helpers';

test.describe('Create Listing – Resilience', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  let createPage: CreateListingPage;

  /** Map data-helper ListingData to POM CreateListingData */
  function toPomData(d: ListingData): CreateListingData {
    return {
      title: d.title,
      description: d.description,
      price: d.price,
      totalSlots: '2',
      address: d.address,
      city: d.city,
      state: d.state,
      zipCode: d.zipCode,
      roomType: d.roomType,
      moveInDate: d.moveInDate,
    };
  }

  /** Shared setup: instantiate POM, navigate, fill form, mock image upload */
  async function setupFilledForm(
    page: import('@playwright/test').Page,
    formData: CreateListingData,
  ) {
    const cp = new CreateListingPage(page);
    await cp.goto();
    await cp.fillRequiredFields(formData);
    await cp.mockImageUpload();
    await cp.uploadTestImage();
    // Wait for image preview to render
    await page.waitForTimeout(500);
    return cp;
  }

  // ────────────────────────────────────────────────
  // R-001: API returns 500 Internal Server Error
  // ────────────────────────────────────────────────
  test('R-001: shows error banner on 500 server error and preserves form', async ({
    page,
    data,
  }) => {
    const listingData = data.generateListingData();
    const formData = toPomData(listingData);
    createPage = await setupFilledForm(page, formData);

    // Mock the API to return 500 before submitting
    await createPage.mockListingApiError(500, { error: 'Internal server error' });

    await createPage.submitAndWaitForResponse();

    // Error banner should appear
    await createPage.expectErrorBanner(/internal server error/i);

    // Should stay on create page
    await createPage.expectOnCreatePage();

    // Form data should be preserved
    await expect(createPage.titleInput).toHaveValue(listingData.title);
  });

  // ────────────────────────────────────────────────
  // R-002: API returns 429 Rate Limit
  // ────────────────────────────────────────────────
  test('R-002: shows rate limit message on 429 and preserves form', async ({
    page,
    data,
  }) => {
    const listingData = data.generateListingData();
    const formData = toPomData(listingData);
    createPage = await setupFilledForm(page, formData);

    await createPage.mockListingApiError(429, {
      error: 'Rate limit exceeded. Try again later.',
    });

    await createPage.submitAndWaitForResponse();

    await createPage.expectErrorBanner(/rate limit/i);
    await createPage.expectOnCreatePage();
    await expect(createPage.titleInput).toHaveValue(listingData.title);
  });

  // ────────────────────────────────────────────────
  // R-003: API returns 401 Auth Expired
  // ────────────────────────────────────────────────
  test('R-003: handles 401 auth expired with error or redirect', async ({
    page,
    data,
  }) => {
    const listingData = data.generateListingData();
    const formData = toPomData(listingData);
    createPage = await setupFilledForm(page, formData);

    await createPage.mockListingApiError(401, { error: 'Not authenticated' });

    await createPage.submitAndWaitForResponse();

    // Either an error banner is shown OR user is redirected to login
    const errorVisible = await createPage.errorBanner.isVisible().catch(() => false);
    const onLoginPage = page.url().includes('/login') || page.url().includes('/sign-in');

    expect(errorVisible || onLoginPage).toBe(true);
  });

  // ────────────────────────────────────────────────
  // R-004: API returns 403 Account Suspended
  // ────────────────────────────────────────────────
  test('R-004: shows suspension error on 403 and preserves form', async ({
    page,
    data,
  }) => {
    const listingData = data.generateListingData();
    const formData = toPomData(listingData);
    createPage = await setupFilledForm(page, formData);

    await createPage.mockListingApiError(403, { error: 'Your account is suspended' });

    await createPage.submitAndWaitForResponse();

    await createPage.expectErrorBanner(/suspended/i);
    await createPage.expectOnCreatePage();
    await expect(createPage.titleInput).toHaveValue(listingData.title);
  });

  // ────────────────────────────────────────────────
  // R-005: Discriminatory Language Guard
  // ────────────────────────────────────────────────
  test('R-005: server rejects discriminatory language in description', async ({
    page,
    data,
  }) => {
    const listingData = data.generateListingData({
      description: 'English speakers only, no foreigners allowed. Americans only.',
    });
    const formData = toPomData(listingData);

    createPage = new CreateListingPage(page);
    await createPage.goto();
    await createPage.fillRequiredFields(formData);

    // Mock image upload so it doesn't depend on real upload infra
    await createPage.mockImageUpload();
    await createPage.uploadTestImage();
    await page.waitForTimeout(500);

    const response = await createPage.submitAndWaitForResponse();

    // Server should reject — either with language compliance error or other validation
    expect(response.ok()).toBe(false);
    await createPage.expectOnCreatePage();

    // Error banner or field error should be visible
    const errorVisible = await createPage.errorBanner.isVisible().catch(() => false);
    const fieldErrorVisible = await page.locator('[role="alert"]').first().isVisible().catch(() => false);
    expect(errorVisible || fieldErrorVisible).toBe(true);
  });

  // ────────────────────────────────────────────────
  // R-006: Geocoding Failure
  // ────────────────────────────────────────────────
  test('R-006: shows address error on geocoding failure and preserves form', async ({
    page,
    data,
  }) => {
    const listingData = data.generateListingData();
    const formData = toPomData(listingData);
    createPage = await setupFilledForm(page, formData);

    await createPage.mockListingApiError(400, { error: 'Could not verify address' });

    await createPage.submitAndWaitForResponse();

    await createPage.expectErrorBanner(/address/i);
    await createPage.expectOnCreatePage();
    await expect(createPage.titleInput).toHaveValue(listingData.title);
  });

  // ────────────────────────────────────────────────
  // R-007: Maximum Listings Reached
  // ────────────────────────────────────────────────
  test('R-007: shows limit message when max listings reached', async ({
    page,
    data,
  }) => {
    const listingData = data.generateListingData();
    const formData = toPomData(listingData);
    createPage = await setupFilledForm(page, formData);

    await createPage.mockListingApiError(400, {
      error: 'Maximum 10 active listings reached',
    });

    await createPage.submitAndWaitForResponse();

    await createPage.expectErrorBanner(/maximum.*listing/i);
    await createPage.expectOnCreatePage();
    await expect(createPage.titleInput).toHaveValue(listingData.title);
  });

  // ────────────────────────────────────────────────
  // R-008: Double Submit Prevention
  // ────────────────────────────────────────────────
  test('R-008: double-click submit only fires one API call', async ({
    page,
    data,
  }) => {
    const listingData = data.generateListingData();
    const formData = toPomData(listingData);
    createPage = await setupFilledForm(page, formData);

    // Set up call counter (this also mocks the API with 200 responses)
    const getCallCount = await createPage.countListingApiCalls();

    // Double-click the submit button
    await createPage.submitButton.dblclick();

    // Give time for any duplicate requests to fire
    await page.waitForTimeout(1000);

    // Only one API call should have been made
    expect(getCallCount()).toBe(1);
  });

  // ────────────────────────────────────────────────
  // R-009: Network Timeout / Aborted Request
  // ────────────────────────────────────────────────
  test('R-009: handles network timeout gracefully and preserves form', async ({
    page,
    data,
  }) => {
    const listingData = data.generateListingData();
    const formData = toPomData(listingData);
    createPage = await setupFilledForm(page, formData);

    // Abort POST requests to simulate a timeout
    await page.route('**/api/listings', async (route) => {
      if (route.request().method() === 'POST') {
        await route.abort('timedout');
      } else {
        await route.continue();
      }
    });

    await createPage.submit();

    // Wait for the error to surface
    await createPage.expectErrorBanner();
    await createPage.expectOnCreatePage();
    await expect(createPage.titleInput).toHaveValue(listingData.title);
  });

  // ────────────────────────────────────────────────
  // R-010: Slow API Response (loading state)
  // ────────────────────────────────────────────────
  test('R-010: shows loading spinner and disables submit during slow response', async ({
    page,
    data,
  }) => {
    const listingData = data.generateListingData();
    const formData = toPomData(listingData);
    createPage = await setupFilledForm(page, formData);

    // Mock a slow 5-second response
    await createPage.mockListingApiSlow(5000);

    // Click submit (don't wait for response — we want to check intermediate state)
    await createPage.submit();

    // The submit button should show a loading state (Loader2 spinner) and be disabled
    await expect(createPage.submitButton).toBeDisabled({ timeout: 2000 });

    // Check for loading indicator inside the button (Loader2 has animate-spin class)
    const spinnerInButton = createPage.submitButton.locator('.animate-spin, svg.lucide-loader-2, svg[class*="animate"]');
    await expect(spinnerInButton).toBeVisible({ timeout: 2000 });
  });

  // ────────────────────────────────────────────────
  // R-011: Malformed (HTML) Response
  // ────────────────────────────────────────────────
  test('R-011: handles malformed HTML response gracefully', async ({
    page,
    data,
  }) => {
    const listingData = data.generateListingData();
    const formData = toPomData(listingData);
    createPage = await setupFilledForm(page, formData);

    // Mock API to return HTML instead of JSON
    await page.route('**/api/listings', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: '<html><body>Server Error</body></html>',
        });
      } else {
        await route.continue();
      }
    });

    await createPage.submit();

    // Client tries res.json() which throws; catch shows error
    await createPage.expectErrorBanner();
    await createPage.expectOnCreatePage();
    await expect(createPage.titleInput).toHaveValue(listingData.title);
  });
});
