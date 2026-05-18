import { test, expect } from "../fixtures/console-errors.fixture";
import type { Page } from "@playwright/test";
import { mockCheckoutForSearchAlerts } from "../fixtures/network-errors.fixture";
import { searchUrl } from "../fixtures/search-data.fixture";
import { SavedSearchModal } from "../pages/SavedSearchModal";
import { SearchPage } from "../pages/SearchPage";
import { expectSaneSearchUrl } from "../utils/urlAssertions";

type MockSaveSearchResult =
  | {
      success: true;
      searchId: string;
      effectiveAlertState: "ACTIVE" | "LOCKED" | "DISABLED";
    }
  | { error: string };

function encodeAsRSCResponse(value: unknown): string {
  const row0 = JSON.stringify({ a: "$@1", f: "", b: "development" });
  const row1 = JSON.stringify(value);
  return `0:${row0}\n1:${row1}\n`;
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

async function mockSaveSearchAction(page: Page, result: MockSaveSearchResult) {
  let callCount = 0;

  await page.route("**/search**", async (route) => {
    const request = route.request();
    const headers = request.headers();
    const isSaveSearchAction =
      request.method() === "POST" && Boolean(headers["next-action"]);

    if (!isSaveSearchAction) {
      await route.continue();
      return;
    }

    callCount += 1;
    await route.fulfill({
      status: 200,
      contentType: "text/x-component; charset=utf-8",
      headers: { "Cache-Control": "no-store" },
      body: encodeAsRSCResponse(result),
    });
  });

  return {
    callCount: () => callCount,
  };
}

test.describe("Group G - Saved searches and alert paywall", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await mockValidManifest(page);
  });

  test("G3 @desktop-authenticated user saves a named search, toggles alerts, and selects frequency", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-authenticated",
      "G3 saved-search success is owned by the authenticated desktop project"
    );

    const saveSearchAction = await mockSaveSearchAction(page, {
      success: true,
      searchId: "e2e-search-active",
      effectiveAlertState: "ACTIVE",
    });
    const search = new SearchPage(page);
    await search.goto(searchUrl({ q: "E2E Dedupe Clone Group" }));
    await search.expectResultsOrBrowseState();

    const modal = new SavedSearchModal(page);
    await modal.open();
    await expect(modal.nameInput()).toHaveValue(/.+/);
    await modal.nameInput().fill("E2E weekly dedupe search");

    await expect(modal.alertsSwitch()).toHaveAttribute("aria-checked", "true");
    await modal.alertsSwitch().click();
    await expect(modal.alertsSwitch()).toHaveAttribute("aria-checked", "false");
    await expect(modal.frequencyButton(/weekly/i)).toBeHidden();

    await modal.alertsSwitch().click();
    await expect(modal.alertsSwitch()).toHaveAttribute("aria-checked", "true");
    await modal.frequencyButton(/weekly/i).click();
    await expect(modal.frequencyButton(/weekly/i)).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    await modal.saveButton().click();

    await expect.poll(() => saveSearchAction.callCount()).toBe(1);
    await expect(modal.dialog()).toBeHidden({ timeout: 15_000 });
    await expect(page.locator("[data-sonner-toast]").first()).toContainText(
      /search saved successfully/i,
      { timeout: 15_000 }
    );
    await search.expectNoCrashBoundary();
    await expectSaneSearchUrl(page);
    await assertNoUnhandledErrors();
  });

  test("G4 @failure-mocked paywalled search alerts open mocked checkout path", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "failure-mocked",
      "G4 paywall coverage is owned by the failure-mocked project"
    );

    const saveSearchAction = await mockSaveSearchAction(page, {
      success: true,
      searchId: "e2e-search-locked",
      effectiveAlertState: "LOCKED",
    });
    const checkoutMock = await mockCheckoutForSearchAlerts(page);
    const search = new SearchPage(page);
    await search.goto(searchUrl({ q: "E2E Dedupe Clone Group" }));
    await search.expectResultsOrBrowseState();

    const modal = new SavedSearchModal(page);
    await modal.open();
    await modal.nameInput().fill("E2E locked alert search");
    await modal.frequencyButton(/weekly/i).click();
    await expect(modal.frequencyButton(/weekly/i)).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    await modal.saveButton().click();

    await expect.poll(() => saveSearchAction.callCount()).toBe(1);
    await expect(modal.dialog()).toBeVisible({ timeout: 15_000 });
    await expect(modal.lockedAlertsMessage()).toBeVisible();
    await expect(modal.unlockAlertsButton()).toBeVisible();

    await modal.unlockAlertsButton().click();

    await expect.poll(() => checkoutMock.requests.length).toBe(1);
    expect(checkoutMock.requests[0]).toMatchObject({
      purchaseContext: "SEARCH_ALERTS",
      productCode: "MOVERS_PASS_30D",
    });
    await expect(page).toHaveURL(/\/checkout\/mock-search-alerts$/, {
      timeout: 30_000,
    });
    await assertNoUnhandledErrors();
  });
});
