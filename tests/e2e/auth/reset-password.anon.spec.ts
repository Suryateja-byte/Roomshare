/**
 * Reset Password — E2E Tests (RP-01 through RP-17)
 *
 * Coverage: /reset-password — no token, invalid token, valid token form,
 * full forgot→reset flow, edge cases.
 *
 * .anon.spec.ts → runs on chromium-anon, firefox-anon, webkit-anon (no auth).
 *
 * Token strategy:
 *   - Rendering tests (RP-07–RP-11, RP-17): page.route() mock to avoid rate limits
 *   - Full flow tests (RP-12–RP-14): real API calls (serial, 2 POSTs)
 */

import { test, expect, timeouts } from "../helpers";
import type { APIRequestContext } from "@playwright/test";

test.beforeEach(async () => {
  test.slow();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_TOKEN = "a".repeat(64); // syntactically valid 64-char hex

/** Generate a real reset token via the dev-mode forgot-password API. */
async function getResetToken(
  request: APIRequestContext,
  email: string,
): Promise<string> {
  const response = await request.post("/api/auth/forgot-password", {
    data: { email, turnstileToken: "" },
  });
  const body = await response.json();
  // Dev mode returns: { resetUrl: "http://…/reset-password?token=<hex>" }
  expect(body.resetUrl).toBeTruthy();
  const url = new URL(body.resetUrl);
  return url.searchParams.get("token")!;
}

/** Mock the GET token-validation endpoint to return { valid: true }. */
async function mockTokenValidation(page: import("@playwright/test").Page) {
  await page.route("**/api/auth/reset-password?token=*", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ valid: true }),
      });
    } else {
      await route.continue();
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Block 1: No Token
// ═══════════════════════════════════════════════════════════════════════════
test.describe("RP: No Token", () => {
  test("RP-01  no token → invalid link state", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(
      page.getByRole("heading", { name: /Invalid Reset Link/i }),
    ).toBeVisible({ timeout: timeouts.navigation });
    await expect(page.getByText(/invalid or has expired/i)).toBeVisible();
  });

  test("RP-02  'Request New Link' navigates to /forgot-password", async ({
    page,
  }) => {
    await page.goto("/reset-password");
    await expect(
      page.getByRole("heading", { name: /Invalid Reset Link/i }),
    ).toBeVisible({ timeout: timeouts.navigation });

    await page.getByRole("link", { name: /Request New Link/i }).click();
    await expect(page).toHaveURL(/\/forgot-password/);
  });

  test("RP-03  'Back to Login' navigates to /login", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(
      page.getByRole("heading", { name: /Invalid Reset Link/i }),
    ).toBeVisible({ timeout: timeouts.navigation });

    await page.getByRole("link", { name: /Back to Login/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Block 2: Invalid Token
// ═══════════════════════════════════════════════════════════════════════════
test.describe("RP: Invalid Token", () => {
  test("RP-04  malformed token → invalid state", async ({ page }) => {
    await page.goto("/reset-password?token=not-a-valid-token");
    await expect(
      page.getByRole("heading", { name: /Invalid Reset Link/i }),
    ).toBeVisible({ timeout: timeouts.navigation });
  });

  test("RP-05  non-existent hex token → invalid state", async ({ page }) => {
    await page.goto(`/reset-password?token=${FAKE_TOKEN}`);
    await expect(
      page.getByRole("heading", { name: /Invalid Reset Link/i }),
    ).toBeVisible({ timeout: timeouts.navigation });
  });

  test("RP-06  loading spinner during validation", async ({ page }) => {
    // Delay the GET response to catch the spinner
    await page.route("**/api/auth/reset-password?token=*", async (route) => {
      if (route.request().method() === "GET") {
        await new Promise((r) => setTimeout(r, 2_000));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ valid: false }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto(`/reset-password?token=${FAKE_TOKEN}`);
    await expect(page.getByText(/Validating reset link/i)).toBeVisible({
      timeout: 5_000,
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Block 3: Valid Token Form (Mocked Validation)
// ═══════════════════════════════════════════════════════════════════════════
test.describe("RP: Valid Token Form", () => {
  test("RP-07  renders reset form with valid token", async ({ page }) => {
    await mockTokenValidation(page);
    await page.goto(`/reset-password?token=${FAKE_TOKEN}`);

    await expect(
      page.getByRole("heading", { name: /Set new password/i }),
    ).toBeVisible({ timeout: timeouts.navigation });
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.locator("#confirmPassword")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Reset Password/i }),
    ).toBeVisible();
  });

  test("RP-08  password fields have correct attributes", async ({ page }) => {
    await mockTokenValidation(page);
    await page.goto(`/reset-password?token=${FAKE_TOKEN}`);
    await expect(page.locator("#password")).toBeVisible({
      timeout: timeouts.navigation,
    });

    await expect(page.locator("#password")).toHaveAttribute("type", "password");
    await expect(page.locator("#password")).toHaveAttribute("required", "");
    await expect(page.locator("#password")).toHaveAttribute("minlength", "12");

    await expect(page.locator("#confirmPassword")).toHaveAttribute(
      "type",
      "password",
    );
  });

  test("RP-09  visibility toggle changes field type", async ({ page }) => {
    await mockTokenValidation(page);
    await page.goto(`/reset-password?token=${FAKE_TOKEN}`);
    await expect(page.locator("#password")).toBeVisible({
      timeout: timeouts.navigation,
    });

    // Fill a password first so we can verify it toggles
    await page.locator("#password").fill("TestPassword1!");

    // Find the visibility toggle button (type="button" near the password field)
    const toggleBtn = page
      .locator("button[type='button']")
      .filter({ has: page.locator("svg") })
      .first();
    await toggleBtn.click();

    await expect(page.locator("#password")).toHaveAttribute("type", "text");

    await toggleBtn.click();
    await expect(page.locator("#password")).toHaveAttribute("type", "password");
  });

  test("RP-10  mismatched passwords → error", async ({ page }) => {
    await mockTokenValidation(page);
    await page.goto(`/reset-password?token=${FAKE_TOKEN}`);
    await expect(page.locator("#password")).toBeVisible({
      timeout: timeouts.navigation,
    });

    // Bypass HTML minLength validation
    await page.locator("#password").evaluate((el: HTMLInputElement) => {
      el.removeAttribute("minLength");
    });
    await page.locator("#confirmPassword").evaluate((el: HTMLInputElement) => {
      el.removeAttribute("minLength");
    });

    await page.locator("#password").fill("ValidPassword1!");
    await page.locator("#confirmPassword").fill("DifferentPassword1!");
    await page.getByRole("button", { name: /Reset Password/i }).click();

    await expect(page.getByText(/Passwords do not match/i)).toBeVisible();
  });

  test("RP-11  short password → error", async ({ page }) => {
    await mockTokenValidation(page);
    await page.goto(`/reset-password?token=${FAKE_TOKEN}`);
    await expect(page.locator("#password")).toBeVisible({
      timeout: timeouts.navigation,
    });

    // Remove HTML minLength to let JS validation handle it
    await page.locator("#password").evaluate((el: HTMLInputElement) => {
      el.removeAttribute("minLength");
    });
    await page.locator("#confirmPassword").evaluate((el: HTMLInputElement) => {
      el.removeAttribute("minLength");
    });

    const shortPwd = "Short1!aaaa"; // 11 chars — under 12 minimum
    await page.locator("#password").fill(shortPwd);
    await page.locator("#confirmPassword").fill(shortPwd);
    await page.getByRole("button", { name: /Reset Password/i }).click();

    await expect(
      page.getByText(/at least 12 characters/i),
    ).toBeVisible();
  });

  test("RP-17  'Back to login' link navigates to /login", async ({
    page,
  }) => {
    await mockTokenValidation(page);
    await page.goto(`/reset-password?token=${FAKE_TOKEN}`);
    await expect(
      page.getByRole("heading", { name: /Set new password/i }),
    ).toBeVisible({ timeout: timeouts.navigation });

    await page.getByText(/Back to login/i).click();
    await expect(page).toHaveURL(/\/login/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Block 4: Full Flow (Serial, Real API)
// ═══════════════════════════════════════════════════════════════════════════
test.describe.serial("RP: Full Flow", () => {
  let sharedToken: string;

  test("RP-12  complete forgot → reset flow", async ({ page, request }) => {
    // Step 1: Get a real token
    sharedToken = await getResetToken(request, "e2e-test@roomshare.dev");
    expect(sharedToken).toBeTruthy();

    // Step 2: Navigate to reset page with token
    await page.goto(`/reset-password?token=${sharedToken}`);
    await expect(
      page.getByRole("heading", { name: /Set new password/i }),
    ).toBeVisible({ timeout: timeouts.navigation });

    // Step 3: Fill form and submit
    const newPassword = "NewSecurePass123!";
    await page.locator("#password").fill(newPassword);
    await page.locator("#confirmPassword").fill(newPassword);
    await page.getByRole("button", { name: /Reset Password/i }).click();

    // Step 4: Success state
    await expect(
      page.getByRole("heading", { name: /Password Reset!/i }),
    ).toBeVisible({ timeout: timeouts.navigation });
  });

  test("RP-13  'Log in' link on success → /login", async ({
    page,
    request,
  }) => {
    // Generate a fresh token for this test
    const token = await getResetToken(request, "e2e-test@roomshare.dev");
    await page.goto(`/reset-password?token=${token}`);
    await expect(
      page.getByRole("heading", { name: /Set new password/i }),
    ).toBeVisible({ timeout: timeouts.navigation });

    await page.locator("#password").fill("AnotherSecure123!");
    await page.locator("#confirmPassword").fill("AnotherSecure123!");
    await page.getByRole("button", { name: /Reset Password/i }).click();

    await expect(
      page.getByRole("heading", { name: /Password Reset!/i }),
    ).toBeVisible({ timeout: timeouts.navigation });

    await page.getByRole("link", { name: /Log in/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("RP-14  reused token → invalid state", async ({ page }) => {
    // sharedToken was consumed by RP-12
    test.skip(!sharedToken, "No shared token from RP-12");

    await page.goto(`/reset-password?token=${sharedToken}`);
    await expect(
      page.getByRole("heading", { name: /Invalid Reset Link/i }),
    ).toBeVisible({ timeout: timeouts.navigation });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Block 5: Edge Cases
// ═══════════════════════════════════════════════════════════════════════════
test.describe("RP: Edge Cases", () => {
  test("RP-15  server error → error message", async ({ page }) => {
    await mockTokenValidation(page);

    // Mock POST to return 500
    await page.route("**/api/auth/reset-password", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Internal server error" }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto(`/reset-password?token=${FAKE_TOKEN}`);
    await expect(page.locator("#password")).toBeVisible({
      timeout: timeouts.navigation,
    });

    await page.locator("#password").fill("ValidPassword123!");
    await page.locator("#confirmPassword").fill("ValidPassword123!");
    await page.getByRole("button", { name: /Reset Password/i }).click();

    await expect(page.getByText(/Something went wrong|server error/i)).toBeVisible();
  });

  test("RP-16  loading state during submission", async ({ page }) => {
    await mockTokenValidation(page);

    // Delay POST response
    await page.route("**/api/auth/reset-password", async (route) => {
      if (route.request().method() === "POST") {
        await new Promise((r) => setTimeout(r, 3_000));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ message: "Password reset successfully" }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto(`/reset-password?token=${FAKE_TOKEN}`);
    await expect(page.locator("#password")).toBeVisible({
      timeout: timeouts.navigation,
    });

    await page.locator("#password").fill("ValidPassword123!");
    await page.locator("#confirmPassword").fill("ValidPassword123!");
    await page.getByRole("button", { name: /Reset Password/i }).click();

    // Button shows "Resetting..." with spinner
    await expect(page.getByText(/Resetting/i)).toBeVisible({ timeout: 3_000 });
  });
});
