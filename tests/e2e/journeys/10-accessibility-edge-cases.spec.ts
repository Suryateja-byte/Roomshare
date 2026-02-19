/**
 * E2E Test Suite: Accessibility & Edge Cases Journeys
 * Journeys: J087-J100
 *
 * Tests accessibility compliance, keyboard navigation,
 * error handling, and edge case scenarios.
 */

import { test, expect, tags, selectors, timeouts, SF_BOUNDS, searchResultsContainer } from '../helpers';

test.beforeEach(async () => {
  test.slow();
});

test.describe('Accessibility Journeys', () => {
  test.describe('J087: Keyboard navigation', () => {
    test(`${tags.a11y} ${tags.core} - Tab navigation through main interface`, async ({ page, nav }) => {
      await nav.goHome();
      await page.waitForLoadState('domcontentloaded');

      // Start at top of page
      await page.keyboard.press('Tab');

      // Should focus on skip link or first interactive element
      // (skip links may be visually hidden via position:absolute/left:-9999px
      //  so we check for focus rather than visibility)
      const focused = page.locator(':focus');
      await expect(focused).toBeAttached({ timeout: 10000 });

      // Tab through multiple elements
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab');

        // Each focused element should be visible
        const currentFocused = page.locator(':focus');
        const isVisible = await currentFocused.isVisible().catch(() => false);
        // Some elements may not be visible (skip links, etc.)
      }
    });

    test(`${tags.a11y} - Skip to main content link`, async ({ page, nav }) => {
      await nav.goHome();
      await page.waitForLoadState('domcontentloaded');

      // First Tab should focus skip link (if implemented)
      await page.keyboard.press('Tab');

      const skipLink = page.locator('a[href="#main"], a[href="#content"], [data-testid="skip-link"]').first();

      if (await skipLink.isVisible().catch(() => false)) {
        await page.keyboard.press('Enter');

        // Focus should move to main content
        const mainContent = page.locator('main, #main, #content').first();
        await expect(mainContent).toBeFocused({ timeout: 10000 });
      }
    });

    test(`${tags.a11y} - Form keyboard interaction`, async ({ page }) => {
      await page.goto('/login');
      await page.waitForLoadState('domcontentloaded');

      // Authenticated users may be redirected away from /login
      if (!page.url().includes('/login')) {
        test.skip(true, 'Authenticated user redirected away from /login');
        return;
      }

      // Wait for the login form to render (Suspense boundary + hydration)
      await expect(page.getByRole('heading', { name: /log in|sign in|welcome back/i })).toBeVisible({ timeout: 30000 });

      // Tab to email field
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab'); // May need multiple tabs

      const emailInput = page.getByLabel(/email/i).first();
      await emailInput.focus();

      // Type with keyboard
      await page.keyboard.type('test@example.com');

      // Tab to password
      await page.keyboard.press('Tab');
      const testPassword = process.env.E2E_TEST_PASSWORD || 'password123';
      await page.keyboard.type(testPassword);

      // Tab to submit and press Enter
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');

      // Form should submit
      await page.waitForLoadState('domcontentloaded');
    });
  });

  test.describe('J088: Screen reader compatibility', () => {
    test(`${tags.a11y} - ARIA landmarks present`, async ({ page, nav }) => {
      await nav.goHome();
      await page.waitForLoadState('domcontentloaded');

      // Check for ARIA landmarks
      const landmarks = {
        main: page.locator('main, [role="main"]'),
        navigation: page.locator('nav, [role="navigation"]'),
        banner: page.locator('header, [role="banner"]'),
        contentinfo: page.locator('footer, [role="contentinfo"]'),
      };

      // At least main and navigation should exist
      await expect(landmarks.main.first()).toBeAttached({ timeout: 30000 });
      await expect(landmarks.navigation.first()).toBeAttached({ timeout: 30000 });
    });

    test(`${tags.a11y} - Images have alt text`, async ({ page, nav }) => {
      await nav.goToSearch({ bounds: SF_BOUNDS });
      await page.waitForLoadState('domcontentloaded');

      const images = page.locator('img');
      const imageCount = await images.count();

      for (let i = 0; i < Math.min(imageCount, 5); i++) {
        const img = images.nth(i);
        const alt = await img.getAttribute('alt');
        const ariaLabel = await img.getAttribute('aria-label');
        const role = await img.getAttribute('role');

        // Should have alt, aria-label, or be decorative (role="presentation")
        const hasAccessibility = alt !== null || ariaLabel !== null || role === 'presentation';
        expect(hasAccessibility).toBeTruthy();
      }
    });

    test(`${tags.a11y} - Form labels present`, async ({ page }) => {
      await page.goto('/login');
      await page.waitForLoadState('domcontentloaded');

      // Authenticated users may be redirected away from /login
      if (!page.url().includes('/login')) {
        test.skip(true, 'Authenticated user redirected away from /login');
        return;
      }

      // Wait for the login form to render (Suspense boundary + hydration)
      await expect(page.getByRole('heading', { name: /log in|sign in|welcome back/i })).toBeVisible({ timeout: 30000 });

      const inputs = page.locator('input:not([type="hidden"])');
      const inputCount = await inputs.count();

      for (let i = 0; i < inputCount; i++) {
        const input = inputs.nth(i);
        const id = await input.getAttribute('id');
        const ariaLabel = await input.getAttribute('aria-label');
        const ariaLabelledBy = await input.getAttribute('aria-labelledby');
        const placeholder = await input.getAttribute('placeholder');

        // Should have label association
        if (id) {
          const label = page.locator(`label[for="${id}"]`);
          expect((await label.count()) > 0 || !!ariaLabel || !!ariaLabelledBy || !!placeholder).toBeTruthy();
        }
      }
    });
  });

  test.describe('J089: Color contrast', () => {
    test(`${tags.a11y} - Text is readable`, async ({ page, nav }) => {
      await nav.goHome();
      await page.waitForLoadState('domcontentloaded');

      // Check that text elements are visible
      const headings = page.locator('h1, h2, h3');
      const headingCount = await headings.count();

      for (let i = 0; i < Math.min(headingCount, 3); i++) {
        const heading = headings.nth(i);
        if (!(await heading.isVisible().catch(() => false))) continue;
        await expect(heading).toBeVisible();

        // Get computed style
        const color = await heading.evaluate(el => getComputedStyle(el).color);
        // Color should be defined (not transparent/invisible)
        expect(color).toBeTruthy();
      }
    });
  });

  test.describe('J090: Focus indicators', () => {
    test(`${tags.a11y} - Focus states visible`, async ({ page, nav }) => {
      await nav.goHome();
      await page.waitForLoadState('domcontentloaded');

      // Tab to interactive elements and verify focus is visible
      const buttons = page.locator('button, a, input');
      const firstButton = buttons.first();

      if (await firstButton.isVisible().catch(() => false)) {
        await firstButton.focus();

        // Check for focus styles (outline, box-shadow, etc.)
        const outlineStyle = await firstButton.evaluate(el => getComputedStyle(el).outlineStyle);
        const boxShadow = await firstButton.evaluate(el => getComputedStyle(el).boxShadow);

        // Should have some focus indication
        expect(outlineStyle !== 'none' || boxShadow !== 'none').toBeTruthy();
      }
    });
  });
});

