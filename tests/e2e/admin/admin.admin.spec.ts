/**
 * Admin E2E Tests (ADM-01 through ADM-24)
 *
 * Tests admin dashboard, verification management, user management,
 * listing moderation, report management, audit log, and auth guards.
 *
 * All tests are READ-ONLY — they assert visibility but never click
 * destructive actions (Approve/Reject/Delete/Suspend) to preserve seed data.
 *
 * Runs under the `chromium-admin` project with admin storageState.
 */

import { test, expect } from '@playwright/test';

test.beforeEach(async () => {
  test.slow(); // 3x timeout for admin pages (server-side auth + DB queries)
});

// ─── Block 1: Admin Dashboard (/admin) ──────────────────────────────────────

test.describe('ADM: Admin Dashboard', () => {
  test('ADM-01: Dashboard renders with header', async ({ page }) => {
    await page.goto('/admin');
    await expect(
      page.getByRole('heading', { name: /admin dashboard/i })
    ).toBeVisible({ timeout: 30_000 });
  });

  test('ADM-02: Stat cards display', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: /admin dashboard/i })).toBeVisible({ timeout: 30_000 });

    // The dashboard has 8 stat cards with these labels
    for (const label of ['Total Users', 'Active Listings', 'Pending Verifications', 'Reports']) {
      await expect(page.getByText(label, { exact: false }).first()).toBeVisible();
    }
  });

  test('ADM-03: Quick action links present', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: /admin dashboard/i })).toBeVisible({ timeout: 30_000 });

    // Quick Actions section has 4 links
    await expect(page.getByRole('link', { name: /verification requests/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /user management/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /listing moderation/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /reports/i })).toBeVisible();
  });

  // ADM-04 (non-admin redirect) covered by Block 7: ADM-23/ADM-24
  // test.use() cannot be called inside a test body — auth guard tests
  // are in their own describe block with the correct storageState override.
});

// ─── Block 2: Verification Management (/admin/verifications) ────────────────

test.describe('ADM: Verification Management', () => {
  test('ADM-05: Page renders with heading', async ({ page }) => {
    await page.goto('/admin/verifications');
    await expect(
      page.getByRole('heading', { name: /verification requests/i })
    ).toBeVisible({ timeout: 30_000 });
  });

  test('ADM-06: Filter tabs visible', async ({ page }) => {
    await page.goto('/admin/verifications');
    await expect(page.getByRole('heading', { name: /verification requests/i })).toBeVisible({ timeout: 30_000 });

    // VerificationList has filter buttons: All, Pending, Approved, Rejected
    await expect(page.getByRole('button', { name: /^all$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /pending/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /approved/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /rejected/i })).toBeVisible();
  });

  test('ADM-07: Pending verification displayed', async ({ page }) => {
    await page.goto('/admin/verifications');
    await expect(page.getByRole('heading', { name: /verification requests/i })).toBeVisible({ timeout: 30_000 });

    // Seed data includes 1 PENDING verification request — should show user info
    // The card shows the PENDING status badge
    await expect(page.getByText('PENDING').first()).toBeVisible({ timeout: 15_000 });
  });

  test('ADM-08: Approve button exists on pending request', async ({ page }) => {
    await page.goto('/admin/verifications');
    await expect(page.getByRole('heading', { name: /verification requests/i })).toBeVisible({ timeout: 30_000 });

    // PENDING requests have Approve and Reject buttons (do NOT click)
    await expect(page.getByRole('button', { name: /approve/i }).first()).toBeVisible({ timeout: 15_000 });
  });
});

// ─── Block 3: User Management (/admin/users) ────────────────────────────────

test.describe('ADM: User Management', () => {
  test('ADM-09: Page renders with heading', async ({ page }) => {
    await page.goto('/admin/users');
    await expect(
      page.getByRole('heading', { name: /user management/i })
    ).toBeVisible({ timeout: 30_000 });
  });

  test('ADM-10: Search input visible', async ({ page }) => {
    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { name: /user management/i })).toBeVisible({ timeout: 30_000 });

    await expect(
      page.getByPlaceholder(/search by name or email/i)
    ).toBeVisible();
  });

  test('ADM-11: User rows displayed', async ({ page }) => {
    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { name: /user management/i })).toBeVisible({ timeout: 30_000 });

    // Seed creates at least 4 users — the list should show at least 1
    // User rows show the email via a Mail icon + email text
    await expect(page.getByText(/@/).first()).toBeVisible({ timeout: 15_000 });
  });

  test('ADM-12: Action menu on non-self user', async ({ page }) => {
    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { name: /user management/i })).toBeVisible({ timeout: 30_000 });

    // Non-self users have a MoreVertical button (the three dots action menu)
    // The admin user is currentUserId, so other users should have the menu
    // MoreVertical renders as a button with the svg icon — look for any such button
    // The UserList component renders buttons with MoreVertical icons for non-self users
    const actionButtons = page.locator('button:has(svg.lucide-more-vertical)');
    await expect(actionButtons.first()).toBeVisible({ timeout: 15_000 });
  });
});

