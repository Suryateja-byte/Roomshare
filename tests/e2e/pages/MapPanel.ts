import { expect, type Locator, type Page } from "@playwright/test";

export class MapPanel {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  root(): Locator {
    return this.page
      .locator('[data-testid="map"], .maplibregl-map, [class*="maplibregl"]')
      .first();
  }

  shell(): Locator {
    return this.page.getByTestId("map-shell").first();
  }

  canvas(): Locator {
    return this.page.locator(".maplibregl-canvas:visible").first();
  }

  markers(): Locator {
    return this.page.locator('[data-testid="map-marker"], .maplibregl-marker');
  }

  markerButtonByListingId(listingId: string): Locator {
    const escapedListingId = listingId.replace(/"/g, '\\"');
    return this.page
      .locator(
        `.maplibregl-marker [data-listing-id="${escapedListingId}"][role="button"]`
      )
      .first();
  }

  toolbarToggle(): Locator {
    return this.page
      .getByTestId("desktop-toolbar-map-toggle")
      .or(
        this.page.getByRole("button", {
          name: /hide results map|show results map/i,
        })
      )
      .first();
  }

  showMapButton(): Locator {
    return this.page.getByRole("button", { name: /^show map$/i }).first();
  }

  errorAlert(message?: RegExp | string): Locator {
    const alert = this.page.getByRole("alert");
    return message ? alert.filter({ hasText: message }).first() : alert.first();
  }

  status(message?: RegExp | string): Locator {
    const status = this.page.getByRole("status");
    return message
      ? status.filter({ hasText: message }).first()
      : status.first();
  }

  retryButton(): Locator {
    return this.page.getByRole("button", { name: /retry/i }).first();
  }

  loadingBar(): Locator {
    return this.page.getByTestId("map-data-loading-bar");
  }

  async expectVisible() {
    await expect(this.root()).toBeVisible({ timeout: 30_000 });
  }

  async expectShellVisible() {
    await expect(this.shell()).toBeVisible({ timeout: 30_000 });
  }
}
