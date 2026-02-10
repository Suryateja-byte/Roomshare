/**
 * Auth Page Journeys — Anonymous (unauthenticated) user tests
 *
 * These test login/signup/forgot-password pages as an unauthenticated user.
 * Runs under the `chromium-anon` project (no stored auth session).
 */

import { test, expect } from "@playwright/test";

test.beforeEach(async () => {
  test.slow();
});

// ─── J7: Login Page (Unauthenticated) ────────────────────────────────────────
test.describe("J7: Login Page (Unauthenticated)", () => {
  test("renders login form with email and password fields", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");
    // Wait for the login form to render (Suspense boundary + hydration)
    await expect(page.getByRole('heading', { name: /log in|sign in|welcome back/i })).toBeVisible({ timeout: 30000 });

    // Should have email field
    const emailField = page
      .getByLabel(/email/i)
      .or(page.locator('input[type="email"]'))
      .or(page.locator('input[name="email"]'));
    await expect(emailField.first()).toBeVisible({ timeout: 15000 });

    // Should have password field
    const passwordField = page
      .getByLabel('Password', { exact: true })
      .or(page.locator('input[type="password"]'));
    await expect(passwordField.first()).toBeVisible();

    // Should have submit button
    const submitBtn = page
      .getByRole("button", { name: /log ?in|sign ?in|submit/i })
      .or(page.locator('button[type="submit"]'));
    await expect(submitBtn.first()).toBeVisible();

    // Submit empty form — should stay on login page
    await submitBtn.first().click();
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/login/);
  });

  test("has link to signup page", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");
    // Wait for the login form to render (Suspense boundary + hydration)
    await expect(page.getByRole('heading', { name: /log in|sign in|welcome back/i })).toBeVisible({ timeout: 30000 });

    const signupLink = page
      .getByRole("link", { name: /sign ?up|create|register/i })
      .or(page.locator('a[href*="/signup"]'));
    await expect(signupLink.first()).toBeVisible({ timeout: 15000 });
  });
});

// ─── J8: Signup Page (Unauthenticated) ───────────────────────────────────────
test.describe("J8: Signup Page (Unauthenticated)", () => {
  test("renders signup form with required fields", async ({ page }) => {
    await page.goto("/signup");
    await page.waitForLoadState("domcontentloaded");
    // Wait for the signup form to render (Suspense boundary + hydration)
    await expect(page.getByRole('heading', { name: /sign up|create.*account|register/i })).toBeVisible({ timeout: 30000 });

    // Should have email field
    const emailField = page
      .getByLabel(/email/i)
      .or(page.locator('input[type="email"]'));
    await expect(emailField.first()).toBeVisible({ timeout: 15000 });

    // Should have password field
    const passwordField = page
      .getByLabel('Password', { exact: true })
      .or(page.locator('input[type="password"]'));
    await expect(passwordField.first()).toBeVisible();

    // Should have link to login
    const loginLink = page
      .getByRole("link", { name: /log ?in|sign ?in|already have/i })
      .or(page.locator('a[href*="/login"]'));
    await expect(loginLink.first()).toBeVisible();
  });
});

// ─── J9: Forgot Password Page (Unauthenticated) ─────────────────────────────
test.describe("J9: Forgot Password Page (Unauthenticated)", () => {
  test("renders forgot password form with email field", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.waitForLoadState("domcontentloaded");

    // Should have email input
    const emailField = page
      .getByLabel(/email/i)
      .or(page.locator('input[type="email"]'))
      .or(page.locator('input[name="email"]'));
    await expect(emailField.first()).toBeVisible({ timeout: 15000 });

    // Should have submit button
    const submitBtn = page
      .getByRole("button", { name: /reset|send|submit/i })
      .or(page.locator('button[type="submit"]'));
    await expect(submitBtn.first()).toBeVisible();
  });
});
