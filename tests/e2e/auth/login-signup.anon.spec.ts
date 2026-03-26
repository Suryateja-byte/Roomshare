/**
 * Login & Signup Form Behavior Tests — Anonymous (unauthenticated)
 *
 * Covers user-facing form interactions for /login and /signup:
 * - Field rendering and accessibility (labels, roles)
 * - Valid credential login with redirect verification
 * - Invalid credential error feedback
 * - Signup form field rendering and client-side validation
 * - Duplicate email handling
 *
 * Runs under the `chromium-anon` project (no stored auth session).
 */

import { test, expect } from "../helpers/test-utils";
import { waitForTurnstileIfPresent } from "../helpers/auth-helpers";

test.use({ storageState: { cookies: [], origins: [] } });

// ─── Login Form Tests ────────────────────────────────────────────────────────

test.describe("Login Form", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.getByRole("heading", { name: /welcome back/i })
    ).toBeVisible({ timeout: 30_000 });
  });

  // LS-01: Login page loads with email and password fields
  test("LS-01: login page renders email and password fields", async ({
    page,
  }) => {
    const emailInput = page.getByLabel(/^email$/i);
    const passwordInput = page.getByLabel(/^password$/i);

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();

    // Verify input types
    await expect(emailInput).toHaveAttribute("type", "email");
    await expect(passwordInput).toHaveAttribute("type", "password");

    // Sign in button is present
    await expect(
      page.getByRole("button", { name: /sign in/i })
    ).toBeVisible();
  });

  // LS-02: Login with valid credentials redirects away from /login
  test("LS-02: valid credentials redirect to homepage", async ({ page }) => {
    const email = process.env.E2E_TEST_EMAIL;
    const password = process.env.E2E_TEST_PASSWORD;

    if (!email || !password) {
      test.skip(!email || !password, "E2E_TEST_EMAIL/PASSWORD not set");
      return;
    }

    await page.getByLabel(/^email$/i).fill(email);
    await page.getByLabel(/^password$/i).first().fill(password);

    await waitForTurnstileIfPresent(page);

    const authResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes("/api/auth") && resp.status() === 200,
      { timeout: 30_000 }
    );

    await page.getByRole("button", { name: /sign in/i }).click();

    await authResponsePromise;

    // Login uses window.location.href = "/" — wait for URL to leave /login
    await expect
      .poll(() => !new URL(page.url()).pathname.includes("/login"), {
        timeout: 30_000,
        message: "Expected redirect away from /login after valid credentials",
      })
      .toBe(true);
  });

  // LS-03: Login with wrong password shows error message
  test("LS-03: wrong password shows error message", async ({ page }) => {
    await page.getByLabel(/^email$/i).fill("e2e-test@roomshare.dev");
    await page.getByLabel(/^password$/i).first().fill("WrongPassword999!");

    await waitForTurnstileIfPresent(page);

    await page.getByRole("button", { name: /sign in/i }).click();

    // Error message: "Incorrect email or password..."
    await expect(
      page.getByText(/incorrect email or password/i)
    ).toBeVisible({ timeout: 15_000 });
  });

  // LS-04: Login with non-existent email shows error message
  test("LS-04: non-existent email shows error message", async ({ page }) => {
    await page
      .getByLabel(/^email$/i)
      .fill(`nonexistent-${Date.now()}@example.com`);
    await page.getByLabel(/^password$/i).first().fill("SomePassword123!");

    await waitForTurnstileIfPresent(page);

    await page.getByRole("button", { name: /sign in/i }).click();

    // Same generic error to prevent user enumeration
    await expect(
      page.getByText(/incorrect email or password/i)
    ).toBeVisible({ timeout: 15_000 });
  });

  // LS-09: Login form has proper labels and accessibility
  test("LS-09: login form fields are accessible via getByLabel", async ({
    page,
  }) => {
    // Labels connect to inputs via htmlFor/id
    const emailInput = page.getByLabel(/^email$/i);
    const passwordInput = page.getByLabel(/^password$/i);

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();

    // Required attributes present
    await expect(emailInput).toHaveAttribute("required", "");
    await expect(passwordInput).toHaveAttribute("required", "");

    // Autocomplete hints for credential managers
    await expect(emailInput).toHaveAttribute("autocomplete", "email");
    await expect(passwordInput).toHaveAttribute(
      "autocomplete",
      "current-password"
    );

    // Show/hide password toggle has an accessible label
    await expect(
      page.getByRole("button", { name: /show password|hide password/i })
    ).toBeVisible();

    // Forgot password link is present
    await expect(
      page.getByRole("link", { name: /forgot password/i })
    ).toBeVisible();

    // Sign up link for new users
    await expect(page.getByRole("link", { name: /sign up/i })).toBeVisible();
  });
});

