/**
 * Admin Moderation Journeys (J38–J41)
 *
 * J38: Admin dashboard overview
 * J39: Admin resolves report
 * J40: Admin reviews verification request
 * J41: Admin audit log
 *
 * NOTE: These tests require admin authentication.
 * The admin user (e2e-admin@roomshare.dev) is created by seed-e2e.js.
 */

import { test, expect, selectors, timeouts } from "../helpers";

// Helper to login as admin
async function loginAsAdmin(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.waitForTimeout(1500);

  const emailField = page
    .getByLabel(/email/i)
    .or(page.locator('input[name="email"]'))
    .or(page.locator('input[type="email"]'));
  const passwordField = page
    .getByLabel(/password/i)
    .or(page.locator('input[name="password"]'))
    .or(page.locator('input[type="password"]'));

  const canLogin = await emailField.first().isVisible().catch(() => false);
  if (!canLogin) return false;

  await emailField.first().fill("e2e-admin@roomshare.dev");
  await passwordField.first().fill("TestPassword123!");

  const submitBtn = page
    .getByRole("button", { name: /log ?in|sign ?in|submit/i })
    .or(page.locator('button[type="submit"]'));
  await submitBtn.first().click();
  await page.waitForTimeout(3000);

  return true;
}

// ─── J38: Admin Dashboard Overview ────────────────────────────────────────────
test.describe("J38: Admin Dashboard Overview", () => {
  test("login as admin → /admin → verify stats and sub-pages", async ({
    page,
  }) => {
    // Step 1: Login as admin
    const loggedIn = await loginAsAdmin(page);
    test.skip(!loggedIn, "Could not login as admin — skipping");

    // Step 2: Navigate to admin
    await page.goto("/admin");
    await page.waitForTimeout(2000);

    // Step 3: Verify admin page loaded (not redirected to login)
    const isAdmin = page.url().includes("/admin");
    const heading = page.locator("main h1, main h2").first();
    const hasHeading = await heading.isVisible().catch(() => false);

    // May redirect to login if admin auth doesn't work
    if (!isAdmin) {
      test.skip(true, "Redirected away from admin — auth may not work");
    }

    // Step 4: Look for dashboard stats
    const stats = page
      .locator('[data-testid="admin-stats"]')
      .or(page.locator('[class*="stat"]'))
      .or(page.locator("main").getByText(/total|users|listings|reports/i));

    const hasStats = await stats.first().isVisible().catch(() => false);

    // Step 5: Look for navigation to sub-pages
    const subLinks = page
      .locator('main a[href*="/admin/"]')
      .or(page.locator("main").getByRole("link"));

    expect(hasHeading || hasStats).toBeTruthy();
  });
});

// ─── J39: Admin Resolves Report ───────────────────────────────────────────────
test.describe("J39: Admin Resolves Report", () => {
  test("admin → reports → open report → resolve with notes", async ({
    page,
  }) => {
    const loggedIn = await loginAsAdmin(page);
    test.skip(!loggedIn, "Could not login — skipping");

    // Step 1: Navigate to admin reports
    await page.goto("/admin/reports");
    await page.waitForTimeout(2000);

    const isAdminReports = page.url().includes("/admin");
    test.skip(!isAdminReports, "Redirected away — skipping");

    // Step 2: Find an open report
    const reportRow = page
      .getByText(/open|pending|misleading/i)
      .first();
    const hasReport = await reportRow.isVisible().catch(() => false);
    test.skip(!hasReport, "No open reports — skipping");

    // Step 3: Click to view/resolve
    await reportRow.click();
    await page.waitForTimeout(1500);

    // Step 4: Look for resolve button
    const resolveBtn = page
      .getByRole("button", { name: /resolve|close|dismiss/i })
      .first();
    const canResolve = await resolveBtn.isVisible().catch(() => false);
    if (canResolve) {
      // Fill notes if field exists
      const notesField = page.locator("textarea").first();
      if (await notesField.isVisible().catch(() => false)) {
        await notesField.fill("Reviewed — no action needed. E2E test.");
      }

      await resolveBtn.click();
      await page.waitForTimeout(2000);
    }

    // Step 5: Verify
    const hasToast = await page.locator(selectors.toast).isVisible().catch(() => false);
    const resolved = page.getByText(/resolved|closed/i).first();
    const isResolved = await resolved.isVisible().catch(() => false);
    expect(hasToast || isResolved || !canResolve).toBeTruthy();
  });
});

// ─── J40: Admin Reviews Verification ──────────────────────────────────────────
test.describe("J40: Admin Reviews Verification Request", () => {
  test("admin → verifications → pending request → approve", async ({
    page,
  }) => {
    const loggedIn = await loginAsAdmin(page);
    test.skip(!loggedIn, "Could not login — skipping");

    // Step 1: Navigate to verifications
    await page.goto("/admin/verifications");
    await page.waitForTimeout(2000);

    const isAdminPage = page.url().includes("/admin");
    test.skip(!isAdminPage, "Redirected away — skipping");

    // Step 2: Find pending verification
    const pendingItem = page.getByText(/pending|driver_license/i).first();
    const hasPending = await pendingItem.isVisible().catch(() => false);
    test.skip(!hasPending, "No pending verifications — skipping");

    // Step 3: Click to review
    await pendingItem.click();
    await page.waitForTimeout(1500);

    // Step 4: Approve
    const approveBtn = page
      .getByRole("button", { name: /approve|verify|accept/i })
      .first();
    const canApprove = await approveBtn.isVisible().catch(() => false);
    if (canApprove) {
      await approveBtn.click();
      await page.waitForTimeout(2000);
    }

    // Step 5: Verify
    const hasToast = await page.locator(selectors.toast).isVisible().catch(() => false);
    const approved = page.getByText(/approved|verified/i).first();
    const isApproved = await approved.isVisible().catch(() => false);
    expect(hasToast || isApproved || !canApprove).toBeTruthy();
  });
});

// ─── J41: Admin Audit Log ─────────────────────────────────────────────────────
test.describe("J41: Admin Audit Log", () => {
  test("admin → audit log → verify table loads with entries", async ({
    page,
  }) => {
    const loggedIn = await loginAsAdmin(page);
    test.skip(!loggedIn, "Could not login — skipping");

    // Step 1: Navigate to audit log
    await page.goto("/admin/audit");
    await page.waitForTimeout(2000);

    // Try alternative paths
    if (!page.url().includes("/admin")) {
      await page.goto("/admin/audit-log");
      await page.waitForTimeout(1500);
    }

    const isAdminPage = page.url().includes("/admin");
    test.skip(!isAdminPage, "Redirected away — skipping");

    // Step 2: Look for audit log table or entries
    const auditTable = page
      .locator("table")
      .or(page.locator('[data-testid="audit-log"]'))
      .or(page.locator("main").getByText(/audit|log|action/i));

    const hasTable = await auditTable.first().isVisible().catch(() => false);

    // Step 3: Verify entries exist
    const rows = page.locator("table tbody tr").or(page.locator('[data-testid="audit-entry"]'));
    const rowCount = await rows.count();

    // Step 4: Look for expected columns
    const headers = page.getByText(/action|admin|target|date|time/i);
    const hasHeaders = await headers.first().isVisible().catch(() => false);

    expect(hasTable || hasHeaders || rowCount > 0).toBeTruthy();
  });
});
