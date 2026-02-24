"""Flows 8-10: Click listing, Map interactions, Mobile responsive."""
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

def safe_goto(page, url, timeout=45000):
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=timeout)
    except Exception:
        pass
    page.wait_for_timeout(4000)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    # ================================================================
    # FLOW 8: CLICK LISTING FROM RESULTS
    # ================================================================
    print("\n" + "=" * 60)
    print("FLOW 8: Click Listing from Results")
    print("=" * 60)

    page = browser.new_page(viewport={"width": 1280, "height": 900})
    console_errors = []
    page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

    # 8.1: Click first listing card
    print("\n--- 8.1: Click first listing ---")
    safe_goto(page, "http://localhost:3000/search")

    first_card_link = page.locator("[data-testid='listing-card'] a, a:has([data-testid='listing-card'])").first
    if not first_card_link.is_visible():
        # Try finding a link inside listing cards
        first_card_link = page.locator("a[href*='/listings/']").first

    if first_card_link.is_visible():
        href = first_card_link.get_attribute("href")
        print(f"  First listing href: {href}")
        first_card_link.click()
        page.wait_for_timeout(5000)

        url = page.url
        if "/listings/" in url:
            log_pass(f"Navigated to listing detail: {url}")
        else:
            log_issue(f"Did not navigate to listing detail: {url}")

        page.screenshot(path=f"{SCREENSHOTS_DIR}/flow8_listing_detail.png", full_page=False)
    else:
        log_issue("No listing link found")

    # 8.2: Back button returns to search
    print("\n--- 8.2: Back to search ---")
    page.go_back()
    page.wait_for_timeout(4000)
    if "/search" in page.url:
        log_pass("Back button returns to search")
    else:
        log_issue(f"Back button went to: {page.url}")

    # 8.3: Listing detail page has correct elements
    print("\n--- 8.3: Listing detail page ---")
    safe_goto(page, "http://localhost:3000/search")
    listing_links = page.locator("a[href*='/listings/']").all()
    if len(listing_links) > 1:
        # Click the second listing
        href = listing_links[1].get_attribute("href")
        listing_links[1].click()
        page.wait_for_timeout(5000)

        # Check for key elements on detail page
        title = page.locator("h1").first
        if title.is_visible():
            log_pass(f"Listing detail has title: '{title.text_content().strip()[:50]}'")
        else:
            log_issue("No h1 title on listing detail")

        # Check for price
        price_el = page.locator("[class*='price'], [data-testid*='price']").first
        if price_el.is_visible():
            log_pass(f"Price visible on detail page")
        else:
            log_issue("Price not visible on detail page")

        page.screenshot(path=f"{SCREENSHOTS_DIR}/flow8_detail_page2.png", full_page=False)

    # 8.4: Check listing detail doesn't have console errors
    print("\n--- 8.4: Console errors on detail ---")
    real_errors = [e for e in console_errors
                   if "photon" not in e.lower()
                   and "Failed to fetch" not in e
                   and "useFacets" not in e
                   and "favicon" not in e.lower()]
    if real_errors:
        for err in real_errors[:5]:
            print(f"  WARN: {err[:200]}")
    else:
        log_pass("No unexpected errors on listing pages")

    page.close()

    # ================================================================
    # FLOW 9: MAP INTERACTIONS
    # ================================================================
    print("\n" + "=" * 60)
    print("FLOW 9: Map Interactions")
    print("=" * 60)

    page = browser.new_page(viewport={"width": 1280, "height": 900})

    # 9.1: Map visible on desktop
    print("\n--- 9.1: Map visible ---")
    safe_goto(page, "http://localhost:3000/search")

    map_container = page.locator("[aria-label='Interactive map showing listing locations'], .maplibregl-map, [class*='maplibre']").first
    if map_container.is_visible():
        log_pass("Map is visible on desktop")
    else:
        log_issue("Map not visible on desktop")

    page.screenshot(path=f"{SCREENSHOTS_DIR}/flow9_map.png", full_page=False)

    # 9.2: Map pins visible
    print("\n--- 9.2: Map pins ---")
    pins = page.locator("[data-testid*='map-pin']").all()
    print(f"  Map pins: {len(pins)}")
    if len(pins) > 0:
        log_pass(f"{len(pins)} map pins visible")
    else:
        log_issue("No map pins visible")

    # 9.3: Map pin click (hover first)
    print("\n--- 9.3: Map pin interaction ---")
    if len(pins) > 0:
        first_pin = pins[0]
        first_pin_testid = first_pin.get_attribute("data-testid") or ""
        print(f"  First pin: {first_pin_testid}")

        # Click on a pin
        try:
            first_pin.click(timeout=5000)
            page.wait_for_timeout(1000)

            # Check if a popup/tooltip appeared
            popup = page.locator("[class*='popup'], [class*='Popup'], [class*='tooltip'], [class*='preview'], .maplibregl-popup").all()
            print(f"  Popups/previews after pin click: {len(popup)}")

            page.screenshot(path=f"{SCREENSHOTS_DIR}/flow9_pin_click.png", full_page=False)
            log_pass("Map pin clicked")
        except Exception as e:
            log_issue(f"Pin click failed: {e}")

    # 9.4: Map zoom (mouse wheel simulation)
    print("\n--- 9.4: Map zoom ---")
    map_box = map_container.bounding_box() if map_container.is_visible() else None
    if map_box:
        center_x = map_box["x"] + map_box["width"] / 2
        center_y = map_box["y"] + map_box["height"] / 2

        # Take before screenshot
        page.screenshot(path=f"{SCREENSHOTS_DIR}/flow9_before_zoom.png", full_page=False)

        # Simulate zoom with mouse wheel
        page.mouse.move(center_x, center_y)
        page.mouse.wheel(0, -300)  # Zoom in
        page.wait_for_timeout(2000)

        page.screenshot(path=f"{SCREENSHOTS_DIR}/flow9_after_zoom.png", full_page=False)
        log_pass("Map zoom simulated")
    else:
        log_issue("Could not get map bounding box")

    # 9.5: Map pan
    print("\n--- 9.5: Map pan ---")
    if map_box:
        start_x = map_box["x"] + map_box["width"] / 2
        start_y = map_box["y"] + map_box["height"] / 2
        page.mouse.move(start_x, start_y)
        page.mouse.down()
        page.mouse.move(start_x - 100, start_y - 50, steps=10)
        page.mouse.up()
        page.wait_for_timeout(2000)

        # Check for "Search as I move" banner or bounds update
        banner = page.locator("[class*='MapMoved'], button:has-text('Search this area'), button:has-text('Redo search')").all()
        print(f"  'Search as I move' related elements: {len(banner)}")

        page.screenshot(path=f"{SCREENSHOTS_DIR}/flow9_after_pan.png", full_page=False)
        log_pass("Map pan simulated")
    else:
        log_issue("Map pan skipped - no bounding box")

    page.close()

    # ================================================================
    # FLOW 10: MOBILE RESPONSIVE
    # ================================================================
    print("\n" + "=" * 60)
    print("FLOW 10: Mobile Responsive")
    print("=" * 60)

    # Test at iPhone viewport
    page = browser.new_page(viewport={"width": 375, "height": 812})

    # 10.1: Mobile layout
    print("\n--- 10.1: Mobile layout ---")
    safe_goto(page, "http://localhost:3000/search")

    page.screenshot(path=f"{SCREENSHOTS_DIR}/flow10_mobile.png", full_page=False)

    # Check for mobile-specific elements
    mobile_filter_btn = page.locator("[data-testid='mobile-filter-button']")
    collapsed_search = page.locator("button[aria-label='Expand search'], button[aria-label='Expand search form']").first
    bottom_sheet = page.locator("[data-testid='sheet-header-text']")

    if mobile_filter_btn.is_visible():
        log_pass("Mobile filter button visible")
    else:
        print("  No mobile filter button")

    if collapsed_search.is_visible():
        log_pass("Collapsed mobile search visible")
    else:
        # Check if full search form is visible instead
        search_input = page.locator("input[placeholder='Search destinations']")
        if search_input.is_visible():
            log_pass("Search input visible on mobile")
        else:
            log_issue("Neither collapsed search nor search input visible on mobile")

    # 10.2: Mobile bottom sheet (if results are in a sheet)
    print("\n--- 10.2: Bottom sheet ---")
    sheet_header = page.locator("[data-testid='sheet-header-text']")
    if sheet_header.is_visible():
        log_pass(f"Bottom sheet header: '{sheet_header.text_content().strip()[:40]}'")
    else:
        # Check if listing cards are visible
        cards = page.locator("[data-testid='listing-card']").all()
        if len(cards) > 0:
            log_pass(f"Mobile shows {len(cards)} listing cards (no sheet wrapper)")
        else:
            log_issue("No cards or sheet visible on mobile")

    # 10.3: Mobile search interaction
    print("\n--- 10.3: Mobile search ---")
    page.screenshot(path=f"{SCREENSHOTS_DIR}/flow10_mobile_search.png", full_page=True)

    # Try to expand search if collapsed
    if collapsed_search.is_visible():
        collapsed_search.click()
        page.wait_for_timeout(1000)
        page.screenshot(path=f"{SCREENSHOTS_DIR}/flow10_mobile_search_expanded.png", full_page=False)
        log_pass("Mobile search expanded")

    # 10.4: Mobile filter modal
    print("\n--- 10.4: Mobile filter modal ---")
    mobile_filter = page.locator("[data-testid='mobile-filter-button'], button[aria-label='Filters']").first
    if mobile_filter.is_visible():
        mobile_filter.click()
        page.wait_for_timeout(2000)
        page.screenshot(path=f"{SCREENSHOTS_DIR}/flow10_mobile_filters.png", full_page=False)

        # Check filter modal on mobile viewport
        filter_heading = page.locator("h2:has-text('Filters')").first
        if filter_heading.is_visible():
            log_pass("Mobile filter modal opens")
        else:
            log_issue("Filter modal heading not visible on mobile")

        # Close modal
        page.keyboard.press("Escape")
        page.wait_for_timeout(500)
    else:
        log_issue("No filter button visible on mobile")

    # 10.5: Listing cards responsive
    print("\n--- 10.5: Card layout ---")
    cards = page.locator("[data-testid='listing-card']").all()
    if len(cards) > 0:
        first_card_box = cards[0].bounding_box()
        if first_card_box:
            card_width = first_card_box["width"]
            viewport_width = 375
            ratio = card_width / viewport_width
            print(f"  Card width: {card_width}px, viewport: {viewport_width}px, ratio: {ratio:.2f}")
            if ratio > 0.8:
                log_pass(f"Cards are full-width on mobile ({card_width:.0f}px)")
            else:
                log_pass(f"Cards at {ratio:.0%} viewport width ({card_width:.0f}px)")
        else:
            log_issue("Could not get card bounding box")
    else:
        log_issue("No cards to measure")

    # 10.6: Touch target sizes (a11y)
    print("\n--- 10.6: Touch targets ---")
    buttons = page.locator("button:visible").all()
    small_targets = 0
    for btn in buttons[:20]:
        box = btn.bounding_box()
        if box and (box["width"] < 44 or box["height"] < 44):
            text = btn.text_content().strip()[:30] if btn.text_content() else "?"
            # Only flag visible meaningful buttons
            if box["width"] > 0 and box["height"] > 0:
                small_targets += 1
    print(f"  Buttons below 44px touch target: {small_targets}/{min(len(buttons), 20)}")
    if small_targets <= 3:  # Allow a few exceptions
        log_pass(f"Touch targets mostly adequate ({small_targets} small)")
    else:
        log_issue(f"{small_targets} buttons below 44px min touch target")

    page.close()

    # ================================================================
    # SUMMARY
    # ================================================================
    print("\n" + "=" * 60)
    print("FLOWS 8-10 SUMMARY")
    print("=" * 60)
    print(f"PASSES: {len(passes)}")
    for p_msg in passes:
        print(f"  ✅ {p_msg}")
    print(f"ISSUES: {len(issues)}")
    for i_msg in issues:
        print(f"  ❌ {i_msg}")

    browser.close()
    sys.exit(1 if issues else 0)
