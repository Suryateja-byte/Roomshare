/**
 * Page Object Model for the Nearby Places section on listing detail pages.
 *
 * All selectors verified against:
 * - NearbyPlacesPanel.tsx (search UI, auth gate, chips, results)
 * - NearbyPlacesMap.tsx (map, markers, controls)
 * - NearbyPlacesSection.tsx (container, heading, layout)
 * - RadarAttribution.tsx (Radar branding link)
 */

import fs from "node:fs";
import path from "node:path";
import { Page, Locator, expect } from "@playwright/test";

const NEARBY_SEED_LISTING_TITLE = "Sunny Mission Room";
const E2E_SEED_MANIFEST_PATH = path.resolve(
  process.cwd(),
  "test-results",
  "e2e-seed.json"
);

type E2ESeedManifest = {
  listingsByTitle?: Record<string, string>;
};

function getSeedListingId(title = NEARBY_SEED_LISTING_TITLE): string {
  if (!fs.existsSync(E2E_SEED_MANIFEST_PATH)) {
    throw new Error(
      `Missing nearby E2E seed manifest at ${E2E_SEED_MANIFEST_PATH}. Run the E2E seed first.`
    );
  }

  const manifest = JSON.parse(
    fs.readFileSync(E2E_SEED_MANIFEST_PATH, "utf8")
  ) as E2ESeedManifest;
  const listingId = manifest.listingsByTitle?.[title];

  if (!listingId) {
    throw new Error(
      `No listing id found for "${title}" in ${E2E_SEED_MANIFEST_PATH}.`
    );
  }

  return listingId;
}

export class NearbyPlacesPage {
  readonly page: Page;

  // Section container (NearbyPlacesSection.tsx line 33)
  readonly section: Locator;
  readonly heading: Locator;

  // Auth states (NearbyPlacesPanel.tsx lines 201-248)
  readonly signInPrompt: Locator;

  // Search input (NearbyPlacesPanel.tsx lines 266-293)
  readonly searchInput: Locator;
  // Search button only appears when query >= 2 chars (line 295-314)
  readonly searchButton: Locator;

  // Category chips — buttons with aria-pressed in the scrollable chip container (lines 324-351)
  readonly categoryChips: Locator;

  // Radius options — buttons with aria-pressed (lines 364-383)
  readonly radiusOptions: Locator;

  // Results area (lines 389-393)
  readonly resultsArea: Locator;
  readonly loadingSkeleton: Locator;

  // Place links (lines 456-461)
  readonly placeLinks: Locator;

  // States
  readonly emptyState: Locator;
  readonly initialState: Locator;
  readonly errorState: Locator;

  // Map elements (NearbyPlacesMap.tsx)
  readonly mapCanvas: Locator;
  readonly mapContainer: Locator;
  // POI markers have .poi-marker class (line 141)
  readonly placeMarkers: Locator;

  // Map controls (NearbyPlacesMap.tsx lines 386-449)
  readonly zoomIn: Locator;
  readonly zoomOut: Locator;
  readonly resetView: Locator;
  readonly fitAll: Locator;

  // Map popup (line 282)
  readonly popup: Locator;

  // Mobile view toggle (NearbyPlacesPanel.tsx lines 524-551)
  readonly mobileToggleButton: Locator;

  // Attribution (RadarAttribution.tsx)
  readonly radarAttribution: Locator;

  constructor(page: Page) {
    this.page = page;

    this.section = page.locator("#nearby-places");
    this.heading = page.getByRole("heading", { name: "Nearby Places" });

    this.signInPrompt = page.getByText("Sign in to explore");

    this.searchInput = page.locator('input[aria-label="Search nearby places"]');
    this.searchButton = this.section.getByRole("button", {
      name: "Search",
      exact: true,
    });

    // Category chips: buttons with aria-pressed inside #nearby-places, excluding radius buttons
    this.categoryChips = this.section.locator(
      ".hide-scrollbar button[aria-pressed]"
    );

    // Radius options: buttons with aria-pressed inside the surface-container-high selector
    this.radiusOptions = this.section.locator(
      ".bg-surface-container-high button[aria-pressed]"
    );

    this.resultsArea = page.locator('[data-testid="results-area"]');
    this.loadingSkeleton = page.locator('[data-testid="loading-skeleton"]');

    this.placeLinks = page.locator('a[aria-label^="Get directions to"]');

    this.emptyState = page.getByText("No places found");
    this.initialState = page.getByText("Discover what's nearby");
    this.errorState = this.resultsArea.locator(
      '[role="status"][aria-live="polite"]'
    );

    this.mapCanvas = page.locator(".maplibregl-canvas").first();
    this.mapContainer = page.locator(".maplibregl-map").first();
    this.placeMarkers = page.locator(".poi-marker");
    this.popup = page.locator(".nearby-popup");

    this.zoomIn = page.getByRole("button", { name: "Zoom in" });
    this.zoomOut = page.getByRole("button", { name: "Zoom out" });
    this.resetView = page.getByRole("button", {
      name: "Reset to listing location",
    });
    this.fitAll = page.getByRole("button", { name: "Fit all markers in view" });

    this.mobileToggleButton = this.section.getByRole("button", {
      name: /^(Map|List)$/,
    });

    this.radarAttribution = page.locator('a[href*="radar.com"]');
  }