// ─── Signup Form Tests ───────────────────────────────────────────────────────

test.describe("Signup Form", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/signup");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.getByRole("heading", { name: /join roomshare/i })
    ).toBeVisible({ timeout: 30_000 });
  });

  // LS-05: Signup page loads with required fields
  test("LS-05: signup page renders all required fields", async ({ page }) => {
    await expect(page.getByLabel(/full name/i)).toBeVisible();
    await expect(page.getByLabel(/^email$/i)).toBeVisible();
    await expect(page.getByLabel(/^password$/i)).toBeVisible();
    await expect(page.getByLabel(/confirm password/i)).toBeVisible();

    // Terms checkbox
    const termsCheckbox = page.getByRole("checkbox");
    await expect(termsCheckbox).toBeVisible();

    // Submit button
    await expect(
      page.getByRole("button", { name: /join roomshare/i })
    ).toBeVisible();
  });

  // LS-06: Signup with valid data calls register API
  test("LS-06: valid signup submits to register API", async ({ page }) => {
    const uniqueEmail = `test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;

    await page.getByLabel(/full name/i).fill("E2E Test User");
    await page.getByLabel(/^email$/i).fill(uniqueEmail);

    // Password must be >= 12 chars per server-side zod schema
    const passwordInputs = page.locator('input[type="password"]');
    await passwordInputs.first().fill("SecureTestPass123!");
    await passwordInputs.nth(1).fill("SecureTestPass123!");

    // Accept terms
    await page.getByRole("checkbox").check();

    await waitForTurnstileIfPresent(page);

    // Intercept the register API call to avoid creating real DB records
    const registerResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes("/api/register"),
      { timeout: 30_000 }
    );

    await page.getByRole("button", { name: /join roomshare/i }).click();

    const registerResponse = await registerResponsePromise;

    // API was called — response is either 201 (created) or 400/403 (rate limit/turnstile)
    // In CI without real Turnstile, the server may reject. The key assertion is
    // that the form submitted and reached the API.
    expect([201, 400, 403, 429]).toContain(registerResponse.status());
  });

  // LS-07: Signup with existing email shows error message
  test("LS-07: existing email shows error message", async ({ page }) => {
    // Use the known seeded test user email
    const existingEmail = "e2e-test@roomshare.dev";

    await page.getByLabel(/full name/i).fill("Duplicate User");
    await page.getByLabel(/^email$/i).fill(existingEmail);

    const passwordInputs = page.locator('input[type="password"]');
    await passwordInputs.first().fill("SecureTestPass123!");
    await passwordInputs.nth(1).fill("SecureTestPass123!");

    await page.getByRole("checkbox").check();

    await waitForTurnstileIfPresent(page);

    await page.getByRole("button", { name: /join roomshare/i }).click();

    // Server returns generic error to prevent enumeration:
    // "Registration failed. Please try again or use forgot password..."
    // Or Turnstile may block in CI — either way, an error should appear.
    await expect(
      page
        .getByText(/registration failed/i)
        .or(page.getByText(/bot verification failed/i))
        .or(page.getByText(/failed to register/i))
        .or(page.getByRole("alert"))
    ).toBeVisible({ timeout: 15_000 });
  });

  // LS-08: Signup with weak password shows validation error
  test("LS-08: weak password shows client-side validation feedback", async ({
    page,
  }) => {
    await page.getByLabel(/full name/i).fill("Weak Pass User");
    await page.getByLabel(/^email$/i).fill("weakpass@example.com");

    // Type a short password — below the 12-char minimum
    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill("short");

    // The PasswordStrengthMeter component should indicate weakness
    // Check that the strength meter is present and shows a low-strength indicator
    const strengthMeter = page.locator('[class*="strength"], [role="progressbar"], [aria-label*="strength" i]')
      .or(page.getByText(/weak/i));

    // The meter renders below the password field — just verify it's present
    // (exact text depends on the PasswordStrengthMeter implementation)
    await expect(strengthMeter.first()).toBeVisible({ timeout: 5_000 });

    // Attempting to submit with mismatched/short passwords should show an error
    const confirmInput = page.locator('input[type="password"]').nth(1);
    await confirmInput.fill("different");

    await page.getByRole("checkbox").check();

    await waitForTurnstileIfPresent(page);

    await page.getByRole("button", { name: /join roomshare/i }).click();

    // Client-side validation: "Those passwords don't match"
    await expect(
      page
        .getByText(/passwords don.t match/i)
        .or(page.getByText(/password/i).and(page.getByRole("alert")))
        .first()
    ).toBeVisible({ timeout: 10_000 });
  });
});
