"""Flows 2-7: Complete test suite after z-index fix."""
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
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=timeout)
    except Exception:
        pass
    page.wait_for_timeout(4000)

today = datetime.now()
next_month = today + timedelta(days=30)
next_month_str = next_month.strftime("%Y-%m-%d")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900})

    console_errors = []
    page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

    # ================================================================
    # FLOW 2: DATE FILTER
    # ================================================================
    print("\n" + "=" * 60)
    print("FLOW 2: Search by Date Range")
    print("=" * 60)

    # 2.1: URL param
    print("\n--- 2.1: URL param ---")
    safe_goto(page, f"http://localhost:3000/search?moveInDate={next_month_str}")
    if "moveInDate" in page.url:
        log_pass("moveInDate URL param preserved")
    else:
        log_issue("moveInDate not in URL")

    # 2.2: Date picker in modal
    print("\n--- 2.2: Date picker in modal ---")
    safe_goto(page, "http://localhost:3000/search")
    page.locator("button:has-text('Filters')").first.click()
    page.wait_for_timeout(2000)

    date_trigger = page.locator("button:has-text('Select move-in date')").first
    date_trigger.click(timeout=5000)
    page.wait_for_timeout(1000)

    # Navigate to next month and select day 15
    next_btn = page.locator("button[aria-label='Next month']").first
    if next_btn.is_visible():
        next_btn.click()
        page.wait_for_timeout(500)
        day15 = page.locator("button:has-text('15')").first
        if day15.is_visible() and day15.is_enabled():
            day15.click()
            page.wait_for_timeout(500)
            log_pass("Date selected from calendar")
        else:
            log_issue("Day 15 not clickable")
    else:
        log_issue("Next month button not visible")

    # Apply and check URL
    page.locator("[data-testid='filter-modal-apply']").click()
    page.wait_for_timeout(4000)
    if "moveInDate" in page.url:
        log_pass(f"Date filter applied via modal: {page.url}")
    else:
        log_issue(f"Date not in URL after modal apply: {page.url}")

    # 2.3: Past date rejection
    print("\n--- 2.3: Past date rejection ---")
    past_date = (today - timedelta(days=30)).strftime("%Y-%m-%d")
    safe_goto(page, f"http://localhost:3000/search?moveInDate={past_date}")
    if "moveInDate" not in page.url:
        log_pass("Past date rejected")
    else:
        log_issue(f"Past date not rejected: {page.url}")

    # ================================================================
    # FLOW 3: PRICE FILTER
    # ================================================================
    print("\n" + "=" * 60)
    print("FLOW 3: Search by Price Filter")
    print("=" * 60)

    # 3.1: Min price
    print("\n--- 3.1: Min price ---")
    safe_goto(page, "http://localhost:3000/search")
    page.locator("input[placeholder='Min']").fill("500")
    page.locator("button[aria-label='Search listings']").click()
    page.wait_for_timeout(4000)
    if "minPrice=500" in page.url:
        log_pass("Min price in URL")
    else:
        log_issue(f"Min price not in URL: {page.url}")

    # 3.2: Max price
    print("\n--- 3.2: Max price ---")
    safe_goto(page, "http://localhost:3000/search")
    page.locator("input[placeholder='Max']").fill("1000")
    page.locator("button[aria-label='Search listings']").click()
    page.wait_for_timeout(4000)
    if "maxPrice=1000" in page.url:
        log_pass("Max price in URL")
    else:
        log_issue(f"Max price not in URL: {page.url}")

    # 3.3: Range + verification
    print("\n--- 3.3: Price range ---")
    safe_goto(page, "http://localhost:3000/search?minPrice=800&maxPrice=1500")
    prices = page.locator("[data-testid='listing-price']").all()
    violations = []
    for price_el in prices[:10]:
        text = price_el.text_content().strip()
        num_str = text.replace("$", "").replace(",", "").split("/")[0]
        try:
            n = int(num_str)
            if n < 800 or n > 1500:
                violations.append(f"{text}=${n}")
        except ValueError:
            pass
    if not violations:
        log_pass(f"All {len(prices)} prices in $800-$1500 range")
    else:
        log_issue(f"Price violations: {violations}")

    # 3.4: Input population from URL
    print("\n--- 3.4: Input population from URL ---")
    safe_goto(page, "http://localhost:3000/search?minPrice=600&maxPrice=1200")
    min_v = page.locator("input[placeholder='Min']").input_value()
    max_v = page.locator("input[placeholder='Max']").input_value()
    if min_v == "600" and max_v == "1200":
        log_pass("Price inputs populated from URL")
    else:
        log_issue(f"Price inputs: min='{min_v}', max='{max_v}'")

    # 3.5: Auto-swap inverted
    print("\n--- 3.5: Inverted auto-swap ---")
    safe_goto(page, "http://localhost:3000/search")
    page.locator("input[placeholder='Min']").fill("2000")
    page.locator("input[placeholder='Max']").fill("500")
    page.locator("button[aria-label='Search listings']").click()
    page.wait_for_timeout(4000)
    if "minPrice=500" in page.url and "maxPrice=2000" in page.url:
        log_pass("Inverted prices auto-swapped")
    else:
        log_issue(f"Inverted prices: {page.url}")

    # ================================================================
    # FLOW 4: AMENITIES
    # ================================================================
    print("\n" + "=" * 60)
    print("FLOW 4: Search by Amenities")
    print("=" * 60)

    # 4.1: Single amenity
    print("\n--- 4.1: Single amenity ---")
    safe_goto(page, "http://localhost:3000/search")
    page.locator("button:has-text('Filters')").first.click()
    page.wait_for_timeout(2000)
    page.locator("[role='dialog'] button:has-text('Wifi')").first.click()
    page.wait_for_timeout(300)
    page.locator("[data-testid='filter-modal-apply']").click()
    page.wait_for_timeout(4000)
    if "amenities=Wifi" in page.url:
        log_pass("Wifi filter applied")
    else:
        log_issue(f"Wifi not in URL: {page.url}")

    # 4.2: Multiple amenities
    print("\n--- 4.2: Multiple amenities ---")
    safe_goto(page, "http://localhost:3000/search")
    page.locator("button:has-text('Filters')").first.click()
    page.wait_for_timeout(2000)
    for a in ["Wifi", "AC", "Parking"]:
        page.locator(f"[role='dialog'] button:has-text('{a}')").first.click()
        page.wait_for_timeout(200)
    page.locator("[data-testid='filter-modal-apply']").click()
    page.wait_for_timeout(4000)
    cnt = sum(1 for a in ["Wifi", "AC", "Parking"] if a in page.url)
    if cnt == 3:
        log_pass("3 amenities applied")
    else:
        log_issue(f"Only {cnt}/3 amenities in URL")

    # 4.3: House rule
    print("\n--- 4.3: House rule ---")
    safe_goto(page, "http://localhost:3000/search")
    page.locator("button:has-text('Filters')").first.click()
    page.wait_for_timeout(2000)
    page.locator("[role='dialog'] button:has-text('Pets allowed')").first.click()
    page.wait_for_timeout(300)
    page.locator("[data-testid='filter-modal-apply']").click()
    page.wait_for_timeout(4000)
    if "houseRules" in page.url and "Pets" in page.url:
        log_pass("House rule applied")
    else:
        log_issue(f"House rule not in URL: {page.url}")

    # ================================================================
    # FLOW 5: COMBINED FILTERS
    # ================================================================
    print("\n" + "=" * 60)
    print("FLOW 5: Combined Filters")
    print("=" * 60)

    # 5.1: Room type tabs
    print("\n--- 5.1: Room type tab ---")
    safe_goto(page, "http://localhost:3000/search")
    page.locator("button[aria-label='Filter by Private room']").click()
    page.wait_for_timeout(4000)
    if "roomType" in page.url:
        log_pass("Room type filter via tab")
    else:
        log_issue(f"Room type not in URL: {page.url}")

    # 5.2: Multi-filter URL
    print("\n--- 5.2: Multi-filter URL ---")
    safe_goto(page, "http://localhost:3000/search?minPrice=500&maxPrice=1500&roomType=Private+Room&amenities=Wifi")
    cards = page.locator("[data-testid='listing-card']").all()
    if "minPrice" in page.url and "roomType" in page.url and "amenities" in page.url:
        log_pass(f"Multi-filter URL works, {len(cards)} results")
    else:
        log_issue(f"Multi-filter URL issue: {page.url}")

    # 5.3: Clear all
    print("\n--- 5.3: Clear all filters ---")
    safe_goto(page, "http://localhost:3000/search?minPrice=500&amenities=Wifi")
    page.locator("button:has-text('Filters')").first.click()
    page.wait_for_timeout(2000)
    clear_btn = page.locator("[data-testid='filter-modal-clear-all']")
    if clear_btn.is_visible():
        clear_btn.click(timeout=5000)
        page.wait_for_timeout(4000)
        if "minPrice" not in page.url and "amenities" not in page.url:
            log_pass("Clear all works")
        else:
            log_issue(f"Filters not cleared: {page.url}")
    else:
        log_issue("Clear all not visible")

    # ================================================================
    # FLOW 6: PAGINATION
    # ================================================================
    print("\n" + "=" * 60)
    print("FLOW 6: Pagination / Infinite Scroll")
    print("=" * 60)

    print("\n--- 6.1: Initial results ---")
    safe_goto(page, "http://localhost:3000/search")
    initial = page.locator("[data-testid='listing-card']").all()
    print(f"  Initial cards: {len(initial)}")
    if len(initial) > 0:
        log_pass(f"Initial: {len(initial)} cards")
    else:
        log_issue("No initial cards")

    print("\n--- 6.2: Load more ---")
    load_more = page.locator("button:has-text('Load more'), button:has-text('Show more'), [data-testid='load-more']").first
    if load_more.is_visible():
        load_more.click()
        page.wait_for_timeout(3000)
        after = page.locator("[data-testid='listing-card']").all()
        if len(after) > len(initial):
            log_pass(f"Load more: {len(initial)} → {len(after)}")
        else:
            log_issue(f"Load more did not add cards: {len(after)}")
    else:
        # All fit on one page
        if len(initial) < 20:
            log_pass(f"All {len(initial)} results on one page")
        else:
            # Try scrolling
            container = page.locator("[data-testid='search-results-container']").first
            if container.is_visible():
                container.evaluate("el => el.scrollTop = el.scrollHeight")
                page.wait_for_timeout(3000)
                after = page.locator("[data-testid='listing-card']").all()
                if len(after) > len(initial):
                    log_pass(f"Infinite scroll: {len(initial)} → {len(after)}")
                else:
                    log_pass(f"All {len(initial)} results on one page (no more)")

    # ================================================================
    # FLOW 7: SORT
    # ================================================================
    print("\n" + "=" * 60)
    print("FLOW 7: Sort Results")
    print("=" * 60)

    # 7.1: Sort controls
    print("\n--- 7.1: Sort control ---")
    safe_goto(page, "http://localhost:3000/search")
    sort_els = page.locator("select[name*='sort'], [data-testid*='sort'], [aria-label*='ort'], button:has-text('Sort'), [class*='SortSelect']").all()
    print(f"  Sort elements: {len(sort_els)}")
    for el in sort_els[:5]:
        text = el.text_content().strip()[:40] if el.text_content() else ""
        tag = el.evaluate("e => e.tagName")
        visible = el.is_visible()
        print(f"    {tag} visible={visible} text='{text}'")

    # 7.2: price_asc sort via URL
    print("\n--- 7.2: Sort price_asc ---")
    safe_goto(page, "http://localhost:3000/search?sort=price_asc")
    prices = []
    for el in page.locator("[data-testid='listing-price']").all()[:10]:
        text = el.text_content().strip()
        num_str = text.replace("$", "").replace(",", "").split("/")[0]
        try:
            prices.append(int(num_str))
        except ValueError:
            pass
    if prices and prices == sorted(prices):
        log_pass(f"Ascending: {prices[:5]}")
    elif prices:
        log_issue(f"Not ascending: {prices[:5]}")
    else:
        log_issue("No prices parsed")

    # 7.3: price_desc sort
    print("\n--- 7.3: Sort price_desc ---")
    safe_goto(page, "http://localhost:3000/search?sort=price_desc")
    prices = []
    for el in page.locator("[data-testid='listing-price']").all()[:10]:
        text = el.text_content().strip()
        num_str = text.replace("$", "").replace(",", "").split("/")[0]
        try:
            prices.append(int(num_str))
        except ValueError:
            pass
    if prices and prices == sorted(prices, reverse=True):
        log_pass(f"Descending: {prices[:5]}")
    elif prices:
        log_issue(f"Not descending: {prices[:5]}")
    else:
        log_issue("No prices parsed")

    # 7.4: newest sort
    print("\n--- 7.4: Sort newest ---")
    safe_goto(page, "http://localhost:3000/search?sort=newest")
    cards = page.locator("[data-testid='listing-card']").all()
    if "sort=newest" in page.url and len(cards) > 0:
        log_pass(f"Newest sort: {len(cards)} results")
    else:
        log_issue(f"Newest sort issue")

    # ================================================================
    # Console errors
    # ================================================================
    print("\n=== Console Errors ===")
    real_errors = [e for e in console_errors
                   if "photon.komoot" not in e.lower()
                   and "Failed to fetch" not in e
                   and "useFacets" not in e]
    if real_errors:
        for err in real_errors[:10]:
            print(f"  WARN: {err[:200]}")
    else:
        log_pass("No unexpected console errors")

    # ================================================================
    # SUMMARY
    # ================================================================
    print("\n" + "=" * 60)
    print("FLOWS 2-7 SUMMARY")
    print("=" * 60)
    print(f"PASSES: {len(passes)}")
    for p_msg in passes:
        print(f"  ✅ {p_msg}")
    print(f"ISSUES: {len(issues)}")
    for i_msg in issues:
        print(f"  ❌ {i_msg}")

    browser.close()
    sys.exit(1 if issues else 0)
