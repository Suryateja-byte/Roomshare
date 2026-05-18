import { test, expect } from "../fixtures/console-errors.fixture";
import type { Locator } from "@playwright/test";
import { searchUrl } from "../fixtures/search-data.fixture";
import { ListingCard } from "../pages/ListingCard";
import { SearchPage } from "../pages/SearchPage";
import { expectSaneSearchUrl } from "../utils/urlAssertions";

const DEDUPE_TITLE = "E2E Dedupe Clone Group";
const DEDUPE_ALTERNATE_ID = "e2e-dedupe-clone-apr18";
const DETAIL_START_DATE = "2026-06-15";
const DETAIL_END_DATE = "2026-06-20";

function numericPrice(text: string): number {
  const value = Number(text.replace(/[^0-9]/g, ""));
  expect(Number.isFinite(value)).toBe(true);
  return value;
}

function groupedCard(search: SearchPage): ListingCard {
  return new ListingCard(
    search.page,
    search
      .resultsContainer()
      .locator('[data-testid="listing-card"]')
      .filter({ has: search.page.getByTestId("group-dates-trigger") })
      .first()
  );
}

function groupedDatesPanel(search: SearchPage) {
  return search.resultsContainer().getByTestId("group-dates-panel");
}

async function openDesktopGroupedDates(search: SearchPage): Promise<Locator> {
  await search.waitForResultsHydrated();
  const card = groupedCard(search);
  await card.expectVisible();
  await expect(card.groupedDatesTrigger()).toHaveText("+3 more dates", {
    timeout: 30_000,
  });
  await expect(card.groupedDatesTrigger()).toHaveAttribute(
    "aria-expanded",
    "false"
  );
  await card.groupedDatesTrigger().click();
  await expect(card.groupedDatesTrigger()).toHaveAttribute(
    "aria-expanded",
    "true",
    { timeout: 15_000 }
  );

  const panel = groupedDatesPanel(search);
  await expect(panel).toBeVisible({ timeout: 15_000 });
  return panel;
}

function expectAlternateListingUrl(
  pageUrl: string,
  expectedListingId = DEDUPE_ALTERNATE_ID
) {
  const detailUrl = new URL(pageUrl);
  expect(detailUrl.pathname).toBe(`/listings/${expectedListingId}`);
}

