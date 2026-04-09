import { Page, expect } from "@playwright/test";

/**
 * Centralized mock session token for route-level auth mocking.
 * Use this instead of hardcoding 'mock-session-token' in specs.
 */
export const MOCK_SESSION_TOKEN = "mock-session-token";

/**
 * Wait for Turnstile to auto-solve, or skip if widget not rendered.
 * When NEXT_PUBLIC_TURNSTILE_SITE_KEY is absent, TurnstileWidget returns null
 * and no hidden input is created — this function detects that and proceeds.
 * See: https://developers.cloudflare.com/turnstile/tutorials/excluding-turnstile-from-e2e-tests/
 *
 * With Cloudflare's always-pass test site key (1x00000000000000000000AA) the
 * widget should auto-solve within ~5s. We wait up to `timeout` ms for the
 * hidden response field to get a value, but we also accept success if the
 * submit button becomes enabled (token received via React state callback).
 * If neither condition is met within the timeout, we proceed anyway — the
 * server-side validator uses the same test key which always passes.
 */
export async function waitForTurnstileIfPresent(
  page: Page,
  timeout = 20_000
): Promise<void> {
  // First check: is there a Turnstile widget at all?
  const widgetExists = await page
    .locator('[data-testid="turnstile-widget"]')
    .count()
    .then((c) => c > 0)
    .catch(() => false);

  if (!widgetExists) return; // No widget — skip Turnstile wait entirely

  // Wait for either the hidden response field to populate (Cloudflare widget
  // solved) OR the submit button to become enabled (React state updated).
  // Wrap in try/catch so a timeout doesn't abort the entire auth setup —
  // with the always-pass test key the server will accept the empty token.
  await page
    .waitForFunction(
      () => {
        const widget = document.querySelector('[data-testid="turnstile-widget"]');
        if (!widget) return true;
        // Check hidden response field
        const input = document.querySelector(
          'input[name="cf-turnstile-response"]'
        ) as HTMLInputElement | null;
        if (input && input.value.length > 0) return true;
        // Check submit button enabled (token received via React state)
        const submitBtn = document.querySelector(
          'button[type="submit"]'
        ) as HTMLButtonElement | null;
        return submitBtn !== null && !submitBtn.disabled;
      },
      { timeout }
    )
    .catch(() => {
      // Turnstile did not resolve in time. Proceed anyway — with the Cloudflare
      // always-pass test keys (1x00000000000000000000AA / 1x0000...AA) the
      // server-side check always returns valid regardless of the token value.
      // The button will still be clicked via force:true in the caller if needed.
    });
}

/**
 * Authentication helper functions
 */