  // --------------------------------------------------------------------------
  // Locator helpers
  // --------------------------------------------------------------------------

  /** Get a specific category chip by label text */
  chipByName(name: string): Locator {
    return this.section.locator(".hide-scrollbar button[aria-pressed]", {
      hasText: name,
    });
  }

  /** Get a specific radius button by label text */
  radiusByLabel(label: string): Locator {
    return this.section.getByRole("button", { name: label, exact: true });
  }

  /** Get a specific place result by name */
  placeByName(name: string): Locator {
    return this.page.locator(`a[aria-label="Get directions to ${name}"]`);
  }

  /** Get a marker by place ID */
  markerById(id: string): Locator {
    return this.page.locator(`[data-place-id="${id}"]`);
  }

  // --------------------------------------------------------------------------
  // Actions
  // --------------------------------------------------------------------------

  /**
   * Navigate to a listing detail page that has the nearby section.
   * Uses the deterministic E2E seed manifest instead of search-page card markup.
   */
  async goto(): Promise<void> {
    const listingId = getSeedListingId();
    await this.page.goto(`/listings/${listingId}`);
    await this.page.waitForLoadState("domcontentloaded");
  }

  /**
   * Scroll to the nearby places section and wait for it to be visible.
   */
  async scrollToSection(): Promise<void> {
    await this.section.waitFor({ state: "attached", timeout: 15_000 });
    await this.section.scrollIntoViewIfNeeded();
    await expect(this.section).toBeVisible({ timeout: 15_000 });
  }

  /**
   * Search for a place by typing text and pressing Enter.
   */
  async searchFor(query: string): Promise<void> {
    await this.searchInput.fill(query);
    await this.searchInput.press("Enter");
  }

  /**
   * Click a category chip by name.
   */
  async selectCategory(name: string): Promise<void> {
    await this.chipByName(name).click();
  }

  /**
   * Change the radius option.
   */
  async selectRadius(label: string): Promise<void> {
    await this.radiusByLabel(label).click();
  }

  /**
   * Wait for a nearby request to reach a terminal post-search state.
   */
  async waitForResults(): Promise<void> {
    await expect(async () => {
      const busy = (await this.resultsArea.getAttribute("aria-busy")) === "true";
      const loadingVisible = await this.loadingSkeleton
        .isVisible()
        .catch(() => false);
      const initialVisible = await this.initialState.isVisible().catch(
        () => false
      );
      const errorVisible = await this.errorState.isVisible().catch(() => false);
      const emptyVisible = await this.emptyState.isVisible().catch(() => false);
      const resultCount = await this.placeLinks.count();

      expect(
        busy ||
          loadingVisible ||
          (!initialVisible && (errorVisible || emptyVisible || resultCount > 0))
      ).toBe(true);
    }).toPass({ timeout: 5_000, intervals: [100, 200, 500] });

    await expect(this.resultsArea).toHaveAttribute("aria-busy", "false", {
      timeout: 15_000,
    });
    await expect(async () => {
      const initialVisible = await this.initialState.isVisible().catch(
        () => false
      );
      const errorVisible = await this.errorState.isVisible().catch(() => false);
      const emptyVisible = await this.emptyState.isVisible().catch(() => false);
      const resultCount = await this.placeLinks.count();

      expect(
        !initialVisible && (errorVisible || emptyVisible || resultCount > 0)
      ).toBe(true);
    }).toPass({ timeout: 15_000, intervals: [100, 200, 500] });
  }

  /**
   * Wait for loading skeleton to appear then disappear.
   */
  async waitForLoadingCycle(): Promise<void> {
    await expect(this.loadingSkeleton).toBeVisible({ timeout: 5_000 });
    await expect(this.loadingSkeleton).toBeHidden({ timeout: 15_000 });
  }

  /**
   * Get the number of visible place results.
   */
  async getPlaceCount(): Promise<number> {
    return this.placeLinks.count();
  }

  /**
   * Hover over a place in the results list to trigger marker highlight.
   */
  async hoverPlace(name: string): Promise<void> {
    await this.placeByName(name).hover();
  }

  /**
   * Check if the map container is visible (may not render in headless without WebGL).
   */
  async isMapVisible(): Promise<boolean> {
    try {
      await expect(this.mapContainer).toBeVisible({ timeout: 5_000 });
      return true;
    } catch {
      return false;
    }
  }
}
