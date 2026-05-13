import {
  expect,
  type Locator,
  type Page,
  type Response,
} from "@playwright/test";
import {
  searchResultsContainer,
  selectors,
  waitForStable,
} from "../helpers/test-utils";
import { expectSaneSearchUrl } from "../utils/urlAssertions";

export class SearchPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(path = "/search"): Promise<Response | null> {
    const response = await this.page.goto(path, {
      waitUntil: "domcontentloaded",
    });
    await waitForStable(this.page);
    await this.recoverFromKnownManifestOverlay();
    return response;
  }

  resultsContainer(): Locator {
    return searchResultsContainer(this.page);
  }

  listingCards(): Locator {
    return this.resultsContainer().locator(selectors.listingCard);
  }

  resultsFeed(): Locator {
    return this.resultsContainer()
      .getByRole("feed", { name: /search results/i })
      .first();
  }

  mainForm(): Locator {
    return this.page
      .locator('form[aria-label="Search listings"]')
      .filter({ has: this.mainLocationInput() })
      .first();
  }

  mainLocationInput(): Locator {
    return this.page.locator("#search-location").first();
  }

  mainVibeInput(): Locator {
    return this.page.locator("#search-what").first();
  }

  mainSearchButton(): Locator {
    return this.mainForm()
      .getByRole("button", { name: /^Search$/i })
      .first();
  }

  locationSuggestions(): Locator {
    return this.page.getByRole("listbox", { name: /location suggestions/i });
  }

  locationSuggestion(name: RegExp | string): Locator {
    return this.page.getByRole("option", { name }).first();
  }

  locationWarning(): Locator {
    return this.page
      .getByText(
        "Select a location from the dropdown for more accurate results"
      )
      .first();
  }

  desktopHeaderSummary(): Locator {
    return this.page.locator('[data-testid="desktop-header-search-summary"]');
  }

  desktopHeaderForm(): Locator {
    return this.page.locator('[data-testid="desktop-header-search-form"]');
  }

  desktopHeaderLocationInput(): Locator {
    return this.page.locator("#desktop-header-search-location");
  }

  desktopHeaderVibeInput(): Locator {
    return this.page.locator("#desktop-header-search-vibe");
  }

  desktopHeaderSearchButton(): Locator {
    return this.desktopHeaderForm()
      .getByRole("button", { name: /^Search$/i })
      .first();
  }

  desktopHeaderMinBudgetInput(): Locator {
    return this.desktopHeaderForm().getByLabel("Minimum budget");
  }

  desktopHeaderMaxBudgetInput(): Locator {
    return this.desktopHeaderForm().getByLabel("Maximum budget");
  }

  appliedFiltersRegion(): Locator {
    return this.resultsContainer().locator('[aria-label="Applied filters"]');
  }

  appliedFilterRemoveButton(name: RegExp | string): Locator {
    return this.appliedFiltersRegion().getByRole("button", { name }).first();
  }

  browseOrEmptyState(): Locator {
    return this.page
      .getByText(/no matches found|no exact matches|start by searching|browse/i)
      .or(this.page.locator('[data-testid="empty-state"]'))
      .or(this.page.locator('[data-testid="search-empty-state"]'));
  }

  crashBoundary(): Locator {
    return this.page.getByText(
      /application error|something went wrong|search failed unexpectedly|stack trace/i
    );
  }

  async expectResultsOrBrowseState() {
    const visibleSurface = this.listingCards()
      .first()
      .or(this.browseOrEmptyState().first());

    try {
      await expect(visibleSurface).toBeVisible({ timeout: 30_000 });
    } catch (error) {
      if (await this.recoverFromKnownManifestOverlay()) {
        await expect(visibleSurface).toBeVisible({ timeout: 30_000 });
        return;
      }
      throw error;
    }
  }

  async waitForResultsHydrated() {
    await expect(this.resultsFeed()).toHaveAttribute("data-hydrated", "true", {
      timeout: 30_000,
    });
  }

  private async recoverFromKnownManifestOverlay(): Promise<boolean> {
    const manifestOverlay = this.page
      .getByText("Manifest file is empty")
      .first();
    if (!(await manifestOverlay.isVisible().catch(() => false))) {
      return false;
    }

    await this.page.reload({ waitUntil: "domcontentloaded" });
    await waitForStable(this.page);
    return true;
  }

  async waitForDesktopHeaderHydrated() {
    await expect(this.desktopHeaderForm()).toBeVisible({ timeout: 30_000 });
    if (
      (await this.desktopHeaderForm().getAttribute("data-hydrated")) === "true"
    ) {
      return;
    }
    await this.waitForResultsHydrated().catch(() => undefined);
    await expect(this.desktopHeaderForm()).toBeVisible({ timeout: 30_000 });
  }

  async selectMainLocation(query: string, optionName: RegExp | string) {
    await this.mainLocationInput().fill(query);
    await expect(this.locationSuggestions()).toBeVisible({ timeout: 15_000 });
    await this.locationSuggestion(optionName).click();
  }

  async selectDesktopHeaderLocation(
    query: string,
    optionName: RegExp | string
  ) {
    const autocompleteResponse = this.page.waitForResponse(
      (response) => response.url().includes("/api/geocoding/autocomplete"),
      { timeout: 10_000 }
    );
    await this.waitForDesktopHeaderHydrated();
    await this.desktopHeaderLocationInput().click();
    await this.desktopHeaderLocationInput().fill(query);
    await expect(this.desktopHeaderLocationInput()).toHaveValue(query);
    await expect((await autocompleteResponse).ok()).toBe(true);
    await expect(this.locationSuggestions()).toBeVisible({ timeout: 15_000 });
    await this.locationSuggestion(optionName).click();
    await expect(this.locationSuggestions()).toBeHidden({ timeout: 15_000 });
    await this.page.evaluate(
      () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    );
  }

  async submitMainSearch() {
    await this.mainSearchButton().click();
    await this.page.waitForURL(/\/search(?:\?|$)/, { timeout: 15_000 });
  }

  async submitDesktopHeaderSearch() {
    await this.page.evaluate(
      () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    );
    await this.desktopHeaderSearchButton().click();
    await this.page.waitForURL(/\/search(?:\?|$)/, { timeout: 15_000 });
  }

  async setDesktopHeaderBudget(min: string, max: string) {
    await this.waitForDesktopHeaderHydrated();
    await this.setNumberInputValue(this.desktopHeaderMinBudgetInput(), min);
    await this.setNumberInputValue(this.desktopHeaderMaxBudgetInput(), max);
  }

  async searchDesktopHeaderVibe(value: string) {
    await this.waitForDesktopHeaderHydrated();
    await this.desktopHeaderVibeInput().fill(value);
    await expect(this.desktopHeaderVibeInput()).toHaveValue(value);
    await this.submitDesktopHeaderSearch();
  }

  async clearDesktopHeaderBudget() {
    await this.setDesktopHeaderBudget("", "");
  }

  private async setNumberInputValue(input: Locator, value: string) {
    await input.waitFor({ state: "visible", timeout: 15_000 });
    await expect
      .poll(
        async () => {
          await input.fill(value);
          await input.blur();
          return input.inputValue();
        },
        {
          message: `number input to keep value ${value}`,
          timeout: 15_000,
        }
      )
      .toBe(value);
  }

  async openCollapsedDesktopHeaderSearch() {
    await expect(this.desktopHeaderSummary()).toBeVisible({ timeout: 15_000 });
    await this.desktopHeaderSummary().click();
    await expect(this.desktopHeaderForm()).toBeVisible({ timeout: 15_000 });
  }

  async expectNoCrashBoundary() {
    await expect(this.crashBoundary().first()).toBeHidden();
  }

  async expectSaneUrl() {
    await expectSaneSearchUrl(this.page);
  }
}