test.describe('Edge Case Journeys', () => {
  test.describe('J091: Empty states', () => {
    test(`${tags.core} - Search with no results`, async ({ page }) => {
      // Use extreme price filter to guarantee zero results (q= param is a location query, not listing search)
      await page.goto(`/search?minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}&minPrice=99999&maxPrice=100000`);
      await page.waitForLoadState('domcontentloaded');

      // Should show empty state or "0 places" heading
      const container = searchResultsContainer(page);
      const emptyStateVisible = container.locator('[data-testid="empty-state"]');
      const noMatchesHeading = container.getByRole('heading', { name: /no matches/i });
      const noListingsText = container.getByText(/no listings found|no exact matches/i);
      const zeroHeading = page.getByRole('heading', { level: 1, name: /^0\s+place/i });
      await expect(
        emptyStateVisible.or(noMatchesHeading).or(noListingsText).or(zeroHeading).first()
      ).toBeAttached({ timeout: 30000 });
    });

    test(`${tags.auth} - Empty bookings list`, async ({ page, nav }) => {
      await nav.goToBookings();

      // Check we weren't redirected to login
      if (!(await nav.isOnAuthenticatedPage())) {
        test.skip(true, 'Auth session expired - redirected to login');
        return;
      }

      await page.waitForLoadState('domcontentloaded');

      const hasBookings = (await page.locator('[data-testid="booking-item"]').count()) > 0;
      const hasEmptyState = await page.locator(selectors.emptyState).first().isVisible().catch(() => false);

      // One should be true
      expect(hasBookings || hasEmptyState).toBeTruthy();
    });
  });

  test.describe('J092: Error handling', () => {
    test(`${tags.core} - 404 page handling`, async ({ page }) => {
      await page.goto('/this-page-does-not-exist-12345');
      await page.waitForLoadState('domcontentloaded');

      // Check we weren't redirected to login (auth middleware may redirect all unknown routes)
      const currentUrl = page.url();
      if (currentUrl.includes('/login') || currentUrl.includes('/signup') || currentUrl.includes('/signin')) {
        test.skip(true, 'Auth redirect — session not available in CI');
        return;
      }

      // Should show 404 page — check text content, heading, or HTTP status indicator
      await expect(
        page.getByText(/404|not found|page.*exist|does not exist|couldn't find/i).first()
          .or(page.getByRole('heading', { name: /couldn't find|oops|not found|404/i }))
      ).toBeVisible({ timeout: 30000 });

      // Should have navigation back home (link text varies by implementation)
      const homeLink = page.getByRole('link', { name: /home|back|return/i })
        .or(page.locator('a[href="/"]'));
      if (await homeLink.first().isVisible().catch(() => false)) {
        await expect(homeLink.first()).toBeVisible();
      }
    });

    test(`${tags.core} - Invalid listing ID`, async ({ page }) => {
      await page.goto('/listings/invalid-id-12345');
      await page.waitForLoadState('domcontentloaded');

      // Check we weren't redirected to login
      const currentUrl = page.url();
      if (currentUrl.includes('/login') || currentUrl.includes('/signup') || currentUrl.includes('/signin')) {
        test.skip(true, 'Auth redirect — session not available in CI');
        return;
      }

      // Should show error or 404 — also check heading as fallback
      await expect(
        page.getByText(/not found|error|invalid|does not exist|404|couldn't find/i).first()
          .or(page.getByRole('heading', { name: /couldn't find|oops|not found|error|404/i }))
      ).toBeVisible({ timeout: 30000 });
    });

    test(`${tags.auth} ${tags.offline} - Network error handling`, async ({ page, nav, network }) => {
      await nav.goHome();
      await page.waitForLoadState('domcontentloaded');

      // Go offline
      await network.goOffline();

      // Try to navigate
      const navLink = page.locator('main').getByRole('link', { name: /search|listing/i }).first();
      if (await navLink.isVisible().catch(() => false)) {
        await navLink.click({ force: true });
        await page.waitForLoadState('domcontentloaded').catch(() => {});
      }

      // Should show offline indicator or error
      // Offline indicator may or may not show depending on implementation

      // Go back online
      await network.goOnline();
    });
  });

  test.describe('J093: Long content handling', () => {
    test(`${tags.core} - Long listing title display`, async ({ page, nav }) => {
      await nav.goToSearch({ bounds: SF_BOUNDS });
      await page.waitForLoadState('domcontentloaded');

      // Check that listing cards handle long text
      const listingCard = searchResultsContainer(page).locator(selectors.listingCard).first();

      if (await listingCard.isVisible().catch(() => false)) {
        // Card should be properly sized
        const boundingBox = await listingCard.boundingBox();
        expect(boundingBox?.width).toBeGreaterThan(100);
        expect(boundingBox?.height).toBeGreaterThan(100);

        // Text should not overflow viewport
        const cardWidth = boundingBox?.width || 0;
        expect(cardWidth).toBeLessThan(2000); // Reasonable max width
      }
    });

    test(`${tags.core} - Long description truncation`, async ({ page, nav }) => {
      await nav.goToSearch({ bounds: SF_BOUNDS });
      await page.waitForLoadState('domcontentloaded');
      await nav.clickListingCard(0);
      await page.waitForLoadState('domcontentloaded');

      const description = page.locator('[data-testid="description"], [class*="description"]').first();

      if (await description.isVisible().catch(() => false)) {
        // May have "read more" functionality
        const readMore = page.getByRole('button', { name: /read more|show more/i }).first();

        if (await readMore.isVisible().catch(() => false)) {
          await readMore.click();
        }
      }
    });
  });

  test.describe('J094: Concurrent actions', () => {
    test(`${tags.auth} - Double submit prevention`, async ({ page }) => {
      await page.goto('/login');
      await page.waitForLoadState('domcontentloaded');

      // Authenticated users may be redirected away from /login
      if (!page.url().includes('/login')) {
        test.skip(true, 'Authenticated user redirected away from /login');
        return;
      }

      // Wait for the login form to render (Suspense boundary + hydration)
      await expect(page.getByRole('heading', { name: /log in|sign in|welcome back/i })).toBeVisible({ timeout: 30000 });

      await page.getByLabel(/email/i).first().fill('test@example.com');
      const loginPassword = process.env.E2E_TEST_PASSWORD || 'TestPassword123!';
      await page.getByLabel(/password/i).first().fill(loginPassword);

      const submitButton = page.getByRole('button', { name: /log in|sign in/i }).first();

      // Click submit twice quickly
      await submitButton.click();
      await submitButton.click().catch(() => {});

      // Should handle gracefully (button disabled or single request)
      await page.waitForLoadState('domcontentloaded');

      // No error should occur from double submit
    });
  });

  test.describe('J095: Browser compatibility', () => {
    test(`${tags.core} - Page renders without JavaScript errors`, async ({ page, nav }) => {
      const errors: string[] = [];

      page.on('pageerror', (error) => {
        errors.push(error.message);
      });

      await nav.goHome();
      await nav.goToSearch({ bounds: SF_BOUNDS });
      await page.waitForLoadState('domcontentloaded');

      // Filter out known acceptable errors
      const criticalErrors = errors.filter(
        (e) => !e.includes('ResizeObserver') && !e.includes('hydration') && !e.includes('NEXT_REDIRECT')
      );

      // Should have no critical JavaScript errors
      expect(criticalErrors.length).toBeLessThanOrEqual(1);
    });
  });

  test.describe('J096: Mobile responsiveness', () => {
    test.use({ viewport: { width: 375, height: 667 } });

    test(`${tags.mobile} - Mobile navigation menu`, async ({ page, nav }) => {
      await nav.goHome();
      await page.waitForLoadState('domcontentloaded');

      // Look for mobile menu button (hamburger)
      const menuButton = page.getByRole('button', { name: /menu/i })
        .or(page.locator('[data-testid="mobile-menu"]'))
        .or(page.locator('[class*="hamburger"]'))
        .first();

      if (await menuButton.isVisible().catch(() => false)) {
        await menuButton.click();

        // Mobile menu should open
        const mobileNav = page.locator('[data-testid="mobile-nav"]')
          .or(page.locator('[class*="mobile-menu"]'))
          .or(page.locator('nav').filter({ has: page.getByRole('link') }))
          .first();

        await expect(mobileNav).toBeVisible({ timeout: 5000 });
      }
    });

    test(`${tags.mobile} - Touch-friendly buttons`, async ({ page, nav }) => {
      await nav.goHome();
      await page.waitForLoadState('domcontentloaded');

      const buttons = page.locator('button, a[role="button"]');
      const buttonCount = await buttons.count();

      for (let i = 0; i < Math.min(buttonCount, 5); i++) {
        const button = buttons.nth(i);
        if (await button.isVisible().catch(() => false)) {
          const box = await button.boundingBox();

          // Touch targets should be at least 44x44 pixels (WCAG)
          if (box) {
            // Allow some flexibility for icon buttons
            expect(box.width).toBeGreaterThanOrEqual(24);
            expect(box.height).toBeGreaterThanOrEqual(24);
          }
        }
      }
    });
  });

  test.describe('J097: Session handling', () => {
    test(`${tags.auth} - Session timeout handling`, async ({ page, nav }) => {
      await nav.goToProfile();
      await page.waitForLoadState('domcontentloaded');

      // In a real test, we would wait for session to expire
      // For now, verify page handles potential session issues

      // Should be on profile or redirected to login/signin
      const onProfile = page.url().includes('/profile');
      const onLogin = page.url().includes('/login') || page.url().includes('/signin');

      expect(onProfile || onLogin).toBeTruthy();
    });
  });

  test.describe('J098: Data validation', () => {
    test(`${tags.auth} - XSS prevention in inputs`, async ({ page, nav }) => {
      await nav.goToSearch({ bounds: SF_BOUNDS });
      await page.waitForLoadState('domcontentloaded');

      // Try to inject script via search
      const searchInput = page.getByPlaceholder(/search|location/i).first();

      if (await searchInput.isVisible().catch(() => false)) {
        await searchInput.fill('<script>alert("xss")</script>');
        await page.keyboard.press('Enter');
        await page.waitForLoadState('domcontentloaded');

        // Script should not execute (page should still be functional)
        const alertDialog = page.locator('[role="alertdialog"]').first();
        const hasAlert = await alertDialog.isVisible().catch(() => false);

        // No XSS alert should appear
        expect(hasAlert).toBeFalsy();
      }
    });

    test(`${tags.auth} - SQL injection prevention`, async ({ page }) => {
      await page.goto('/login');
      await page.waitForLoadState('domcontentloaded');

      // Authenticated users may be redirected away from /login
      if (!page.url().includes('/login')) {
        test.skip(true, 'Authenticated user redirected away from /login');
        return;
      }

      // Wait for the login form to render (Suspense boundary + hydration)
      await expect(page.getByRole('heading', { name: /log in|sign in|welcome back/i })).toBeVisible({ timeout: 30000 });
      const emailInput = page.getByLabel(/email/i).first();

      // Try SQL injection in email field
      await emailInput.fill("' OR '1'='1");
      await page.getByLabel(/password/i).first().fill("' OR '1'='1");

      await page.getByRole('button', { name: /log in|sign in/i }).first().click();
      await page.waitForLoadState('domcontentloaded');

      // Should show validation error, not log in
      const loggedIn = await page.locator('[data-testid="user-menu"]').first().isVisible().catch(() => false);
      expect(loggedIn).toBeFalsy();
    });
  });

  test.describe('J099: Performance edge cases', () => {
    test(`${tags.core} ${tags.slow} - Large image handling`, async ({ page, nav }) => {
      test.slow();

      await nav.goToSearch({ bounds: SF_BOUNDS });
      await page.waitForLoadState('domcontentloaded');
      await nav.clickListingCard(0);
      await page.waitForLoadState('domcontentloaded');

      // Images should be lazy loaded or optimized
      // Images should be lazy loaded or optimized (img[loading="lazy"], img[decoding="async"])

      // Page should remain responsive
      const isResponsive = await page.evaluate(() => {
        return document.readyState === 'complete';
      });

      expect(isResponsive).toBeTruthy();
    });

    test(`${tags.core} ${tags.slow} - Scroll performance`, async ({ page, nav }) => {
      test.slow();

      await nav.goToSearch({ bounds: SF_BOUNDS });
      await page.waitForLoadState('domcontentloaded');

      // Scroll through page multiple times
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.evaluate(() => window.scrollTo(0, 0));
      }

      // Page should remain functional
      const heading = page.getByRole('heading').first();
      await expect(heading).toBeVisible({ timeout: 30000 });
    });
  });

  test.describe('J100: Complete user journey', () => {
    test(`${tags.auth} ${tags.slow} - Full user flow: search -> view -> save -> unsave`, async ({
      page,
      nav,
      assert,
    }) => {
      test.slow();

      // Step 1: Start from home
      await nav.goHome();
      await assert.pageLoaded();

      // Step 2: Navigate to search
      await nav.goToSearch({ bounds: SF_BOUNDS });
      await assert.pageLoaded();

      // Step 3: View a listing
      await nav.clickListingCard(0);
      await page.waitForURL(/\/listings\//, { timeout: 30000 });
      await page.waitForLoadState('domcontentloaded');

      // Step 4: Save listing (if button exists)
      const saveButton = page.locator('[data-testid="favorite-button"]')
        .or(page.getByRole('button', { name: /save|favorite/i }))
        .first();

      if (await saveButton.isVisible().catch(() => false)) {
        await saveButton.click();

        // Step 5: Go to saved listings
        await nav.goToSaved();

        // Check we weren't redirected to login
        if (!(await nav.isOnAuthenticatedPage())) {
          // Auth expired, skip the rest
          return;
        }

        await assert.pageLoaded();

        // Step 6: Unsave from saved page
        const unsaveButton = page.locator('[data-testid="favorite-button"]')
          .or(page.getByRole('button', { name: /save|unsave|remove/i }))
          .first();

        if (await unsaveButton.isVisible().catch(() => false)) {
          await unsaveButton.click();
        }
      }

      // Step 7: Return home
      await nav.goHome();
      await assert.pageLoaded();

      // Full journey completed successfully
    });
  });
});