export const authHelpers = {
  /**
   * Get test user credentials from environment
   */
  getCredentials() {
    return {
      email: process.env.E2E_TEST_EMAIL || "test@example.com",
      password: process.env.E2E_TEST_PASSWORD || "TestPassword123!",
    };
  },

  /**
   * Get admin credentials from environment
   */
  getAdminCredentials() {
    return {
      email: process.env.E2E_ADMIN_EMAIL || "admin@example.com",
      password: process.env.E2E_ADMIN_PASSWORD || "AdminPassword123!",
    };
  },

  /**
   * Login via UI (for tests without pre-authenticated state)
   */
  async loginViaUI(page: Page, email?: string, password?: string) {
    const creds = this.getCredentials();
    const useEmail = email || creds.email;
    const usePassword = password || creds.password;

    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    // Wait for the login form to render (Suspense boundary + hydration)
    await expect(
      page.getByRole("heading", { name: /log in|sign in|welcome back/i })
    ).toBeVisible({ timeout: 30000 });

    await page.getByLabel(/email/i).first().fill(useEmail);
    await page
      .getByLabel(/password/i)
      .first()
      .fill(usePassword);

    // Wait for Turnstile widget to auto-solve (skips if widget not rendered)
    await waitForTurnstileIfPresent(page);

    await page
      .getByRole("button", { name: /sign in|log in|login/i })
      .first()
      .click();

    // Wait for redirect away from login
    // Login uses window.location.href = '/' (full page navigation)
    await expect
      .poll(() => !new URL(page.url()).pathname.includes("/login"), {
        timeout: 30000,
        message: "Expected to navigate away from login after auth",
      })
      .toBe(true);
  },

  /**
   * Register a new user via UI
   */
  async registerViaUI(
    page: Page,
    options: {
      email: string;
      password: string;
      name?: string;
    }
  ) {
    await page.goto("/signup");
    await page.waitForLoadState("domcontentloaded");

    // Wait for the signup form to render (Suspense boundary + hydration)
    await expect(
      page.getByRole("heading", { name: /sign up|create.*account|register|join/i })
    ).toBeVisible({ timeout: 30000 });

    // Fill registration form
    if (options.name) {
      await page.getByLabel(/name/i).first().fill(options.name);
    }
    await page.getByLabel(/email/i).first().fill(options.email);

    // Handle password fields (might be "password" and "confirm password")
    const passwordInputs = page.locator('input[type="password"]');
    const count = await passwordInputs.count();

    if (count >= 2) {
      await passwordInputs.first().fill(options.password);
      await passwordInputs.nth(1).fill(options.password);
    } else {
      await passwordInputs.first().fill(options.password);
    }

    // Wait for Turnstile widget to auto-solve (skips if widget not rendered)
    await waitForTurnstileIfPresent(page);

    await page
      .getByRole("button", { name: /sign up|register|create account/i })
      .first()
      .click();

    // Wait for redirect or success message
    await expect(page).not.toHaveURL(/\/signup/, { timeout: 30000 });
  },

  /**
   * Logout via UI
   */
  async logoutViaUI(page: Page) {
    // On mobile, open hamburger menu first to reveal nav items
    const viewport = page.viewportSize();
    const isMobile = viewport ? viewport.width < 768 : false;

    if (isMobile) {
      const hamburger = page
        .getByRole("button", { name: /menu/i })
        .or(page.locator('[data-testid="mobile-menu"]'))
        .or(page.locator('[class*="hamburger"]'));
      const hamburgerVisible = await hamburger
        .first()
        .isVisible()
        .catch(() => false);
      if (hamburgerVisible) {
        await hamburger.first().click();
        // Wait for mobile menu to be visible after hamburger click
        const menu = page
          .getByRole("navigation")
          .or(page.locator('[data-testid="mobile-menu"]'))
          .or(page.locator('[role="menu"]'));
        await expect(menu.first()).toBeVisible({ timeout: 5000 });
      }
    }

    // Use the exact aria-label selector — avoids .or() chains where .first()
    // can resolve to different elements between waitFor and click calls.
    const userMenuButton = page.locator('[aria-label="User menu"]');

    // Wait for the button to be attached and visible
    await userMenuButton.waitFor({ state: "visible", timeout: 30000 });
    // The _disableAnimations fixture sets transition-duration: 0s !important,
    // so the button's transition-all duration-300 no longer causes instability.
    await userMenuButton.click();

    // Click logout option
    const logoutOption = page
      .getByRole("menuitem", { name: /log ?out|sign ?out/i })
      .or(page.getByRole("button", { name: /log ?out|sign ?out/i }));

    await logoutOption.first().click();

    // Verify logged out
    await expect(page).toHaveURL(/\/(login)?$/, { timeout: 30000 });
  },

  /**
   * Check if currently logged in.
   * On mobile viewports the user menu may be hidden behind a hamburger menu,
   * so we check for DOM attachment rather than visibility.
   */
  async isLoggedIn(page: Page): Promise<boolean> {
    try {
      const userMenu = page
        .getByRole("button", { name: /menu|profile|account/i })
        .or(page.locator('[data-testid="user-menu"]'))
        .or(page.locator('[aria-label*="user"]'));

      // On mobile, nav items are hidden behind hamburger — check attached instead of visible
      const viewport = page.viewportSize();
      const isMobile = viewport ? viewport.width < 768 : false;

      if (isMobile) {
        await userMenu.first().waitFor({ state: "attached", timeout: 5000 });
      } else {
        await userMenu.first().waitFor({ state: "visible", timeout: 5000 });
      }
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Navigate to a protected route and verify auth redirect
   */
  async verifyAuthRequired(page: Page, protectedUrl: string) {
    await page.goto(protectedUrl);

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/, { timeout: 30000 });
  },

  /**
   * Verify admin access
   */
  async verifyAdminAccess(page: Page) {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin/);
    await expect(
      page.locator("h1, h2").filter({ hasText: /admin/i }).first()
    ).toBeVisible();
  },

  /**
   * Verify admin access denied for non-admin
   */
  async verifyAdminDenied(page: Page) {
    await page.goto("/admin");

    // Should redirect away or show access denied
    // Wait for either a redirect away from /admin or an access denied message.
    // Client-side auth redirects may fire after domcontentloaded, so we
    // race a URL change against a visible denial message.
    const redirected = await page
      .waitForURL((url) => !url.pathname.startsWith("/admin"), {
        timeout: 10_000,
      })
      .then(() => true)
      .catch(() => false);

    if (!redirected) {
      // Still on /admin — must show access denied
      await expect(
        page.locator("text=/access denied|unauthorized|forbidden/i")
      ).toBeVisible({ timeout: 5_000 });
    }
  },

  /**
   * Generate unique test email
   */
  generateTestEmail(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    return `test-${timestamp}-${random}@example.com`;
  },
};
