# Test Plan: Search Filter Interactions E2E

## Overview

Comprehensive Playwright E2E test plan for the search page filter system at `/search`.
Covers all filter components, URL synchronization, filter chips, filter combinations,
count preview, state persistence, validation, accessibility, and mobile experience.

**Scope**: All filter interactions on the search page  
**Auth**: Anonymous (no login required for search filters)  
**Base URL**: `/search` with SF_BOUNDS for reliable results  
**Existing Coverage**: Partial coverage exists in `02-search-critical-journeys.spec.ts` (J2, J4, J5, J11-J14), `terminal3-filters-nav.spec.ts`, and `search-p0-filters-mobile.spec.ts`. This plan fills gaps and adds systematic edge-case, combination, and regression coverage.

---

## File Organization

```
tests/e2e/
  search-filters/
    filter-modal.spec.ts          # Sections 1, 15 (open/close, mobile drawer)
    filter-price.spec.ts          # Section 2 (price range slider, inputs, histogram)
    filter-room-type.spec.ts      # Section 3 (room type select + category tabs/bar)
    filter-amenities.spec.ts      # Section 4 (multi-select amenities, facet counts)
    filter-lease-duration.spec.ts # Section 5 (lease duration, split-stay)
    filter-house-rules.spec.ts    # Section 6 (multi-select house rules)
    filter-date.spec.ts           # Section 7 (move-in date picker, date pills)
    filter-gender-language.spec.ts# Section 8 (gender pref, household gender, languages)
    filter-chips.spec.ts          # Section 9 (applied filter chips, removal, clear all)
    filter-combinations.spec.ts   # Section 10 (multi-filter stacking)
    filter-count-preview.spec.ts  # Section 11 (show X listings button)
    filter-persistence.spec.ts    # Section 12 (URL persistence, refresh, deep link)
    filter-reset.spec.ts          # Section 13 (clear all, zero-results reset)
    filter-category-bar.spec.ts   # Section 14 (category icon bar)
    filter-recommended.spec.ts    # Section 16 (recommended filters)
    filter-validation.spec.ts     # Section 17 (XSS, invalid params, edge cases)
```

---

## Selectors Reference

All selectors derived from actual component source code.

```typescript
const filterSelectors = {
  // Filter Modal (FilterModal.tsx)
  filterModalTrigger: 'button:has-text("Filters")',       // SearchForm renders this
  filterModal: '[role="dialog"][aria-modal="true"]',       // Portal dialog
  filterModalTitle: '#filter-drawer-title',                // h2 heading
  filterModalClose: 'button[aria-label="Close filters"]',  // X button in header
  filterModalApply: '[data-testid="filter-modal-apply"]',  // "Show X listings" button
  filterModalClearAll: '[data-testid="filter-modal-clear-all"]', // "Clear all" in footer
  filterModalBackdrop: '.bg-black\\/40',                    // Backdrop overlay

  // Price Range (PriceRangeFilter.tsx - uses Radix Slider)
  priceRangeLabel: 'label:has-text("Price Range")',
  priceSlider: '[aria-label="Price range"]',               // Radix Slider.Root
  priceSliderMinThumb: '[aria-label="Minimum price"]',     // Slider.Thumb
  priceSliderMaxThumb: '[aria-label="Maximum price"]',     // Slider.Thumb
  priceHistogram: '[aria-hidden="true"]',                  // histogram bars container

  // Desktop price inputs (SearchForm compact header)
  priceMinInput: '[aria-label="Minimum budget"]',
  priceMaxInput: '[aria-label="Maximum budget"]',

  // Move-In Date (FilterModal.tsx)
  moveInDatePicker: '#filter-move-in',

  // Lease Duration (FilterModal.tsx)
  leaseDurationTrigger: '#filter-lease',

  // Room Type (FilterModal.tsx)
  roomTypeTrigger: '#filter-room-type',

  // Amenities (FilterModal.tsx)
  amenitiesGroup: '[aria-label="Select amenities"]',
  amenityButton: (name: string) => `[aria-label="Select amenities"] button:has-text("${name}")`,

  // House Rules (FilterModal.tsx)
  houseRulesGroup: '[aria-label="Select house rules"]',
  houseRuleButton: (name: string) => `[aria-label="Select house rules"] button:has-text("${name}")`,

  // Languages (FilterModal.tsx)
  languageSearchInput: 'input[placeholder="Search languages..."]',
  selectedLanguagesGroup: '[aria-label="Selected languages"]',
  availableLanguagesGroup: '[aria-label="Available languages"]',

  // Gender Preference (FilterModal.tsx)
  genderPreferenceTrigger: '#filter-gender-pref',

  // Household Gender (FilterModal.tsx)
  householdGenderTrigger: '#filter-household-gender',

  // Applied Filter Chips (AppliedFilterChips.tsx)
  appliedFiltersRegion: '[aria-label="Applied filters"]',
  filterChipRemove: (label: string) => `button[aria-label="Remove filter: ${label}"]`,
  clearAllFiltersBtn: 'button[aria-label="Clear all filters"]',

  // Category Bar (CategoryBar.tsx)
  categoryBar: '[aria-label="Category filters"]',
  categoryButton: (id: string) => `[aria-label="Category filters"] button:has-text("${id}")`,

  // Category Tabs (CategoryTabs.tsx)
  categoryTabs: '.flex.items-center.gap-1.p-1', // wrapper container

  // Recommended Filters (RecommendedFilters.tsx)
  recommendedFiltersRow: '.flex.items-center.gap-2:has(text="Try:")',
  recommendedPill: (label: string) => `button:has-text("${label}")`,
};
```

---

## Shared Constants

