import { expect, type Locator, type Page } from "@playwright/test";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export class MobileSearchOverlay {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  overlay(): Locator {
    return this.page.getByRole("dialog", { name: /^search$/i }).first();
  }

  collapsedTrigger(): Locator {
    return this.page
      .getByRole("button", { name: /^expand search$/i })
      .filter({ visible: true })
      .first();
  }

  whereInput(): Locator {
    return this.overlay().getByLabel(/where/i);
  }

  minBudgetInput(): Locator {
    return this.overlay().getByLabel(/minimum budget/i);
  }

  maxBudgetInput(): Locator {
    return this.overlay().getByLabel(/maximum budget/i);
  }

  filtersButton(): Locator {
    return this.overlay()
      .getByRole("button", { name: /^filters$/i })
      .first();
  }

  searchButton(): Locator {
    return this.overlay()
      .getByRole("button", { name: /^search$/i })
      .last();
  }

  backButton(): Locator {
    return this.overlay().getByRole("button", { name: /back to results/i });
  }

  recentSearch(name: RegExp | string): Locator {
    return this.overlay().getByRole("button", { name }).first();
  }

  removeRecentSearch(name: RegExp | string): Locator {
    const removeName =
      typeof name === "string"
        ? new RegExp(`remove ${escapeRegExp(name)}`, "i")
        : new RegExp(`remove ${name.source}`, name.flags || "i");

    return this.overlay().getByRole("button", { name: removeName }).first();
  }

  async open() {
    const trigger = this.collapsedTrigger();
    await this.page
      .waitForLoadState("load", { timeout: 10_000 })
      .catch(() => undefined);
    await expect(trigger).toBeVisible({ timeout: 15_000 });
    await expect(async () => {
      if (
        !(await this.overlay()
          .isVisible()
          .catch(() => false))
      ) {
        await trigger.click();
      }
      await expect(this.overlay()).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 15_000 });
  }
}
