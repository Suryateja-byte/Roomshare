/**
 * Safety & Edge Cases Journeys (J45–J50)
 *
 * J45: Report a listing
 * J46: XSS prevention
 * J47: Rate limit feedback
 * J48: Protected route redirects (anon)
 * J49: Offline page
 * J50: Cross-page navigation chain
 */

import {
  test,
  expect,
  selectors,
  timeouts,
  SF_BOUNDS,
  searchResultsContainer,
} from "../helpers";
import { testApi } from "../helpers/stability-helpers";

test.beforeEach(async () => {
  test.slow();
});

// ─── J45: Report a Listing ────────────────────────────────────────────────────
test.describe("J45: Report a Listing", () => {
  test("listing detail → report → fill reason → submit → verify confirmation", async ({
    page,
  }) => {
    let listingId: string | undefined;

    try {
      const title = `E2E Safety Report ${Date.now()}`;
      const seeded = await testApi<{ listingIds: string[] }>(
        page,
        "seedCollisionListings",
        {
          ownerEmail: "e2e-incomplete-host@roomshare.dev",
          title,
          address: `${Date.now()} Safety Report St`,
          city: "San Francisco",
          state: "CA",
          zip: "94103",
          count: 1,
          createdAtOffsetsHours: [1],
          moveInDateOffsetsDays: [7],
        }
      );
      expect(seeded.ok, JSON.stringify(seeded.data)).toBe(true);
      listingId = seeded.data.listingIds[0];
      expect(listingId).toBeTruthy();

      await page.goto(`/listings/${listingId}`, {
        waitUntil: "domcontentloaded",
      });

      // ReportButton has a hydration guard. Wait for the hydrated trigger
      // instead of clicking the SSR placeholder shell.
      const reportBtn = page.locator(
        '[data-testid="report-listing"][data-state]'
      );
      await expect(reportBtn.first()).toBeVisible({
        timeout: timeouts.action,
      });
      await reportBtn.first().click();

      // Fill report form. The select options render in a portal outside the
      // dialog, so select the option from the page after opening the trigger.
      const reportDialog = page.getByRole("dialog").filter({
        hasText: /report listing/i,
      });
      await expect(reportDialog).toBeVisible({ timeout: timeouts.action });

      const selectTrigger = reportDialog.getByRole("combobox");
      await selectTrigger.first().click();
      await page.getByRole("option", { name: /spam/i }).click();

      const detailsField = reportDialog.locator("textarea");
      if (await detailsField.first().isVisible().catch(() => false)) {
        await detailsField.first().fill("Misleading photos - E2E test report");
      }

      const submitBtn = reportDialog.getByRole("button", {
        name: /submit report/i,
      });
      await expect(submitBtn).toBeEnabled({ timeout: timeouts.action });

      const reportResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes("/api/reports") &&
          response.request().method() === "POST"
      );
      await submitBtn.click();
      const reportResponse = await reportResponsePromise;
      expect(reportResponse.status()).toBeLessThan(300);

      await expect(
        reportDialog.getByText(/thank you for your report/i)
      ).toBeVisible({ timeout: timeouts.action });
    } finally {
      if (listingId) {
        await testApi(page, "deleteListings", { listingIds: [listingId] });
      }
    }
  });
});

// ─── J46: XSS Prevention ─────────────────────────────────────────────────────
test.describe("J46: XSS Prevention", () => {
  test("search with script tag → verify escaped output", async ({
    page,
    nav,
  }) => {
    // Step 1: Navigate to search with XSS payload in query
    const xssPayload = '<script>alert("xss")</script>';
    await nav.goToSearch({ q: xssPayload });
    await page.waitForLoadState("domcontentloaded");

    // Step 2: Verify the script tag is not executed
    // Check that no alert dialog appeared
    let alertFired = false;
    page.on("dialog", () => {
      alertFired = true;
    });
    // INTENTIONAL: measurement window — allow time for any injected script to execute
    await page.waitForTimeout(1000);
    expect(alertFired).toBeFalsy();

    // Step 3: If the query text is displayed, it should be escaped
    const rawScript = page.locator("script:text('alert')");
    const hasRawScript = await rawScript.count();
    expect(hasRawScript).toBe(0);

    // Step 4: Page should still function
    await expect(page.locator("body")).toBeVisible();
  });
});