```typescript
const SF_BOUNDS = {
  minLat: 37.7, maxLat: 37.85, minLng: -122.52, maxLng: -122.35,
};
const BOUNDS_QS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;
const BASE_SEARCH_URL = `/search?${BOUNDS_QS}`;

// Valid enums from search-params.ts
const AMENITIES = ['Wifi', 'AC', 'Parking', 'Washer', 'Dryer', 'Kitchen', 'Gym', 'Pool', 'Furnished'];
const HOUSE_RULES = ['Pets allowed', 'Smoking allowed', 'Couples allowed', 'Guests allowed'];
const LEASE_DURATIONS = ['Month-to-month', '3 months', '6 months', '12 months', 'Flexible'];
const ROOM_TYPES = ['Private Room', 'Shared Room', 'Entire Place'];
const GENDER_PREFERENCES = ['MALE_ONLY', 'FEMALE_ONLY', 'NO_PREFERENCE'];
const HOUSEHOLD_GENDERS = ['ALL_MALE', 'ALL_FEMALE', 'MIXED'];
```

---

## Mock Strategy

All tests run against the live dev server unless explicitly mocked:

| API Endpoint | Mock When | Reason |
|---|---|---|
| `/api/search/v2` | Network error tests, zero-results tests | Control result count |
| `/api/search/facets` | Facet count display tests | Provide deterministic counts |
| `/api/search-count` | Count preview tests | Provide deterministic count for button |

Use `network.mockApiResponse()` fixture for mocking.

---

## Section 1: Filter Modal Open/Close

**File**: `filter-modal.spec.ts`  
**Priority**: P0  
**Auth**: Anonymous  
**Tags**: `@core`

### Test 1.1: Open filter modal from Filters button

- **Preconditions**: Search page loaded with bounds
- **Steps**:
  1. Navigate to `BASE_SEARCH_URL`
  2. Wait for heading h1 to be visible
  3. Click the "Filters" button (exact match to avoid "Close filters")
  4. Wait for `[role="dialog"][aria-modal="true"]` to be visible
- **Assertions**:
  - Dialog is visible with `timeout: 5000`
  - Dialog has `aria-labelledby="filter-drawer-title"`
  - Heading "Filters" (`#filter-drawer-title`) is visible inside the dialog
  - Focus is trapped inside the dialog (FocusTrap component)

### Test 1.2: Close filter modal with X button

- **Preconditions**: Filter modal is open
- **Steps**:
  1. Open filter modal (reuse helper)
  2. Click `button[aria-label="Close filters"]` inside the dialog
- **Assertions**:
  - Dialog is not visible
  - Focus returns to the "Filters" trigger button

### Test 1.3: Close filter modal with Escape key

- **Preconditions**: Filter modal is open
- **Steps**:
  1. Open filter modal
  2. Press `Escape` key
- **Assertions**:
  - Dialog is not visible
- **Notes**: FocusTrap handles Escape via onClose prop. Verify the modal's `onClose` fires.

### Test 1.4: Close filter modal by clicking backdrop

- **Preconditions**: Filter modal is open
- **Steps**:
  1. Open filter modal
  2. Click the backdrop overlay (`div[aria-label="Close filters"]` behind the panel)
- **Assertions**:
  - Dialog is not visible
- **Notes**: The backdrop `div` has `onClick={onClose}`. Click coordinates must be outside the panel (left side).

### Test 1.5: Filter modal renders all sections

- **Preconditions**: Filter modal is open
- **Steps**:
  1. Open filter modal
  2. Scroll through the modal content
- **Assertions**:
  - "Price Range" label visible (when onPriceChange provided)
  - "Move-in Date" label visible
  - "Lease Duration" label visible
  - "Room Type" label visible
  - "Amenities" fieldset legend visible
  - "House Rules" fieldset legend visible
  - "Can Communicate In" fieldset legend visible
  - "Gender Preference" label visible
  - "Household Gender" label visible
  - Apply button (`[data-testid="filter-modal-apply"]`) visible

### Test 1.6: Filter modal shows active filter count badge

- **Preconditions**: Filters applied via URL
- **Steps**:
  1. Navigate to `BASE_SEARCH_URL&amenities=Wifi&roomType=Private+Room`
  2. Open filter modal
- **Assertions**:
  - Badge showing "2" (or appropriate count) visible next to "Filters" heading
  - `#filter-drawer-title` contains a `<span>` with the count

### Test 1.7: Filter modal preserves dirty state during open

- **Preconditions**: Filter modal is open
- **Steps**:
  1. Open filter modal
  2. Toggle "Wifi" amenity on
  3. Toggle "Parking" amenity on
  4. Scroll down in the modal
  5. Scroll back up
- **Assertions**:
  - Wifi button still has `aria-pressed="true"`
  - Parking button still has `aria-pressed="true"`
  - Changes are not lost during scroll

---

## Section 2: Price Range Filter

**File**: `filter-price.spec.ts`  
**Priority**: P0  
**Auth**: Anonymous  
**Tags**: `@core`

### Test 2.1: Price range slider adjusts min/max

- **Preconditions**: Filter modal is open
- **Steps**:
  1. Open filter modal
  2. Locate the price slider (`[aria-label="Price range"]`)
  3. Drag the minimum price thumb right (simulate with keyboard: focus thumb, press ArrowRight)
  4. Drag the maximum price thumb left
- **Assertions**:
  - Price range label text updates (e.g., "$500 - $5,000")
  - Slider thumbs move visually
- **Notes**: Use keyboard interaction (ArrowRight/ArrowLeft on focused Radix Slider thumb) for reliability.

### Test 2.2: Price range display updates during drag

- **Preconditions**: Filter modal is open with slider visible
- **Steps**:
  1. Focus minimum price thumb
  2. Press ArrowRight 5 times
  3. Read the range label text
- **Assertions**:
  - Range label shows updated min value
  - Label format matches `$X,XXX - $Y,YYY` or `$Xk - $Yk+`

### Test 2.3: Desktop price inputs sync with URL params

- **Preconditions**: Price params in URL
- **Steps**:
  1. Navigate to `BASE_SEARCH_URL&minPrice=500&maxPrice=2000`
  2. Wait for page load
- **Assertions**:
  - `[aria-label="Minimum budget"]` input has value "500"
  - `[aria-label="Maximum budget"]` input has value "2000"
  - URL contains `minPrice=500&maxPrice=2000`

### Test 2.4: Manual price input updates URL on apply

- **Preconditions**: Filter modal open, or desktop price inputs visible
- **Steps**:
  1. Navigate to `BASE_SEARCH_URL`
  2. Locate minimum budget input
  3. Clear and type "600"
  4. Locate maximum budget input
  5. Clear and type "1800"
  6. Press Enter or trigger form submission
