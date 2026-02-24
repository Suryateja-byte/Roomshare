"""Flows 2-7: Test date, price, amenities, combined filters, pagination, sort."""
from playwright.sync_api import sync_playwright
import os, sys
from datetime import datetime, timedelta

SCREENSHOTS_DIR = "/tmp/roomshare-tests"
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

issues = []
passes = []

def log_pass(msg):
    passes.append(msg)
    print(f"  PASS: {msg}")

def log_issue(msg):
    issues.append(msg)
    print(f"  ISSUE: {msg}")

def safe_goto(page, url, timeout=45000):
    """Navigate with fallback if networkidle times out."""
    try:
        page.goto(url, wait_until="networkidle", timeout=timeout)
    except Exception:
        page.goto(url, wait_until="domcontentloaded", timeout=timeout)
    page.wait_for_timeout(3000)

# Calculate dates
today = datetime.now()
next_month = today + timedelta(days=30)
next_month_str = next_month.strftime("%Y-%m-%d")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900})

    console_errors = []
    page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

    # ================================================================
    # FLOW 2: SEARCH BY DATE RANGE
    # ================================================================
    print("\n" + "=" * 60)
    print("FLOW 2: Search by Date Range")
    print("=" * 60)

    # Test 2.1: Move-in date via URL parameter
    print("\n--- Test 2.1: Move-in date via URL param ---")
    safe_goto(page, f"http://localhost:3000/search?moveInDate={next_month_str}")
    url = page.url
    if "moveInDate" in url:
        log_pass(f"Move-in date URL param works: moveInDate={next_month_str}")
    else:
        log_issue("Move-in date not preserved in URL")

    # Test 2.2: Open filter modal, interact with move-in date
    print("\n--- Test 2.2: Move-in date in filter modal ---")
    safe_goto(page, "http://localhost:3000/search")

    filters_btn = page.locator("button:has-text('Filters')").first
    filters_btn.click()
    page.wait_for_timeout(1500)

    # The date picker is a button "Select move-in date"
    date_btn = page.locator("button:has-text('Select move-in date'), button:has-text('move-in date')").first
    if date_btn.is_visible():
        date_btn.click()
        page.wait_for_timeout(1000)
        page.screenshot(path=f"{SCREENSHOTS_DIR}/flow2_date_picker.png", full_page=False)

        # Check if a date picker/calendar appeared
        calendar = page.locator("[role='dialog'] input[type='date'], [class*='calendar'], [class*='Calendar'], [class*='datepicker'], [class*='DatePicker'], [role='grid']").all()
        print(f"  Calendar/date elements found: {len(calendar)}")

        # Try to find the date input that appeared
        date_input = page.locator("input[type='date']").first
        if date_input.is_visible():
            date_input.fill(next_month_str)
            page.wait_for_timeout(500)
            log_pass(f"Date input found and filled with {next_month_str}")
        else:
            # Maybe it's a native date picker button - check what appeared
            print("  No date input appeared after clicking button")
            # Take screenshot to see state
            page.screenshot(path=f"{SCREENSHOTS_DIR}/flow2_no_date_input.png", full_page=False)
            log_issue("Date input not visible after clicking 'Select move-in date'")
    else:
        log_issue("'Select move-in date' button not found")

    # Try applying filters regardless
    apply_btn = page.locator("[data-testid='filter-modal-apply']").first
    if apply_btn.is_visible():
        apply_btn.click()
        page.wait_for_timeout(3000)

    # Test 2.3: Past date rejection
    print("\n--- Test 2.3: Past date rejection ---")
    past_date = (today - timedelta(days=30)).strftime("%Y-%m-%d")
    safe_goto(page, f"http://localhost:3000/search?moveInDate={past_date}")
    url = page.url
    if "moveInDate" not in url:
        log_pass("Past date correctly rejected from URL")
    else:
        log_issue(f"Past date not rejected: {url}")

    # ================================================================
    # FLOW 3: SEARCH BY PRICE FILTER
    # ================================================================
    print("\n" + "=" * 60)
    print("FLOW 3: Search by Price Filter")
    print("=" * 60)

    # Test 3.1: Min price via search form
    print("\n--- Test 3.1: Min price filter ---")
    safe_goto(page, "http://localhost:3000/search")

    min_input = page.locator("input[placeholder='Min']")
    min_input.fill("500")
    page.locator("button[aria-label='Search listings']").click()
    page.wait_for_timeout(4000)

    url = page.url
    if "minPrice=500" in url:
        log_pass("Min price applied to URL")
    else:
        log_issue(f"Min price not in URL: {url}")

    # Test 3.2: Max price
    print("\n--- Test 3.2: Max price filter ---")
    safe_goto(page, "http://localhost:3000/search")

    max_input = page.locator("input[placeholder='Max']")
    max_input.fill("1000")
    page.locator("button[aria-label='Search listings']").click()
    page.wait_for_timeout(4000)

    url = page.url
    if "maxPrice=1000" in url:
        log_pass("Max price applied to URL")
    else:
        log_issue(f"Max price not in URL: {url}")

    # Test 3.3: Price range
    print("\n--- Test 3.3: Price range ---")
    safe_goto(page, "http://localhost:3000/search")

    min_input = page.locator("input[placeholder='Min']")
    max_input = page.locator("input[placeholder='Max']")
    min_input.fill("800")
    max_input.fill("1500")
    page.locator("button[aria-label='Search listings']").click()
    page.wait_for_timeout(4000)

    url = page.url
    if "minPrice=800" in url and "maxPrice=1500" in url:
        log_pass("Price range applied to URL")
    else:
        log_issue(f"Price range not in URL: {url}")

    # Test 3.4: Verify prices in results match filter
    print("\n--- Test 3.4: Verify result prices match filter ---")
    safe_goto(page, "http://localhost:3000/search?minPrice=800&maxPrice=1500")

    prices = page.locator("[data-testid='listing-price']").all()
    price_violations = []
    for price_el in prices[:10]:
        text = price_el.text_content().strip()
        # Extract number from "$1,200/mo" format
        num_str = text.replace("$", "").replace(",", "").split("/")[0]
        try:
            price_num = int(num_str)
            if price_num < 800 or price_num > 1500:
                price_violations.append(f"{text} (${price_num})")
        except ValueError:
            pass

    if not price_violations:
        log_pass(f"All {len(prices)} prices within $800-$1500 range")
    else:
        log_issue(f"Price violations found: {price_violations}")

    page.screenshot(path=f"{SCREENSHOTS_DIR}/flow3_price_range_results.png", full_page=False)

    # Test 3.5: Direct URL with price preserves in inputs
    print("\n--- Test 3.5: URL params populate price inputs ---")
    safe_goto(page, "http://localhost:3000/search?minPrice=600&maxPrice=1200")

    min_val = page.locator("input[placeholder='Min']").input_value()
    max_val = page.locator("input[placeholder='Max']").input_value()
    if min_val == "600" and max_val == "1200":
        log_pass("Price inputs correctly populated from URL params")
    else:
        log_issue(f"Price inputs mismatch: min='{min_val}', max='{max_val}'")

    # Test 3.6: Inverted price auto-swap
    print("\n--- Test 3.6: Inverted price auto-swap ---")
    safe_goto(page, "http://localhost:3000/search")

    min_input = page.locator("input[placeholder='Min']")
    max_input = page.locator("input[placeholder='Max']")
    min_input.fill("2000")
    max_input.fill("500")
    page.locator("button[aria-label='Search listings']").click()
    page.wait_for_timeout(4000)

    url = page.url
    if "minPrice=500" in url and "maxPrice=2000" in url:
        log_pass("Inverted prices auto-swapped correctly")
    else:
        log_issue(f"Inverted prices: {url}")

    # Test 3.7: Price slider in modal
    print("\n--- Test 3.7: Price sliders in modal ---")
    safe_goto(page, "http://localhost:3000/search")
    page.locator("button:has-text('Filters')").first.click()
    page.wait_for_timeout(1500)

    min_slider = page.locator("[role='slider'][aria-label='Minimum price']")
    max_slider = page.locator("[role='slider'][aria-label='Maximum price']")

    if min_slider.is_visible() and max_slider.is_visible():
        log_pass("Price sliders found in modal")
        # Try dragging min slider
        min_box = min_slider.bounding_box()
        if min_box:
            page.mouse.move(min_box["x"] + min_box["width"] / 2, min_box["y"] + min_box["height"] / 2)
            page.mouse.down()
            page.mouse.move(min_box["x"] + 100, min_box["y"] + min_box["height"] / 2)
            page.mouse.up()
            page.wait_for_timeout(500)
            log_pass("Price slider dragged successfully")
    else:
        log_issue("Price sliders not visible in modal")

    # Close modal
    close_btn = page.locator("button[aria-label='Close'], button:has-text('×')").first
    if close_btn.is_visible():
        close_btn.click()
    else:
        page.keyboard.press("Escape")
    page.wait_for_timeout(500)

    # ================================================================
    # FLOW 4: SEARCH BY AMENITIES
    # ================================================================
    print("\n" + "=" * 60)
    print("FLOW 4: Search by Amenities")
    print("=" * 60)

    # Test 4.1: Select amenity via filter modal
    print("\n--- Test 4.1: Select amenity (Wifi) via filter modal ---")
    safe_goto(page, "http://localhost:3000/search")

    page.locator("button:has-text('Filters')").first.click()
    page.wait_for_timeout(1500)

    wifi_btn = page.locator("aside button:has-text('Wifi'), [role='dialog'] button:has-text('Wifi')").first
    if wifi_btn.is_visible():
        wifi_btn.click()
        page.wait_for_timeout(500)
        log_pass("Wifi amenity button clicked")

        # Apply
        page.locator("[data-testid='filter-modal-apply']").click()
        page.wait_for_timeout(4000)

        url = page.url
        if "amenities=Wifi" in url or "amenities=wifi" in url.lower():
            log_pass(f"Wifi amenity in URL: {url}")
        else:
            log_issue(f"Wifi amenity not in URL: {url}")
    else:
        log_issue("Wifi button not found in filter modal")

    page.screenshot(path=f"{SCREENSHOTS_DIR}/flow4_wifi.png", full_page=False)

    # Test 4.2: Select multiple amenities
    print("\n--- Test 4.2: Multiple amenities ---")
    safe_goto(page, "http://localhost:3000/search")

    page.locator("button:has-text('Filters')").first.click()
    page.wait_for_timeout(1500)

    for amenity in ["Wifi", "AC", "Parking"]:
        btn = page.locator(f"aside button:has-text('{amenity}'), [role='dialog'] button:has-text('{amenity}')").first
        if btn.is_visible():
            btn.click()
            page.wait_for_timeout(300)
            print(f"    Clicked: {amenity}")

    page.locator("[data-testid='filter-modal-apply']").click()
    page.wait_for_timeout(4000)

    url = page.url
    amenity_count = sum(1 for a in ["Wifi", "AC", "Parking"] if a in url)
    if amenity_count == 3:
        log_pass(f"All 3 amenities in URL")
    else:
        log_issue(f"Only {amenity_count}/3 amenities in URL: {url}")

    # Test 4.3: URL param with amenities
    print("\n--- Test 4.3: Amenities via URL params ---")
    safe_goto(page, "http://localhost:3000/search?amenities=Wifi&amenities=Kitchen")

    url = page.url
    cards = page.locator("[data-testid='listing-card']").all()
    if "amenities=Wifi" in url and "amenities=Kitchen" in url:
        log_pass(f"Amenity URL params work, {len(cards)} results")
    else:
        log_issue(f"Amenity URL params not preserved: {url}")

    # Test 4.4: Select house rule
    print("\n--- Test 4.4: House rules filter ---")
    safe_goto(page, "http://localhost:3000/search")
    page.locator("button:has-text('Filters')").first.click()
    page.wait_for_timeout(1500)

    pets_btn = page.locator("aside button:has-text('Pets allowed'), [role='dialog'] button:has-text('Pets allowed')").first
    if pets_btn.is_visible():
        pets_btn.click()
        page.wait_for_timeout(300)
        page.locator("[data-testid='filter-modal-apply']").click()
        page.wait_for_timeout(4000)

        url = page.url
        if "houseRules" in url and "Pets" in url:
            log_pass("House rule (Pets allowed) in URL")
        else:
            log_issue(f"House rule not in URL: {url}")
    else:
        log_issue("Pets allowed button not found")

    # ================================================================
    # FLOW 5: COMBINED FILTERS
    # ================================================================
    print("\n" + "=" * 60)
    print("FLOW 5: Combined Filters")
    print("=" * 60)

    # Test 5.1: Price + Room Type
    print("\n--- Test 5.1: Price + Room Type ---")
    safe_goto(page, "http://localhost:3000/search")

    # Set price
    page.locator("input[placeholder='Min']").fill("500")
    page.locator("input[placeholder='Max']").fill("1500")

    # Set room type (click Private tab)
    private_btn = page.locator("button[aria-label='Filter by Private room']")
    if private_btn.is_visible():
        private_btn.click()
        page.wait_for_timeout(4000)

        url = page.url
        if "roomType" in url:
            log_pass("Room type filter applied via tab")
        else:
            log_issue(f"Room type not in URL after tab click: {url}")

    # Now submit with price too
    page.locator("button[aria-label='Search listings']").click()
    page.wait_for_timeout(4000)

    url = page.url
    combined = ("minPrice" in url or "maxPrice" in url) and "roomType" in url
    if combined:
        log_pass(f"Combined filters (price + room type) in URL")
    else:
        log_issue(f"Combined filters incomplete: {url}")

    page.screenshot(path=f"{SCREENSHOTS_DIR}/flow5_combined.png", full_page=False)

    # Test 5.2: Multiple filters via URL
    print("\n--- Test 5.2: Multiple filters via URL ---")
    safe_goto(page, "http://localhost:3000/search?minPrice=500&maxPrice=1500&roomType=Private+Room&amenities=Wifi")

    cards = page.locator("[data-testid='listing-card']").all()
    url = page.url
    if "minPrice" in url and "roomType" in url and "amenities" in url:
        log_pass(f"Multi-filter URL works, {len(cards)} results")
    else:
        log_issue(f"Multi-filter URL not preserved: {url}")

    # Test 5.3: Clear all filters
    print("\n--- Test 5.3: Clear all filters ---")
    safe_goto(page, "http://localhost:3000/search?minPrice=500&maxPrice=1500&roomType=Private+Room&amenities=Wifi")

    page.locator("button:has-text('Filters')").first.click()
    page.wait_for_timeout(1500)

    clear_btn = page.locator("[data-testid='filter-modal-clear-all'], button:has-text('Clear all'), button:has-text('Reset')").first
    if clear_btn.is_visible():
        clear_btn.click()
        page.wait_for_timeout(4000)
        url = page.url
        if url.rstrip("/") == "http://localhost:3000/search" or ("minPrice" not in url and "roomType" not in url):
            log_pass("Clear all filters works")
        else:
            log_issue(f"Filters not cleared: {url}")
    else:
        log_issue("Clear all button not found in modal")
        # Check outside modal too
        page.keyboard.press("Escape")
        page.wait_for_timeout(500)

    # ================================================================
    # FLOW 6: PAGINATION / INFINITE SCROLL
    # ================================================================
    print("\n" + "=" * 60)
    print("FLOW 6: Pagination / Infinite Scroll")
    print("=" * 60)

    # Test 6.1: Initial results count
    print("\n--- Test 6.1: Initial results ---")
    safe_goto(page, "http://localhost:3000/search")

    initial_cards = page.locator("[data-testid='listing-card']").all()
    print(f"  Initial cards: {len(initial_cards)}")
    if len(initial_cards) > 0:
        log_pass(f"Initial load shows {len(initial_cards)} cards")
    else:
        log_issue("No initial cards loaded")

    # Test 6.2: Look for "Load more" button
    print("\n--- Test 6.2: Load more / pagination ---")
    load_more = page.locator("button:has-text('Load more'), button:has-text('Show more'), button:has-text('Next'), [data-testid='load-more']").first
    if load_more.is_visible():
        log_pass("Load more button found")
        load_more.click()
        page.wait_for_timeout(3000)

        after_cards = page.locator("[data-testid='listing-card']").all()
        if len(after_cards) > len(initial_cards):
            log_pass(f"Load more works: {len(initial_cards)} → {len(after_cards)} cards")
        else:
            log_issue(f"Load more didn't add cards: still {len(after_cards)}")
    else:
        # Check for infinite scroll
        print("  No load more button, checking if all results fit on one page...")
        # Scroll down to trigger infinite scroll
        page.locator("[data-testid='search-results-container']").first.evaluate(
            "el => el.scrollTop = el.scrollHeight"
        )
        page.wait_for_timeout(2000)

        after_scroll_cards = page.locator("[data-testid='listing-card']").all()
        if len(after_scroll_cards) > len(initial_cards):
            log_pass(f"Infinite scroll works: {len(initial_cards)} → {len(after_scroll_cards)} cards")
        else:
            print(f"  Same number of cards after scroll: {len(after_scroll_cards)}")
            # Might be that all results fit on one page - check for empty state
            results_container = page.locator("[data-testid='search-results-container']")
            container_text = results_container.text_content() if results_container.is_visible() else ""
            if "no more" in container_text.lower() or len(initial_cards) < 20:
                log_pass(f"All {len(initial_cards)} results fit on one page (no pagination needed)")
            else:
                log_issue("Neither load more button nor infinite scroll working")

    page.screenshot(path=f"{SCREENSHOTS_DIR}/flow6_pagination.png", full_page=False)

    # ================================================================
    # FLOW 7: SORT RESULTS
    # ================================================================
    print("\n" + "=" * 60)
    print("FLOW 7: Sort Results")
    print("=" * 60)

    # Test 7.1: Find sort control
    print("\n--- Test 7.1: Find sort control ---")
    safe_goto(page, "http://localhost:3000/search")

    # Look for sort select/dropdown
    sort_select = page.locator("select[name*='sort'], [data-testid*='sort'], [aria-label*='sort'], [aria-label*='Sort']").first
    sort_button = page.locator("button:has-text('Sort'), button:has-text('Recommended'), button:has-text('Newest'), [class*='SortSelect']").first

    if sort_select.is_visible():
        log_pass("Sort select found")
        # Get options
        options = sort_select.locator("option").all()
        for opt in options:
            print(f"    option: '{opt.text_content().strip()}'")
    elif sort_button.is_visible():
        log_pass("Sort button found")
        sort_button.click()
        page.wait_for_timeout(500)
    else:
        # Check for sort-related elements more broadly
        sort_els = page.locator("[class*='sort'], [class*='Sort']").all()
        print(f"  Sort-related elements: {len(sort_els)}")
        for el in sort_els[:5]:
            text = el.text_content().strip()[:60] if el.text_content() else ""
            tag = el.evaluate("e => e.tagName")
            visible = el.is_visible()
            print(f"    tag={tag} visible={visible} text='{text}'")

    # Test 7.2: Sort by price ascending via URL
    print("\n--- Test 7.2: Sort by price_asc via URL ---")
    safe_goto(page, "http://localhost:3000/search?sort=price_asc")

    url = page.url
    if "sort=price_asc" in url:
        log_pass("Sort by price_asc URL param works")

        # Check that prices are in ascending order
        prices = page.locator("[data-testid='listing-price']").all()
        price_values = []
        for price_el in prices[:10]:
            text = price_el.text_content().strip()
            num_str = text.replace("$", "").replace(",", "").split("/")[0]
            try:
                price_values.append(int(num_str))
            except ValueError:
                pass

        if price_values and price_values == sorted(price_values):
            log_pass(f"Prices in ascending order: {price_values[:5]}...")
        elif price_values:
            log_issue(f"Prices NOT in ascending order: {price_values[:5]}...")
        else:
            log_issue("Could not parse any prices")
    else:
        log_issue(f"Sort param not preserved: {url}")

    page.screenshot(path=f"{SCREENSHOTS_DIR}/flow7_sort_price_asc.png", full_page=False)

    # Test 7.3: Sort by price descending
    print("\n--- Test 7.3: Sort by price_desc via URL ---")
    safe_goto(page, "http://localhost:3000/search?sort=price_desc")

    prices = page.locator("[data-testid='listing-price']").all()
    price_values = []
    for price_el in prices[:10]:
        text = price_el.text_content().strip()
        num_str = text.replace("$", "").replace(",", "").split("/")[0]
        try:
            price_values.append(int(num_str))
        except ValueError:
            pass

    if price_values and price_values == sorted(price_values, reverse=True):
        log_pass(f"Prices in descending order: {price_values[:5]}...")
    elif price_values:
        log_issue(f"Prices NOT in descending order: {price_values[:5]}...")
    else:
        log_issue("Could not parse any prices for desc sort")

    # Test 7.4: Sort by newest
    print("\n--- Test 7.4: Sort by newest via URL ---")
    safe_goto(page, "http://localhost:3000/search?sort=newest")

    url = page.url
    cards = page.locator("[data-testid='listing-card']").all()
    if "sort=newest" in url and len(cards) > 0:
        log_pass(f"Sort by newest works, {len(cards)} results")
    else:
        log_issue(f"Sort by newest issue: url={url}, cards={len(cards)}")

    # ================================================================
    # Console errors check
    # ================================================================
    print("\n=== Console Errors ===")
    real_errors = [e for e in console_errors if "photon.komoot" not in e.lower() and "Failed to fetch" not in e]
    if real_errors:
        for err in real_errors[:10]:
            log_issue(f"Console error: {err[:200]}")
    else:
        log_pass("No unexpected console errors (excluding known API timeouts)")

    # ================================================================
    # SUMMARY
    # ================================================================
    print("\n" + "=" * 60)
    print("FLOWS 2-7 COMBINED SUMMARY")
    print("=" * 60)
    print(f"PASSES: {len(passes)}")
    for p_msg in passes:
        print(f"  ✅ {p_msg}")
    print(f"ISSUES: {len(issues)}")
    for i_msg in issues:
        print(f"  ❌ {i_msg}")

    browser.close()

    if issues:
        print(f"\nFLOWS 2-7: {len(issues)} ISSUES FOUND")
        sys.exit(1)
    else:
        print("\nFLOWS 2-7: ALL PASSED")
        sys.exit(0)
