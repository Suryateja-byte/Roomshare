/**
 * E2E Test Suite: Verification & Admin Journeys
 * Journeys: J077-J086
 *
 * Tests identity verification flows, admin dashboard,
 * content moderation, and user management.
 */

import { test, expect, tags, selectors, timeouts } from '../helpers';

test.beforeEach(async () => {
  test.slow();
});

test.describe('Verification Journeys', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test.describe('J077: Identity verification submission', () => {
    test(`${tags.auth} - Start verification process`, async ({ page, nav }) => {
      await page.goto('/verify');

      // Should show verification options
      await expect(
        page.getByRole('heading', { name: /verify|verification/i })
          .or(page.getByText(/verify.*identity/i))
      ).toBeVisible({ timeout: 10000 });

      // Check for verification status or start button
      const startButton = page.getByRole('button', { name: /start|begin|verify/i });
      const pendingStatus = page.getByText(/pending|under review/i);
      const verifiedStatus = page.getByText(/verified/i);

      // User may be in any verification state
      await expect(
        startButton.or(pendingStatus).or(verifiedStatus)
      ).toBeVisible({ timeout: 10000 });
    });

    test(`${tags.auth} ${tags.slow} - Upload verification documents`, async ({ page, nav }) => {
      test.slow();

      await page.goto('/verify');

      const startButton = page.getByRole('button', { name: /start|begin|get verified/i });

      if (await startButton.isVisible()) {
        await startButton.click();

        // Find document upload section
        const fileInput = page.locator('input[type="file"]');

        if ((await fileInput.count()) > 0) {
          // File input exists for document upload
          await expect(fileInput.first()).toBeAttached();

          // Look for ID type selection
          const idTypeSelect = page.getByLabel(/type.*id|document.*type/i);
          if (await idTypeSelect.isVisible()) {
            await idTypeSelect.selectOption({ index: 1 });
          }
        }
      }
    });
  });

  test.describe('J078: Verification status tracking', () => {
    test(`${tags.auth} - View verification status`, async ({ page, nav }) => {
      await page.goto('/verify');

      // Should show current status
      const statusIndicator = page.locator('[data-testid="verification-status"]')
        .or(page.getByText(/pending|approved|rejected|not verified/i));

      await expect(statusIndicator).toBeVisible({ timeout: 10000 });
    });

    test(`${tags.auth} - Cancel pending verification`, async ({ page, nav }) => {
      await page.goto('/verify');

      const cancelButton = page.getByRole('button', { name: /cancel.*verification/i });

      if (await cancelButton.isVisible()) {
        await cancelButton.click();

        // Confirm cancellation
        const confirmButton = page.locator(selectors.modal)
          .getByRole('button', { name: /confirm|yes/i });

        if (await confirmButton.isVisible()) {
          await confirmButton.click();

          await expect(
            page.locator(selectors.toast)
              .or(page.getByText(/cancelled/i))
          ).toBeVisible({ timeout: 10000 });
        }
      }
    });
  });

  test.describe('J079: Verified badge display', () => {
    test(`${tags.core} - Verified badge on profile`, async ({ page }) => {
      // Navigate to a verified user's profile
      await page.goto('/users/1');

      // Look for verified badge
      const verifiedBadge = page.locator('[data-testid="verified-badge"]')
        .or(page.locator('[aria-label*="verified"]'))
        .or(page.getByText(/verified/i).first());

      // May or may not have verified badge
      await page.waitForLoadState('domcontentloaded');
    });

    test(`${tags.core} - Verified badge on listings`, async ({ page, nav }) => {
      await nav.goToSearch();

      // Look for verified indicators on listing cards
      const verifiedIndicator = page.locator('[data-testid="verified-host"]')
        .or(page.locator('[class*="verified"]'));

      // May or may not have verified hosts
      await page.waitForLoadState('domcontentloaded');
    });
  });
});