- **Assertions**:
  - URL updates to contain `minPrice=600` and `maxPrice=1800`

### Test 2.5: Price inverted range throws/rejects (min > max)

- **Preconditions**: None
- **Steps**:
  1. Navigate to `BASE_SEARCH_URL&minPrice=5000&maxPrice=1000`
- **Assertions**:
  - Server-side parseSearchParams throws "minPrice cannot exceed maxPrice"
  - Page either shows error state or rejects the inverted params
  - URL is corrected or error message shown
- **Notes**: Per `search-params.ts:340-345`, inverted ranges throw rather than silently swap.

### Test 2.6: Price histogram renders when data available

- **Preconditions**: Filter modal open, facets API returns histogram
- **Steps**:
  1. Mock `/api/search/facets` to return histogram data
  2. Open filter modal
- **Assertions**:
  - Histogram container with bars is visible above the slider
  - Bars reflect the mocked distribution
- **Mock**: Provide `priceHistogram: [{ min: 0, max: 500, count: 10 }, ...]`

### Test 2.7: Price at absolute max shows "+" suffix

- **Preconditions**: Filter modal open
- **Steps**:
  1. Drag max price thumb to the far right (absolute max)
- **Assertions**:
  - Range label shows `$X,XXX - $10,000+` (with "+" suffix)
  - `isAtMax` condition in PriceRangeFilter triggers the "+" display

---

## Section 3: Room Type Selection

**File**: `filter-room-type.spec.ts`  
**Priority**: P0  
**Auth**: Anonymous  
**Tags**: `@core`

### Test 3.1: Select room type from filter modal

- **Preconditions**: Filter modal open
- **Steps**:
  1. Open filter modal
  2. Click room type trigger (`#filter-room-type`)
  3. Select "Private Room" from dropdown
  4. Click Apply
- **Assertions**:
  - URL contains `roomType=Private+Room` (or URL-encoded equivalent)
  - Modal closes

### Test 3.2: Room type is single-select (only one active)

- **Preconditions**: Filter modal open
- **Steps**:
  1. Open filter modal
  2. Select "Private Room"
  3. Then select "Shared Room"
  4. Click Apply
- **Assertions**:
  - URL contains `roomType=Shared+Room`
  - URL does NOT contain `Private+Room`
  - Only one roomType param exists

### Test 3.3: "Any" clears room type selection

- **Preconditions**: Room type filter applied
- **Steps**:
  1. Navigate to `BASE_SEARCH_URL&roomType=Private+Room`
  2. Open filter modal
  3. Click room type trigger
  4. Select "Any"
  5. Click Apply
- **Assertions**:
  - URL does NOT contain `roomType`
  - roomType param removed from URL

### Test 3.4: Room type facet counts shown with zero-count disabled

- **Preconditions**: Filter modal open, facets API returns room type counts
- **Steps**:
  1. Mock `/api/search/facets` with `roomTypes: { "Private Room": 5, "Shared Room": 0, "Entire Place": 3 }`
  2. Open filter modal
  3. Click room type trigger
- **Assertions**:
  - "Private Room" shows "(5)" and is enabled
  - "Shared Room" shows "(0)" and is `disabled`
  - "Entire Place" shows "(3)" and is enabled

### Test 3.5: Room type URL aliases resolve correctly

- **Preconditions**: None
- **Steps**:
  1. Navigate to `BASE_SEARCH_URL&roomType=private`
  2. Wait for page load
- **Assertions**:
  - Server normalizes `private` to `Private Room`
  - Applied filter chip shows "Private Room"
- **Notes**: Aliases defined in `ROOM_TYPE_ALIASES` in search-params.ts

---

## Section 4: Amenities Multi-Select

**File**: `filter-amenities.spec.ts`  
**Priority**: P0  
**Auth**: Anonymous  
**Tags**: `@core`

### Test 4.1: Select single amenity

- **Preconditions**: Filter modal open
- **Steps**:
  1. Open filter modal
  2. Click "Wifi" button in amenities group
  3. Click Apply
- **Assertions**:
  - Wifi button shows `aria-pressed="true"` before Apply
  - URL contains `amenities=Wifi`
  - Applied filter chip "Wifi" appears

### Test 4.2: Select multiple amenities

- **Preconditions**: Filter modal open
- **Steps**:
  1. Open filter modal
  2. Click "Wifi"
  3. Click "Parking"
  4. Click "Furnished"
  5. Click Apply
- **Assertions**:
  - All three buttons show `aria-pressed="true"`
  - URL contains `amenities=Wifi,Parking,Furnished` (comma-separated)
  - Three separate filter chips appear

### Test 4.3: Deselect individual amenity

- **Preconditions**: Multiple amenities selected
- **Steps**:
  1. Navigate to `BASE_SEARCH_URL&amenities=Wifi,Parking,Furnished`
  2. Open filter modal
  3. Click "Parking" to deselect (it shows X icon when active)
  4. Click Apply
- **Assertions**:
  - URL contains `amenities=Wifi,Furnished` (Parking removed)
  - "Parking" button shows `aria-pressed="false"`

### Test 4.4: Amenity facet counts displayed

- **Preconditions**: Filter modal open with facet data
- **Steps**:
  1. Open filter modal (facets API responds with counts)
- **Assertions**:
  - Each unselected amenity button shows count in parentheses (e.g., "Wifi (12)")
  - Selected amenity buttons show X icon instead of count
  - Zero-count amenities are `disabled` and have `opacity-40`

### Test 4.5: Zero-count amenity cannot be selected

- **Preconditions**: Filter modal open, facets show zero count
- **Steps**:
  1. Mock facets with `amenities: { Wifi: 5, Pool: 0 }`
  2. Open filter modal
  3. Try to click "Pool"
- **Assertions**:
  - "Pool" button has `aria-disabled="true"` and `disabled`
  - Click does not toggle it
  - "Pool" has `opacity-40` styling

### Test 4.6: All nine amenities are rendered

- **Preconditions**: Filter modal open
- **Steps**:
  1. Open filter modal
  2. Count amenity buttons in the group
