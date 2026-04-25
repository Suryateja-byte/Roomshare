import { test as setup, expect, Page } from "@playwright/test";
import path from "path";

const authFile = path.join(__dirname, "../../playwright/.auth/user.json");

/**
 * Shared login helper — authenticates via the Auth.js credentials callback,
 * verifies the session, and saves the authenticated storage state.
 */
async function loginAndSaveState(
  page: Page,
  email: string,
  password: string,
  stateFile: string
) {
  const callbackUrl = new URL(
    "/",
    process.env.E2E_BASE_URL || "http://localhost:3000"
  ).toString();

  const csrfResponse = await page.request.get("/api/auth/csrf");
  expect(csrfResponse.ok()).toBeTruthy();

  const csrfData = (await csrfResponse.json()) as { csrfToken?: string };
  expect(csrfData.csrfToken).toBeTruthy();

  const loginResponse = await page.request.post(
    "/api/auth/callback/credentials",
    {
      form: {
        email,
        password,
        csrfToken: csrfData.csrfToken!,
        callbackUrl,
        json: "true",
        // Cloudflare's test keys accept deterministic fake tokens in E2E.
        turnstileToken: "test-token",
      },
      failOnStatusCode: false,
      maxRedirects: 0,
    }
  );

  expect([200, 302]).toContain(loginResponse.status());

  await expect
    .poll(
      async () => {
        const sessionResponse = await page.request.get("/api/auth/session");
        if (!sessionResponse.ok()) return null;

        const sessionData = (await sessionResponse.json()) as
          | {
              user?: { email?: string };
            }
          | null;

        return sessionData?.user?.email?.toLowerCase() ?? null;
      },
      {
        timeout: 10_000,
        message: `Waiting for authenticated session for ${email}`,
      }
    )
    .toBe(email.toLowerCase());

  // Hydrate a real page with the authenticated browser context before
  // persisting storage state so downstream specs inherit verified cookies.
  await page.goto("/");

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

setup("authenticate as reviewer", async ({ page }) => {
  const reviewerAuthFile = path.join(
    __dirname,
    "../../playwright/.auth/reviewer.json"
  );

  await loginAndSaveState(
    page,
    "e2e-reviewer@roomshare.dev",
    "TestPassword123!",
    reviewerAuthFile
  );

  await expect(
    page
      .getByRole("button", { name: /menu|profile|account/i })
      .or(page.locator('[data-testid="user-menu"]'))
      .or(page.locator('[aria-label*="user"]'))
  ).toBeVisible({ timeout: 10000 });
});
