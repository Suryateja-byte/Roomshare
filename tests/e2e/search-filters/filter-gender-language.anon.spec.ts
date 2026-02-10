/**
 * Gender & Language Filter E2E Tests (P2)
 *
 * Validates gender preference, household gender, and language filtering
 * via the filter modal's Radix Select dropdowns and language chip selector.
 *
 * Key implementation details:
 * - Gender Preference: Radix Select (#filter-gender-pref)
 *   Values: MALE_ONLY ("Male Identifying Only"), FEMALE_ONLY ("Female Identifying Only"),
 *           NO_PREFERENCE ("Any Gender / All Welcome"), "any" (clears)
 *   URL param: genderPreference (e.g., genderPreference=FEMALE_ONLY)
 *
 * - Household Gender: Radix Select (#filter-household-gender)
 *   Values: ALL_MALE ("All Male"), ALL_FEMALE ("All Female"),
 *           MIXED ("Mixed (Co-ed)"), "any" (clears)
 *   URL param: householdGender (e.g., householdGender=MIXED)
 *
 * - Languages: Multi-select with search input and toggle buttons
 *   Search: input[placeholder="Search languages..."]
 *   Selected group: [aria-label="Selected languages"] with aria-pressed="true" buttons
 *   Available group: [aria-label="Available languages"] with aria-pressed="false" buttons
 *   URL param: languages (comma-separated codes, e.g., languages=es,fr)
 *   Codes: ISO 639-1 (en, es, fr, zh, hi, etc.)
 *   Display: getLanguageName(code) -> "Spanish", "French", etc.
 *
 * - All changes are pending until Apply is clicked (useBatchedFilters)
 */