- **Assertions**:
  - Exactly 9 buttons: Wifi, AC, Parking, Washer, Dryer, Kitchen, Gym, Pool, Furnished

---

## Section 5: Lease Duration

**File**: `filter-lease-duration.spec.ts`  
**Priority**: P1  
**Auth**: Anonymous  
**Tags**: `@core`

### Test 5.1: Select each lease duration option

- **Preconditions**: Filter modal open
- **Steps** (for each duration):
  1. Open filter modal
  2. Click lease duration trigger (`#filter-lease`)
  3. Select the option
  4. Click Apply
- **Assertions**:
  - URL contains `leaseDuration=<value>` for each valid duration
  - Values tested: "Month-to-month", "3 months", "6 months", "12 months", "Flexible"

### Test 5.2: "Any" clears lease duration

- **Preconditions**: Lease duration applied
- **Steps**:
  1. Navigate to `BASE_SEARCH_URL&leaseDuration=6+months`
  2. Open filter modal
  3. Select "Any" for lease duration
  4. Click Apply
- **Assertions**:
  - URL does NOT contain `leaseDuration`

### Test 5.3: Lease duration aliases resolve

- **Preconditions**: None
- **Steps**:
  1. Navigate to `BASE_SEARCH_URL&leaseDuration=mtm`
- **Assertions**:
  - Normalized to "Month-to-month" server-side
  - Applied filter chip shows "Month-to-month"

---

## Section 6: House Rules

**File**: `filter-house-rules.spec.ts`  
**Priority**: P1  
**Auth**: Anonymous  
**Tags**: `@core`

### Test 6.1: Select single house rule

- **Preconditions**: Filter modal open
- **Steps**:
  1. Open filter modal
  2. Click "Pets allowed" in house rules group
  3. Click Apply
- **Assertions**:
  - `aria-pressed="true"` on the button
  - URL contains `houseRules=Pets+allowed`

### Test 6.2: Select multiple house rules

- **Preconditions**: Filter modal open
- **Steps**:
  1. Click "Pets allowed" and "Couples allowed"
  2. Click Apply
- **Assertions**:
  - URL contains `houseRules=Pets+allowed,Couples+allowed`
  - Two filter chips appear

### Test 6.3: Deselect house rule

- **Preconditions**: House rules applied
- **Steps**:
  1. Navigate with `houseRules=Pets+allowed,Smoking+allowed`
  2. Open filter modal
  3. Click "Smoking allowed" to deselect
  4. Click Apply
- **Assertions**:
  - URL contains only `houseRules=Pets+allowed`

### Test 6.4: House rule facet counts shown

- **Preconditions**: Facets API returns counts
- **Assertions**:
  - Each unselected rule shows count
  - Zero-count rules disabled

---

## Section 7: Move-In Date

**File**: `filter-date.spec.ts`  
**Priority**: P1  
**Auth**: Anonymous  
**Tags**: `@core`

### Test 7.1: Select move-in date from picker

- **Preconditions**: Filter modal open
- **Steps**:
  1. Open filter modal
  2. Click the date picker (`#filter-move-in`)
  3. Select a future date
  4. Click Apply
- **Assertions**:
  - URL contains `moveInDate=YYYY-MM-DD`
  - Filter chip shows "Move-in: Mon DD, YYYY"

### Test 7.2: Past dates are prevented

- **Preconditions**: None
- **Steps**:
  1. Navigate to `BASE_SEARCH_URL&moveInDate=2020-01-01`
- **Assertions**:
  - Server-side `safeParseDate` rejects past dates (returns undefined)
  - No moveInDate filter applied
  - No filter chip for move-in date

### Test 7.3: Date > 2 years in future rejected

- **Preconditions**: None
- **Steps**:
  1. Navigate to `BASE_SEARCH_URL&moveInDate=2030-01-01`
- **Assertions**:
  - Date rejected by safeParseDate
  - No moveInDate in active filters

### Test 7.4: Invalid date format rejected

- **Preconditions**: None
- **Steps**:
  1. Navigate to `BASE_SEARCH_URL&moveInDate=not-a-date`
  2. Navigate to `BASE_SEARCH_URL&moveInDate=13/45/2025`
- **Assertions**:
  - Invalid format returns undefined
  - No filter chip for date

---

## Section 8: Gender and Language Filters

**File**: `filter-gender-language.spec.ts`  
**Priority**: P2  
**Auth**: Anonymous

### Test 8.1: Select gender preference

- **Preconditions**: Filter modal open
- **Steps**:
  1. Click gender preference trigger (`#filter-gender-pref`)
  2. Select "Female Identifying Only"
  3. Click Apply
- **Assertions**:
  - URL contains `genderPreference=FEMALE_ONLY`
  - Filter chip appears

### Test 8.2: Select household gender

- **Preconditions**: Filter modal open
- **Steps**:
  1. Click household gender trigger (`#filter-household-gender`)
  2. Select "Mixed (Co-ed)"
  3. Click Apply
- **Assertions**:
  - URL contains `householdGender=MIXED`

### Test 8.3: Language multi-select with search

- **Preconditions**: Filter modal open
- **Steps**:
  1. Scroll to languages section
  2. Type "Span" in search input
  3. Click "Spanish" from filtered results
  4. Clear search, type "Fre"
  5. Click "French"
  6. Click Apply
- **Assertions**:
  - Both selected languages appear in "Selected languages" group with `aria-pressed="true"`
  - URL contains `languages=es,fr` (or equivalent codes)
  - Two filter chips appear

### Test 8.4: Deselect language

- **Preconditions**: Languages selected
- **Steps**:
  1. With Spanish and French selected
  2. Click Spanish in the "Selected languages" group (to deselect)
  3. Click Apply
- **Assertions**:
  - Only French remains
  - URL contains single language code

### Test 8.5: "No languages found" shown when search has no matches

- **Preconditions**: Filter modal open
- **Steps**:
  1. Type "zzzzzz" in language search
- **Assertions**:
  - "No languages found" text visible

### Test 8.6: "All languages selected" shown when all picked

- **Preconditions**: All languages selected (unlikely in practice but edge case)
- **Assertions**:
  - "All languages selected" text visible instead of available list

