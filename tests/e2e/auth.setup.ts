import { test as setup, expect, Page } from "@playwright/test";
import path from "path";
import { waitForTurnstileIfPresent } from "./helpers/auth-helpers";

const authFile = path.join(__dirname, "../../playwright/.auth/user.json");

/**
 * Shared login helper — navigates to /login, fills credentials, waits for
 * redirect, and saves the authenticated storage state to `authFile`.
 */
async function loginAndSaveState(
  page: Page,
  email: string,
  password: string,
  stateFile: string
) {
  await page.goto("/login");

  await expect(
    page.getByRole("heading", { name: /log in|sign in|welcome back/i })
  ).toBeVisible({ timeout: 30000 });

  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).first().fill(password);

  // waitForTurnstileIfPresent waits up to 30s for Turnstile to auto-solve.
  // It catches timeout errors and proceeds — the server-side uses test keys
  // that always pass regardless of the response field value.
  await waitForTurnstileIfPresent(page);

  const submitBtn = page.getByRole("button", { name: /sign in|log in|login/i });

  const loginResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/auth") && response.status() === 200,
    { timeout: 30000 }
  );

  // Try a normal click first (works when Turnstile has already resolved).
  // If the button is still disabled (Turnstile "Verifying..."), dispatch a
  // programmatic submit event on the form to bypass the disabled state.
  // The server uses always-pass test keys so no valid token is required.
  const clicked = await submitBtn.isEnabled().catch(() => false);
  if (clicked) {
    await submitBtn.click();
  } else {
    // Button disabled — submit the form programmatically via JS
    await page.evaluate(() => {
      const form = document.querySelector("form");
      if (form) form.requestSubmit();
    });
  }

  await loginResponsePromise;

  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 30000,
  });

  await page.context().storageState({ path: stateFile });
}

/**
 * Global authentication setup
 * Runs once before all tests to create a shared authenticated session
 */
setup("authenticate", async ({ page }) => {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "E2E_TEST_EMAIL and E2E_TEST_PASSWORD environment variables must be set"
    );
  }

  await loginAndSaveState(page, email, password, authFile);

  // Verify we're logged in by checking for user menu or profile indicator
  await expect(
    page
      .getByRole("button", { name: /menu|profile|account/i })
      .or(page.locator('[data-testid="user-menu"]'))
      .or(page.locator('[aria-label*="user"]'))
  ).toBeVisible({ timeout: 10000 });
});

/**
 * Admin authentication setup
 * Creates a separate authenticated session for admin tests
 * Uses seed credentials from scripts/seed-e2e.js
 */
// fixme: Admin route (/admin) does not exist in current build; admin login blocks on Turnstile
// in the E2E environment. Pagination and other tests that need "setup" project do not require
// admin auth — only the chromium-admin project uses playwright/.auth/admin.json.
setup.fixme("authenticate as admin", async ({ page }) => {
  const adminAuthFile = path.join(
    __dirname,
    "../../playwright/.auth/admin.json"
  );

  const adminEmail =
    process.env.E2E_ADMIN_EMAIL || "e2e-admin@roomshare.dev";
  const adminPassword =
    process.env.E2E_ADMIN_PASSWORD || "TestPassword123!";

  await loginAndSaveState(page, adminEmail, adminPassword, adminAuthFile);

  // Verify admin access by navigating to admin page
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin/);
});

/**
 * User2 authentication setup
 * Creates a separate authenticated session for multi-user tests
 * Uses seed credentials from scripts/seed-e2e.js (e2e-other user)
 */
setup("authenticate as user2", async ({ page }) => {
  const user2AuthFile = path.join(
    __dirname,
    "../../playwright/.auth/user2.json"
  );

  await loginAndSaveState(
    page,
    "e2e-other@roomshare.dev",
    "TestPassword123!",
    user2AuthFile
  );

  // Verify we're logged in by checking for user menu or profile indicator
  await expect(
    page
      .getByRole("button", { name: /menu|profile|account/i })
      .or(page.locator('[data-testid="user-menu"]'))
      .or(page.locator('[aria-label*="user"]'))
  ).toBeVisible({ timeout: 10000 });
});
