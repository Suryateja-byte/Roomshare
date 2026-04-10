import { expect, type Locator, type Page } from "@playwright/test";
import { SF_BOUNDS, searchResultsContainer, timeouts } from "./test-utils";
import { waitForHydration, waitForMapReady, waitForSortHydrated } from "./test-utils";
import { applyFilters, closeFilterModal, openFilterModal } from "./filter-helpers";

export type SearchScenario =
  | "default-results"
  | "zero-results"
  | "near-match"
  | "rate-limited"
  | "v2-fails-v1-succeeds"
  | "load-more-error"
  | "map-empty"
  | "slow-first-fast-second";

export const SEARCH_SCENARIO_HEADER = "x-e2e-search-scenario" as const;

const RELEASE_GATE_PROJECTS = new Set(["chromium", "webkit", "Mobile Safari"]);

export function isSearchReleaseGateEnabled(): boolean {
  return process.env.ENABLE_SEARCH_TEST_SCENARIOS === "true";
}

export function isSearchReleaseGateProject(projectName: string): boolean {
  return RELEASE_GATE_PROJECTS.has(projectName);
}

export function scenarioHeaders(
  scenario: SearchScenario
): Record<string, string> {
  return { [SEARCH_SCENARIO_HEADER]: scenario };
}

export function defaultSearchUrl(
  extraParams: Record<string, string | number | undefined> = {}
): string {
  const params = new URLSearchParams({
    minLat: String(SF_BOUNDS.minLat),
    maxLat: String(SF_BOUNDS.maxLat),
    minLng: String(SF_BOUNDS.minLng),
    maxLng: String(SF_BOUNDS.maxLng),
  });

  for (const [key, value] of Object.entries(extraParams)) {
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }

  return `/search?${params.toString()}`;
}

export async function applySearchScenario(
  page: Page,
  scenario: SearchScenario
): Promise<void> {
  await page.context().setExtraHTTPHeaders(scenarioHeaders(scenario));
}

export async function gotoSearchPage(
  page: Page,
  scenario: SearchScenario,
  extraParams: Record<string, string | number | undefined> = {}
): Promise<void> {
  await applySearchScenario(page, scenario);
  await page.goto(defaultSearchUrl(extraParams));
  await page.waitForLoadState("domcontentloaded");
  await waitForHydration(page, { timeout: timeouts.navigation });
}

export function searchShell(page: Page): Locator {
  return page
    .getByTestId("search-shell")
    .or(searchResultsContainer(page))
    .or(page.locator("main"))
    .first();
}

export function mapShell(page: Page): Locator {
  return page
    .getByTestId("map-shell")
    .or(page.getByTestId("map"))
    .or(page.locator(".maplibregl-map"))
    .first();
}

export function searchStatus(page: Page): Locator {
  return page
    .getByRole("status", { name: /searching area/i })
    .or(page.locator('[aria-label="Searching area"]'))
    .first();
}

export function loadMoreButton(page: Page): Locator {
  return searchResultsContainer(page)
    .getByRole("button", { name: /show more places/i })
    .filter({ visible: true })
    .first();
}

export function mobileExpandSearchButton(page: Page): Locator {
  return page
    .getByRole("button", { name: /expand search/i })
    .filter({ visible: true })
    .first();
}

export function mobileSearchDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: /search/i }).first();
}

export async function openMobileSearchOverlay(page: Page): Promise<void> {
  await mobileExpandSearchButton(page).click();
  await expect(mobileSearchDialog(page)).toBeVisible({
    timeout: timeouts.action,
  });
}

export function desktopSortTrigger(page: Page): Locator {
  return page
    .locator('button[aria-label="Sort by"], button[role="combobox"]')
    .filter({ visible: true })
    .first();
}

export function mobileSortTrigger(page: Page): Locator {
  return page.locator('button[aria-label^="Sort:"]').filter({ visible: true }).first();
}

export async function openSortMenu(page: Page): Promise<Locator> {
  const viewport = page.viewportSize();
  const trigger =
    viewport && viewport.width < 768
      ? mobileSortTrigger(page)
      : desktopSortTrigger(page);

  await waitForSortHydrated(page);
  await expect(trigger).toBeVisible({ timeout: timeouts.navigation });
  await trigger.click();

  const listbox = page.getByRole("listbox");
  await expect(listbox).toBeVisible({ timeout: timeouts.action });
  return listbox;
}

export async function selectSortOption(
  page: Page,
  optionLabel: string
): Promise<void> {
  const listbox = await openSortMenu(page);
  await listbox.getByRole("option", { name: optionLabel }).click();
  await expect(listbox).not.toBeVisible({ timeout: timeouts.action });
}

export async function waitForSearchResolution(page: Page): Promise<void> {
  const container = searchResultsContainer(page);
  const cards = container.locator('[data-testid="listing-card"]');
  const zeroResults = container.locator(
    'h2:visible:has-text("No matches found"), h3:visible:has-text("No exact matches")'
  );
  const rateLimit = page
    .getByText(/Too many requests|Please wait a moment/i)
    .filter({ visible: true });

  await expect
    .poll(
      async () => {
        if (await cards.first().isVisible().catch(() => false)) return true;
        if (await zeroResults.first().isVisible().catch(() => false))
          return true;
        if (await rateLimit.first().isVisible().catch(() => false))
          return true;
        return false;
      },
      { timeout: timeouts.navigation, message: "search surface to resolve" }
    )
    .toBe(true);
}

export async function getListingIds(page: Page): Promise<string[]> {
  const ids = await searchResultsContainer(page)
    .locator('[data-testid="listing-card"]')
    .evaluateAll((nodes) =>
      nodes
        .map((node) => node.getAttribute("data-listing-id"))
        .filter((id): id is string => Boolean(id))
    );

  return Array.from(new Set(ids));
}

export async function assertNoDuplicateListingIds(page: Page): Promise<void> {
  const ids = await getListingIds(page);
  expect(new Set(ids).size).toBe(ids.length);
}

export async function readSearchShellMeta(page: Page): Promise<{
  queryHash: string | null;
  backendSource: string | null;
  responseVersion: string | null;
}> {
  const shell = searchShell(page);

  return shell.evaluate((element) => {
    const queryHash =
      element.getAttribute("data-search-query-hash") ??
      element.getAttribute("data-query-hash") ??
      null;
    const backendSource =
      element.getAttribute("data-search-backend-source") ?? null;
    const responseVersion =
      element.getAttribute("data-search-response-version") ?? null;

    return { queryHash, backendSource, responseVersion };
  });
}

export async function openFilterModalAndWait(page: Page): Promise<void> {
  await openFilterModal(page);
  await waitForSearchResolution(page);
}

export async function cancelFilterModal(page: Page): Promise<void> {
  await closeFilterModal(page);
  await waitForHydration(page, { timeout: timeouts.action });
}

export async function applyFilterModal(page: Page): Promise<void> {
  await applyFilters(page);
  await waitForSearchResolution(page);
}

export async function waitForMapReadyIfAvailable(page: Page): Promise<boolean> {
  await waitForMapReady(page);
  const shell = mapShell(page);
  const box = await shell.boundingBox().catch(() => null);
  return Boolean(box);
}