test.describe("Group F - Listing cards, media, dates, and price display", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
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
  });

  test("F1 @desktop-anonymous multi-month total price toggle updates labels and persists", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-anonymous",
      "F1 desktop coverage is owned by the anonymous desktop project"
    );

    const search = new SearchPage(page);
    await search.goto(
      searchUrl({
        leaseDuration: "6 months",
      })
    );
    await search.expectResultsOrBrowseState();
    await search.waitForResultsHydrated();

    const firstCard = new ListingCard(page, search.listingCards().first());
    await firstCard.expectVisible();
    await expect(firstCard.root).toContainText(/\/mo/);

    const switchButton = search.resultsContainer().getByRole("switch").first();
    await expect(
      search.resultsContainer().getByText("Show total price")
    ).toBeVisible();
    await expect(switchButton).toHaveAttribute("aria-checked", "false", {
      timeout: 30_000,
    });
    const monthlyPrice = numericPrice(await firstCard.price().innerText());

    await switchButton.click();

    await expect(switchButton).toHaveAttribute("aria-checked", "true");
    await expect(firstCard.root).toContainText(/total/i);
    const totalPrice = numericPrice(await firstCard.price().innerText());
    expect(totalPrice).toBeGreaterThan(monthlyPrice);

    await page.reload({ waitUntil: "domcontentloaded" });
    await search.expectResultsOrBrowseState();
    await search.waitForResultsHydrated();

    await expect(
      search.resultsContainer().getByRole("switch").first()
    ).toHaveAttribute("aria-checked", "true", { timeout: 30_000 });
    await expect(
      new ListingCard(page, search.listingCards().first()).root
    ).toContainText(/total/i);
    await search.expectNoCrashBoundary();
    await expectSaneSearchUrl(page);
    await assertNoUnhandledErrors();
  });

  test("F2 @desktop-anonymous listing detail link carries date params", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-anonymous",
      "F2 is owned by the anonymous desktop project"
    );

    const search = new SearchPage(page);
    await search.goto(
      searchUrl({
        moveInDate: DETAIL_START_DATE,
        endDate: DETAIL_END_DATE,
      })
    );
    await search.expectResultsOrBrowseState();
    await search.waitForResultsHydrated();

    const card = new ListingCard(page, search.listingCards().first());
    await card.expectVisible();
    const href = await card.link().getAttribute("href");
    expect(href).toContain(`startDate=${DETAIL_START_DATE}`);
    expect(href).toContain(`endDate=${DETAIL_END_DATE}`);

    await card.root.getByRole("heading").first().click();

    await expect(page).toHaveURL(/\/listings\//, { timeout: 30_000 });
    const detailUrl = new URL(page.url());
    expect(detailUrl.pathname).toMatch(/^\/listings\/[^/]+$/);
    expect(detailUrl.searchParams.get("startDate")).toBe(DETAIL_START_DATE);
    expect(detailUrl.searchParams.get("endDate")).toBe(DETAIL_END_DATE);
    await assertNoUnhandledErrors();
  });

  test("F3 @desktop-anonymous carousel drag does not navigate away from search", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-anonymous",
      "F3 is owned by the anonymous desktop project"
    );

    const search = new SearchPage(page);
    await search.goto(searchUrl({ q: DEDUPE_TITLE }));
    await search.expectResultsOrBrowseState();

    const carousel = search
      .resultsContainer()
      .locator('[aria-label^="Image carousel"]')
      .first();
    await expect(carousel).toHaveAttribute("data-carousel-ready", "true", {
      timeout: 30_000,
    });
    await expect(carousel).toBeVisible();

    const initialUrl = page.url();
    const box = await carousel.boundingBox();
    expect(box).not.toBeNull();

    const y = box!.y + box!.height / 2;
    await page.mouse.move(box!.x + box!.width * 0.75, y);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width * 0.25, y, { steps: 8 });
    await page.mouse.up();

    await expect(page).toHaveURL(initialUrl);
    await expect(carousel).toBeVisible();
    await search.expectNoCrashBoundary();
    await expectSaneSearchUrl(page);
    await assertNoUnhandledErrors();
  });

  test("F4 @desktop-anonymous grouped listing dates open a desktop panel", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-anonymous",
      "F4 desktop coverage is owned by the anonymous desktop project"
    );

    const search = new SearchPage(page);
    await search.goto(searchUrl({ q: DEDUPE_TITLE }));
    await search.expectResultsOrBrowseState();

    const panel = await openDesktopGroupedDates(search);
    await expect(panel.getByTestId("group-dates-chip")).toHaveCount(4);
    await expect(
      panel.getByRole("button", { name: /available june 18, 2026/i })
    ).toBeVisible();
    await search.expectNoCrashBoundary();
    await expectSaneSearchUrl(page);
    await assertNoUnhandledErrors();
  });

  test("F5 @desktop-anonymous grouped alternate date routes to the sibling listing/date URL", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-anonymous",
      "F5 desktop coverage is owned by the anonymous desktop project"
    );

    const search = new SearchPage(page);
    await search.goto(searchUrl({ q: DEDUPE_TITLE }));
    await search.expectResultsOrBrowseState();

    const panel = await openDesktopGroupedDates(search);
    await panel
      .getByRole("button", { name: /available june 18, 2026/i })
      .click();

    await page.waitForURL(new RegExp(`/listings/${DEDUPE_ALTERNATE_ID}`), {
      timeout: 30_000,
    });
    expectAlternateListingUrl(page.url());
    await assertNoUnhandledErrors();
  });

  test("F4 @mobile-anonymous grouped listing dates open a mobile modal", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile-anonymous",
      "F4 mobile coverage is owned by the anonymous mobile project"
    );

    const search = new SearchPage(page);
    await search.goto(searchUrl({ q: DEDUPE_TITLE }));
    await search.expectResultsOrBrowseState();

    const snapContent = page.locator("[data-snap-current]").first();
    await expect(snapContent).toHaveAttribute("data-snap-current", "1");

    const trigger = page
      .getByTestId("group-dates-trigger")
      .filter({ visible: true })
      .first();
    await expect(trigger).toHaveAttribute("aria-haspopup", "dialog", {
      timeout: 30_000,
    });
    await trigger.evaluate((element) => (element as HTMLButtonElement).click());

    const modal = page.getByTestId("group-dates-modal");
    await expect(modal).toBeVisible({ timeout: 15_000 });
    await expect(modal.getByTestId("group-dates-chip")).toHaveCount(4);
    await expect(snapContent).toHaveAttribute("data-snap-current", "1");
    await search.expectNoCrashBoundary();
    await expectSaneSearchUrl(page);
    await assertNoUnhandledErrors();
  });

  test("F5 @mobile-anonymous grouped alternate date routes from the modal", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile-anonymous",
      "F5 mobile coverage is owned by the anonymous mobile project"
    );

    const search = new SearchPage(page);
    await search.goto(searchUrl({ q: DEDUPE_TITLE }));
    await search.expectResultsOrBrowseState();

    const trigger = page
      .getByTestId("group-dates-trigger")
      .filter({ visible: true })
      .first();
    await expect(trigger).toHaveAttribute("aria-haspopup", "dialog", {
      timeout: 30_000,
    });
    await trigger.evaluate((element) => (element as HTMLButtonElement).click());

    const modal = page.getByTestId("group-dates-modal");
    await expect(modal).toBeVisible({ timeout: 15_000 });
    await modal
      .getByRole("button", { name: /available june 18, 2026/i })
      .click();

    await page.waitForURL(new RegExp(`/listings/${DEDUPE_ALTERNATE_ID}`), {
      timeout: 30_000,
    });
    expectAlternateListingUrl(page.url());
    await assertNoUnhandledErrors();
  });
});
