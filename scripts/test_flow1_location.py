"""Flow 1: Test search by location - enter city/area, verify results update."""
from playwright.sync_api import sync_playwright
import json, os, sys

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
    context = browser.new_context(viewport={"width": 1280, "height": 900})
    page = context.new_page()

    console_errors = []
    page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

    # ========================================
    # Test 1: Default search page loads with results
    # ========================================
    print("\n=== Test 1: Default search page loads ===")
    page.goto("http://localhost:3000/search", wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(2000)

    # Check results are present
    cards = page.locator("[data-testid='listing-card']").all()
    if len(cards) > 0:
        log_pass(f"Default search shows {len(cards)} listing cards")
    else:
        log_issue("No listing cards on default search page")

    # ========================================
    # Test 2: Click a suggested city link (Austin, TX)
    # ========================================
    print("\n=== Test 2: Click suggested city link (Austin, TX) ===")
    austin_link = page.locator("a[href*='Austin']")
    if austin_link.is_visible():
        austin_link.click()
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(3000)

        # Check URL updated
        url = page.url
        if "Austin" in url or "austin" in url.lower():
            log_pass(f"URL updated to include Austin: {url}")
        else:
            log_issue(f"URL does not contain Austin after clicking link: {url}")

        # Check search input has Austin
        search_input = page.locator("input[placeholder='Search destinations']")
        input_value = search_input.input_value()
        if "Austin" in input_value or "austin" in input_value.lower():
            log_pass(f"Search input shows: '{input_value}'")
        else:
            log_issue(f"Search input does not show Austin, shows: '{input_value}'")

        # Check results loaded
        page.wait_for_timeout(2000)
        cards = page.locator("[data-testid='listing-card']").all()
        print(f"  Cards after Austin search: {len(cards)}")

        page.screenshot(path=f"{SCREENSHOTS_DIR}/flow1_austin_search.png", full_page=False)
    else:
        log_issue("Austin, TX link not visible on search page")

    # ========================================
    # Test 3: Type a new location in the search input
    # ========================================
    print("\n=== Test 3: Type new location in search input ===")
    page.goto("http://localhost:3000/search", wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(2000)

    search_input = page.locator("input[placeholder='Search destinations']")
    search_input.click()
    page.wait_for_timeout(500)

    # Clear existing text and type new location
    search_input.fill("")
    page.wait_for_timeout(300)
    search_input.fill("San Francisco")
    page.wait_for_timeout(1500)  # Wait for autocomplete debounce

    page.screenshot(path=f"{SCREENSHOTS_DIR}/flow1_sf_typing.png", full_page=False)

    # Check for autocomplete suggestions
    suggestions = page.locator("[role='listbox'] [role='option'], [class*='suggestion'], [class*='autocomplete'] li, [class*='Suggestion'], [class*='dropdown'] li, [class*='Combobox'] li").all()
    print(f"  Autocomplete suggestions found: {len(suggestions)}")
    if len(suggestions) > 0:
        log_pass(f"Autocomplete shows {len(suggestions)} suggestions for 'San Francisco'")
        # Click first suggestion
        first_text = suggestions[0].text_content().strip()[:50]
        print(f"  First suggestion: '{first_text}'")
        suggestions[0].click()
        page.wait_for_timeout(1000)
    else:
        # Maybe autocomplete has different structure - try clicking the search button
        print("  No autocomplete dropdown visible, trying search button...")
        # Check if there's a listbox or similar
        all_listboxes = page.locator("[role='listbox']").all()
        print(f"  Listbox elements: {len(all_listboxes)}")
        # Take screenshot for debugging
        page.screenshot(path=f"{SCREENSHOTS_DIR}/flow1_sf_no_autocomplete.png", full_page=False)

    # Click search button
    search_btn = page.locator("button[aria-label='Search listings']")
    if search_btn.is_visible():
        search_btn.click()
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(3000)

        url = page.url
        if "San" in url or "san" in url.lower() or "Francisco" in url:
            log_pass(f"URL updated after search: {url}")
        else:
            log_issue(f"URL may not have updated properly after SF search: {url}")

        page.screenshot(path=f"{SCREENSHOTS_DIR}/flow1_sf_results.png", full_page=False)
    else:
        log_issue("Search button not visible")

    # ========================================
    # Test 4: Search by URL parameter (direct navigation)
    # ========================================
    print("\n=== Test 4: Direct URL navigation with q param ===")
    page.goto("http://localhost:3000/search?q=New%20York%2C%20NY", wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(3000)

    search_input = page.locator("input[placeholder='Search destinations']")
    input_value = search_input.input_value()
    if "New York" in input_value:
        log_pass(f"Direct URL loads with search input: '{input_value}'")
    else:
        log_issue(f"Direct URL navigation: search input shows '{input_value}' instead of 'New York'")

    cards = page.locator("[data-testid='listing-card']").all()
    print(f"  Cards for New York search: {len(cards)}")

    page.screenshot(path=f"{SCREENSHOTS_DIR}/flow1_ny_direct.png", full_page=False)

    # ========================================
    # Test 5: Search with Enter key (not just button click)
    # ========================================
    print("\n=== Test 5: Search with Enter key ===")
    page.goto("http://localhost:3000/search", wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(2000)

    search_input = page.locator("input[placeholder='Search destinations']")
    search_input.click()
    search_input.fill("Chicago")
    page.wait_for_timeout(500)
    search_input.press("Enter")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(3000)

    url = page.url
    if "Chicago" in url or "chicago" in url.lower():
        log_pass(f"Enter key search works, URL: {url}")
    else:
        log_issue(f"Enter key search: URL doesn't contain Chicago: {url}")

    page.screenshot(path=f"{SCREENSHOTS_DIR}/flow1_chicago_enter.png", full_page=False)

    # ========================================
    # Test 6: Clear search / reset to all results
    # ========================================
    print("\n=== Test 6: Clear search location ===")
    search_input = page.locator("input[placeholder='Search destinations']")
    search_input.fill("")
    page.wait_for_timeout(500)
    search_btn = page.locator("button[aria-label='Search listings']")
    if search_btn.is_visible():
        search_btn.click()
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(3000)

    url = page.url
    cards = page.locator("[data-testid='listing-card']").all()
    print(f"  Cards after clearing search: {len(cards)}")
    if len(cards) > 0:
        log_pass(f"Clearing search shows {len(cards)} results")
    else:
        log_issue("No results after clearing search")

    # ========================================
    # Test 7: Location search with special characters
    # ========================================
    print("\n=== Test 7: Special characters in search ===")
    search_input = page.locator("input[placeholder='Search destinations']")
    search_input.fill("St. Louis, MO")
    page.wait_for_timeout(500)
    search_input.press("Enter")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)

    url = page.url
    # Should handle the period and comma safely
    if "St" in url:
        log_pass(f"Special characters handled in URL: {url}")
    else:
        log_issue(f"Special characters may not be handled: {url}")

    # ========================================
    # Check for console errors during all tests
    # ========================================
    print("\n=== Console Errors ===")
    if console_errors:
        for err in console_errors[:15]:
            log_issue(f"Console error: {err[:200]}")
    else:
        log_pass("No console errors during location search tests")

    # ========================================
    # Summary
    # ========================================
    print("\n" + "=" * 50)
    print("FLOW 1 SUMMARY: Search by Location")
    print("=" * 50)
    print(f"PASSES: {len(passes)}")
    for p_msg in passes:
        print(f"  ✅ {p_msg}")
    print(f"ISSUES: {len(issues)}")
    for i_msg in issues:
        print(f"  ❌ {i_msg}")

    browser.close()

    if issues:
        print("\nFLOW 1: ISSUES FOUND - needs investigation")
        sys.exit(1)
    else:
        print("\nFLOW 1: ALL PASSED")
        sys.exit(0)
