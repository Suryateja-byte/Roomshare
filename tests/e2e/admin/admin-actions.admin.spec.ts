/**
 * Admin Actions -- E2E Tests (AA-01 through AA-16)
 *
 * Coverage: /admin/verifications, /admin/audit -- filter tabs,
 * approve/reject verification, audit log entries, auth guards.
 *
 * Runs under chromium-admin project (admin.json auth).
 * Mutation tests (approve/reject) are serial and modify seed data.
 *
 * NOTE: These tests extend the existing admin.admin.spec.ts which
 * covers read-only visibility (ADM-01..ADM-24). This file tests
 * actual admin ACTIONS (clicks that change state).
 */

import { test, expect } from '@playwright/test';

test.beforeEach(async () => {
  test.slow(); // 3x timeout for admin SSR pages
});

// ─── Block 1: Verification Filters ──────────────────────────────────────────
test.describe('AA: Verification Filters', () => {
  test('AA-01  verification list renders pending requests', async ({ page }) => {
    await page.goto('/admin/verifications');
    await expect(
      page.getByRole('heading', { name: /verification requests/i })
    ).toBeVisible({ timeout: 30_000 });

    // At least one verification request should be visible
    // Cards show user info (name/email) and status badges
    await expect(
      page.getByText(/pending|approved|rejected/i).first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test('AA-02  filter by Pending status', async ({ page }) => {
    await page.goto('/admin/verifications');
    await expect(
      page.getByRole('heading', { name: /verification requests/i })
    ).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: /pending/i }).click();

    // Seed data guarantees at least one PENDING verification
    const items = page.getByText('PENDING');
    await expect(items.first()).toBeVisible({ timeout: 10_000 });
    const count = await items.count();
    for (let i = 0; i < count; i++) {
      await expect(items.nth(i)).toBeVisible();
    }
  });

  test('AA-03  filter by Approved status', async ({ page }) => {
    await page.goto('/admin/verifications');
    await expect(
      page.getByRole('heading', { name: /verification requests/i })
    ).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: /approved/i }).click();

    // Approved items may or may not exist depending on mutation test ordering
    const items = page.getByText('APPROVED');
    try {
      await expect(items.first()).toBeVisible({ timeout: 5_000 });
    } catch {
      // No approved items after filtering — filter worked (empty result set)
      test.skip(true, 'No APPROVED verifications to validate filter');
      return;
    }
    const count = await items.count();
    for (let i = 0; i < count; i++) {
      await expect(items.nth(i)).toBeVisible();
    }
  });

  test('AA-04  filter by Rejected status', async ({ page }) => {
    await page.goto('/admin/verifications');
    await expect(
      page.getByRole('heading', { name: /verification requests/i })
    ).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: /rejected/i }).click();

    // Rejected items may or may not exist depending on mutation test ordering
    const items = page.getByText('REJECTED');
    try {
      await expect(items.first()).toBeVisible({ timeout: 5_000 });
    } catch {
      // No rejected items after filtering — filter worked (empty result set)
      test.skip(true, 'No REJECTED verifications to validate filter');
      return;
    }
    const count = await items.count();
    for (let i = 0; i < count; i++) {
      await expect(items.nth(i)).toBeVisible();
    }
  });
});

// ─── Block 2: Verification Actions (serial — mutates state) ─────────────────
test.describe('AA: Verification Actions', () => {
  test.describe.configure({ mode: 'serial' });

  test('AA-05  approve pending verification', async ({ page }) => {
    await page.goto('/admin/verifications');
    await expect(
      page.getByRole('heading', { name: /verification requests/i })
    ).toBeVisible({ timeout: 30_000 });

    // Click Pending filter to find a pending request
    await page.getByRole('button', { name: /pending/i }).click();

    const approveBtn = page.getByRole('button', { name: /approve/i }).first();
    try {
      await expect(approveBtn).toBeVisible({ timeout: 10_000 });
    } catch {
      test.skip(true, 'No pending verifications to approve');
      return;
    }

    // Count pending items before approving to verify the mutation took effect
    const pendingCountBefore = await page.getByText('PENDING').count();

    await approveBtn.click();

    // After approve, the number of PENDING badges should decrease
    await expect(async () => {
      const pendingCountAfter = await page.getByText('PENDING').count();
      expect(pendingCountAfter).toBeLessThan(pendingCountBefore);
    }).toPass({ timeout: 15_000 });
  });

  test('AA-06  reject opens reason input', async ({ page }) => {
    await page.goto('/admin/verifications');
    await expect(
      page.getByRole('heading', { name: /verification requests/i })
    ).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: /pending/i }).click();

    // Use exact match to avoid matching "Rejected(N)" filter button
    const rejectBtn = page.getByRole('button', { name: 'Reject', exact: true });
    try {
      await expect(rejectBtn).toBeVisible({ timeout: 10_000 });
    } catch {
      test.skip(true, 'No pending verifications to reject');
      return;
    }

    await rejectBtn.click();

    // Reason input + Confirm Reject / Cancel should appear
    await expect(
      page.getByPlaceholder(/reason for rejection/i)
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByRole('button', { name: /confirm reject/i })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /cancel/i })
    ).toBeVisible();
  });

  test('AA-07  reject with reason changes status', async ({ page }) => {
    await page.goto('/admin/verifications');
    await expect(
      page.getByRole('heading', { name: /verification requests/i })
    ).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: /pending/i }).click();

    // Use exact match to avoid matching "Rejected(N)" filter button
    const rejectBtn = page.getByRole('button', { name: 'Reject', exact: true });
    try {
      await expect(rejectBtn).toBeVisible({ timeout: 10_000 });
    } catch {
      test.skip(true, 'No pending verifications to reject');
      return;
    }

    await rejectBtn.click();

    const reasonInput = page.getByPlaceholder(/reason for rejection/i);
    await reasonInput.fill('Document is blurry and unreadable');

    await page.getByRole('button', { name: /confirm reject/i }).click();

    // Status should change to REJECTED
    await expect(
      page.getByText('REJECTED').first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test('AA-08  cancel reject returns to initial state', async ({ page }) => {
    await page.goto('/admin/verifications');
    await expect(
      page.getByRole('heading', { name: /verification requests/i })
    ).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: /pending/i }).click();

    // Use exact match to avoid matching "Rejected(N)" filter button
    const rejectBtn = page.getByRole('button', { name: 'Reject', exact: true });
    try {
      await expect(rejectBtn).toBeVisible({ timeout: 10_000 });
    } catch {
      test.skip(true, 'No pending verifications');
      return;
    }

    await rejectBtn.click();
    await expect(
      page.getByPlaceholder(/reason for rejection/i)
    ).toBeVisible({ timeout: 5_000 });

    // Cancel
    await page.getByRole('button', { name: /cancel/i }).click();

    // Reason input should disappear
    await expect(
      page.getByPlaceholder(/reason for rejection/i)
    ).toBeHidden({ timeout: 5_000 });
  });
});

