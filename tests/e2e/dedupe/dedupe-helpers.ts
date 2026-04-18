import type { Locator, Page } from "@playwright/test";
import {
  expect,
  SF_BOUNDS,
  searchResultsContainer,
  waitForMapReady,
} from "../helpers";

export const DEDUPE_IDS = {
  singleton: "e2e-dedupe-singleton",
  canonical: "e2e-dedupe-clone-mar20",
  apr18: "e2e-dedupe-clone-apr18",
  may15: "e2e-dedupe-clone-may15",
  jun01: "e2e-dedupe-clone-jun01",
  crossOwnerA: "e2e-cross-owner-a",
  crossOwnerB: "e2e-cross-owner-b",
} as const;

function buildSearchUrl(
  query: string,
  extraParams: Record<string, string> = {}
): string {
  const params = new URLSearchParams({
    q: query,
    minLat: String(SF_BOUNDS.minLat),
    maxLat: String(SF_BOUNDS.maxLat),
    minLng: String(SF_BOUNDS.minLng),
    maxLng: String(SF_BOUNDS.maxLng),
    ...extraParams,
  });

  return `/search?${params.toString()}`;
}

export const searchUrls = {
  singleton: buildSearchUrl("E2E Dedupe Singleton Room"),
  cloneGroup: buildSearchUrl("E2E Dedupe Clone Group"),
  cloneGroupFiltered: buildSearchUrl("E2E Dedupe Clone Group", {
    minPrice: "1000",
    maxPrice: "1000",
  }),
  cloneGroupSortNewest: buildSearchUrl("E2E Dedupe Clone Group", {
    sort: "newest",
  }),
  crossOwner: buildSearchUrl("E2E Cross Owner Visual"),
} as const;

export async function waitForVisibleCards(page: Page): Promise<Locator> {
  const cards = searchResultsContainer(page).locator('[data-testid="listing-card"]');
  await expect
    .poll(async () => cards.count(), {
      timeout: 30_000,
      message: "Expected listing cards in the visible search results container",
    })
    .toBeGreaterThan(0);
  return cards;
}

export async function visibleMarkerCount(page: Page): Promise<number> {
  await waitForMapReady(page, 30_000);
  const markers = page.locator(".maplibregl-marker:visible");
  await expect
    .poll(async () => markers.count(), {
      timeout: 30_000,
      message: "Expected map markers for the dedupe search results",
    })
    .toBeGreaterThan(0);
  return markers.count();
}

export async function openGroupTrigger(page: Page): Promise<Locator> {
  const trigger = searchResultsContainer(page)
    .locator('[data-testid="group-dates-trigger"]')
    .first();
  await expect(trigger).toBeVisible();
  return trigger;
}

export async function tabToLocator(
  page: Page,
  locator: Locator,
  maxTabs = 40
): Promise<void> {
  await page.locator("body").click({ position: { x: 5, y: 5 } });

  for (let index = 0; index < maxTabs; index += 1) {
    await page.keyboard.press("Tab");
    if (await locator.evaluate((element) => element === document.activeElement)) {
      return;
    }
  }

  throw new Error("Failed to tab to the target locator");
}
