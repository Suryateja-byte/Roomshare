/**
 * Session Expiry E2E Test Helpers
 *
 * Reusable utilities for simulating mid-session auth token expiry.
 * Combines cookie clearing, session endpoint mocking, and API 401 mocking
 * to test how components react when the user's session expires.
 *
 * Cookie name: `authjs.session-token` (NextAuth v5 / Auth.js beta 30)
 */

import { Page, Route } from "@playwright/test";
import { expect } from "@playwright/test";

const AUTH_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "authjs.csrf-token",
  "__Host-authjs.csrf-token",
  "authjs.callback-url",
  "__Secure-authjs.callback-url",
];

export async function clearAuthCookies(page: Page): Promise<void> {
  const currentCookies = await page.context().cookies();
  const matchingCookies = currentCookies.filter((cookie) =>
    AUTH_COOKIES.includes(cookie.name)
  );

  if (matchingCookies.length === 0) {
    for (const cookie of AUTH_COOKIES) {
      await page.context().clearCookies({ name: cookie });
    }
    return;
  }

  for (const cookie of matchingCookies) {
    await page.context().clearCookies({
      name: cookie.name,
      domain: cookie.domain,
      path: cookie.path,
    });
  }
}

/**
 * Expire session by clearing all auth cookies + optionally mocking session endpoint.
 *
 * @param page - Playwright page
 * @param options.mockEndpoint - Also mock /api/auth/session to return {} (default: true)
 * @param options.triggerRefetch - Dispatch a focus event to force SessionProvider refetch (default: false)
 */
export async function expireSession(
  page: Page,
  options: { mockEndpoint?: boolean; triggerRefetch?: boolean } = {}
): Promise<void> {
  const { mockEndpoint = true, triggerRefetch = false } = options;

  await clearAuthCookies(page);

  if (mockEndpoint) {
    await page.route("**/api/auth/session", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}",
      });
    });
  }

  if (triggerRefetch) {
    // Set up response waiter before dispatching events
    const sessionResponse = page.waitForResponse(
      (resp) => resp.url().includes("/api/auth/session"),
      { timeout: 10_000 }
    );
    // Dispatch both focus and visibilitychange to maximize chance of triggering
    // SessionProvider's refetchOnWindowFocus. Playwright's synthetic events may not
    // always trigger the same listeners as real user interactions.
    await page.evaluate(() => {
      window.dispatchEvent(new Event("focus"));
      Object.defineProperty(document, "visibilityState", {
        value: "visible",
        writable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    // Wait for SessionProvider to actually refetch the session endpoint
    await sessionResponse;
  }
}

/**
 * Mock a specific API endpoint to return 401 Unauthorized.
 *
 * @param page - Playwright page
 * @param urlPattern - URL string or regex to intercept
 * @param options.method - Only intercept this HTTP method (e.g. 'POST')
 */
export async function mockApi401(
  page: Page,
  urlPattern: string | RegExp,
  options?: { method?: string }
): Promise<void> {
  await page.route(urlPattern, async (route: Route) => {
    if (options?.method && route.request().method() !== options.method) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "Unauthorized" }),
    });
  });
}

/**
 * Trigger SessionProvider refetch immediately via window focus event.
 * SessionProvider (refetchOnWindowFocus: true) will call /api/auth/session.
 */
export async function triggerSessionPoll(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
}

/**
 * Assert page redirected to /login, optionally checking callbackUrl.
 * Handles NextAuth redirecting to /login, /signin, or /auth paths,
 * and URL-encoded callbackUrl values.
 */
export async function expectLoginRedirect(
  page: Page,
  callbackUrl?: string,
  timeout = 30000
): Promise<void> {
  // Poll for redirect — may go through /api/auth/signin first,
  // and may take a moment after domcontentloaded to complete.
  await expect
    .poll(() => /\/(login|signin|auth)/.test(page.url()), {
      timeout,
      message: `Expected URL to contain /login, /signin, or /auth but got: ${page.url()}`,
    })
    .toBe(true);
  if (callbackUrl) {
    const url = new URL(page.url());
    const raw = url.searchParams.get("callbackUrl") ?? url.search;
    // Handle both encoded (%2F) and decoded (/) forms
    const decoded = decodeURIComponent(raw);
    expect(decoded).toContain(callbackUrl);
  }
}

/**
 * Assert sessionStorage draft was preserved after session expiry.
 *
 * @returns The stored draft value
 */
export async function expectDraftSaved(
  page: Page,
  key: string,
  expectedContent?: string
): Promise<string | null> {
  const value = await page.evaluate((k) => sessionStorage.getItem(k), key);
  expect(value).not.toBeNull();
  if (expectedContent) {
    expect(value).toContain(expectedContent);
  }
  return value;
}
