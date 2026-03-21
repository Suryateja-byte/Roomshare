/**
 * Auth Boundary Tests — Anonymous (unauthenticated) user access
 *
 * Verifies that protected pages properly redirect unauthenticated users
 * to /login and do not leak any private data.
 *
 * Gap coverage identified by depth audit:
 * - /profile — no prior anon redirect test
 * - /profile/edit — no prior anon redirect test
 * - /listings/create — no prior anon redirect test
 * - /admin/* (regular user) — no prior non-admin boundary test
 *
 * Runs under the `chromium-anon` project (no stored auth session).
 */

import { test, expect } from "@playwright/test";

test.beforeEach(async () => {
  test.slow();
});

// ─── AB-01: /profile redirects unauthenticated user ─────────────────────────
test.describe("Auth Boundary: Profile", () => {
  test("AB-01: unauthenticated user visiting /profile is redirected to /login", async ({
    page,
  }) => {
    await page.goto("/profile");
    await page.waitForLoadState("domcontentloaded");

    // Server-side auth check should redirect to /login
    await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });

    // Login form should be visible — no private data leaked
    await expect(
      page.getByRole("heading", { name: /log in|sign in|welcome back/i })
    ).toBeVisible({ timeout: 15_000 });

    // No profile data should be visible on the login page
    await expect(page.getByTestId("profile-page")).not.toBeVisible();
  });

  test("AB-02: unauthenticated user visiting /profile/edit is redirected to /login", async ({
    page,
  }) => {
    await page.goto("/profile/edit");
    await page.waitForLoadState("domcontentloaded");

    // Should redirect to /login (possibly with callbackUrl)
    await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });

    // No edit form should be visible
    await expect(page.locator('form[action*="profile"]')).not.toBeVisible();
  });
});

// ─── AB-03: /listings/create redirects unauthenticated user ──────────────────
test.describe("Auth Boundary: Create Listing", () => {
  test("AB-03: unauthenticated user visiting /listings/create is redirected to /login", async ({
    page,
  }) => {
    await page.goto("/listings/create");
    await page.waitForLoadState("domcontentloaded");

    // Should redirect to /login
    await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });

    // No listing creation form should be visible
    await expect(
      page.getByRole("heading", { name: /create.*listing|new.*listing/i })
    ).not.toBeVisible();
  });
});

// ─── AB-04: /saved-searches redirects unauthenticated user ───────────────────
test.describe("Auth Boundary: Saved Searches", () => {
  test("AB-04: unauthenticated user visiting /saved-searches is redirected to /login", async ({
    page,
  }) => {
    await page.goto("/saved-searches");
    await page.waitForLoadState("domcontentloaded");

    // Should redirect to /login
    await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
  });
});

// ─── AB-05: Protected API endpoints return 401 for unauthenticated requests ──
test.describe("Auth Boundary: API endpoints", () => {
  test("AB-05: /api/favorites POST returns 401 without auth", async ({
    request,
  }) => {
    const response = await request.post("/api/favorites", {
      data: { listingId: "nonexistent-id" },
    });

    // API may return 401 (Unauthorized) or 403 (Forbidden) — both are valid
    expect([401, 403]).toContain(response.status());
    const body = await response.json();
    expect(body).toHaveProperty("error");
    // Must not contain stack traces or SQL
    expect(JSON.stringify(body)).not.toMatch(/at\s+\w+\s+\(|SELECT|INSERT/);
  });

  test("AB-06: /api/messages POST returns 401 without auth", async ({
    request,
  }) => {
    const response = await request.post("/api/messages", {
      data: { conversationId: "test", content: "test" },
    });

    expect([401, 403]).toContain(response.status());
    const body = await response.json();
    expect(body).toHaveProperty("error");
    // Error message should not leak internal details
    expect(JSON.stringify(body)).not.toMatch(/at\s+\w+\s+\(|SELECT|INSERT/);
  });

  test("AB-07: /api/listings POST returns 401 without auth", async ({
    request,
  }) => {
    const response = await request.post("/api/listings", {
      data: { title: "Test" },
    });

    expect([401, 403]).toContain(response.status());
    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(JSON.stringify(body)).not.toMatch(/at\s+\w+\s+\(|SELECT|INSERT/);
  });
});