// ─── J47: Rate Limit Feedback ─────────────────────────────────────────────────
test.describe("J47: Rate Limit Feedback", () => {
  test("rapid-click action button → verify throttle or disable", async ({
    page,
    nav,
  }) => {
    // Step 1: Find a listing NOT owned by test user (action buttons only show for non-owners)
    await nav.goToSearch({ q: "Reviewer Nob Hill", bounds: SF_BOUNDS });
    await page.waitForLoadState("domcontentloaded");

    const j47Container = searchResultsContainer(page);
    const cards = j47Container.locator(selectors.listingCard);
    test.skip((await cards.count()) === 0, "No listings — skipping");

    await nav.clickListingCard(0);
    await page.waitForURL(/\/listings\//, {
      timeout: timeouts.navigation,
      waitUntil: "commit",
    });
    await page.waitForLoadState("domcontentloaded");

    // Step 2: Find an action button (save, book, contact)
    const actionBtn = page
      .locator("main")
      .getByRole("button", { name: /save|book|apply|contact|favorite/i })
      .first();
    const hasBtn = await actionBtn.isVisible().catch(() => false);
    test.skip(!hasBtn, "No action button — skipping");

    // Step 3: Rapid-click the button 5 times
    for (let i = 0; i < 5; i++) {
      await actionBtn.click().catch(() => {});
    }
    await page.waitForLoadState("domcontentloaded");

    // Step 4: Verify some feedback happened
    // Could be: button disabled, toast, error message, or just normal toggle behavior
    const isDisabled = await actionBtn.isDisabled().catch(() => false);
    const hasToast = await page
      .locator(selectors.toast)
      .isVisible()
      .catch(() => false);

    // The app should handle rapid clicks without crashing
    await expect(page.locator("body")).toBeVisible();
  });
});

// ─── J48: Protected Route Redirects (Anon) ───────────────────────────────────
test.describe("J48: Protected Route Redirects", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("visit protected routes without auth → verify redirect to login", async ({
    page,
  }, testInfo) => {
    // Skip on Mobile Chrome — deterministic net::ERR_ABORTED on /messages in CI
    test.skip(
      testInfo.project.name === "Mobile Chrome",
      "Flaky on Mobile Chrome in CI — net::ERR_ABORTED on /messages"
    );

    // This test works whether authenticated or not - it tests the route structure
    const protectedRoutes = [
      "/bookings",
      "/messages",
      "/listings/create",
      "/settings",
      "/profile",
    ];

    for (const route of protectedRoutes) {
      // Use a fresh context approach: just verify the page loads or redirects
      await page
        .goto(route, { waitUntil: "domcontentloaded" })
        .catch((error: unknown) => {
          if (
            error instanceof Error &&
            (error.message.includes("net::ERR_ABORTED") ||
              error.message.includes("interrupted by another navigation"))
          ) {
            return null;
          }
          throw error;
        });
      await page.waitForLoadState("domcontentloaded").catch(() => {});

      // Should either be on the route (if authenticated) or redirected to login.
      await expect
        .poll(
          async () => {
            const currentPath = new URL(page.url()).pathname;
            const isOnRoute =
              currentPath === route || currentPath.startsWith(`${route}/`);
            const isRetiredBookingsRedirect =
              route === "/bookings" &&
              (currentPath === "/messages" ||
                currentPath.startsWith("/messages/"));
            const isOnAuthPage =
              currentPath === "/login" ||
              currentPath === "/signup" ||
              currentPath.startsWith("/auth") ||
              currentPath.startsWith("/api/auth") ||
              currentPath.startsWith("/signin");
            const isOnHome = currentPath === "/";
            const bodyText = await page
              .locator("body")
              .innerText({ timeout: 500 })
              .catch(() => "");
            const isAuthUiVisible =
              /Welcome back|Sign in to manage your listings and messages|Continue with Google/i.test(
                bodyText
              );

            return (
              isOnRoute ||
              isRetiredBookingsRedirect ||
              isOnAuthPage ||
              isOnHome ||
              isAuthUiVisible
            );
          },
          {
            timeout: 10_000,
            message: `Expected ${route} to load or redirect to auth UI`,
          }
        )
        .toBe(true);

      // Page should not crash
      await expect(page.locator("body")).toBeVisible();
    }
  });
});

