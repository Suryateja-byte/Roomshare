import { expect, type Locator, type Page } from "@playwright/test";

export class SavedSearchModal {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  openButton(): Locator {
    return this.page
      .getByRole("button", { name: /save search/i })
      .or(this.page.locator('[data-testid="save-search"]'))
      .first();
  }

  dialog(): Locator {
    return this.page.getByRole("dialog", { name: /save this search/i });
  }

  nameInput(): Locator {
    return this.dialog().getByLabel(/search name/i);
  }

  alertsSwitch(): Locator {
    return this.dialog().getByRole("switch", { name: /email alerts/i });
  }

  frequencyButton(name: RegExp | string): Locator {
    return this.dialog().getByRole("button", { name }).first();
  }

  saveButton(): Locator {
    return this.dialog()
      .getByRole("button", { name: /save search/i })
      .last();
  }

  unlockAlertsButton(): Locator {
    return this.dialog().getByRole("button", { name: /unlock alerts/i });
  }

  alert(): Locator {
    return this.dialog().getByRole("alert");
  }

  lockedAlertsMessage(): Locator {
    return this.dialog().getByText(/alerts are locked/i);
  }

  async open() {
    await this.openButton().click();
    await expect(this.dialog()).toBeVisible();
  }
}