---

## Section 9: Applied Filter Chips

**File**: `filter-chips.spec.ts`  
**Priority**: P0  
**Auth**: Anonymous  
**Tags**: `@core`

### Test 9.1: Filter chips appear for each active filter

- **Preconditions**: Multiple filters in URL
- **Steps**:
  1. Navigate to `BASE_SEARCH_URL&minPrice=500&maxPrice=2000&amenities=Wifi,Parking&roomType=Private+Room`
- **Assertions**:
  - `[aria-label="Applied filters"]` region visible
  - Chip: "$500 - $2,000" (combined price range)
  - Chip: "Wifi"
  - Chip: "Parking"
  - Chip: "Private Room"
  - 4 total chips

### Test 9.2: Clicking chip X removes that filter from URL

- **Preconditions**: Amenities filter applied
- **Steps**:
  1. Navigate to `BASE_SEARCH_URL&amenities=Wifi,Parking`
  2. Click `button[aria-label="Remove filter: Wifi"]`
- **Assertions**:
  - Wifi chip disappears
  - URL updated to only contain `amenities=Parking`
  - Parking chip remains

### Test 9.3: Removing price range chip clears both min and max

- **Preconditions**: Price range filter applied
- **Steps**:
  1. Navigate to `BASE_SEARCH_URL&minPrice=500&maxPrice=2000`
  2. Click the price range chip's remove button
- **Assertions**:
  - URL no longer contains `minPrice` or `maxPrice`
  - No price chip visible

### Test 9.4: "Clear all" button removes all filter chips

- **Preconditions**: Multiple filters applied
- **Steps**:
  1. Navigate with multiple filters
  2. Click `button[aria-label="Clear all filters"]`
- **Assertions**:
  - All filter chips removed
  - URL retains only preserved params (bounds, sort, q)
  - Applied filters region disappears

### Test 9.5: Filter chips use keyboard-accessible removal

- **Preconditions**: Filter chips visible
- **Steps**:
  1. Tab to a filter chip's remove button
  2. Press Enter
- **Assertions**:
  - Filter removed (same as click)
  - Focus moves to next element
- **Tags**: `@a11y`

### Test 9.6: Impact count badge shows on filter chips

- **Preconditions**: Filter chips visible, impact count API responds
- **Steps**:
  1. Navigate with `amenities=Wifi`
  2. Wait for staggered auto-fetch (500ms + index * 200ms)
- **Assertions**:
  - Green badge with "+N" appears on chip
  - Badge has `aria-label` like "Removing this filter adds +N more results"
- **Notes**: FilterChipWithImpact auto-fetches after delay

### Test 9.7: No chips rendered when no filters active

- **Preconditions**: No filter params in URL
- **Steps**:
  1. Navigate to `BASE_SEARCH_URL` (only bounds, no filters)
- **Assertions**:
  - `[aria-label="Applied filters"]` region NOT visible (component returns null)

---

## Section 10: Filter Combinations

**File**: `filter-combinations.spec.ts`  
**Priority**: P0  
**Auth**: Anonymous  
**Tags**: `@core`

### Test 10.1: Multiple filters applied simultaneously via modal

- **Preconditions**: Filter modal open
- **Steps**:
  1. Open filter modal
  2. Toggle "Wifi" amenity
  3. Select "Private Room" for room type
  4. Select "Month-to-month" for lease duration
  5. Click Apply
- **Assertions**:
  - URL contains all three params: `amenities=Wifi`, `roomType=Private+Room`, `leaseDuration=Month-to-month`
  - Three filter chips visible
  - Results heading updated

### Test 10.2: URL contains all filter params when stacked

- **Preconditions**: None
- **Steps**:
  1. Navigate to `BASE_SEARCH_URL&minPrice=500&maxPrice=3000&amenities=Wifi,Furnished&roomType=Private+Room&houseRules=Pets+allowed&leaseDuration=6+months&genderPreference=NO_PREFERENCE`
- **Assertions**:
  - All params present in URL
  - All corresponding chips visible
  - Page renders without errors

### Test 10.3: Removing one filter preserves all others

- **Preconditions**: Multiple filters applied
- **Steps**:
  1. Navigate with price + amenities + room type
  2. Remove the amenity chip
- **Assertions**:
  - Price and room type still in URL
  - Their chips still visible
  - Only amenity chip removed

### Test 10.4: Adding filter via category bar preserves modal filters

- **Preconditions**: Modal filters applied
- **Steps**:
  1. Navigate to `BASE_SEARCH_URL&amenities=Wifi`
  2. Click "Furnished" category in CategoryBar
- **Assertions**:
  - URL contains both `amenities=Wifi,Furnished`
  - Both chips visible

### Test 10.5: Recommended filter adds to existing filters

- **Preconditions**: Some filters applied, recommended filters visible
- **Steps**:
  1. Navigate to `BASE_SEARCH_URL&roomType=Private+Room`
  2. Click a recommended filter pill (e.g., "Furnished")
- **Assertions**:
  - URL now contains both `roomType=Private+Room` and `amenities=Furnished`
  - Cursor/page params are reset

---

## Section 11: Filter Count Preview

**File**: `filter-count-preview.spec.ts`  
**Priority**: P1  
**Auth**: Anonymous

### Test 11.1: Apply button shows result count when dirty

- **Preconditions**: Filter modal open, filter changed
- **Steps**:
  1. Open filter modal
  2. Toggle an amenity (making filters dirty)
  3. Wait for debounce (300ms) + API response
- **Assertions**:
  - Apply button text changes from "Show Results" to "N listings"
  - `[data-testid="filter-modal-apply"]` contains count text

### Test 11.2: Count shows loading spinner while fetching

- **Preconditions**: Filter modal open
- **Steps**:
  1. Mock `/api/search-count` with 1s delay
  2. Toggle an amenity
- **Assertions**:
  - Apply button shows a spinning indicator
  - After response, spinner replaced with count

### Test 11.3: Count shows "100+" for large result sets

- **Preconditions**: Filter modal open
- **Steps**:
  1. Mock `/api/search-count` to return `{ count: null }`
  2. Toggle a filter
