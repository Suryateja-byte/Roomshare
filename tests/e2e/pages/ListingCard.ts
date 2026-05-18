import { expect, type Locator, type Page } from "@playwright/test";
import { selectors, searchResultsContainer } from "../helpers/test-utils";

export class ListingCard {
  readonly page: Page;
  readonly root: Locator;

  constructor(page: Page, root?: Locator) {
    this.page = page;
    this.root =
      root ??
      searchResultsContainer(page).locator(selectors.listingCard).first();
  }

  link(): Locator {
    return this.root.locator('a[href^="/listings/"]').first();
  }

  price(): Locator {
    return this.root.getByTestId("listing-price").first();
  }

  imageCarousel(): Locator {
    return this.root.locator('[aria-label^="Image carousel"]').first();
  }

  saveButton(): Locator {
    return this.root
      .getByRole("button", { name: /save|favorite|heart/i })
      .or(this.root.locator('[data-testid="favorite-button"]'))
      .first();
  }

  groupedDatesTrigger(): Locator {
    return this.root.getByTestId("group-dates-trigger").first();
  }

  async expectVisible() {
    await expect(this.root).toBeVisible({ timeout: 30_000 });
  }
}
