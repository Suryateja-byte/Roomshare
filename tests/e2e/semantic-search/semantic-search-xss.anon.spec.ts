/**
 * Semantic Search XSS/Injection E2E Test
 *
 * Validates that search queries with HTML/script tags are sanitized
 * and do not cause script execution.
 *
 * Scenario: SS-60
 * Run: pnpm playwright test tests/e2e/semantic-search/semantic-search-xss.anon.spec.ts
 */

import {
  test,
  expect,
  SF_BOUNDS,
  searchResultsContainer,
} from "../helpers/test-utils";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Semantic Search - XSS Sanitization", () => {
  test.beforeEach(async () => {
    test.slow();
  });

  test(`SS-60: HTML/script tags in search query are sanitized`, async ({ page }) => {
    // Track if any injected script executes
    let scriptExecuted = false;
    await page.exposeFunction("__xssDetected", () => {
      scriptExecuted = true;
    });

    // Install detection: if alert() is called, flag it
    await page.addInitScript(() => {
      (window as any).__originalAlert = window.alert;
      window.alert = () => {
        (window as any).__xssDetected?.();
      };
    });

    // Search with XSS payload
    const xssPayload = encodeURIComponent(
      '<script>alert(1)</script> cozy room'
    );
    await page.goto(`/search?q=${xssPayload}&${boundsQS}`);
    await page.waitForLoadState("domcontentloaded");

    // Wait for page to render
    const heading = page.getByRole("heading", { level: 1 }).first();
    await expect(heading).toBeVisible({ timeout: 30_000 });

    // Verify no script execution occurred (the key XSS assertion)
    expect(scriptExecuted).toBe(false);

    // Verify no user-injected <script> tags executed
    // Note: Next.js may serialize URL params into inline data scripts,
    // so we can't count <script> tags by content. The `scriptExecuted`
    // flag above is the authoritative XSS detection mechanism.

    // Page should still function (not crashed by the input)
    const container = searchResultsContainer(page);
    const cards = container.locator('[data-testid="listing-card"]');
    const cardOrEmpty = cards.first().or(
      container.getByText(/no (matches|results|listings)/i).first()
    );
    await expect(cardOrEmpty).toBeVisible({ timeout: 30_000 });
  });
});
