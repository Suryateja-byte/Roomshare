import { test, expect } from "../fixtures/console-errors.fixture";
import type { Page } from "@playwright/test";
import { searchUrl } from "../fixtures/search-data.fixture";
import { ListingCard } from "../pages/ListingCard";
import { SearchPage } from "../pages/SearchPage";
import { expectSaneSearchUrl } from "../utils/urlAssertions";

function listingCardById(search: SearchPage, listingId: string): ListingCard {
  const escapedListingId = listingId.replace(/"/g, '\\"');
  return new ListingCard(
    search.page,
    search
      .resultsContainer()
      .locator(
        `[data-testid="listing-card"][data-listing-id="${escapedListingId}"]`
      )
      .first()
  );
}

async function mockValidManifest(page: Page) {
  await page.route("**/manifest.json", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/manifest+json",
      body: JSON.stringify({
        name: "RoomShare",
        short_name: "RoomShare",
        start_url: "/",
        display: "standalone",
      }),
    });
  });
}

async function mockFavoriteState(page: Page) {
  let savedListingId: string | null = null;
  let saved = false;

  await page.route("**/api/favorites**", async (route) => {
    const request = route.request();

    if (request.method() === "GET") {
      const url = new URL(request.url());
      const requestedIds = (url.searchParams.get("ids") ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "Cache-Control": "private, no-store" },
        body: JSON.stringify({
          savedIds:
            saved && savedListingId && requestedIds.includes(savedListingId)
              ? [savedListingId]
              : [],
        }),
      });
      return;
    }

    if (request.method() === "POST") {
      const payload = JSON.parse(request.postData() ?? "{}") as {
        listingId?: string;
      };

      expect(payload.listingId).toBeTruthy();
      savedListingId = payload.listingId ?? null;
      saved = !saved;

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "Cache-Control": "private, no-store" },
        body: JSON.stringify({ saved }),
      });
      return;
    }

    await route.continue();
  });

  return {
    savedListingId: () => savedListingId,
    isSaved: () => saved,
  };
}

async function mockUnauthorizedFavorite(page: Page) {
  await page.route("**/api/favorites**", async (route) => {
    const request = route.request();

    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "Cache-Control": "private, no-store" },
        body: JSON.stringify({ savedIds: [] }),
      });
      return;
    }

    if (request.method() === "POST") {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        headers: { "Cache-Control": "private, no-store" },
        body: JSON.stringify({ error: "Unauthorized" }),
      });
      return;
    }

    await route.continue();
  });
}

test.describe("Group G - Saved listings", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await mockValidManifest(page);
  });

  test("G1 @desktop-authenticated logged-in user saves, reloads, and unsaves a listing", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-authenticated",
      "G1 saved listing persistence is owned by the authenticated desktop project"
    );

    const favoriteState = await mockFavoriteState(page);
    const search = new SearchPage(page);
    await search.goto(searchUrl());
    await search.expectResultsOrBrowseState();
    await search.waitForResultsHydrated();

    const card = new ListingCard(page, search.listingCards().first());
    await card.expectVisible();
    const listingId = await card.root.getAttribute("data-listing-id");
    expect(listingId).toBeTruthy();
    await expect(card.saveButton()).toHaveAttribute("aria-pressed", "false");

    await card.saveButton().click();

    await expect(card.saveButton()).toHaveAttribute("aria-pressed", "true", {
      timeout: 15_000,
    });
    expect(favoriteState.savedListingId()).toBe(listingId);
    expect(favoriteState.isSaved()).toBe(true);

    await page.reload({ waitUntil: "domcontentloaded" });
    await search.expectResultsOrBrowseState();
    await search.waitForResultsHydrated();

    const reloadedCard = listingCardById(search, listingId!);
    await reloadedCard.expectVisible();
    await expect(reloadedCard.saveButton()).toHaveAttribute(
      "aria-pressed",
      "true",
      { timeout: 15_000 }
    );

    await reloadedCard.saveButton().click();

    await expect(reloadedCard.saveButton()).toHaveAttribute(
      "aria-pressed",
      "false",
      { timeout: 15_000 }
    );
    expect(favoriteState.isSaved()).toBe(false);
    await expect(page).toHaveURL(/\/search(?:\?|$)/);
    await search.expectNoCrashBoundary();
    await expectSaneSearchUrl(page);
    await assertNoUnhandledErrors();
  });

  test("G2 @desktop-anonymous anonymous save redirects to login", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-anonymous",
      "G2 anonymous auth redirect is owned by the anonymous desktop project"
    );

    await mockUnauthorizedFavorite(page);
    const search = new SearchPage(page);
    await search.goto(searchUrl());
    await search.expectResultsOrBrowseState();
    await search.waitForResultsHydrated();

    const card = new ListingCard(page, search.listingCards().first());
    await card.expectVisible();
    await card.saveButton().click();

    await expect(page).toHaveURL(/\/login(?:\?|$)/, { timeout: 30_000 });
    await assertNoUnhandledErrors();
  });
});
