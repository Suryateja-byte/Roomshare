"""Flow 1 Recon: Take screenshots and discover selectors on the search page."""
from playwright.sync_api import sync_playwright
import json, os

SCREENSHOTS_DIR = "/tmp/roomshare-tests"
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900})

    # Navigate to search page
    print("Navigating to /search...")
    page.goto("http://localhost:3000/search", wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(2000)

    # Screenshot the initial state
    page.screenshot(path=f"{SCREENSHOTS_DIR}/search_initial.png", full_page=False)
    print(f"Screenshot saved: {SCREENSHOTS_DIR}/search_initial.png")

    # Collect all interactive elements
    print("\n=== BUTTONS ===")
    buttons = page.locator("button").all()
    for i, btn in enumerate(buttons[:20]):
        text = btn.text_content().strip()[:80] if btn.text_content() else ""
        testid = btn.get_attribute("data-testid") or ""
        aria = btn.get_attribute("aria-label") or ""
        visible = btn.is_visible()
        print(f"  [{i}] text='{text}' testid='{testid}' aria='{aria}' visible={visible}")

    print("\n=== INPUTS ===")
    inputs = page.locator("input").all()
    for i, inp in enumerate(inputs[:20]):
        name = inp.get_attribute("name") or ""
        placeholder = inp.get_attribute("placeholder") or ""
        inp_type = inp.get_attribute("type") or ""
        testid = inp.get_attribute("data-testid") or ""
        visible = inp.is_visible()
        print(f"  [{i}] name='{name}' placeholder='{placeholder}' type='{inp_type}' testid='{testid}' visible={visible}")

    print("\n=== SELECT / DROPDOWN ===")
    selects = page.locator("select").all()
    for i, sel in enumerate(selects[:10]):
        name = sel.get_attribute("name") or ""
        testid = sel.get_attribute("data-testid") or ""
        print(f"  [{i}] name='{name}' testid='{testid}'")

    print("\n=== LINKS (a tags) ===")
    links = page.locator("a[href]").all()
    for i, link in enumerate(links[:20]):
        href = link.get_attribute("href") or ""
        text = link.text_content().strip()[:60] if link.text_content() else ""
        visible = link.is_visible()
        if visible:
            print(f"  [{i}] href='{href}' text='{text}'")

    print("\n=== DATA-TESTID ELEMENTS ===")
    testid_els = page.locator("[data-testid]").all()
    for i, el in enumerate(testid_els[:30]):
        testid = el.get_attribute("data-testid") or ""
        tag = el.evaluate("e => e.tagName")
        visible = el.is_visible()
        print(f"  [{i}] testid='{testid}' tag='{tag}' visible={visible}")

    print("\n=== SEARCH/LOCATION INPUT AREA ===")
    # Look for location-related inputs
    loc_inputs = page.locator("[placeholder*='earch'], [placeholder*='ocation'], [placeholder*='ity'], [placeholder*='here'], [aria-label*='earch'], [aria-label*='ocation']").all()
    for i, el in enumerate(loc_inputs[:10]):
        placeholder = el.get_attribute("placeholder") or ""
        aria = el.get_attribute("aria-label") or ""
        role = el.get_attribute("role") or ""
        tag = el.evaluate("e => e.tagName")
        print(f"  [{i}] tag='{tag}' placeholder='{placeholder}' aria='{aria}' role='{role}'")

    # Check for filter pills / chips
    print("\n=== FILTER CHIPS/PILLS ===")
    pills = page.locator("[class*='pill'], [class*='chip'], [class*='filter'], [class*='Filter']").all()
    for i, el in enumerate(pills[:15]):
        text = el.text_content().strip()[:60] if el.text_content() else ""
        tag = el.evaluate("e => e.tagName")
        visible = el.is_visible()
        if visible and text:
            print(f"  [{i}] tag='{tag}' text='{text}'")

    # Check for listing cards
    print("\n=== LISTING RESULTS ===")
    cards = page.locator("article, [class*='ListingCard'], [class*='listing-card'], [data-listing-id]").all()
    print(f"  Found {len(cards)} listing card elements")
    for i, card in enumerate(cards[:5]):
        text = card.text_content().strip()[:100] if card.text_content() else ""
        print(f"  [{i}] text='{text[:80]}...'")

    # Check for map
    print("\n=== MAP ===")
    map_el = page.locator("[class*='map'], [class*='Map'], canvas, .maplibregl-map").all()
    print(f"  Found {len(map_el)} map-related elements")

    # Check console errors
    console_errors = []
    page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(3000)

    print("\n=== CONSOLE ERRORS ON RELOAD ===")
    if console_errors:
        for err in console_errors[:10]:
            print(f"  ERROR: {err[:200]}")
    else:
        print("  No console errors detected")

    # Get page title and URL
    print(f"\n=== PAGE INFO ===")
    print(f"  Title: {page.title()}")
    print(f"  URL: {page.url}")

    # Screenshot after reload
    page.screenshot(path=f"{SCREENSHOTS_DIR}/search_after_reload.png", full_page=False)

    browser.close()
    print("\nRecon complete!")