- **Assertions**:
  - Apply button shows "100+ listings"

### Test 11.4: Count shows "Select a location" when bounds required

- **Preconditions**: Search page without bounds
- **Steps**:
  1. Navigate to `/search?q=test` (no bounds)
  2. Open filter modal
  3. Toggle a filter
- **Assertions**:
  - Apply button text is "Select a location"
  - Button is disabled (`boundsRequired`)

### Test 11.5: Count request debounced (not fired on every change)

- **Preconditions**: Filter modal open
- **Steps**:
  1. Rapidly toggle 3 amenities within 200ms
  2. Track network requests to `/api/search-count`
- **Assertions**:
  - Only 1 request sent (debounce 300ms coalesces rapid changes)
  - Final request reflects all 3 amenities

---

## Section 12: Filter State Persistence

**File**: `filter-persistence.spec.ts`  
**Priority**: P1  
**Auth**: Anonymous

### Test 12.1: Filters preserved on page refresh

- **Preconditions**: Filters in URL
- **Steps**:
  1. Navigate to `BASE_SEARCH_URL&minPrice=700&amenities=Wifi&roomType=Private+Room`
  2. Reload page
- **Assertions**:
  - URL unchanged after reload
  - Price input shows "700"
  - Filter chips re-render correctly

### Test 12.2: Filters preserved on back/forward navigation

- **Preconditions**: Filters applied, navigated to listing detail
- **Steps**:
  1. Navigate to `BASE_SEARCH_URL&minPrice=800&maxPrice=2000`
  2. Click a listing card to navigate to detail page
  3. Click browser back
- **Assertions**:
  - URL returns to `BASE_SEARCH_URL&minPrice=800&maxPrice=2000`
  - Filters still active

### Test 12.3: Deep link with filter params pre-populates

- **Preconditions**: None
- **Steps**:
  1. Navigate directly to `BASE_SEARCH_URL&amenities=Wifi,Parking&roomType=Entire+Place&leaseDuration=12+months`
- **Assertions**:
  - All filter chips visible on load
  - Filter modal (when opened) shows correct state: Wifi and Parking pressed, "Entire Place" selected, "12 months" selected

### Test 12.4: Sort preserved independently from filters

- **Preconditions**: Sort + filters in URL
- **Steps**:
  1. Navigate to `BASE_SEARCH_URL&minPrice=500&sort=price_asc`
  2. Remove the price filter chip
- **Assertions**:
  - URL retains `sort=price_asc`
  - Sort param preserved by `clearAllFilters()` (in PRESERVED_PARAMS)

---

## Section 13: Filter Reset

**File**: `filter-reset.spec.ts`  
**Priority**: P0  
**Auth**: Anonymous  
**Tags**: `@core`

### Test 13.1: "Clear all" in modal resets all filters

- **Preconditions**: Filter modal open with active filters
- **Steps**:
  1. Navigate to `BASE_SEARCH_URL&minPrice=500&amenities=Wifi&roomType=Private+Room`
  2. Open filter modal
  3. Click `[data-testid="filter-modal-clear-all"]`
- **Assertions**:
  - All filter values reset in modal state
  - "Clear all" button only visible when `hasActiveFilters` is true

### Test 13.2: "Clear all filters" link from zero-results state

- **Preconditions**: Zero results from extreme filters
- **Steps**:
  1. Navigate to `BASE_SEARCH_URL&minPrice=99999&maxPrice=100000`
  2. Wait for "No matches found" or "0 places"
  3. Click "Clear all filters" link
- **Assertions**:
  - URL cleaned of filter params
  - Results refresh to unfiltered view
  - Bounds preserved

### Test 13.3: Clear all via chips bar removes everything

- **Preconditions**: Multiple filter chips visible
- **Steps**:
  1. Navigate with 3+ filters
  2. Click `button[aria-label="Clear all filters"]` in the chips bar
- **Assertions**:
  - All chips removed
  - URL retains only preserved params (q, bounds, sort)

### Test 13.4: Results refresh after reset

- **Preconditions**: Restrictive filters applied
- **Steps**:
  1. Navigate with `minPrice=99999` (zero results)
  2. Clear all filters
  3. Wait for results to load
- **Assertions**:
  - Listing cards appear
  - h1 heading shows non-zero count

---

## Section 14: Category Bar

**File**: `filter-category-bar.spec.ts`  
**Priority**: P1  
**Auth**: Anonymous

### Test 14.1: Category bar renders with buttons

- **Preconditions**: Search page loaded
- **Steps**:
  1. Navigate to `BASE_SEARCH_URL`
- **Assertions**:
  - `[aria-label="Category filters"]` navigation visible
  - At least 3 category buttons present
  - Each button has `aria-pressed` attribute

### Test 14.2: Clicking category applies filter to URL

- **Preconditions**: Category bar visible
- **Steps**:
  1. Click "Furnished" category button
- **Assertions**:
  - URL updated with `amenities=Furnished`
  - Button changes to `aria-pressed="true"` styling

### Test 14.3: Clicking active category toggles it off

- **Preconditions**: Category active
- **Steps**:
  1. Navigate to `BASE_SEARCH_URL&amenities=Furnished`
  2. Click "Furnished" category (now active)
- **Assertions**:
  - `amenities` param removed from URL
  - Button reverts to `aria-pressed="false"`

### Test 14.4: Category bar scrolls horizontally on overflow

- **Preconditions**: Narrow viewport
- **Steps**:
  1. Set viewport to 375px width
  2. Verify scroll arrows appear (if desktop) or scroll gesture works
- **Assertions**:
  - Container scrolls smoothly
  - All categories accessible via scroll
- **Tags**: `@mobile`

### Test 14.5: Keyboard navigation through categories

- **Preconditions**: Category bar visible
- **Steps**:
  1. Tab to first category button
  2. Tab through remaining buttons
- **Assertions**:
  - Each button focusable
  - Press Enter activates the focused category
- **Tags**: `@a11y`

### Test 14.6: Category resets pagination

- **Preconditions**: On page 2 of results
- **Steps**:
  1. Navigate to `BASE_SEARCH_URL&page=2`
  2. Click a category button
- **Assertions**:
  - `page` and `cursor` params removed from URL

