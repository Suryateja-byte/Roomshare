import { expect, type Locator, type Page } from "@playwright/test";
import {
  applyFilters,
  clearAllButton,
  openFilterModal,
  selectDropdownOption,
  toggleAmenity,
  toggleHouseRule,
} from "../helpers/filter-helpers";

export class FilterModal {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  dialog(): Locator {
    return this.page
      .getByRole("dialog")
      .filter({ hasText: /filter/i })
      .first();
  }

  openButton(): Locator {
    return this.page
      .getByRole("button", { name: /filter/i })
      .or(this.page.locator('[data-testid="filter-button"]'))
      .first();
  }

  async open() {
    await openFilterModal(this.page);
    await expect(this.dialog()).toBeVisible();
  }

  async apply() {
    await applyFilters(this.page);
  }

  async applyIfOpen() {
    const applyButton = this.page.locator('[data-testid="filter-modal-apply"]');
    if (await applyButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await this.apply();
    }
  }

  async clearAll() {
    await clearAllButton(this.page).click();
  }

  async reduceMaximumPrice(steps = 5) {
    const maxThumb = this.page.locator('[aria-label="Maximum price"]');
    await expect(maxThumb).toBeVisible({ timeout: 10_000 });
    await maxThumb.focus();
    for (let index = 0; index < steps; index += 1) {
      await this.page.keyboard.press("ArrowLeft");
    }
  }

  async selectNextMonthDay(
    triggerId: "filter-move-in" | "filter-end-date",
    day: number
  ) {
    const trigger = this.dialog().locator(`#${triggerId}`);
    await trigger.scrollIntoViewIfNeeded();
    await expect(trigger).toBeVisible({ timeout: 10_000 });
    await trigger.click();

    const nextMonth = this.page.getByRole("button", {
      name: "Next month",
    });
    await expect(nextMonth).toBeVisible({ timeout: 10_000 });
    await nextMonth.click();

    const calendar = this.dialog().locator(`#${triggerId}-calendar`);
    await expect(calendar).toBeVisible({ timeout: 10_000 });

    const dayButton = calendar
      .getByRole("button", {
        name: new RegExp(`^${day}$`),
      })
      .filter({ hasText: new RegExp(`^${day}$`) })
      .first();
    await expect(dayButton).toBeVisible({ timeout: 10_000 });
    await dayButton.click();
    await expect(calendar).toBeHidden({ timeout: 10_000 });
  }

  async selectLeaseDuration(label: RegExp) {
    await selectDropdownOption(this.page, "#filter-lease", label);
  }

  async selectRoomType(label: RegExp) {
    await selectDropdownOption(this.page, "#filter-room-type", label);
  }

  async increaseMinimumOpenSpots() {
    const button = this.dialog().getByRole("button", {
      name: /increase minimum spots/i,
    });
    await button.scrollIntoViewIfNeeded();
    await button.click();
  }

  async toggleAmenity(name: string) {
    await toggleAmenity(this.page, name);
  }

  async toggleHouseRule(name: string) {
    await toggleHouseRule(this.page, name);
  }

  async selectLanguage(searchText: string, languageLabel: RegExp) {
    const input = this.dialog().locator(
      'input[placeholder="Search languages..."]'
    );
    await input.scrollIntoViewIfNeeded();
    await expect(input).toBeVisible({ timeout: 10_000 });
    await input.fill(searchText);

    const option = this.dialog()
      .locator('[aria-label="Available languages"]')
      .getByRole("button", { name: languageLabel });
    await expect(option).toBeVisible({ timeout: 10_000 });
    await option.click();
    await input.clear();
  }

  async selectGenderPreference(label: RegExp) {
    await selectDropdownOption(this.page, "#filter-gender-pref", label);
  }

  async selectHouseholdGender(label: RegExp) {
    await selectDropdownOption(this.page, "#filter-household-gender", label);
  }
}
