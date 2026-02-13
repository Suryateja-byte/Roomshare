/**
 * ID Verification Page — E2E Tests (VF-01 through VF-04)
 *
 * Coverage: /verify — auth guard, page structure, verified user state.
 *
 * Phase 1 (this file): 4 tests using existing seeded user (isVerified: true).
 * Phase 2 (future): 14 additional tests requiring seed extension with unverified user.
 *
 * Runs on all 5 authenticated projects (chromium, firefox, webkit, Mobile Chrome, Mobile Safari).
 */

import { test, expect, timeouts } from "../helpers";

test.beforeEach(async () => {
  test.slow();
});

// ═══════════════════════════════════════════════════════════════════════════
// VF: Auth Guard
// ═══════════════════════════════════════════════════════════════════════════
test.describe("VF: Auth Guard", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("VF-01  unauthenticated user redirects to /login", async ({
    page,
  }) => {
    await page.goto("/verify");

    // Server component redirects to login with callback
    await expect(page).toHaveURL(/\/login/, { timeout: timeouts.navigation });
    // Verify callbackUrl is preserved
    const url = page.url();
    expect(url).toContain("callbackUrl");
    expect(url).toContain("verify");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// VF: Page Structure
// ═══════════════════════════════════════════════════════════════════════════
test.describe("VF: Page Structure", () => {
  test("VF-02  page header renders with title", async ({ page }) => {
    await page.goto("/verify");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByRole("heading", { name: /ID Verification/i }),
    ).toBeVisible({ timeout: timeouts.navigation });
    await expect(
      page.getByText(/Build trust by verifying your identity/i),
    ).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// VF: Verified State (seeded user is isVerified: true)
// ═══════════════════════════════════════════════════════════════════════════
test.describe("VF: Verified State", () => {
  test("VF-03  verified user sees badge and profile link", async ({
    page,
  }) => {
    await page.goto("/verify");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByRole("heading", { name: /You're Verified/i }),
    ).toBeVisible({ timeout: timeouts.navigation });
    await expect(page.getByText(/View Your Profile/i)).toBeVisible();
  });

  test("VF-04  profile link navigates to /profile", async ({ page }) => {
    await page.goto("/verify");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByRole("heading", { name: /You're Verified/i }),
    ).toBeVisible({ timeout: timeouts.navigation });

    await page.getByText(/View Your Profile/i).click();
    await expect(page).toHaveURL(/\/profile/, { timeout: timeouts.navigation });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Phase 2 (requires seed extension with e2e-unverified user):
//   VF-05  not_started: benefits section visible
//   VF-06  not_started: document type selector with 3 options
//   VF-07  not_started: document type selection changes active state
//   VF-08  not_started: upload area shows instructions
//   VF-09  not_started: uploading document changes area to green
//   VF-10  not_started: selfie upload works (optional)
//   VF-11  not_started: submit disabled without document
//   VF-12  not_started: submit enabled after document upload
//   VF-13  not_started: error on submit without document
//   VF-14  not_started: successful submission → pending state
//   VF-15  pending: shows status with request ID
//   VF-16  rejected: shows reason and tips
//   VF-17  rejected (cooldown): shows cooldown message
//   VF-18  not_started: privacy notice text displayed
// ═══════════════════════════════════════════════════════════════════════════
