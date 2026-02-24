"""Flow 2: Test search by date range — move-in date filter."""
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

# Calculate test dates
today = datetime.now()
next_month = today + timedelta(days=30)
next_month_str = next_month.strftime("%Y-%m-%d")
three_months = today + timedelta(days=90)
three_months_str = three_months.strftime("%Y-%m-%d")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900})

    console_errors = []
    page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

    # ========================================
    # Test 1: Open filters modal, find move-in date
    # ========================================
    print("\n=== Test 1: Open filter modal and find date controls ===")
    page.goto("http://localhost:3000/search", wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(2000)

    # Click the Filters button
    filters_btn = page.locator("button[aria-label='Filters'], button:has-text('Filters')").first
    if filters_btn.is_visible():
        filters_btn.click()
        page.wait_for_timeout(1000)
        log_pass("Filters button clicked")
    else:
        log_issue("Filters button not found")

    page.screenshot(path=f"{SCREENSHOTS_DIR}/flow2_filter_modal.png", full_page=False)

    # Look for date input inside the filter modal
    date_input = page.locator("input[type='date']").first
    if date_input.is_visible():
        log_pass("Date input found in filter modal")
    else:
        # Check for date pills
        print("  No date input visible, looking for date-related elements...")
        date_els = page.locator("[class*='date'], [class*='Date'], [data-testid*='date']").all()
        print(f"  Found {len(date_els)} date-related elements")
        for i, el in enumerate(date_els[:5]):
            text = el.text_content().strip()[:80] if el.text_content() else ""
            tag = el.evaluate("e => e.tagName")
            visible = el.is_visible()
            print(f"    [{i}] tag={tag} visible={visible} text='{text}'")

    # ========================================
    # Test 2: Set move-in date via URL parameter
    # ========================================
    print("\n=== Test 2: Set move-in date via URL param ===")
    page.goto(f"http://localhost:3000/search?moveInDate={next_month_str}", wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(3000)

    url = page.url
    if "moveInDate" in url:
        log_pass(f"Move-in date in URL: {url}")
    else:
        log_issue(f"Move-in date not in URL after direct navigation: {url}")

    cards = page.locator("[data-testid='listing-card']").all()
    print(f"  Cards with move-in date filter: {len(cards)}")

    page.screenshot(path=f"{SCREENSHOTS_DIR}/flow2_date_url.png", full_page=False)

    # ========================================
    # Test 3: Set date via filter modal interaction
    # ========================================
    print("\n=== Test 3: Set date via filter modal ===")
    page.goto("http://localhost:3000/search", wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(2000)

    # Open filters
    filters_btn = page.locator("button[aria-label='Filters'], button:has-text('Filters')").first
    filters_btn.click()
    page.wait_for_timeout(1000)

    # Find and fill date input
    date_input = page.locator("input[type='date']").first
    if date_input.is_visible():
        date_input.fill(next_month_str)
        page.wait_for_timeout(500)
        log_pass(f"Date input filled with {next_month_str}")

        # Click Apply/Show button
        apply_btn = page.locator("[data-testid='filter-modal-apply'], button:has-text('Show'), button:has-text('Apply')").first
        if apply_btn.is_visible():
            apply_btn.click()
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(3000)

            url = page.url
            if "moveInDate" in url:
                log_pass(f"Date applied via modal, URL: {url}")
            else:
                log_issue(f"Date not in URL after modal apply: {url}")
        else:
            log_issue("Apply button not found in filter modal")
    else:
        log_issue("Date input not visible in filter modal")

    page.screenshot(path=f"{SCREENSHOTS_DIR}/flow2_date_modal_applied.png", full_page=False)

    # ========================================
    # Test 4: Date pills (if they exist)
    # ========================================
    print("\n=== Test 4: Check for date pills ===")
    page.goto("http://localhost:3000/search", wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(2000)

    # Look for date-related pills/tabs on the search page
    date_pills = page.locator("button:has-text('This month'), button:has-text('Next month'), button:has-text('Flexible'), [class*='DatePill']").all()
    print(f"  Date pills found: {len(date_pills)}")
    for dp in date_pills[:5]:
        text = dp.text_content().strip()[:40]
        visible = dp.is_visible()
        print(f"    pill: '{text}' visible={visible}")

    # ========================================
    # Test 5: Past date rejection
    # ========================================
    print("\n=== Test 5: Past date rejection ===")
    past_date = (today - timedelta(days=30)).strftime("%Y-%m-%d")
    page.goto(f"http://localhost:3000/search?moveInDate={past_date}", wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(2000)

    url = page.url
    # Past dates should be stripped from URL by validation
    if "moveInDate" not in url:
        log_pass("Past date correctly rejected/stripped from URL")
    else:
        log_issue(f"Past date NOT rejected - still in URL: {url}")

    # ========================================
    # Test 6: Clear date filter
    # ========================================
    print("\n=== Test 6: Clear date filter ===")
    page.goto(f"http://localhost:3000/search?moveInDate={next_month_str}", wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(2000)

    # Open filters and clear
    filters_btn = page.locator("button[aria-label='Filters'], button:has-text('Filters')").first
    if filters_btn.is_visible():
        filters_btn.click()
        page.wait_for_timeout(1000)

        # Clear the date input
        date_input = page.locator("input[type='date']").first
        if date_input.is_visible():
            date_input.fill("")
            page.wait_for_timeout(500)

            # Apply
            apply_btn = page.locator("[data-testid='filter-modal-apply'], button:has-text('Show'), button:has-text('Apply')").first
            if apply_btn.is_visible():
                apply_btn.click()
                page.wait_for_load_state("networkidle")
                page.wait_for_timeout(2000)

                url = page.url
                if "moveInDate" not in url:
                    log_pass("Date filter cleared successfully")
                else:
                    log_issue(f"Date filter not cleared: {url}")

    # ========================================
    # Console errors
    # ========================================
    print("\n=== Console Errors ===")
    # Filter out known Photon timeout errors
    real_errors = [e for e in console_errors if "photon.komoot" not in e.lower()]
    if real_errors:
        for err in real_errors[:10]:
            log_issue(f"Console error: {err[:200]}")
    else:
        log_pass("No unexpected console errors")

    # ========================================
    # Summary
    # ========================================
    print("\n" + "=" * 50)
    print("FLOW 2 SUMMARY: Search by Date Range")
    print("=" * 50)
    print(f"PASSES: {len(passes)}")
    for p_msg in passes:
        print(f"  ✅ {p_msg}")
    print(f"ISSUES: {len(issues)}")
    for i_msg in issues:
        print(f"  ❌ {i_msg}")

    browser.close()

    if issues:
        print("\nFLOW 2: ISSUES FOUND")
        sys.exit(1)
    else:
        print("\nFLOW 2: ALL PASSED")
        sys.exit(0)