import {
  test,
  expect,
  SF_BOUNDS,
  selectors,
  tags,
  SEARCH_URL,
  waitForSearchReady,
  getUrlParam,
  openFilterModal,
  applyFilters,
  selectDropdownOption,
} from "../helpers";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Gender & Language Filters", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async () => {
    test.slow();
  });

  // 8.1: Select gender preference -> URL has genderPreference=FEMALE_ONLY
  test(`${tags.core} - selecting gender preference and applying updates URL`, async ({ page }) => {
    await waitForSearchReady(page);
    const dialog = await openFilterModal(page);

    // Select "Female Identifying Only" from the gender preference dropdown
    await selectDropdownOption(page, "#filter-gender-pref", /female identifying only/i);

    // Apply
    await applyFilters(page);

    // Verify URL contains genderPreference=FEMALE_ONLY
    await page.waitForURL(
      (url) => new URL(url).searchParams.get("genderPreference") === "FEMALE_ONLY",
      { timeout: 30_000 },
    );

    expect(getUrlParam(page, "genderPreference")).toBe("FEMALE_ONLY");
  });

  // 8.2: Select household gender -> URL has householdGender=MIXED
  test(`${tags.core} - selecting household gender and applying updates URL`, async ({ page }) => {
    await waitForSearchReady(page);
    const dialog = await openFilterModal(page);

    // Select "Mixed (Co-ed)" from the household gender dropdown
    await selectDropdownOption(page, "#filter-household-gender", /mixed/i);

    // Apply
    await applyFilters(page);

    // Verify URL contains householdGender=MIXED
    await page.waitForURL(
      (url) => new URL(url).searchParams.get("householdGender") === "MIXED",
      { timeout: 30_000 },
    );

    expect(getUrlParam(page, "householdGender")).toBe("MIXED");
  });

  // 8.3: Language multi-select with search -> select Spanish and French, URL has language codes
  test(`${tags.core} - searching and selecting multiple languages updates URL`, async ({ page }) => {
    await waitForSearchReady(page);
    const dialog = await openFilterModal(page);

    // Scroll to the language section
    const languageSearch = dialog.locator('input[placeholder="Search languages..."]');
    await languageSearch.scrollIntoViewIfNeeded();
    await expect(languageSearch).toBeVisible({ timeout: 5_000 });

    // Search for "Span" and select Spanish
    await languageSearch.fill("Span");
    await page.waitForTimeout(300);

    const availableGroup = dialog.locator('[aria-label="Available languages"]');
    const spanishBtn = availableGroup.getByRole("button", { name: /spanish/i });
    await expect(spanishBtn).toBeVisible({ timeout: 3_000 });
    await spanishBtn.click();
    await page.waitForTimeout(300);

    // Spanish should now appear in the "Selected languages" group
    const selectedGroup = dialog.locator('[aria-label="Selected languages"]');
    await expect(selectedGroup).toBeVisible({ timeout: 3_000 });
    const selectedSpanish = selectedGroup.getByRole("button", { name: /spanish/i });
    await expect(selectedSpanish).toHaveAttribute("aria-pressed", "true");

    // Clear search and search for "Fre" to find French
    await languageSearch.clear();
    await languageSearch.fill("Fre");
    await page.waitForTimeout(300);

    const frenchBtn = availableGroup.getByRole("button", { name: /french/i });
    await expect(frenchBtn).toBeVisible({ timeout: 3_000 });
    await frenchBtn.click();
    await page.waitForTimeout(300);

    // Both should be in the selected group
    const selectedFrench = selectedGroup.getByRole("button", { name: /french/i });
    await expect(selectedFrench).toHaveAttribute("aria-pressed", "true");

    // Apply
    await languageSearch.clear();
    await applyFilters(page);

    // Verify URL contains language codes (es for Spanish, fr for French)
    await page.waitForURL(
      (url) => {
        const languages = new URL(url).searchParams.get("languages");
        return languages !== null && languages.includes("es") && languages.includes("fr");
      },
      { timeout: 30_000 },
    );

    const languages = getUrlParam(page, "languages") ?? "";
    expect(languages).toContain("es");
    expect(languages).toContain("fr");
  });

  // 8.4: Deselect language -> click selected language to remove, URL updates
  test(`${tags.core} - deselecting a language removes it from URL`, async ({ page }) => {
    // Start with Spanish and French applied
    await page.goto(`${SEARCH_URL}&languages=es,fr`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2_000);

    const dialog = await openFilterModal(page);

    // Scroll to language section
    const languageSearch = dialog.locator('input[placeholder="Search languages..."]');
    await languageSearch.scrollIntoViewIfNeeded();

    // Spanish should be in the "Selected languages" group
    const selectedGroup = dialog.locator('[aria-label="Selected languages"]');
    await expect(selectedGroup).toBeVisible({ timeout: 5_000 });

    // Click Spanish to deselect it
    const selectedSpanish = selectedGroup.getByRole("button", { name: /spanish/i });
    await expect(selectedSpanish).toBeVisible({ timeout: 3_000 });
    await selectedSpanish.click();
    await page.waitForTimeout(300);

    // Apply
    await applyFilters(page);

    // URL should now have only French (fr), not Spanish (es)
    await page.waitForURL(
      (url) => {
        const languages = new URL(url).searchParams.get("languages") ?? "";
        return !languages.includes("es");
      },
      { timeout: 30_000 },
    );

    const languages = getUrlParam(page, "languages") ?? "";
    expect(languages).not.toContain("es");
    // French should still be present
    expect(languages).toContain("fr");
  });

  // 8.5: "No languages found" shown when search has no matches
  test(`${tags.core} - shows "No languages found" for unmatched search`, async ({ page }) => {
    await waitForSearchReady(page);
    const dialog = await openFilterModal(page);

    // Scroll to language section
    const languageSearch = dialog.locator('input[placeholder="Search languages..."]');
    await languageSearch.scrollIntoViewIfNeeded();
    await expect(languageSearch).toBeVisible({ timeout: 5_000 });

    // Type a nonsense string that matches no language
    await languageSearch.fill("zzzzzz");
    await page.waitForTimeout(300);

    // "No languages found" message should appear in the available languages area
    const noResultsMsg = dialog.locator("text=No languages found");
    await expect(noResultsMsg).toBeVisible({ timeout: 3_000 });
  });

  // 8.6: "All languages selected" shown when all picked
  test(`${tags.core} - shows "All languages selected" when every language is selected`, async ({ page }) => {
    // Build a URL with all supported language codes selected
    // The SUPPORTED_LANGUAGES object has ~47 languages; we need all their codes.
    // Rather than hardcoding all codes, we navigate with a large set of known codes
    // and verify the "All languages selected" message appears when search is empty.
    const allLanguageCodes = [
      "en", "es", "zh", "hi", "ar", "pt", "ru", "ja", "de", "fr",
      "ko", "vi", "it", "nl", "pl", "tr", "th", "te", "ta", "bn",
      "pa", "gu", "mr", "kn", "ml", "ur", "ne", "si", "yue", "tl",
      "id", "ms", "my", "km", "fa", "he", "sw", "am", "yo", "ha",
      "ig", "uk", "cs", "ro", "el", "hu", "sv", "da", "no", "fi",
      "sk", "bg", "sr", "hr",
    ];
    const languagesParam = allLanguageCodes.join(",");

    await page.goto(`${SEARCH_URL}&languages=${languagesParam}`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2_000);

    const dialog = await openFilterModal(page);

    // Scroll to language section
    const languageSearch = dialog.locator('input[placeholder="Search languages..."]');
    await languageSearch.scrollIntoViewIfNeeded();

    // With all languages selected and no search term, the available languages area
    // should show "All languages selected" (since filteredLanguages minus selected = 0)
    const allSelectedMsg = dialog.locator("text=All languages selected");
    await expect(allSelectedMsg).toBeVisible({ timeout: 5_000 });
  });
});