---

## Section 15: Mobile Filter Experience

**File**: `filter-modal.spec.ts` (appended)  
**Priority**: P1  
**Auth**: Anonymous  
**Tags**: `@mobile`

### Test 15.1: Filter button visible with active count badge on mobile

- **Preconditions**: Mobile viewport (375x812)
- **Steps**:
  1. Set viewport to 375x812
  2. Navigate to `BASE_SEARCH_URL&amenities=Wifi&roomType=Private+Room`
- **Assertions**:
  - Filters button visible
  - Button shows badge/count for active filters

### Test 15.2: Full-screen drawer on mobile

- **Preconditions**: Mobile viewport
- **Steps**:
  1. Open filter modal on mobile viewport
- **Assertions**:
  - Drawer takes full width (`w-full max-w-md`)
  - Slides in from right (`animate-in slide-in-from-right`)
  - Scrollable content area visible

### Test 15.3: Scroll within drawer sections on mobile

- **Preconditions**: Filter drawer open on mobile
- **Steps**:
  1. Open filter modal
  2. Scroll through all filter sections
  3. Verify content at bottom (Gender, Household Gender)
- **Assertions**:
  - All sections reachable via scroll
  - Header and footer remain fixed
  - Content area (`overflow-y-auto`) scrolls independently

### Test 15.4: "Show results" button at bottom of mobile drawer

- **Preconditions**: Filter drawer open on mobile
- **Assertions**:
  - Apply button fixed at bottom in footer
  - Button shows count when filters dirty
  - Button enabled and clickable

---

## Section 16: Recommended Filters

**File**: `filter-recommended.spec.ts`  
**Priority**: P2  
**Auth**: Anonymous

### Test 16.1: Recommended filter pills shown

- **Preconditions**: Search page loaded, no filters applied
- **Steps**:
  1. Navigate to `BASE_SEARCH_URL`
- **Assertions**:
  - "Try:" label visible
  - Up to 5 suggestion pills visible
  - Pills include options like "Furnished", "Pet Friendly", "Wifi", etc.

### Test 16.2: Clicking suggestion applies the filter

- **Preconditions**: Recommended filters visible
- **Steps**:
  1. Click "Furnished" pill
- **Assertions**:
  - URL updated with `amenities=Furnished`
  - "Furnished" pill disappears from recommendations (already applied)
  - Filter chip for "Furnished" appears

### Test 16.3: Suggestions update after filter changes

- **Preconditions**: One filter applied
- **Steps**:
  1. Click "Wifi" recommendation
  2. Check updated recommendations
- **Assertions**:
  - "Wifi" no longer in suggestions
  - Other suggestions still present (up to MAX_PILLS=5)
  - Pagination reset (cursor/page removed)

### Test 16.4: No recommendations shown when all applied

- **Preconditions**: All suggestion filters already applied
- **Steps**:
  1. Navigate with all 10 suggestion params applied
- **Assertions**:
  - RecommendedFilters component returns null (no "Try:" section)

---

## Section 17: Filter Validation and Security

**File**: `filter-validation.spec.ts`  
**Priority**: P1  
**Auth**: Anonymous

### Test 17.1: XSS in filter params sanitized

- **Preconditions**: None
- **Steps**:
  1. Navigate to `BASE_SEARCH_URL&amenities=<script>alert('xss')</script>`
- **Assertions**:
  - No script execution
  - Invalid amenity silently ignored (not in VALID_AMENITIES allowlist)
  - No filter chip for the XSS payload
  - Page renders safely

### Test 17.2: Invalid enum values ignored

- **Preconditions**: None
- **Steps**:
  1. Navigate to `BASE_SEARCH_URL&roomType=InvalidType&genderPreference=WRONG&householdGender=BAD`
- **Assertions**:
  - All invalid values silently dropped
  - No filter chips for invalid values
  - No errors in console or UI

### Test 17.3: Negative price handled

- **Preconditions**: None
- **Steps**:
  1. Navigate to `BASE_SEARCH_URL&minPrice=-100`
- **Assertions**:
  - Price clamped to 0 (server-side: `Math.max(0, ...)`)
  - Or silently ignored
  - No errors

### Test 17.4: Zero price handled

- **Preconditions**: None
- **Steps**:
  1. Navigate to `BASE_SEARCH_URL&minPrice=0&maxPrice=0`
- **Assertions**:
  - Both values accepted (valid range)
  - Results show zero-price listings or empty state

### Test 17.5: Extremely large price clamped

- **Preconditions**: None
- **Steps**:
  1. Navigate to `BASE_SEARCH_URL&maxPrice=999999999`
- **Assertions**:
  - Price clamped to MAX_SAFE_PRICE
  - No crash or error

### Test 17.6: Duplicate amenity values deduplicated

- **Preconditions**: None
- **Steps**:
  1. Navigate to `BASE_SEARCH_URL&amenities=Wifi,Wifi,Wifi`
- **Assertions**:
  - Only one "Wifi" chip appears
  - Server deduplicates via Set

### Test 17.7: Case-insensitive filter values normalized

- **Preconditions**: None
- **Steps**:
  1. Navigate to `BASE_SEARCH_URL&amenities=wifi,PARKING&roomType=private+room`
- **Assertions**:
  - Filters recognized (case-insensitive matching via allowMap)
  - Chips show canonical forms: "Wifi", "Parking", "Private Room"

### Test 17.8: Max array items enforced

- **Preconditions**: None
- **Steps**:
  1. Navigate with 50 amenity values (exceeding MAX_ARRAY_ITEMS)
- **Assertions**:
  - Only first MAX_ARRAY_ITEMS values kept
  - No crash or excessive memory usage

---

## Accessibility Test Coverage

Distributed across sections with `@a11y` tag:

| Test | Aspect |
|---|---|
| 1.1 | Dialog has `aria-labelledby`, `role="dialog"`, `aria-modal="true"` |
| 1.2 | Focus returns to trigger on close |
| 1.3 | Escape key closes modal |
| 4.1-4.3 | `aria-pressed` toggles correctly on filter buttons |
| 5.1 | Select dropdowns have `id` matching `for` labels |
| 8.3 | Language groups have `aria-label`, `role="group"` |
| 9.5 | Chips removable via keyboard (Enter/Space) |
| 14.5 | Category bar keyboard navigable |
| All Sections | All filter buttons have descriptive `aria-label` |