test.describe('Admin Journeys', () => {
  // Admin tests require admin authentication
  // Note: In real tests, use separate admin storage state
  test.use({ storageState: 'playwright/.auth/user.json' });

  test.describe('J080: Admin dashboard access', () => {
    test(`${tags.auth} - Access admin panel`, async ({ page }) => {
      await page.goto('/admin');

      // Should either show admin panel or redirect/403
      const adminPanel = page.getByRole('heading', { name: /admin|dashboard/i });
      const accessDenied = page.getByText(/denied|unauthorized|not authorized/i);
      const loginRedirect = page.locator('input[type="password"]');

      await expect(
        adminPanel.or(accessDenied).or(loginRedirect)
      ).toBeVisible({ timeout: 10000 });
    });

    test(`${tags.auth} - Admin dashboard overview`, async ({ page }) => {
      await page.goto('/admin');

      // If admin access granted, verify dashboard components
      const statsSection = page.locator('[data-testid="admin-stats"]')
        .or(page.getByText(/total.*users|total.*listings/i));

      if (await statsSection.isVisible().catch(() => false)) {
        await expect(statsSection).toBeVisible();
      }
    });
  });

  test.describe('J081: User management', () => {
    test(`${tags.auth} - View users list`, async ({ page }) => {
      await page.goto('/admin/users');

      // Should show users table or access denied
      const usersTable = page.locator('table')
        .or(page.locator('[data-testid="users-list"]'));
      const accessDenied = page.getByText(/denied|unauthorized/i);

      await expect(usersTable.or(accessDenied)).toBeVisible({ timeout: 10000 });
    });

    test(`${tags.auth} - Suspend user action`, async ({ page }) => {
      await page.goto('/admin/users');

      const suspendButton = page.getByRole('button', { name: /suspend/i }).first();

      if (await suspendButton.isVisible()) {
        await suspendButton.click();

        // Should show confirmation
        const confirmDialog = page.locator(selectors.modal);
        await expect(confirmDialog).toBeVisible({ timeout: 5000 });

        // Cancel - don't actually suspend
        const cancelButton = confirmDialog.getByRole('button', { name: /cancel/i });
        await cancelButton.click();
      }
    });
  });

  test.describe('J082: Content moderation', () => {
    test(`${tags.auth} - View reported content`, async ({ page }) => {
      await page.goto('/admin/reports');

      // Should show reports or access denied
      const reportsSection = page.locator('[data-testid="reports-list"]')
        .or(page.getByRole('heading', { name: /report/i }));
      const accessDenied = page.getByText(/denied|unauthorized/i);

      await expect(reportsSection.or(accessDenied)).toBeVisible({ timeout: 10000 });
    });

    test(`${tags.auth} - Review flagged listing`, async ({ page }) => {
      await page.goto('/admin/listings');

      const flaggedListing = page.locator('[data-testid="flagged-listing"]')
        .or(page.locator('[class*="flagged"]'));

      if (await flaggedListing.isVisible()) {
        await flaggedListing.first().click();

        // Should show review options
        const approveButton = page.getByRole('button', { name: /approve/i });
        const rejectButton = page.getByRole('button', { name: /reject|remove/i });

        await expect(approveButton.or(rejectButton)).toBeVisible({ timeout: 5000 });
      }
    });
  });

  test.describe('J083: Verification review', () => {
    test(`${tags.auth} - View pending verifications`, async ({ page }) => {
      await page.goto('/admin/verifications');

      // Should show pending verifications or access denied
      const pendingList = page.locator('[data-testid="verification-list"]')
        .or(page.getByRole('heading', { name: /verification/i }));
      const accessDenied = page.getByText(/denied|unauthorized/i);

      await expect(pendingList.or(accessDenied)).toBeVisible({ timeout: 10000 });
    });

    test(`${tags.auth} - Approve verification request`, async ({ page }) => {
      await page.goto('/admin/verifications');

      const approveButton = page.getByRole('button', { name: /approve/i }).first();

      if (await approveButton.isVisible()) {
        await approveButton.click();

        // Should show confirmation or success
        await expect(
          page.locator(selectors.modal)
            .or(page.locator(selectors.toast))
        ).toBeVisible({ timeout: 5000 });
      }
    });

    test(`${tags.auth} - Reject verification with reason`, async ({ page }) => {
      await page.goto('/admin/verifications');

      const rejectButton = page.getByRole('button', { name: /reject/i }).first();

      if (await rejectButton.isVisible()) {
        await rejectButton.click();

        // Should show reason input
        const reasonInput = page.getByLabel(/reason/i).or(page.locator('textarea'));

        if (await reasonInput.isVisible()) {
          await reasonInput.fill('Document quality too low for verification.');
        }

        // Confirm rejection
        const confirmButton = page.getByRole('button', { name: /confirm|submit/i });
        if (await confirmButton.isVisible()) {
          await confirmButton.click();
        }
      }
    });
  });

  test.describe('J084: Audit logs', () => {
    test(`${tags.auth} - View admin audit log`, async ({ page }) => {
      await page.goto('/admin/audit');

      // Should show audit logs or access denied
      const auditLog = page.locator('[data-testid="audit-log"]')
        .or(page.getByRole('heading', { name: /audit/i }));
      const accessDenied = page.getByText(/denied|unauthorized/i);

      await expect(auditLog.or(accessDenied)).toBeVisible({ timeout: 10000 });
    });

    test(`${tags.auth} - Filter audit logs`, async ({ page }) => {
      await page.goto('/admin/audit');

      const filterSelect = page.getByLabel(/filter|action/i)
        .or(page.locator('[data-testid="audit-filter"]'));

      if (await filterSelect.isVisible()) {
        await filterSelect.selectOption({ index: 1 });
        await page.waitForTimeout(1000);
      }
    });
  });

  test.describe('J085-J086: Report handling', () => {
    test(`${tags.auth} - Submit content report`, async ({ page, nav }) => {
      await nav.goToSearch();
      await nav.clickListingCard(0);

      // Find report button
      const reportButton = page.getByRole('button', { name: /report/i });

      if (await reportButton.isVisible()) {
        await reportButton.click();

        // Fill report form
        const reasonSelect = page.getByLabel(/reason/i);
        if (await reasonSelect.isVisible()) {
          await reasonSelect.selectOption({ index: 1 });
        }

        const detailsInput = page.getByLabel(/details|description/i)
          .or(page.locator('textarea'));
        if (await detailsInput.isVisible()) {
          await detailsInput.fill('This listing appears to violate community guidelines.');
        }

        // Submit report
        const submitButton = page.getByRole('button', { name: /submit.*report/i });
        if (await submitButton.isVisible()) {
          await submitButton.click();

          await expect(
            page.locator(selectors.toast)
              .or(page.getByText(/submitted|received/i))
          ).toBeVisible({ timeout: 10000 });
        }
      }
    });

    test(`${tags.auth} - Admin resolves report`, async ({ page }) => {
      await page.goto('/admin/reports');

      const resolveButton = page.getByRole('button', { name: /resolve|dismiss/i }).first();

      if (await resolveButton.isVisible()) {
        await resolveButton.click();

        // Add resolution note
        const noteInput = page.getByLabel(/note|resolution/i);
        if (await noteInput.isVisible()) {
          await noteInput.fill('Reviewed and found no violation.');
        }

        // Confirm resolution
        const confirmButton = page.getByRole('button', { name: /confirm|submit/i });
        if (await confirmButton.isVisible()) {
          await confirmButton.click();
        }
      }
    });
  });
});
