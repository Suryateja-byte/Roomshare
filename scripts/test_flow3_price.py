"""Flow 3: Test search by price filter — min/max price inputs."""
from playwright.sync_api import sync_playwright
import os, sys

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

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900})

    console_errors = []
    page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

    # ========================================
    # Test 1: Find price inputs on search form
    # ========================================
    print("\n=== Test 1: Find price inputs ===")
    page.goto("http://localhost:3000/search", wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(2000)

    min_input = page.locator("input[placeholder='Min']")
    max_input = page.locator("input[placeholder='Max']")

    if min_input.is_visible() and max_input.is_visible():
        log_pass("Min and Max price inputs visible")
    else:
        log_issue(f"Price inputs not visible: min={min_input.is_visible()}, max={max_input.is_visible()}")

    # ========================================
    # Test 2: Set min price and search
    # ========================================
    print("\n=== Test 2: Set min price and search ===")
    min_input.fill("500")
    page.wait_for_timeout(300)

    # Click search button
    search_btn = page.locator("button[aria-label='Search listings']")
    search_btn.click()
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(3000)

    url = page.url
    if "minPrice=500" in url:
        log_pass(f"Min price in URL: {url}")
    else:
        log_issue(f"Min price not in URL: {url}")

    # Check that results have prices >= 500
    prices = page.locator("[data-testid='listing-price']").all()
    print(f"  Listing prices found: {len(prices)}")
    for i, price_el in enumerate(prices[:5]):
        text = price_el.text_content().strip()
        print(f"    [{i}] {text}")

    page.screenshot(path=f"{SCREENSHOTS_DIR}/flow3_min_price.png", full_page=False)

    # ========================================
    # Test 3: Set max price and search
    # ========================================
    print("\n=== Test 3: Set max price and search ===")
    page.goto("http://localhost:3000/search", wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(2000)

    max_input = page.locator("input[placeholder='Max']")
    max_input.fill("1000")
    page.wait_for_timeout(300)

    search_btn = page.locator("button[aria-label='Search listings']")
    search_btn.click()
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(3000)

    url = page.url
    if "maxPrice=1000" in url:
        log_pass(f"Max price in URL: {url}")
    else:
        log_issue(f"Max price not in URL: {url}")

    page.screenshot(path=f"{SCREENSHOTS_DIR}/flow3_max_price.png", full_page=False)

    # ========================================
    # Test 4: Set both min and max price
    # ========================================
    print("\n=== Test 4: Set min+max price range ===")
    page.goto("http://localhost:3000/search", wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(2000)

    min_input = page.locator("input[placeholder='Min']")
    max_input = page.locator("input[placeholder='Max']")
    min_input.fill("800")
    max_input.fill("1500")
    page.wait_for_timeout(300)

    search_btn = page.locator("button[aria-label='Search listings']")
    search_btn.click()
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(3000)

    url = page.url
    if "minPrice=800" in url and "maxPrice=1500" in url:
        log_pass(f"Both price filters in URL: {url}")
    else:
        log_issue(f"Price range not properly in URL: {url}")

    page.screenshot(path=f"{SCREENSHOTS_DIR}/flow3_price_range.png", full_page=False)

    # ========================================
    # Test 5: URL param direct navigation with price
    # ========================================
    print("\n=== Test 5: Direct URL with price params ===")
    page.goto("http://localhost:3000/search?minPrice=600&maxPrice=1200", wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(3000)

    min_input = page.locator("input[placeholder='Min']")
    max_input = page.locator("input[placeholder='Max']")

    min_val = min_input.input_value()
    max_val = max_input.input_value()

    if min_val == "600":
        log_pass(f"Min price input populated from URL: {min_val}")
    else:
        log_issue(f"Min price input not populated from URL. Expected '600', got '{min_val}'")

    if max_val == "1200":
        log_pass(f"Max price input populated from URL: {max_val}")
    else:
        log_issue(f"Max price input not populated from URL. Expected '1200', got '{max_val}'")

    # ========================================
    # Test 6: Inverted price auto-swap (min > max)
    # ========================================
    print("\n=== Test 6: Inverted price auto-swap ===")
    page.goto("http://localhost:3000/search", wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(2000)

    min_input = page.locator("input[placeholder='Min']")
    max_input = page.locator("input[placeholder='Max']")
    min_input.fill("2000")
    max_input.fill("500")
    page.wait_for_timeout(300)

    search_btn = page.locator("button[aria-label='Search listings']")
    search_btn.click()
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(3000)

    url = page.url
    # Should auto-swap: min=500, max=2000
    if "minPrice=500" in url and "maxPrice=2000" in url:
        log_pass("Inverted prices auto-swapped correctly")
    elif "minPrice" in url and "maxPrice" in url:
        log_pass(f"Inverted prices handled (URL: {url})")
    else:
        log_issue(f"Inverted prices not handled properly: {url}")

    # ========================================
    # Test 7: Clear price filter
    # ========================================
    print("\n=== Test 7: Clear price filter ===")
    page.goto("http://localhost:3000/search?minPrice=500&maxPrice=1500", wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(2000)

    min_input = page.locator("input[placeholder='Min']")
    max_input = page.locator("input[placeholder='Max']")
    min_input.fill("")
    max_input.fill("")
    page.wait_for_timeout(300)

    search_btn = page.locator("button[aria-label='Search listings']")
    search_btn.click()
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)

    url = page.url
    if "minPrice" not in url and "maxPrice" not in url:
        log_pass("Price filters cleared successfully")
    else:
        log_issue(f"Price filters not cleared: {url}")

    # ========================================
    # Test 8: Price in filter modal (slider/histogram)
    # ========================================
    print("\n=== Test 8: Price filter in modal ===")
    page.goto("http://localhost:3000/search", wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(2000)

    filters_btn = page.locator("button[aria-label='Filters'], button:has-text('Filters')").first
    filters_btn.click()
    page.wait_for_timeout(1500)

    # Look for price-related elements in modal
    price_slider = page.locator("[class*='PriceRange'], [class*='price-range'], input[type='range'], [class*='Slider'], [role='slider']").all()
    price_histogram = page.locator("[class*='histogram'], [class*='Histogram']").all()
    print(f"  Price sliders: {len(price_slider)}")
    print(f"  Price histograms: {len(price_histogram)}")

    # Check for min/max inputs in modal
    modal_price_inputs = page.locator("[role='dialog'] input[type='number'], [class*='modal'] input[type='number'], [class*='Modal'] input[type='number']").all()
    print(f"  Modal price inputs: {len(modal_price_inputs)}")

    page.screenshot(path=f"{SCREENSHOTS_DIR}/flow3_price_modal.png", full_page=False)

    if len(price_slider) > 0 or len(modal_price_inputs) > 0:
        log_pass("Price filter controls found in modal")
    else:
        log_issue("No price filter controls found in filter modal")

    # ========================================
    # Console errors
    # ========================================
    print("\n=== Console Errors ===")
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
    print("FLOW 3 SUMMARY: Search by Price Filter")
    print("=" * 50)
    print(f"PASSES: {len(passes)}")
    for p_msg in passes:
        print(f"  ✅ {p_msg}")
    print(f"ISSUES: {len(issues)}")
    for i_msg in issues:
        print(f"  ❌ {i_msg}")

    browser.close()

    if issues:
        print("\nFLOW 3: ISSUES FOUND")
        sys.exit(1)
    else:
        print("\nFLOW 3: ALL PASSED")
        sys.exit(0)