// ─── Block 4: Listing Management (/admin/listings) ──────────────────────────

test.describe('ADM: Listing Management', () => {
  test('ADM-13: Page renders with heading', async ({ page }) => {
    await page.goto('/admin/listings');
    await expect(
      page.getByRole('heading', { name: /listing moderation/i })
    ).toBeVisible({ timeout: 30_000 });
  });

  test('ADM-14: Search and filters visible', async ({ page }) => {
    await page.goto('/admin/listings');
    await expect(page.getByRole('heading', { name: /listing moderation/i })).toBeVisible({ timeout: 30_000 });

    await expect(page.getByPlaceholder(/search by title or owner/i)).toBeVisible();

    // Status filter buttons
    await expect(page.getByRole('button', { name: /^all$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /active/i })).toBeVisible();
  });

  test('ADM-15: Listing cards displayed', async ({ page }) => {
    await page.goto('/admin/listings');
    await expect(page.getByRole('heading', { name: /listing moderation/i })).toBeVisible({ timeout: 30_000 });

    // Seed data creates several listings — at least 1 should be visible
    // Listings show a dollar amount like "$X/mo"
    await expect(page.getByText(/\/mo/).first()).toBeVisible({ timeout: 15_000 });
  });
});

// ─── Block 5: Report Management (/admin/reports) ────────────────────────────

test.describe('ADM: Report Management', () => {
  test('ADM-16: Page renders with heading', async ({ page }) => {
    await page.goto('/admin/reports');
    await expect(
      page.getByRole('heading', { name: /reports management/i })
    ).toBeVisible({ timeout: 30_000 });
  });

  test('ADM-17: Filter controls visible', async ({ page }) => {
    await page.goto('/admin/reports');
    await expect(page.getByRole('heading', { name: /reports management/i })).toBeVisible({ timeout: 30_000 });

    // ReportList has filter buttons: All, Open, Resolved, Dismissed
    await expect(page.getByRole('button', { name: /^all$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^open$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /resolved/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /dismissed/i })).toBeVisible();
  });

  test('ADM-18: Open report displayed', async ({ page }) => {
    await page.goto('/admin/reports');
    await expect(page.getByRole('heading', { name: /reports management/i })).toBeVisible({ timeout: 30_000 });

    // Seed data creates 1 OPEN report — the listing title should be visible
    // Report cards show listing title as a link
    await expect(
      page.getByText(/apartment|room|house|studio/i).first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test('ADM-19: Take Action button on open report', async ({ page }) => {
    await page.goto('/admin/reports');
    await expect(page.getByRole('heading', { name: /reports management/i })).toBeVisible({ timeout: 30_000 });

    // OPEN reports have a "Take Action" button (do NOT click — would consume seed data)
    await expect(
      page.getByRole('button', { name: /take action/i }).first()
    ).toBeVisible({ timeout: 15_000 });
  });
});

// ─── Block 6: Audit Log (/admin/audit) ──────────────────────────────────────

test.describe('ADM: Audit Log', () => {
  test('ADM-20: Page renders with heading', async ({ page }) => {
    await page.goto('/admin/audit');
    await expect(
      page.getByRole('heading', { name: /audit log/i })
    ).toBeVisible({ timeout: 30_000 });
  });

  test('ADM-21: Action type filter links visible', async ({ page }) => {
    await page.goto('/admin/audit');
    await expect(page.getByRole('heading', { name: /audit log/i })).toBeVisible({ timeout: 30_000 });

    // Filter section has "All" link plus action type links
    // Check for a few known filter labels from actionConfig
    await expect(page.getByRole('link', { name: /^all$/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /user suspended/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /report resolved/i })).toBeVisible();
  });

  test('ADM-22: Audit entries displayed', async ({ page }) => {
    await page.goto('/admin/audit');
    await expect(page.getByRole('heading', { name: /audit log/i })).toBeVisible({ timeout: 30_000 });

    // Seed data creates 3 audit entries — table should have at least 1 row
    // The table has thead with "Action", "Admin", "Target", "Details", "Time" columns
    const tableRows = page.locator('table tbody tr');
    await expect(tableRows.first()).toBeVisible({ timeout: 15_000 });
  });
});

// ─── Block 7: Auth Guards (regular user) ────────────────────────────────────

test.describe('ADM: Auth Guards', () => {
  // Override to use regular user auth for these tests
  test.use({ storageState: 'playwright/.auth/user.json' });

  test('ADM-23: Regular user redirected from /admin', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    // Non-admin user should be redirected away from /admin
    expect(page.url()).not.toContain('/admin');
  });

  test('ADM-24: Regular user redirected from /admin/users', async ({ page }) => {
    await page.goto('/admin/users');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    // Non-admin user should be redirected away from /admin
    expect(page.url()).not.toContain('/admin');
  });
});