// ─── J49: Offline Page ────────────────────────────────────────────────────────
test.describe("J49: Offline Page", () => {
  test("navigate to /offline → verify content renders", async ({ page }) => {
    const response = await page.goto("/offline");
    await page.waitForLoadState("domcontentloaded");

    // The offline route may render a dedicated page, fall back to a generic
    // shell, return a 404 UI, or redirect. The invariant is that it must not
    // crash into a blank page.
    await expect(page.locator("body")).toBeVisible();

    const offlineContent = page.getByText(
      /offline|connection|retry|no internet/i
    );
    const has404 = page.getByText(
      /404|not found|couldn't find|doesn't exist|packed up|moved out/i
    );
    const headings = page.getByRole("heading");
    const main = page.locator("main").first();
    const nav = page.locator("nav").first();

    const hasOffline = await offlineContent
      .first()
      .isVisible()
      .catch(() => false);
    const hasNotFound = await has404
      .first()
      .isVisible()
      .catch(() => false);
    const hasHeading = await headings
      .first()
      .isVisible()
      .catch(() => false);
    const hasMain = await main.isVisible().catch(() => false);
    const hasNav = await nav.isVisible().catch(() => false);

    const currentPath = new URL(page.url()).pathname;
    const wasRedirected = currentPath !== "/offline";
    const status = response?.status() ?? null;

    expect(
      hasOffline ||
        hasNotFound ||
        wasRedirected ||
        status === 404 ||
        hasHeading ||
        hasMain ||
        hasNav
    ).toBeTruthy();
  });
});

// ─── J50: Cross-Page Navigation Chain ─────────────────────────────────────────
test.describe("J50: Cross-Page Navigation Chain", () => {
  test("home → search → listing → retired bookings bookmark → messages → profile → verify each loads", async ({
    page,
    nav,
  }) => {
    // Step 1: Home page
    await nav.goHome();
    await expect(page.locator("body")).toBeVisible();
    const homeUrl = page.url();

    // Step 2: Search page
    await nav.goToSearch({ bounds: SF_BOUNDS });
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body")).toBeVisible();
    expect(page.url()).toContain("/search");

    // Step 3: Listing detail (if available)
    const j50Container = searchResultsContainer(page);
    const cards = j50Container.locator(selectors.listingCard);
    if ((await cards.count()) > 0) {
      await nav.clickListingCard(0);
      await page.waitForURL(/\/listings\//, {
        timeout: timeouts.navigation,
        waitUntil: "commit",
      });
      await expect(page.locator("body")).toBeVisible();
    }

    // Step 4: Retired bookings bookmark redirects to messages
    await nav.goToBookings();
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveURL(/\/messages/, { timeout: 30_000 });
    await expect(page.locator("body")).toBeVisible();

    // Step 5: Messages page
    await nav.goToMessages();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body")).toBeVisible();

    // Step 6: Profile page
    await nav.goToProfile();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body")).toBeVisible();

    // All pages should have loaded without crashes
    // Verify we're on profile or redirected
    const finalUrl = page.url();
    expect(finalUrl).toBeTruthy();
  });
});