---

## Risks and Blockers

| Risk | Severity | Mitigation |
|---|---|---|
| **Radix Select dropdown timing** | Medium | Use `page.getByRole("option")` with `waitFor`, not raw CSS selectors |
| **Radix Slider drag simulation** | High | Use keyboard (ArrowRight/ArrowLeft) instead of mouse drag for reliability |
| **Portal-based modal** | Medium | Filter modal uses `createPortal(document.body)` -- always scope to `[role="dialog"]` |
| **Debounced navigation** | Medium | After Apply, wait for URL update with `page.waitForURL(/param/i, { timeout: 10000 })` |
| **Facet API latency** | Low | Mock `/api/search/facets` for deterministic counts, or wait with generous timeout |
| **Stale closure in useBatchedFilters** | Low | Verify filter state reflects latest changes after rapid toggling |
| **Dynamic import of FilterModal** | Medium | Modal loaded via `next/dynamic` -- may need extra wait after button click |
| **Comma-separated array params** | Medium | Some components use `amenities=Wifi,Parking` (single param), others use `amenities=Wifi&amenities=Parking` (repeated). Tests should handle both. |
| **Network conditions** | Low | Use `network.mockApiResponse` for flaky API tests; live server for happy paths |

---

## Existing Test Gap Analysis

| Area | Existing Coverage | Gap |
|---|---|---|
| Modal open/close | `search-p0-filters-mobile.spec.ts` (mobile only) | Desktop open/close, Escape key, backdrop click |
| Price filter | `02-search-critical-journeys.spec.ts` J2 (URL only) | Slider interaction, histogram, price swap |
| Amenities | `02-search-critical-journeys.spec.ts` J4 (Wifi only) | Multi-select, deselect, facet counts, zero-count |
| House Rules | `02-search-critical-journeys.spec.ts` J12 (Pets only) | Multi-select, deselect |
| Lease Duration | `02-search-critical-journeys.spec.ts` J11 | Alias resolution, split-stay |
| Gender | `02-search-critical-journeys.spec.ts` J13 | All options, household gender |
| Languages | None | Full coverage needed |
| Filter Chips | `terminal3-filters-nav.spec.ts` (basic) | Impact count, keyboard removal, combined price chip |
| Combinations | None | Full coverage needed |
| Count Preview | None | Full coverage needed |
| Category Bar | `terminal3-filters-nav.spec.ts` (basic) | Toggle off, scroll, keyboard |
| Recommended | `terminal3-filters-nav.spec.ts` (smoke only) | Click-apply, update after change |
| Validation/XSS | None | Full coverage needed |
| Mobile drawer | `search-p0-filters-mobile.spec.ts` | Scroll sections, badge count |

---

## Implementation Priority

**Phase 1 (P0 -- implement first)**:
- `filter-modal.spec.ts` (1.1-1.7)
- `filter-chips.spec.ts` (9.1-9.7)
- `filter-combinations.spec.ts` (10.1-10.5)
- `filter-reset.spec.ts` (13.1-13.4)

**Phase 2 (P0/P1 -- core filters)**:
- `filter-price.spec.ts` (2.1-2.7)
- `filter-room-type.spec.ts` (3.1-3.5)
- `filter-amenities.spec.ts` (4.1-4.6)

**Phase 3 (P1 -- secondary filters)**:
- `filter-lease-duration.spec.ts` (5.1-5.3)
- `filter-house-rules.spec.ts` (6.1-6.4)
- `filter-date.spec.ts` (7.1-7.4)
- `filter-count-preview.spec.ts` (11.1-11.5)
- `filter-persistence.spec.ts` (12.1-12.4)
- `filter-category-bar.spec.ts` (14.1-14.6)
- `filter-validation.spec.ts` (17.1-17.8)

**Phase 4 (P2 -- polish)**:
- `filter-gender-language.spec.ts` (8.1-8.6)
- `filter-recommended.spec.ts` (16.1-16.4)
- Mobile-specific tests (15.1-15.4)

---

## Test Helper Extensions Needed

```typescript
// Extend navigation helpers
async goToSearchWithFilters(filters: {
  bounds?: typeof SF_BOUNDS;
  minPrice?: number;
  maxPrice?: number;
  amenities?: string[];
  houseRules?: string[];
  roomType?: string;
  leaseDuration?: string;
  moveInDate?: string;
  genderPreference?: string;
  householdGender?: string;
  languages?: string[];
}) {
  const params = new URLSearchParams();
  if (filters.bounds) {
    params.set('minLat', filters.bounds.minLat.toString());
    // ... etc
  }
  if (filters.amenities?.length) params.set('amenities', filters.amenities.join(','));
  // ... build full URL
  await page.goto(`/search?${params.toString()}`);
}

// Filter modal helper
async openFilterModal() {
  const btn = page.getByRole('button', { name: 'Filters', exact: true });
  await expect(btn).toBeVisible({ timeout: 10000 });
  await btn.click();
  const modal = page.getByRole('dialog', { name: /filters/i });
  await expect(modal).toBeVisible({ timeout: 5000 });
  return modal;
}

async applyFilters() {
  const apply = page.locator('[data-testid="filter-modal-apply"]');
  await apply.click();
  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 });
}
```

---

## Total Test Count

| Section | Tests |
|---|---|
| 1. Filter Modal | 7 |
| 2. Price Range | 7 |
| 3. Room Type | 5 |
| 4. Amenities | 6 |
| 5. Lease Duration | 3 |
| 6. House Rules | 4 |
| 7. Move-In Date | 4 |
| 8. Gender/Language | 6 |
| 9. Applied Chips | 7 |
| 10. Combinations | 5 |
| 11. Count Preview | 5 |
| 12. Persistence | 4 |
| 13. Reset | 4 |
| 14. Category Bar | 6 |
| 15. Mobile | 4 |
| 16. Recommended | 4 |
| 17. Validation | 8 |
| **Total** | **87** |
