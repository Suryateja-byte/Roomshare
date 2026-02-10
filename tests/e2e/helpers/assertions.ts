import { Page, expect, Locator } from '@playwright/test';
import { selectors, timeouts, searchResultsContainer } from './test-utils';

/**
 * Custom assertion helpers
 */
export function assertionHelpers(page: Page) {
  return {
    /**
     * Assert page has loaded successfully (no error state)
     */
    async pageLoaded() {
      // Check no error message is visible (ignore empty Next.js dev overlay alerts)
      const errorMessage = page.locator(selectors.errorMessage);
      const hasError = await errorMessage.isVisible().catch(() => false);

      if (hasError) {
        const errorText = (await errorMessage.textContent())?.trim();
        // Skip empty alerts (Next.js dev overlay creates an empty [role="alert"])
        if (errorText) {
          throw new Error(`Page loaded with error: ${errorText}`);
        }
      }

      // Wait for loading spinners to disappear
      const spinner = page.locator(selectors.loadingSpinner);
      if (await spinner.isVisible().catch(() => false)) {
        await spinner.waitFor({ state: 'hidden', timeout: timeouts.navigation });
      }
    },

    /**
     * Assert toast notification appeared
     */
    async toastAppeared(type: 'success' | 'error' | 'any' = 'any') {
      const selector =
        type === 'success'
          ? selectors.toastSuccess
          : type === 'error'
            ? selectors.toastError
            : selectors.toast;

      await expect(page.locator(selector).first()).toBeVisible({ timeout: 5000 });
    },

    /**
     * Assert toast with specific message
     */
    async toastWithMessage(message: string | RegExp) {
      const toast = page.locator(selectors.toast);
      await expect(toast.filter({ hasText: message })).toBeVisible({ timeout: 5000 });
    },

    /**
     * Assert modal is open
     */
    async modalOpen() {
      await expect(page.locator(selectors.modal)).toBeVisible();
    },

    /**
     * Assert modal is closed
     */
    async modalClosed() {
      await expect(page.locator(selectors.modal)).not.toBeVisible();
    },

    /**
     * Assert listings are displayed
     */
    async listingsDisplayed(minCount = 1) {
      const container = searchResultsContainer(page);
      const cards = container.locator(selectors.listingCard);
      await expect(cards.first()).toBeVisible({ timeout: 10000 });
      const count = await cards.count();
      expect(count).toBeGreaterThanOrEqual(minCount);
      return count;
    },

    /**
     * Assert empty state is shown
     */
    async emptyStateShown() {
      await expect(page.locator(selectors.emptyState)).toBeVisible();
    },

    /**
     * Assert form field has error
     */
    async fieldHasError(fieldName: string) {
      const field = page.getByLabel(new RegExp(fieldName, 'i'));
      await expect(field).toHaveAttribute('aria-invalid', 'true');
    },

    /**
     * Assert form is valid (no errors)
     */
    async formIsValid() {
      const invalidFields = page.locator('[aria-invalid="true"]');
      await expect(invalidFields).toHaveCount(0);
    },

    /**
     * Assert user is logged in
     */
    async isLoggedIn() {
      const userMenu = page
        .getByRole('button', { name: /menu|profile|account/i })
        .or(page.locator('[data-testid="user-menu"]'))
        .or(page.locator('[aria-label*="user"]'));

      await expect(userMenu.first()).toBeVisible({ timeout: 15000 });
    },

    /**
     * Assert user is logged out
     */
    async isLoggedOut() {
      const loginButton = page
        .getByRole('link', { name: /log ?in|sign ?in/i })
        .or(page.locator('a[href*="/login"]'));

      await expect(loginButton.first()).toBeVisible({ timeout: 15000 });
    },

    /**
     * Assert map is loaded
     */
    async mapLoaded() {
      const map = page.locator(selectors.map);
      await expect(map).toBeVisible({ timeout: 15000 });
    },

    /**
     * Assert map has markers
     */
    async mapHasMarkers(minCount = 1) {
      const markers = page.locator(selectors.mapMarker);
      await expect(markers.first()).toBeVisible({ timeout: 10000 });
      const count = await markers.count();
      expect(count).toBeGreaterThanOrEqual(minCount);
    },

    /**
     * Assert page title matches
     */
    async pageTitle(title: string | RegExp) {
      await expect(page).toHaveTitle(title);
    },

    /**
     * Assert heading is visible
     */
    async headingVisible(text: string | RegExp, level?: 1 | 2 | 3 | 4 | 5 | 6) {
      const heading = level
        ? page.locator(`h${level}`).filter({ hasText: text })
        : page.getByRole('heading', { name: text });
      await expect(heading).toBeVisible();
    },

    /**
     * Assert button is disabled
     */
    async buttonDisabled(name: string | RegExp) {
      const button = page.getByRole('button', { name });
      await expect(button).toBeDisabled();
    },

    /**
     * Assert button is enabled
     */
    async buttonEnabled(name: string | RegExp) {
      const button = page.getByRole('button', { name });
      await expect(button).toBeEnabled();
    },

    /**
     * Assert link exists
     */
    async linkExists(name: string | RegExp) {
      const link = page.getByRole('link', { name });
      await expect(link).toBeVisible();
    },

    /**
     * Assert element count
     */
    async elementCount(locator: Locator | string, expectedCount: number) {
      const element = typeof locator === 'string' ? page.locator(locator) : locator;
      await expect(element).toHaveCount(expectedCount);
    },

    /**
     * Assert text is visible somewhere on page
     */
    async textVisible(text: string | RegExp) {
      await expect(page.getByText(text)).toBeVisible();
    },

    /**
     * Assert text is not visible
     */
    async textNotVisible(text: string | RegExp) {
      await expect(page.getByText(text)).not.toBeVisible();
    },

    /**
     * Assert loading state completed
     */
    async loadingComplete() {
      const spinner = page.locator(selectors.loadingSpinner);
      await spinner.waitFor({ state: 'hidden', timeout: timeouts.navigation });
    },

    /**
     * Assert accessibility - check for common a11y issues
     */
    async basicA11y() {
      // Check for main landmark
      const main = page.locator('main, [role="main"]');
      await expect(main).toBeVisible();

      // Check for page heading
      const h1 = page.locator('h1');
      const headingCount = await h1.count();
      expect(headingCount).toBeGreaterThanOrEqual(1);

      // Check all images have alt text
      const images = page.locator('img:visible');
      const imageCount = await images.count();
      for (let i = 0; i < imageCount; i++) {
        const img = images.nth(i);
        const alt = await img.getAttribute('alt');
        const role = await img.getAttribute('role');
        // Images should have alt or role="presentation"
        expect(alt !== null || role === 'presentation').toBeTruthy();
      }

      // Check all form fields have labels
      const inputs = page.locator(
        'input:visible:not([type="hidden"]):not([type="submit"]):not([type="button"])'
      );
      const inputCount = await inputs.count();
      for (let i = 0; i < inputCount; i++) {
        const input = inputs.nth(i);
        const id = await input.getAttribute('id');
        const ariaLabel = await input.getAttribute('aria-label');
        const ariaLabelledBy = await input.getAttribute('aria-labelledby');
        const placeholder = await input.getAttribute('placeholder');

        const hasLabel =
          ariaLabel ||
          ariaLabelledBy ||
          placeholder ||
          (id && (await page.locator(`label[for="${id}"]`).count()) > 0);

        expect(hasLabel).toBeTruthy();
      }
    },

    /**
     * Assert element is focusable
     */
    async isFocusable(locator: Locator) {
      await locator.focus();
      await expect(locator).toBeFocused();
    },

    /**
     * Assert keyboard navigation works
     */
    async keyboardNavigable(
      elements: Locator[],
      options?: { useTab?: boolean; useArrows?: boolean }
    ) {
      const useTab = options?.useTab ?? true;

      for (let i = 0; i < elements.length; i++) {
        if (useTab && i > 0) {
          await page.keyboard.press('Tab');
        }
        await expect(elements[i]).toBeFocused();
      }
    },

    /**
     * Assert form submission succeeded
     */
    async formSubmitSucceeded() {
      // Check for success toast or redirect away from form
      const successToast = page.locator(selectors.toastSuccess);
      const successMessage = page.locator(selectors.successMessage);

      const hasSuccess =
        (await successToast.isVisible().catch(() => false)) ||
        (await successMessage.isVisible().catch(() => false));

      expect(hasSuccess).toBeTruthy();
    },

    /**
     * Assert price format is correct
     */
    async priceFormat(locator: Locator) {
      const text = await locator.textContent();
      expect(text).toMatch(/\$[\d,]+(\.\d{2})?/);
    },

    /**
     * Assert date format is correct
     */
    async dateFormat(locator: Locator, format: 'short' | 'long' = 'short') {
      const text = await locator.textContent();
      if (format === 'short') {
        // MM/DD/YYYY or similar
        expect(text).toMatch(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/);
      } else {
        // "January 1, 2024" or similar
        expect(text).toMatch(/[A-Z][a-z]+ \d{1,2}, \d{4}/);
      }
    },
  };
}