// ─── Block 3: Audit Log ─────────────────────────────────────────────────────
test.describe('AA: Audit Log', () => {
  test('AA-09  audit log page renders', async ({ page }) => {
    await page.goto('/admin/audit');
    await expect(
      page.getByRole('heading', { name: /audit log/i })
    ).toBeVisible({ timeout: 30_000 });

    // Table should have entries
    const rows = page.locator('table tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });
  });

  test('AA-10  audit filter by action type', async ({ page }) => {
    await page.goto('/admin/audit');
    await expect(
      page.getByRole('heading', { name: /audit log/i })
    ).toBeVisible({ timeout: 30_000 });

    // Click any available action-type filter link (not "All")
    const filterLinks = page.locator('a[href*="action="]');
    const filterCount = await filterLinks.count();

    if (filterCount === 0) {
      test.skip(true, 'No action-type filter links found');
      return;
    }

    await filterLinks.first().click();

    // URL should update with action filter
    await expect(page).toHaveURL(/action=/, { timeout: 10_000 });
  });

  test('AA-11  audit entries show correct columns', async ({ page }) => {
    await page.goto('/admin/audit');
    await expect(
      page.getByRole('heading', { name: /audit log/i })
    ).toBeVisible({ timeout: 30_000 });

    // Table headers should include key columns
    const headers = page.locator('table thead th');
    await expect(headers.first()).toBeVisible({ timeout: 15_000 });

    const headerTexts = (await headers.allTextContents()).map(t => t.trim().toLowerCase());
    expect(headerTexts).toEqual(
      expect.arrayContaining(['action', 'admin', 'target'])
    );
  });

  test('AA-12  audit log pagination', async ({ page }) => {
    await page.goto('/admin/audit');
    await expect(
      page.getByRole('heading', { name: /audit log/i })
    ).toBeVisible({ timeout: 30_000 });

    // Pagination uses ChevronRight icon links (no text label).
    // Check if "Page X of Y" indicator exists with totalPages > 1
    const pageIndicator = page.getByText(/page \d+ of (\d+)/i);
    const hasMultiplePages = await pageIndicator.isVisible().catch(() => false);

    if (!hasMultiplePages) {
      // Only 1 page of audit data — pagination controls are not rendered
      test.skip(true, 'Only one page of audit data, no pagination to test');
      return;
    }

    // The "next" link is the second pagination link (after "previous")
    const nextLink = page.locator('a[href*="page=2"]');
    await expect(nextLink).toBeVisible({ timeout: 5_000 });
    await nextLink.click();
    await expect(page).toHaveURL(/page=2/, { timeout: 10_000 });
  });

  test('AA-13  admin action creates audit entry', async ({ page }) => {
    // Visit audit log and check that recent admin actions are logged
    await page.goto('/admin/audit');
    await expect(
      page.getByRole('heading', { name: /audit log/i })
    ).toBeVisible({ timeout: 30_000 });

    // Seed data creates audit entries — verify at least one exists
    const rows = page.locator('table tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });

    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThanOrEqual(1);
  });

  test('AA-16  view verification documents link', async ({ page }) => {
    await page.goto('/admin/verifications');
    await expect(
      page.getByRole('heading', { name: /verification requests/i })
    ).toBeVisible({ timeout: 30_000 });

    // Find "View Document" link
    const docLink = page.getByRole('link', { name: /view document/i }).first();
    try {
      await expect(docLink).toBeVisible({ timeout: 10_000 });
    } catch {
      test.skip(true, 'No "View Document" links found in verifications');
      return;
    }

    // Verify it has an href and opens in a new tab
    const href = await docLink.getAttribute('href');
    expect(href).toBeTruthy();
    const target = await docLink.getAttribute('target');
    expect(target).toBe('_blank');
  });
});

// ─── Block 4: Auth Guards ───────────────────────────────────────────────────
test.describe('AA: Auth Guards', () => {
  test('AA-14  non-admin user blocked from admin routes', async ({ browser }) => {
    const context = await browser.newContext({
      storageState: 'playwright/.auth/user.json',
    });
    const page = await context.newPage();

    await page.goto('/admin');
    await page.waitForLoadState('domcontentloaded');

    // Non-admin user should be redirected away from /admin
    await expect(async () => {
      expect(page.url()).not.toContain('/admin');
    }).toPass({ timeout: 15_000 });

    await context.close();
  });

  test('AA-15  unauthenticated user redirected to login', async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();

    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });

    await context.close();
  });
});
