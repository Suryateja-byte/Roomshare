/**
 * Prod-flag Smoke Suite (Anonymous)
 *
 * Addresses docs/multislot-review-2026-07-02.md · P2-13 + Test gap #1:
 * every dev-default E2E validates the non-prod read engine/card shape, so a
 * dev/preview sign-off does NOT validate what prod serves. This suite runs the
 * critical search + listing flows with the PROD-EFFECTIVE feature-flag env
 * (phase-04 projection reads OFF, dedup OFF, paywalls OFF, SearchDoc engine ON —
 * see tests/e2e/helpers/prod-flags-env.ts and playwright.config.ts).
 *
 * It is a DEDICATED run, not part of the normal suite: the flag env is injected
 * only when this run is requested, and the spec self-skips otherwise (guard
 * below) so it can never produce a misleading pass/fail under dev-default flags.
 *
 * Run: E2E_PROD_FLAGS=true pnpm exec playwright test --project=prod-flags-smoke
 */

import {
  test,
  expect,
  SF_BOUNDS,
  searchResultsContainer,
  scopedCards,
} from "./helpers/test-utils";
import { isProdFlagsRun } from "./helpers/prod-flags-env";

// Seeded San Francisco viewport — the same bounds the P0 smoke uses.
const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;
const SEARCH_URL = `/search?${boundsQS}`;

// Valid-or-empty outcome: results, or one of the recognized zero-result headings.
const zeroResults = (page: Parameters<typeof searchResultsContainer>[0]) =>
  page.locator(
    'h2:has-text("No matches found"), h3:has-text("No exact matches")'
  );

test.describe("Prod-flag Smoke Suite", () => {
  // Self-guard: only run when this process is the prod-flags run (the config
  // injects the prod-effective flag env for the launched server in the same
  // condition). Under any other project/invocation the flags are dev-default,
  // so skip rather than validate the wrong system.
  test.beforeEach(() => {
    test.skip(
      !isProdFlagsRun(),
      "Prod-flag smoke runs only under the prod-flags-smoke project with " +
        "E2E_PROD_FLAGS=true. Run: E2E_PROD_FLAGS=true pnpm exec playwright " +
        "test --project=prod-flags-smoke"
    );
  });

  // PF01: Search page loads with results for a seeded city under prod flags.
  test("PF01: search page loads with results (SearchDoc engine)", async ({
    page,
  }) => {
    const response = await page.goto(SEARCH_URL);
    expect(response?.status()).toBe(200);

    const cards = scopedCards(page);
    await expect(cards.first()).toBeAttached({ timeout: 30_000 });
    expect(await cards.count()).toBeGreaterThanOrEqual(1);
  });

  // PF02: Price filter narrows results — every visible price <= cap.
  test("PF02: price filter applies (maxPrice)", async ({ page }) => {
    await page.goto(`/search?maxPrice=1000&${boundsQS}`);

    const container = searchResultsContainer(page);
    const cards = container.locator('[data-testid="listing-card"]');
    await expect(cards.first()).toBeAttached({ timeout: 30_000 });

    const priceTexts = await container
      .locator('[data-testid="listing-card"] [data-testid="listing-price"]')
      .allTextContents();

    for (const priceText of priceTexts) {
      const numeric = parseInt(priceText.replace(/[^0-9]/g, ""), 10);
      if (!Number.isNaN(numeric)) {
        expect(numeric).toBeLessThanOrEqual(1000);
      }
    }
  });

  // PF03: Gender filter applies — reaches a valid state, narrows (or holds) the
  // result set, and round-trips in the URL. Under prod's SearchDoc engine the
  // gender filter EXCLUDES unspecified rows (review P1-4), so filtering can only
  // reduce the set: filtered first-page count <= baseline first-page count.
  test("PF03: gender filter applies (genderPreference)", async ({ page }) => {
    await page.goto(SEARCH_URL);
    const baselineCards = scopedCards(page);
    await expect(baselineCards.first()).toBeAttached({ timeout: 30_000 });
    const baselineCount = await baselineCards.count();

    await page.goto(`/search?genderPreference=FEMALE_ONLY&${boundsQS}`);
    await page.waitForLoadState("domcontentloaded");

    const cards = scopedCards(page);
    await expect(cards.or(zeroResults(page)).first()).toBeAttached({
      timeout: 30_000,
    });

    // URL preserves the applied filter (shareability contract).
    expect(page.url()).toContain("genderPreference=FEMALE_ONLY");

    // Filtering only removes rows — never adds them.
    const filteredCount = await cards.count();
    expect(filteredCount).toBeLessThanOrEqual(baselineCount);
  });

  // PF04: Listing detail opens from a card.
  test("PF04: listing detail opens from a card", async ({ page }) => {
    await page.goto(SEARCH_URL);

    const cards = scopedCards(page);
    await expect(cards.first()).toBeAttached({ timeout: 30_000 });

    const firstLink = cards.first().locator('a[href^="/listings/"]').first();
    const href = await firstLink.getAttribute("href");
    expect(href).toBeTruthy();
    expect(href).toMatch(/^\/listings\//);

    // Direct navigation is more reliable than click for SSR apps (mirrors P0 S07).
    await page.goto(href!);
    await expect(page).toHaveURL(/\/listings\//);
  });

  // PF05: Cards do NOT show the dev-only dedup grouping UI. `group-dates-trigger`
  // renders only when the card carries a dedup `groupSummary`, which only the
  // `searchListingDedup` engine emits (ListingCard.tsx). With dedup prod-OFF it
  // must be absent — the concrete card-shape divergence P2-13 calls out.
  test("PF05: no dev-only dedup grouping UI on cards", async ({ page }) => {
    await page.goto(SEARCH_URL);

    const container = searchResultsContainer(page);
    const cards = container.locator('[data-testid="listing-card"]');
    await expect(cards.first()).toBeAttached({ timeout: 30_000 });

    await expect(
      container.locator('[data-testid="group-dates-trigger"]')
    ).toHaveCount(0);
  });
});
