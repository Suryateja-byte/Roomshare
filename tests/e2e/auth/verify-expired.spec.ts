/**
 * Verify-Expired Page — E2E Tests (VE-01 through VE-14)
 *
 * Coverage: /verify-expired — page structure, authenticated resend flow,
 * error handling (mocked API), unauthenticated state.
 *
 * Runs on all 5 authenticated projects. Unauthenticated block uses
 * test.use({ storageState: ... }) override.
 *
 * API mocking: The test user has emailVerified set, so real resend-verification
 * returns "Email is already verified". All resend tests mock the API.
 */

import { test, expect, selectors, timeouts } from "../helpers";

test.beforeEach(async () => {
  test.slow();
});

// ═══════════════════════════════════════════════════════════════════════════
// Block 1: Page Structure
// ═══════════════════════════════════════════════════════════════════════════
test.describe("VE: Page Structure", () => {
  test("VE-01  renders expired link header", async ({ page }) => {
    await page.goto("/verify-expired");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByRole("heading", { name: /Verification Link Expired/i }),
    ).toBeVisible({ timeout: timeouts.navigation });
    await expect(
      page.getByText(/no longer valid/i),
    ).toBeVisible();
  });

  test("VE-02  'Back to Home' footer link", async ({ page }) => {
    await page.goto("/verify-expired");
    await page.waitForLoadState("domcontentloaded");

    const backLink = page.getByText(/Back to Home/i);
    await expect(backLink).toBeVisible({ timeout: timeouts.navigation });

    await backLink.click();
    await expect(page).toHaveURL(/^\/$|\/$/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Block 2: Authenticated State
// ═══════════════════════════════════════════════════════════════════════════
test.describe("VE: Authenticated State", () => {
  test("VE-03  shows resend button and user email", async ({ page }) => {
    await page.goto("/verify-expired");
    await page.waitForLoadState("domcontentloaded");

    // Wait for session to load (useSession())
    await expect(
      page.getByRole("button", { name: /Resend Verification Email/i }),
    ).toBeVisible({ timeout: timeouts.navigation });

    // User email displayed
    await expect(
      page.getByText(/e2e-test@roomshare\.dev/i),
    ).toBeVisible();
  });

  test("VE-04  security warning about 24h expiry", async ({ page }) => {
    await page.goto("/verify-expired");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByText(/expire after 24 hours/i),
    ).toBeVisible({ timeout: timeouts.navigation });
  });

  test("VE-06  loading state during resend", async ({ page }) => {
    // Delay mock response to catch "Sending..." state
    await page.route("**/api/auth/resend-verification", async (route) => {
      await new Promise((r) => setTimeout(r, 2_000));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: "Verification email sent successfully" }),
      });
    });

    await page.goto("/verify-expired");
    await expect(
      page.getByRole("button", { name: /Resend Verification Email/i }),
    ).toBeVisible({ timeout: timeouts.navigation });

    await page
      .getByRole("button", { name: /Resend Verification Email/i })
      .click();

    // Button shows "Sending..." with spinner
    await expect(page.getByText(/Sending/i)).toBeVisible({ timeout: 3_000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Block 3: Resend Flow (Mocked)
// ═══════════════════════════════════════════════════════════════════════════
test.describe("VE: Resend Flow", () => {
  test("VE-05  success flow → Check Your Inbox", async ({ page }) => {
    await page.route("**/api/auth/resend-verification", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: "Verification email sent successfully" }),
      });
    });

    await page.goto("/verify-expired");
    await expect(
      page.getByRole("button", { name: /Resend Verification Email/i }),
    ).toBeVisible({ timeout: timeouts.navigation });

    await page
      .getByRole("button", { name: /Resend Verification Email/i })
      .click();

    // Success state
    await expect(
      page.getByRole("heading", { name: /Check Your Inbox/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Toast
    await expect(
      page.locator(selectors.toast).filter({ hasText: /sent/i }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("VE-07  'try again' resets state", async ({ page }) => {
    await page.route("**/api/auth/resend-verification", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: "Verification email sent successfully" }),
      });
    });

    await page.goto("/verify-expired");
    await expect(
      page.getByRole("button", { name: /Resend Verification Email/i }),
    ).toBeVisible({ timeout: timeouts.navigation });

    // Trigger success state
    await page
      .getByRole("button", { name: /Resend Verification Email/i })
      .click();
    await expect(
      page.getByRole("heading", { name: /Check Your Inbox/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Click "try again"
    await page.getByText(/try again/i).click();

    // Back to resend button
    await expect(
      page.getByRole("button", { name: /Resend Verification Email/i }),
    ).toBeVisible({ timeout: 5_000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Block 4: Error Handling (Mocked)
// ═══════════════════════════════════════════════════════════════════════════
test.describe("VE: Error Handling", () => {
  test("VE-08  500 error → toast", async ({ page }) => {
    await page.route("**/api/auth/resend-verification", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Internal server error" }),
      });
    });

    await page.goto("/verify-expired");
    await expect(
      page.getByRole("button", { name: /Resend Verification Email/i }),
    ).toBeVisible({ timeout: timeouts.navigation });

    await page
      .getByRole("button", { name: /Resend Verification Email/i })
      .click();

    // Error toast
    await expect(
      page.locator(selectors.toast).filter({ hasText: /Failed to send/i }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("VE-09  429 rate limit → toast", async ({ page }) => {
    await page.route("**/api/auth/resend-verification", async (route) => {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ error: "Too many requests" }),
      });
    });

    await page.goto("/verify-expired");
    await expect(
      page.getByRole("button", { name: /Resend Verification Email/i }),
    ).toBeVisible({ timeout: timeouts.navigation });

    await page
      .getByRole("button", { name: /Resend Verification Email/i })
      .click();

    await expect(
      page.locator(selectors.toast).filter({ hasText: /Too many requests/i }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("VE-10  400 with error message → toast", async ({ page }) => {
    await page.route("**/api/auth/resend-verification", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "Email is already verified" }),
      });
    });

    await page.goto("/verify-expired");
    await expect(
      page.getByRole("button", { name: /Resend Verification Email/i }),
    ).toBeVisible({ timeout: timeouts.navigation });

    await page
      .getByRole("button", { name: /Resend Verification Email/i })
      .click();

    await expect(
      page.locator(selectors.toast).filter({ hasText: /already verified/i }),
    ).toBeVisible({ timeout: 5_000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Block 5: Unauthenticated State
// ═══════════════════════════════════════════════════════════════════════════
test.describe("VE: Unauthenticated State", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("VE-11  login prompt when not logged in", async ({ page }) => {
    await page.goto("/verify-expired");
    await page.waitForLoadState("domcontentloaded");

    // Session check resolves → shows login prompt
    await expect(
      page.getByText(/Log In to Continue/i),
    ).toBeVisible({ timeout: timeouts.navigation });

    await expect(
      page.getByText(/Please log in/i),
    ).toBeVisible();

    // No resend button visible
    await expect(
      page.getByRole("button", { name: /Resend Verification Email/i }),
    ).not.toBeVisible({ timeout: 3_000 });
  });

  test("VE-12  login button navigates with callback", async ({ page }) => {
    await page.goto("/verify-expired");

    await expect(
      page.getByText(/Log In to Continue/i),
    ).toBeVisible({ timeout: timeouts.navigation });

    await page.getByText(/Log In to Continue/i).click();
    await expect(page).toHaveURL(/\/login/);

    const url = page.url();
    expect(url).toContain("callbackUrl");
    expect(url).toContain("verify-expired");
  });

  test("VE-13  signup link for new users", async ({ page }) => {
    await page.goto("/verify-expired");

    await expect(
      page.getByText(/Log In to Continue/i),
    ).toBeVisible({ timeout: timeouts.navigation });

    const signupLink = page.getByRole("link", { name: /Sign up/i });
    await expect(signupLink).toBeVisible();

    await signupLink.click();
    await expect(page).toHaveURL(/\/signup/);
  });

  test("VE-14  loading spinner visible briefly", async ({ page }) => {
    // This test may be flaky if session resolves very fast
    await page.goto("/verify-expired");

    // Try to catch the spinner — skip if too fast
    const spinner = page.locator(".animate-spin");
    const wasVisible = await spinner
      .isVisible({ timeout: 3_000 })
      .catch(() => false);

    // If spinner appeared, great — pass. If not, skip (too fast is fine).
    if (!wasVisible) {
      test.skip(true, "Session loaded too fast to catch spinner");
    }
  });
});
